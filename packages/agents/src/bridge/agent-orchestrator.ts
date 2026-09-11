/**
 * Multi-agent orchestration runtime.
 *
 * Provides `delegate()` — a function that lets a parent agent invoke a
 * sub-agent and receive its result. Handles budget clamping (D4), tool sharing,
 * toolbox auto-instantiation (EC-1), and routes the resolved `@MainLoop` strategy
 * through `runReflectiveLoop` — the SAME driver `AgentRunner.run()` uses, so both
 * on-ramps are one runtime (ADR D4). `simple-chat` ⇒ `shouldContinue:()=>false`
 * ⇒ exactly one round; `react`/`plan-act-reflect` ⇒ multi-round reflective loop.
 */
import type {
  AgentDefinition,
  BudgetTracker,
  CustomTool,
  PluginsSettings,
  ProviderRoutingSettings,
} from '@theokit/sdk'
import type { RetryOptions } from '@theokit/sdk/retry'

import { runInputGuards, runOutputGuards } from '../guardrails/index.js'
import type { Guardrail } from '../guardrails/index.js'
import {
  ladderReflectionStrategy,
  noopReflectionStrategy,
  type ReflectionStrategy,
  resolveLoopStrategy,
} from '../loop/index.js'
import { type RoundStreamFactory, runReflectiveLoop } from '../loop/run-reflective-loop.js'
import type { MainLoopMeta } from '../types.js'

import type { CompiledAgentOptions, CompiledTool } from './agent-compiler.js'
import { hooksPlugin, inheritHooks } from './delegation-hooks.js'
import { type DelegationResult, DelegationError } from './delegation-types.js'
import type { HookHandlers } from './hook-handlers.js'
import { createSdkAgentStream } from './sdk-adapter.js'

// Re-export the delegation value types for backward compatibility — they moved
// to delegation-types.js to break the orchestrator↔loop import cycle (G1).
export {
  DelegationBudgetExceededError,
  /** @deprecated M91 — use `DelegationBudgetExceededError`; it is the SAME class, aliased for one major. */
  BudgetExceededError,
  type DelegationResult,
  DelegationError,
} from './delegation-types.js'

export interface DelegateOptions {
  /**
   * M81 — wall-clock cap for the delegation, in milliseconds. Absent ⇒ no clock cap.
   *
   * A DIFFERENT guard from `budget`: money is spent by work that progresses, and a delegation that
   * HANGS burns clock without spending a cent. A consumer wrote its own timeout race with its own
   * typed error because this was missing. Exceeding it raises `DelegationTimeoutError`, which —
   * unlike the budget errors — is marked retryable, because a hang is often transient.
   */
  readonly timeoutMs?: number
  /** Max USD for this sub-agent call. */
  budget?: number
  /** Parent's remaining budget (for clamping). */
  parentBudgetRemaining?: number
  /** Parent's tools (for sharing — sub-agent inherits these). */
  parentTools?: CompiledTool[]
  /**
   * Parent's hooks. The member inherits them, and inheritance may only TIGHTEN: both
   * `pre_tool_call` gates run and the first refusal wins, so a member cannot widen what the parent
   * refused.
   *
   * Symmetric with `parentTools` on purpose — `delegate` already carried the parent's tools and its
   * budget into the member's run and left its AUTHORITY behind, which is how a squad member could
   * call a tool the supervisor had vetoed. The failure was silent: nothing threw, and the member's
   * own suite passed because the member never declared the gate.
   *
   * To scope a member differently, pass its handlers on `spec.compiled.hooks` — they compose with
   * these rather than replacing them, because a widening that a call site cannot see is the state
   * this option exists to remove.
   */
  parentHooks?: HookHandlers
  /**
   * LLM API key (inherited from parent).
   *
   * `null` says the provider takes NO credential — a model on the developer's own machine
   * (usetheokit/theokit#423). It is a distinct value from `''` on purpose: an empty string is what
   * an unset environment variable produces, and treating the two alike is how a typo becomes an
   * unauthenticated run. `undefined` still means the caller supplied nothing and is still refused.
   */
  apiKey?: string | null
  /** Session ID override (default: crypto.randomUUID for isolation). */
  sessionId?: string
  /** Cancellation — aborts stop the reflective loop from re-entering. */
  signal?: AbortSignal
  // V4-T: per-run config parity with `AgentRunnerRunOptions` — a sub-agent inherits the parent's
  // runtime config (all optional; absent ⇒ today's behavior). Each field is already accepted by
  // `createSdkAgentStream`'s `RuntimeOverrides` / the loop's `RunReflectiveLoopConfig`.
  /** Per-run model override (`?? SubAgent @Agent model`). */
  model?: string
  /** Per-run working directory → `Agent.create({ local: { cwd } })`. */
  cwd?: string
  /** Per-run plugins (e.g. a read-only permission gate for an explore sub-agent). */
  plugins?: PluginsSettings
  /** Per-run provider routing (e.g. OpenRouter). */
  providers?: ProviderRoutingSettings
  /** Per-run sub-agent definitions. */
  agents?: Record<string, AgentDefinition>
  /** Per-run SDK budget tracker (inner tool-loop cap). */
  budgetTracker?: BudgetTracker
  /** Per-run pre-built SDK tools forwarded raw (V4-Q). */
  sdkTools?: readonly CustomTool[]
  /** Per-round transient retry (V4-P). */
  retry?: RetryOptions
  /** Custom between-round reflection (default: ladder for `plan-act-reflect`, else noop). */
  reflection?: ReflectionStrategy
  /** Per-run loop-ceiling override (`?? SubAgent @MainLoop maxIterations`). */
  maxIterations?: number
  // M12 — delegation observability hooks (ADR-0040 § D2). Observability over the EXISTING
  // primitive; no new orchestration engine. `abortSignal` propagation already lives in `signal`.
  /**
   * Called BEFORE the sub-agent runs. Returns the input the sub-agent will receive — return
   * `ctx.input` unchanged, or a rewritten string (e.g. inject a persona). A transform, not a veto.
   */
  onDelegationStart?: (ctx: { subAgent: string; input: string }) => string | Promise<string>
  /**
   * Called AFTER the sub-agent completes. Returns the result the supervisor sees — return
   * `ctx.result` unchanged, or a transformed one (e.g. redact, score, re-wrap).
   */
  onDelegationComplete?: (ctx: {
    subAgent: string
    result: DelegationResult
  }) => DelegationResult | Promise<DelegationResult>
  /**
   * Injected stream factory (parity with `AgentRunnerRunOptions.streamFactory`) — drives the loop
   * directly instead of the SDK adapter (tests / custom transport). Absent ⇒ `createSdkAgentStream`.
   */
  streamFactory?: RoundStreamFactory
}

/**
 * The credential to delegate with, or a refusal.
 *
 * Three states, not two (usetheokit/theokit#423). This read `!apiKey`, which folded "the provider
 * takes no credential" into "the caller forgot one" — so a local model, whose provider resolves to
 * an empty key by design, could not delegate at all. The fix is not to accept `''`: an empty string
 * is also what an unset environment variable produces, and accepting it would turn a typo into an
 * unauthenticated run. The keyless case says so explicitly instead.
 */
function requireApiKey(opts: DelegateOptions, agentName: string): string {
  // `null` — declared keyless. The SDK's client sends an `authorization` header only for a
  // non-empty key, so the empty string it receives here is the honest value rather than a
  // placeholder.
  if (opts.apiKey === null) return ''
  const apiKey = opts.apiKey ?? ''
  if (!apiKey) {
    throw new DelegationError(
      agentName,
      'No API key provided. Pass apiKey in DelegateOptions, or `apiKey: null` when the provider ' +
        'takes no credential (a local model).',
    )
  }
  return apiKey
}

/** Merge parent tools with sub-agent tools (sub wins on collision). */
/**
 * Carry the parent's authority into the member's compiled options.
 *
 * Appends to `compiled.plugins` — the CODE-plugin array — and NOT to `DelegateOptions.plugins`,
 * which is the SDK's `PluginsSettings`: a list of plugin NAMES to enable. A handler map placed
 * there would type-check nowhere and fire nothing, which is the quiet failure this whole task is
 * about.
 *
 * Returns the options untouched when the parent declared no hooks, so a caller that never had a
 * gate does not silently acquire one.
 */
function withInheritedHooks(
  compiled: CompiledAgentOptions,
  parentHooks: HookHandlers | undefined,
): CompiledAgentOptions {
  const plugin = hooksPlugin(inheritHooks(parentHooks, undefined))
  if (plugin === undefined) return compiled
  return { ...compiled, plugins: [...(compiled.plugins ?? []), plugin] }
}

function mergeTools(parentTools: CompiledTool[], subTools: CompiledTool[]): CompiledTool[] {
  const subToolNames = new Set(subTools.map((t) => t.name))
  const inherited = parentTools.filter((t) => !subToolNames.has(t.name))
  return [...inherited, ...subTools]
}

/**
 * Delegate a task to a sub-agent and collect its result.
 *
 * - Budget clamping: `min(parentBudgetRemaining, budget)` (D4)
 * - Tool sharing: parent tools merged with sub-agent tools (sub wins on collision)
 * - Toolbox auto-instantiation: sub-agent toolboxes instantiated without DI (EC-1)
 * - Session isolation: each delegation gets a unique session ID (EC-4)
 * - `@MainLoop` strategy runtime: routes through `runReflectiveLoop` (the same loop
 *   `AgentRunner.run` uses — one runtime for both on-ramps, ADR D4). The runtime
 *   metric (`THEO_AGENT_MAINLOOP_RUNTIME_APPLIED`) + typed-error + cumulative budget
 *   all live in the shared driver, so they fire identically on both paths.
 */
/**
 * What `delegate` needs from a sub-agent: a name and already-compiled options (built by
 * `applyCapabilities`). Compatible with {@link AgentRunnerSpec} — one spec drives both on-ramps.
 */
export interface SubAgentSpec {
  readonly name: string
  readonly compiled: CompiledAgentOptions
  /** Loop strategy (`@MainLoop({ strategy })`); absent ⇒ the same `'simple-chat'` default. */
  readonly strategy?: MainLoopMeta['strategy']
  /** Loop ceiling (`@MainLoop({ maxIterations })`); a per-run override still wins. */
  readonly maxIterations?: number
}

export async function delegate(
  spec: SubAgentSpec,
  message: string,
  opts: DelegateOptions = {},
): Promise<DelegationResult> {
  const apiKey = requireApiKey(opts, spec.name)

  // M12 — onDelegationStart: let the supervisor rewrite the input before the sub-agent runs.
  const rewritten = opts.onDelegationStart
    ? await opts.onDelegationStart({ subAgent: spec.name, input: message })
    : message

  const { compiled } = spec

  // B-015 — the guards the SPEC declares, which this function accepted and never consulted.
  //
  // Measured against the built artifact: a spec carrying a guard with both halves saw neither. The
  // input reached the model with its injection intact and the caller received the secret, while the
  // operator had declared guardrails and the run was green. That is B-012's defect class on a
  // sibling public API, and it is model-reachable — `tools/delegate-tool.ts` wraps this function.
  //
  // AFTER `onDelegationStart`, deliberately: that hook exists to rewrite the input, so a guard
  // placed before it would moderate a string that never goes out.
  const guardrails = compiled.guardrails ?? []
  const effectiveMessage = await runInputGuards(rewritten, guardrails)

  // 2. Merge parent tools + clamp budget (D4) + INHERIT the parent's authority.
  //
  // Tools and budget were already carried down; hooks were not, so a member could call a tool the
  // parent's `pre_tool_call` had refused. Inheriting them here — beside the two things that were
  // always inherited — is what makes "the member runs under the parent's authority" true rather
  // than merely intended.
  const allTools = mergeTools(opts.parentTools ?? [], compiled.tools)
  const budget = Math.min(opts.budget ?? Infinity, opts.parentBudgetRemaining ?? Infinity)
  // The parent's gate travels as a code plugin, because that is the seam the SDK dispatches hooks
  // through (`compileHooksAndPlugins` in define-agent.ts says so, and `kind: 'general'` is
  // load-bearing there). The member's OWN hooks are already inside its own plugin by the time
  // `compiled` reaches us, so this appends the parent's rather than merging two maps we cannot both
  // see — and `inheritHooks` hardens it to fail closed on the way.
  const compiledForMember = withInheritedHooks(compiled, opts.parentHooks)

  // 3. Build the stream factory (the model call stays in the SDK — ADR 0031) + session.
  // V4-T: forward the per-run config (parity with AgentRunner.stream); model opt wins over the
  // decorator; absent fields ⇒ no key (byte-identical to the pre-V4-T `{ model }`-only override).
  // M12 — an injected factory (tests / custom transport) wins; absent ⇒ the SDK adapter.
  const streamFactory =
    opts.streamFactory ??
    createSdkAgentStream(compiledForMember, allTools, apiKey, {
      model: opts.model ?? compiled.model,
      cwd: opts.cwd,
      plugins: opts.plugins,
      providers: opts.providers,
      agents: opts.agents,
      budgetTracker: opts.budgetTracker,
      sdkTools: opts.sdkTools,
    })
  const sessionId = opts.sessionId ?? `sub-${crypto.randomUUID()}`

  // 4. Resolve the @MainLoop strategy + reflection, then run the shared reflective loop.
  // V4-T: per-run maxIterations override (parity with AgentRunner.stream); absent ⇒ decorator ceiling.
  const loopStrategy = resolveLoopStrategy(
    spec.strategy ?? 'simple-chat',
    opts.maxIterations ?? spec.maxIterations,
  )
  // V4-T: a custom reflection wins; absent ⇒ the strategy-derived default (ladder/noop).
  const reflection =
    opts.reflection ??
    (loopStrategy.name === 'plan-act-reflect' ? ladderReflectionStrategy : noopReflectionStrategy)
  const result = await runReflectiveLoop(streamFactory, effectiveMessage, sessionId, {
    loop: loopStrategy,
    reflection,
    budget,
    agentName: spec.name,
    signal: opts.signal,
    retry: opts.retry, // V4-T: per-round transient retry (V4-P) on the delegate path
  })

  // M12 — onDelegationComplete: let the supervisor transform the result before it returns.
  const transformed = opts.onDelegationComplete
    ? await opts.onDelegationComplete({ subAgent: spec.name, result })
    : result

  return await moderateDelegationResult(transformed, guardrails)
}

/**
 * Moderate what the CALLER of `delegate` receives.
 *
 * Extracted rather than inlined because inlining it took `delegate` to a cyclomatic complexity of 16
 * against a ceiling of 15 — and a guard that makes a gate fire is a guard somebody deletes.
 *
 * Runs AFTER `onDelegationComplete`, mirroring the input side running after `onDelegationStart`: the
 * caller receives what that hook produced, so a guard placed before it would moderate a string the
 * supervisor may then rewrite.
 *
 * ONE channel, and that is a fact rather than a convenience. `delegate` drains the loop and returns
 * a value, exposing no event stream, so the two-channel split that cost B-012 four review rounds
 * cannot repeat here. Saying so is the point — relying on it silently is how that one was missed.
 *
 * `response` only. `toolCalls[].output` is tool output rather than model text, and
 * `loop/agent-runner.ts` excludes it from `extractText` on the same reasoning; leaving it alone here
 * is that decision applied consistently, not an omission.
 */
async function moderateDelegationResult(
  result: DelegationResult,
  guardrails: readonly Guardrail[],
): Promise<DelegationResult> {
  if (guardrails.length === 0) return result
  return { ...result, response: await runOutputGuards(result.response, guardrails) }
}
