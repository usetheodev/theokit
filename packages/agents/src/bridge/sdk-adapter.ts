/**
 * SDK Adapter — bridges @theokit/agents decorators → @theokit/sdk runtime.
 *
 * Per rule sdk-runtime.md (UNBREAKABLE): @theokit/sdk is the ONLY agent runtime.
 * This adapter replaces llm-runner.ts (which called OpenRouter API directly).
 *
 * Flow: @Agent decorator → compileAgent() → createSdkAgentStream() → SDK Agent.create() → Run.stream()
 */
// M96 — the rationale below, and the `prettier-ignore`, exist for lint budget: this file sits at the
// `max-lines` ceiling (500 lines of code) and the break prettier would make in this import costs
// +11 lines, enough to blow the gate. The `prettier-ignore` must be the LAST comment before the node.
// When `sdk-adapter.ts` is split, the directive goes with it.
// prettier-ignore
import type { AgentDefinition, BudgetTracker, CustomTool, InlineSkill, InteractionUpdate, ModelSelection, Plugin, PluginsSettings, ProviderRoutingSettings, RunEventSink, SendOptions } from '@theokit/sdk'
import type { RetryOptions } from '@theokit/sdk/retry'

import { debugLog } from '../debug-log.js'
import type { ReasoningEffort } from '../types.js'
import { createRunUsageMeter, type RunUsageMeter } from '../usage/run-usage.js'

import type { CompiledAgentOptions, CompiledTool } from './agent-compiler.js'
import type { StreamEvent } from './agent-sse-handler.js'
import { applyPosture, type ApprovalPosture } from './approval-posture.js'
import { type AgentDefinition as TheokitAgentDefinition } from './define-agent.js'
import { type DefinitionOrThunk, resolveProjection } from './definition-or-thunk.js'
import { type SdkMessage } from './event-translator.js'
import { withGuardrails, withStepCeiling } from './handle-wrappers.js'
import { buildModelSelection, contextWindowOf, modelIdOf } from './model-selection.js'
import { assembleM8CreateOptions, realUsageDone } from './sdk-adapter-create-options.js'
import { sdkErrorEvent } from './sdk-error.js'
import {
  createToolSeen,
  flushPendingToolResults,
  type SdkTimelineEvent,
  translateTimelineEvent,
} from './sdk-timeline.js'
import { extractThinkTagStream } from './think-tag-extractor.js'
import { withInjectedToolContext, type ToolContextInjection } from './tool-context-injection.js'
import { stripToolDialectStream } from './tool-dialect-stripper.js'
import { runTurnWithRetry, type TurnOutcome } from './turn-retry.js'

/**
 * Per-request overrides forwarded into `Agent.create` (V4-L.2 + V4-L.3). Bundled into
 * one object (rather than positional params) so the per-request surface can grow without
 * a parameter explosion. Each field is Axis-A SWAP — a value the app holds at call time.
 */
/**
 * A multimodal image for a send turn — the SDK's `SDKImage` shape, typed locally because `@theokit/sdk`
 * is an optional peer (dynamic import). Either a URL or inline base64 `{ data, mimeType }`.
 */
export type BridgeImage = { url: string } | { data: string; mimeType: string }

export interface RuntimeOverrides {
  /** Overrides the model for this call (`?? compiled.model ?? default`). */
  model?: string | ModelSelection
  /**
   * M35 (multimodal) — images to send alongside the text. When present, the SDK send switches from the
   * plain-string form to the structured `{ text, images }` form (`SDKUserMessage`). Absent ⇒ the
   * string path is byte-unchanged (back-compat).
   */
  images?: readonly BridgeImage[]
  /**
   * Per-run extended-thinking effort (`?? compiled.reasoningEffort`). Mapped to the SDK
   * `ModelSelection.params` so the provider produces reasoning (surfaced as `thinking` StreamEvents).
   */
  reasoningEffort?: ReasoningEffort
  /**
   * Per-run opt-in (`?? compiled.parseThinkTags`): when true, wrap the event stream with the M2
   * `<think>`-tag extractor so inline `<think>…</think>` text becomes `thinking` StreamEvents.
   */
  parseThinkTags?: boolean
  /**
   * Per-run opt-in (`?? compiled.stripToolDialect`): when true, strip a leaked Hermes
   * `<function=…></tool_call>` tool-call dialect out of the assistant text stream (theocode#32).
   */
  stripToolDialect?: boolean
  /**
   * Per-run opt-in (`?? compiled.recoverLeakedToolCalls`): when true, enable the SDK chat route's
   * `extractToolCallsFromContent` so a leaked Hermes `<function=…></tool_call>` dialect is recovered
   * and EXECUTED (theokit#58). Sibling of {@link stripToolDialect}; has effect only when {@link providers}
   * routes a provider.
   */
  recoverLeakedToolCalls?: boolean
  /** Per-run cwd → `Agent.create({ local: { cwd } })` → `SystemPromptContext.cwd`. */
  cwd?: string
  /**
   * M7 — per-run run-context override (`?? compiled.runContext`). Injected into every tool
   * handler's `ctx.context` by `buildSdkTools`. Lets a single request override the agent-level
   * `defineAgent({ context })` (mirrors `model`/`cwd`).
   */
  runContext?: Record<string, unknown>
  /**
   * Per-run plugins (e.g. permission gate selected by request mode). Accepts EITHER
   * named-plugin discovery settings (`{ enabled: [...] }`) OR an array of code `Plugin`
   * objects, forwarded RAW through the duck-typed `Agent.create` bridge (mirrors the
   * @theokit/sdk `AgentOptions.plugins` widen).
   */
  plugins?: PluginsSettings | readonly Plugin[]
  /** Per-run provider routing. */
  providers?: ProviderRoutingSettings
  /** Per-run sub-agent definitions (opts-only; `compiled.agents` stays deferred — ADR D3). */
  agents?: Record<string, AgentDefinition>
  /** Per-run SDK budget tracker (inner tool-loop cap; distinct from the loop's USD `budget`). */
  budgetTracker?: BudgetTracker
  /**
   * SDK 4.0 (SE40) — root of the native Claude-shaped `.jsonl` session transcript the SDK writes
   * automatically (`<root>/projects/<encoded-cwd>/<agentId>.jsonl`). The framework threads the
   * app's project root here (see `mount-agent`) so sessions persist per-app; unset ⇒ SDK default
   * (`~/.theokit`). Replaces the removed pluggable `conversationStorage` — persistence is now the
   * SDK's native transcript, not a swappable adapter.
   *
   * Forwarded to the SDK as `local.baseDir`, which that package deprecated in its own #301 in favour
   * of `sessionDir`. It stays `baseDir` on purpose: `sessionDir` does not exist at `^4.52.1`, the
   * floor this package declares, so switching would type-error on the floor and — worse — silently
   * send the transcript to the SDK default `~/.theokit` for any consumer resolving there, losing
   * per-app persistence. Migrating the name is a floor bump, not a rename, and the deprecated field
   * is still honoured. Attempted and reverted rather than assumed: the typecheck gate caught it.
   *
   * **Setting this also relocates the agent's durable MEMORY**, which the SDK's own docstring for
   * the field denies ("Only transcripts are written here"). `MEMORY.md` moves from
   * `<cwd>/.theokit/memory/` to `<root>/projects/<encoded-cwd>/memory/`, while `.index/` and
   * `sessions/` stay behind — so the store looks alive and the capture looks broken. Since the
   * mount sets this unconditionally, it applies to every agent the framework serves.
   *
   * Measured against `@theokit/sdk` 4.62.0 and filed as usetheokit/theokit-sdk#463; the downstream
   * report is usetheokit/theokit#557. Documented here rather than worked around because one SDK
   * field governs both roots — there is no way to place them separately from this side.
   */
  baseDir?: string
  /**
   * V4-Q: pre-built SDK `CustomTool[]` forwarded RAW to `Agent.create.tools` (appended after the
   * compiled tools), bypassing `defineTool` (which requires a Zod schema). Lets an app whose tools
   * come from imperative SDK factories supply them without the `@Tool` compile path.
   */
  sdkTools?: readonly CustomTool[]
  /**
   * theokit#132 — sink for the SDK's typed `RunEvent`s (`tool_progress`, `rate_limit`,
   * `permission_denied`, `task_*`, `compact_boundary`, `tripwire`, `completion_check`), threaded
   * straight to `SendOptions.onRunEvent`.
   *
   * Threaded, NOT multiplexed into the UIMessage stream. These are run diagnostics for an observer —
   * theokit-studio's event inspector is the demand that opened the issue — and folding them into the
   * message protocol would force every consumer of the chat stream to know about frames it has no
   * use for. Threading leaves the chat path byte-identical for anyone who does not opt in, which is
   * why the key is omitted entirely rather than set to `undefined` when absent.
   */
  onRunEvent?: RunEventSink
  /**
   * theokit#474 — per-turn transient retry, opt-in.
   *
   * When set, the START of the turn (the SDK handshake plus its first event, before anything is
   * yielded) is wrapped in the SDK `Retry`, so a 429/5xx/network blip that kills the turn before it
   * produced anything is recovered instead of ending it. Absent ⇒ a single attempt, and the key is
   * omitted from every downstream call, so the stream is byte-identical to before.
   *
   * See `turn-retry.ts` for why a rejection-shaped retry would have been inert on this path, and
   * for the invariant that closes the retry window on the first event.
   */
  retry?: RetryOptions
  /**
   * theokit#475 — expose the run's REAL token usage to tool handlers as `ctx.usage`, opt-in.
   *
   * When true, the adapter installs a {@link RunUsageMeter} as the run's `budgetTracker` (wrapping
   * the caller's own, when there is one) and hands every tool handler a snapshot of what the
   * provider has reported so far. A tool can then answer "how much context is left?" from a
   * measurement instead of a character-count estimate. See `usage/run-usage.ts`.
   *
   * Opt-in rather than always-on because installing a `budgetTracker` changes what `Agent.create`
   * receives for every run that never asked for it, and the back-compat floor here is a floor, not
   * a preference. Absent ⇒ handlers are wrapped exactly as before (`ctx.usage` does not exist) and
   * the SDK receives no tracker it was not already given.
   */
  exposeUsageToTools?: boolean
}

/**
 * theokit#58: clone provider routing with `extractToolCallsFromContent` enabled on every route, so the
 * SDK recovers a leaked Hermes `<function=…></tool_call>` dialect that would otherwise be lost. The SDK
 * reads the flag off the chat route (routes[0]); marking all routes is fail-open — a non-leaking route
 * is unaffected (recovery only fires on a finish with ZERO native tool_calls carrying the dialect).
 */
function withLeakedDialectRecovery(providers: ProviderRoutingSettings): ProviderRoutingSettings {
  return {
    ...providers,
    routes: providers.routes.map((route) => ({ ...route, extractToolCallsFromContent: true })),
  }
}

/**
 * Project the V4-L.3 per-request fields into the `Agent.create` extra surface (absent ⇒ no
 * key). Extracted from the stream generator to keep its cyclomatic complexity within budget (G6).
 * theokit#58: per-run `recoverLeakedToolCalls` (overrides compiled) opts the routed provider into
 * SDK leaked-dialect recovery by cloning the routes with `extractToolCallsFromContent`.
 */
function buildExtraCreateOptions(
  overrides: RuntimeOverrides,
  compiled: CompiledAgentOptions,
): Record<string, unknown> {
  const recoverLeakedToolCalls =
    overrides.recoverLeakedToolCalls ?? compiled.recoverLeakedToolCalls ?? false
  const extra: Record<string, unknown> = {}
  // A per-run plugin override (e.g. the HITL gate) must NOT silently drop the agent's own code plugins:
  // `extra` is spread AFTER the assembled options, so a bare assignment clobbered `compiled.plugins`
  // and every `createToolHooksPlugin` hook was lost whenever HITL was active. Concatenate when both
  // sides are arrays; keep the previous replace semantics for the legacy `{ enabled }` object form.
  if (overrides.plugins !== undefined) {
    // `Array.isArray` narrows to `any[]`, losing the element type — a local guard keeps it.
    const asArray = (v: unknown): readonly unknown[] | undefined =>
      Array.isArray(v) ? (v as readonly unknown[]) : undefined
    const overrideList = asArray(overrides.plugins)
    const compiledList = asArray(compiled.plugins)
    extra.plugins =
      overrideList !== undefined && compiledList !== undefined
        ? [...compiledList, ...overrideList]
        : overrides.plugins
  }
  if (overrides.providers !== undefined) {
    extra.providers = recoverLeakedToolCalls
      ? withLeakedDialectRecovery(overrides.providers)
      : overrides.providers
  }
  if (overrides.agents !== undefined) extra.agents = overrides.agents
  if (overrides.budgetTracker !== undefined) extra.budgetTracker = overrides.budgetTracker
  return extra
}

/**
 * theokit#363 — put the DECLARED step ceiling on the send the served agent actually makes.
 *
 * `compiled.maxIterations` was written by every authoring path (`@Agent`, `@MainLoop`, `defineAgent`,
 * the builder) and read by none of them on this path: `runReflectiveLoop` enforces a ceiling, and
 * `runReflectiveLoop` has zero call sites under `packages/theo/src`. So a served agent that declared
 * a cap ran to the SDK's own default instead, and the declaration was decoration.
 *
 * ## Why `SendOptions.maxIterations` and not a `budgetTracker`
 *
 * `Agent.create({ budgetTracker })` looks like the seam — `createCounterBudgetTracker({ maxIterations })`
 * exists, and the compiled loop does call `check()` / `nextIteration()`. Two things rule it out, both
 * read off the published contract rather than the bundle:
 *
 * 1. The `.d.ts` for `AgentOptions.budgetTracker` states the option is "wired to the type surface
 *    only" and that consumers passing a tracker "get the type guarantee but NOT runtime enforcement".
 *    The shipped bundle enforces it anyway, but building the framework's step cap on behavior the
 *    contract disclaims makes a silent no-op one SDK patch away.
 * 2. A tracker is stateful and lives on the AGENT, and `Agent.getOrCreate` returns a CACHED agent
 *    (options ignored on a hit). Its iteration counter therefore accumulates across turns of a
 *    session — `toAgentFactory`'s handle is exactly that shape — so an agent declaring 5 would hard-
 *    fail partway through a conversation rather than cap each turn. And its limit sets the run's
 *    status to `error`; a step cap that is REACHED is not a failure.
 *
 * `SendOptions.maxIterations` is the SDK's documented per-send ceiling on tool-calling turns,
 * validated at its own boundary, and reaching it ends the run cleanly with `stoppedAtIterationLimit`.
 * That is what a step cap means. It also needs no runtime symbol, so no optional-peer guard: an older
 * SDK that predates the option simply ignores an extra field instead of the adapter degrading.
 *
 * NO NEW DEFAULT: when nothing was declared the key is omitted entirely, so the SDK's own ceiling
 * (8, unchanged) still applies and every agent that never asked for a cap runs byte-identically.
 */
function applyStepCeiling(sendOptions: SendOptions, maxIterations: number | undefined): void {
  if (maxIterations !== undefined) sendOptions.maxIterations = maxIterations
}

/** The `@theokit/sdk` `Agent` surface the adapter drives (dynamic-import shape, kept minimal). */
interface SdkAgentApi {
  getOrCreate: (
    id: string,
    opts: Record<string, unknown>,
  ) => Promise<{
    // #40: the SDK token-streams ONLY via send's onDelta callback (proven empirically);
    // run.stream() yields complete messages. The adapter merges both.
    send: (
      msg: string,
      // onDelta receives `{ update: InteractionUpdate }`; toolChoice gates tools for this send.
      opts?: {
        onDelta?: (d: { update: InteractionUpdate }) => void
        toolChoice?: 'auto' | 'none' | 'required'
      },
    ) => Promise<{
      stream: () => AsyncGenerator<SdkMessage>
      // V4-N.1: the SDK Run's terminal await — carries the real per-run token usage + cost.
      // V4-O: usage also carries optional reasoning/cache buckets (forwarded by realUsageDone).
      // theokit#379: it ALSO carries why the run stopped. This shape declared three fields, so
      // `realUsageDone` had no status to read even had it wanted one — the boundary, not the SDK,
      // is what dropped the outcome. Both flags are optional, so an SDK that predates them (or one
      // that finished cleanly) reads `undefined` rather than breaking — the same optional-peer
      // discipline `applyStepCeiling` uses for the ceiling travelling the other way.
      wait: () => Promise<{
        result?: string
        usage?: {
          inputTokens?: number
          outputTokens?: number
          reasoningTokens?: number
          cacheReadTokens?: number
          cacheWriteTokens?: number
        }
        cost?: { amount?: number }
        stoppedAtIterationLimit?: boolean
        stoppedByDoomLoop?: boolean
        /**
         * theokit#474 — the run's failure detail, whose `cause` is the TYPED error the loop threw
         * (`script.errorDetail.cause`). It is the only place the error's CLASS survives: the event
         * stream reports the same failure as a `status: "ERROR"` message carrying text alone.
         * Optional, so an SDK that predates it reads `undefined` rather than breaking — the same
         * optional-peer discipline the two flags above use.
         */
        error?: { message?: string; code?: string; cause?: unknown }
      }>
    }>
    dispose: () => Promise<void>
  }>
}

/** The resolved `@theokit/sdk` runtime symbols the adapter needs, bound after the dynamic import. */
interface SdkRuntime {
  Agent: SdkAgentApi
  defineTool: (spec: {
    name: string
    description: string
    inputSchema: unknown
    handler: CustomTool['handler']
  }) => unknown
  /**
   * SE23 — optional `skill_read` tool factory. Absent on SDKs older than it shipped; guarded with `in`
   * at load so an older peer degrades gracefully (inline skills still list in the `<skills>` block, they
   * just aren't auto-readable). Used to auto-wire reading for `defineAgent({ skills: [inlineSkill] })`.
   */
  defineSkillReadTool?: (skills: readonly InlineSkill[]) => unknown
}

/**
 * Dynamically import `@theokit/sdk` (optional peer dep) and bind the runtime symbols; `null` when it
 * is not installed (the caller emits `SDK_NOT_INSTALLED`). SDK 4.0 (SE40) writes the session transcript
 * natively — there is no pluggable storage to load; persistence is automatic (see `local.baseDir`).
 */
async function loadSdkRuntime(): Promise<SdkRuntime | null> {
  try {
    const sdk = await import('@theokit/sdk')
    // SE36 (SDK v3.0) — the public factories became `X.create()`: `defineTool`→`Tool.create`,
    // `defineSkillReadTool`→`SkillReadTool.create`. Guard on the VALUE (not `'…' in sdk`) so a peer
    // that omits `SkillReadTool` degrades gracefully instead of calling `.create` on `undefined`.
    const skillReadTool = 'SkillReadTool' in sdk ? sdk.SkillReadTool : undefined
    return {
      Agent: sdk.Agent as unknown as SdkAgentApi,
      // `.bind` keeps the static factory callable when detached from `sdk.Tool` (it takes no `this`,
      // but binding is explicit + satisfies unbound-method rather than relying on that).
      defineTool: sdk.Tool.create.bind(sdk.Tool) as unknown as SdkRuntime['defineTool'],
      ...(skillReadTool ? { defineSkillReadTool: (skills) => skillReadTool.create(skills) } : {}),
    }
  } catch (err) {
    console.warn('[theokit] @theokit/sdk import failed:', err)
    return null
  }
}

/**
 * Resolve the per-run opt-in text-transform flags, each `override ?? compiled ?? false` (mirrors `model`).
 */
function resolveTextTransformFlags(
  compiled: CompiledAgentOptions,
  overrides: RuntimeOverrides,
): { parseThinkTags: boolean; stripToolDialect: boolean } {
  return {
    parseThinkTags: overrides.parseThinkTags ?? compiled.parseThinkTags ?? false,
    stripToolDialect: overrides.stripToolDialect ?? compiled.stripToolDialect ?? false,
  }
}

/**
 * Compose the opt-in text-stream transforms over the merged event stream, in fixed order:
 * `<think>`-tag extraction (M2) first, then tool-dialect stripping (theocode#32) on the post-think
 * `text_delta`. Both default off ⇒ the merged stream is returned unchanged (byte-identical).
 */
function applyTextTransforms(
  events: AsyncIterable<StreamEvent>,
  opts: { parseThinkTags: boolean; stripToolDialect: boolean },
): AsyncIterable<StreamEvent> {
  let out = opts.parseThinkTags ? extractThinkTagStream(events) : events
  if (opts.stripToolDialect) out = stripToolDialectStream(out)
  return out
}

/**
 * A tool whose `inputSchema` is a live Zod schema (from `@Tool({ input })`) needs the SDK's
 * `defineTool` to lower it to JSON Schema + wrap parsing. A tool whose `inputSchema` is already a
 * JSON-Schema object (from `defineAgentTool`, which pre-converts via `z.toJSONSchema`) is ALREADY an
 * SDK-ready `CustomTool` and MUST be appended raw — re-running it through `defineTool` (which reads
 * Zod internals like `.def`) crashes. Every Zod schema exposes `.parse`; a JSON-Schema object does not.
 */
function hasZodInputSchema(schema: unknown): boolean {
  return typeof (schema as { parse?: unknown } | null | undefined)?.parse === 'function'
}

/**
 * Build the SDK tool list: `@Tool`s (Zod `inputSchema`) lowered via `defineTool`; `defineAgentTool`
 * results (already SDK-ready `CustomTool`s with a JSON-Schema `inputSchema`) and any pre-built
 * `sdkTools` appended RAW — must NOT re-run through `defineTool` (V4-Q). Extracted for G6.
 *
 * When `runContext` is set, every tool handler is wrapped to receive it as `ctx.context` (M7); when
 * `meter` is set, the same wrapper adds `ctx.usage` (theokit#475). With NEITHER, handlers are passed
 * through unwrapped and by the same reference — byte-identical to pre-M7.
 */
function buildSdkTools(
  compiledTools: CompiledTool[],
  defineTool: (spec: {
    name: string
    description: string
    inputSchema: unknown
    handler: CustomTool['handler']
  }) => unknown,
  extraSdkTools: readonly CustomTool[] = [],
  runContext?: unknown,
  meter?: RunUsageMeter,
): unknown[] {
  const injection: ToolContextInjection = {
    ...(runContext !== undefined ? { runContext: { value: runContext } } : {}),
    ...(meter !== undefined ? { meter } : {}),
  }
  const has = injection.runContext !== undefined || injection.meter !== undefined
  const inject = (h: CustomTool['handler']): CustomTool['handler'] =>
    has ? withInjectedToolContext(h, injection) : h
  return [
    ...compiledTools.map((t) => {
      if (hasZodInputSchema(t.inputSchema)) {
        return defineTool({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          handler: inject(t.handler),
        })
      }
      // Already an SDK-ready CustomTool (JSON-Schema inputSchema) — forward RAW (same reference)
      // unless this layer must inject something into its handler.
      return has ? { ...t, handler: inject(t.handler) } : t
    }),
    ...extraSdkTools.map((t) => (has ? { ...t, handler: inject(t.handler) } : t)),
  ]
}

/**
 * Creates an agent stream factory using @theokit/sdk as the runtime.
 *
 * Returns a function that, given a message + sessionId, yields TheoKit
 * AgentStreamEvent via the SDK's Agent.create() + Run.stream() pipeline.
 */
/** M74 — resolves the credential when the stream/session STARTS; with a `string` the value arrived frozen. */
const resolverApiKey = async (k: string | (() => string | Promise<string>)): Promise<string> =>
  typeof k === 'function' ? await k() : k

export function createSdkAgentStream(
  compiled: CompiledAgentOptions,
  compiledTools: CompiledTool[],
  apiKey: string | (() => string | Promise<string>),
  overrides: RuntimeOverrides = {},
) {
  const model = overrides.model ?? compiled.model ?? 'openai/gpt-4o-mini'
  // M1 reasoning-visibility: per-run effort overrides the compiled @Agent effort (mirrors `model`).
  const reasoningEffort = overrides.reasoningEffort ?? compiled.reasoningEffort
  // Per-run opt-in text-stream transforms (each overrides the compiled @Agent flag, mirrors `model`):
  // parseThinkTags (M2, <think> extraction), stripToolDialect (theocode#32, leaked-dialect strip).
  const { parseThinkTags, stripToolDialect } = resolveTextTransformFlags(compiled, overrides)
  // M7 — run-context resolved once per stream: per-run override wins over the agent-level
  // `defineAgent({ context })`; injected into every tool's `ctx.context` by buildSdkTools.
  const runContext = overrides.runContext ?? compiled.runContext
  // SDK 4.0 (SE40): history persists across the loop's rounds via the SDK's native `.jsonl` transcript
  // (keyed by `sessionId`/`agentId` under `local.baseDir`). No theokit-side store — the SDK owns it.

  // `factoryOpts.disableTools` (step-cap force-close) → `tool_choice:"none"` at send-time.
  const factory = (
    message: string,
    sessionId: string,
    factoryOpts?: { disableTools?: boolean },
  ): AsyncIterable<StreamEvent> => ({
    async *[Symbol.asyncIterator]() {
      const runId = `run-${Date.now()}`
      const t0 = Date.now()

      // Dynamic import — @theokit/sdk is optional peer dep (null ⇒ not installed).
      const rt = await loadSdkRuntime()
      if (!rt) {
        yield {
          type: 'error',
          code: 'SDK_NOT_INSTALLED',
          message: 'Install @theokit/sdk: pnpm add @theokit/sdk',
          retryable: false,
        }
        return
      }

      // theokit#475 — one meter per turn, opt-in. It is both the `budgetTracker` the SDK reports
      // real usage to and the reader every tool handler is handed, so the two halves cannot drift.
      // The window is the DECLARED one (`ModelSelection.contextWindow`) or absent — see
      // `contextWindowOf` for why the model catalog is not consulted here.
      const usageMeter =
        overrides.exposeUsageToTools === true
          ? createRunUsageMeter({
              contextWindowTokens: contextWindowOf(model),
              delegate: overrides.budgetTracker,
            })
          : undefined

      // M7 — pass the resolved run-context so every tool handler receives it as `ctx.context`.
      const sdkTools = buildSdkTools(
        compiledTools,
        rt.defineTool,
        overrides.sdkTools,
        runContext,
        usageMeter,
      )

      // Auto-wire `skill_read` for inline skills (`defineAgent({ skills: [inlineSkill] })`). An inline
      // skill lists in the `<skills>` block by name + description only — its body is unreachable to the
      // model without the `skill_read` tool, so registering an inline skill implies wanting it readable.
      // One `.skills([...])` call thus both registers AND makes the skill readable. Dedup: skip when the
      // app already declared a `skill_read` (an explicit `defineSkillReadTool` wins). Graceful: skip when
      // the loaded SDK predates `defineSkillReadTool` (inline skills still list, just not auto-readable).
      const inlineSkills = compiled.skills?.inline
      if (
        inlineSkills !== undefined &&
        inlineSkills.length > 0 &&
        rt.defineSkillReadTool !== undefined &&
        !compiledTools.some((t) => t.name === 'skill_read')
      ) {
        sdkTools.push(rt.defineSkillReadTool(inlineSkills))
      }
      // Wiring triad pillar (c) — M7 run-context metric: observable proof that context injection is active.
      let runContextSource: string
      if (overrides.runContext !== undefined) {
        runContextSource = 'per-run'
      } else if (compiled.runContext !== undefined) {
        runContextSource = 'agent-level'
      } else {
        runContextSource = 'none'
      }
      debugLog('[THEO_AGENT_M7_RUN_CONTEXT]', {
        source: runContextSource,
        keys: runContext !== undefined ? Object.keys(runContext) : [],
      })

      const turnOpts: StreamSdkAgentOpts = {
        apiKey: await resolverApiKey(apiKey),
        model,
        reasoningEffort,
        overrides,
        parseThinkTags,
        stripToolDialect,
        sessionId,
        message,
        factoryOpts,
        runId,
        t0,
        ...(usageMeter !== undefined ? { usageMeter } : {}),
      }
      try {
        // theokit#474 — with no `retry` declared, `runTurnWithRetry` returns the single attempt it
        // always made, with the same arguments; the retry machinery exists only for a caller that
        // asked for it.
        yield* runTurnWithRetry(
          (outcome) =>
            streamSdkAgent(
              rt,
              compiled,
              sdkTools,
              outcome === undefined ? turnOpts : { ...turnOpts, outcome },
            ),
          overrides.retry,
        )
      } catch (err) {
        yield sdkErrorEvent(err)
      }
    },
  })

  // The resolved model is the one silent fallback in this path that matters: a caller passing the
  // wrong argument shape (as the HTTP app builder did) gets `openai/gpt-4o-mini` with no error and
  // no way to tell. Exposing it makes the resolution observable — and testable.
  return Object.assign(factory, { resolvedModel: model })
}

interface StreamSdkAgentOpts {
  apiKey: string
  model: string | ModelSelection
  reasoningEffort: string | undefined
  overrides: RuntimeOverrides
  parseThinkTags: boolean
  stripToolDialect: boolean
  sessionId: string
  message: string
  factoryOpts: { disableTools?: boolean } | undefined
  runId: string
  t0: number
  /** theokit#475 — present when the run opted into exposing usage to tools; it IS the tracker. */
  usageMeter?: RunUsageMeter
  /**
   * theokit#474 — where a turn that fails BEFORE yielding anything reports its typed error, so the
   * retry policy can ask `isTransientError` instead of guessing from the event's text. Present only
   * when a `retry` was declared; absent ⇒ the failure lookup below never runs.
   */
  outcome?: TurnOutcome
}

/**
 * Inner streaming kernel (G6 extraction): creates the SDK agent, runs the send+stream loop,
 * and disposes. Errors propagate to the outer generator's catch. The `finally` inside guarantees
 * disposal even when `run.wait()` rejects (V4-N.1).
 */
async function* streamSdkAgent(
  rt: SdkRuntime,
  compiled: CompiledAgentOptions,
  sdkTools: unknown[],
  opts: StreamSdkAgentOpts,
): AsyncGenerator<StreamEvent> {
  const { Agent } = rt
  const {
    apiKey,
    model,
    reasoningEffort,
    overrides,
    parseThinkTags,
    stripToolDialect,
    sessionId,
    message,
    factoryOpts,
    runId,
    t0,
  } = opts

  // Project the compiled M8 decorator fields into native Agent.create args.
  const { options: m8, applied } = assembleM8CreateOptions(compiled)
  if (overrides.cwd !== undefined) m8.local = { ...m8.local, cwd: overrides.cwd }
  // SDK 4.0 (SE40): root the native session transcript at the framework-resolved app root when known
  // (mount-agent threads it), so sessions persist per-app; unset ⇒ SDK default (`~/.theokit`).
  if (overrides.baseDir !== undefined) m8.local = { ...m8.local, baseDir: overrides.baseDir }
  const extra = buildExtraCreateOptions(overrides, compiled)
  // theokit#475 — the meter REPLACES the tracker key set just above, because it already wraps that
  // same caller tracker (`createRunUsageMeter({ delegate })`). `Agent.create` takes one tracker;
  // handing it the wrapper is what makes the SDK's per-completion `track()` reach both the caller's
  // budget gate and the snapshot a tool reads.
  if (opts.usageMeter !== undefined) extra.budgetTracker = opts.usageMeter.tracker
  if (applied.length > 0) {
    // Wiring triad — runtime metric: observable proof the decorators fired (opt-in via THEOKIT_DEBUG).
    debugLog('[THEO_AGENT_M8_RUNTIME_APPLIED]', {
      skills: applied.includes('skills'),
      contextWindow: applied.includes('context'),
      projectContext: applied.includes('projectContext'),
    })
  }

  // V4-N.1: declared before try so `finally` can dispose even when `run.wait()` rejects.
  const agent = await Agent.getOrCreate(sessionId, {
    apiKey,
    model: buildModelSelection(model, reasoningEffort),
    tools: sdkTools,
    ...m8,
    ...extra,
  })
  try {
    // theokit#140 — ONE ordered source. The `onDelta` sink + merge queue are gone: the SDK's
    // `run.events()` appends messages and deltas as the loop reports them, so arrival order IS
    // model order, and `textAlreadyStreamed` tells us which text is a repeat instead of leaving us
    // to compare content. `state` survives only to carry the two facts the tail block below needs.
    const state = { sawError: false, lastEventType: '' }
    const sendOptions: SendOptions = {}
    if (factoryOpts?.disableTools === true) sendOptions.toolChoice = 'none'
    applyStepCeiling(sendOptions, compiled.maxIterations)
    // theokit#132 — hand the caller's sink to the SDK. Set only when supplied: an `onRunEvent:
    // undefined` riding along would still change what the SDK receives on the non-opted-in path,
    // and back-compat here is a floor, not a preference.
    if (overrides.onRunEvent !== undefined) sendOptions.onRunEvent = overrides.onRunEvent
    // M35 — when images are present, use the SDK's structured `SDKUserMessage { text, images }` form so
    // the model receives them alongside the text; otherwise the plain-string form is unchanged (back-compat).
    const sendInput =
      overrides.images && overrides.images.length > 0
        ? { text: message, images: overrides.images }
        : message
    const sendPromise = agent.send(sendInput as typeof message, sendOptions)
    // The generator is opened lazily so consumption starts only when the caller pulls — the loop is
    // detached inside the SDK (`setTimeout(() => void driveLoop())`), so the run handle is available
    // long before the turn finishes and the timeline streams live.
    const timeline = async function* (): AsyncGenerator<StreamEvent> {
      const run = (await sendPromise) as unknown as {
        events: () => AsyncGenerator<SdkTimelineEvent>
      }
      const seen = createToolSeen()
      const emit = function* (events: StreamEvent[]): Generator<StreamEvent> {
        for (const event of events) {
          if (event.type === 'error') state.sawError = true
          // #142 — the SDK's `done` stays suppressed here, on the promise that the tail block below
          // emits the terminal frame (a real-usage `done`, or an `error` when the turn failed).
          if (event.type === 'done') continue
          state.lastEventType = event.type
          yield event
        }
      }
      for await (const ev of run.events()) {
        const translated = translateTimelineEvent(ev, runId, seen)
        // theokit#474 — recover the run's TYPED failure, but ONLY for a turn that failed before
        // yielding anything (`lastEventType === ''`), which is the one case the retry seam can act
        // on. Bounded that tightly for two reasons: every other run pays nothing, and in this case
        // `wait()` is already resolved — the SDK yields a `status: "ERROR"` message only from
        // `terminalErrorEvent()`, i.e. after `transitionTo("error")` resolved the termination
        // promise. Awaiting it for a NON-terminal error would be a way to hang the stream.
        if (
          opts.outcome !== undefined &&
          state.lastEventType === '' &&
          translated.some((e) => e.type === 'error')
        ) {
          opts.outcome.failure = (await (await sendPromise).wait()).error?.cause
        }
        yield* emit(translated)
      }
      // #388 — a tool result held for a second report the run never sent still belongs on the wire.
      // Without this, a turn whose last act was a tool call would drop it: the hold is released by
      // the next timeline event, and a run that ends has none.
      yield* emit(flushPendingToolResults(seen))
    }
    for await (const event of applyTextTransforms(timeline(), {
      parseThinkTags,
      stripToolDialect,
    })) {
      yield event
    }
    // #142 — the stream ALWAYS ends on a terminal frame.
    //
    // The SDK's `done` is suppressed in the merge, on the promise that this block emits the final
    // frame. Before, that promise broke when `sawError`: nothing was emitted, and the stream simply
    // ended. It would only be correct if `error` were always the LAST event — and it is not: the merge
    // marks `sawError` and KEEPS emitting. A UI that flips its "turn finished" flag on a terminal
    // frame got stuck.
    //
    // `done` is still SUPPRESSED when there was an error (contract H1, pinned by
    // `test_run_stream_error_status_emits_error_and_suppresses_done`) — `done` keeps meaning
    // "finished well". What changes is the guarantee: when there was an error and the last event was
    // not the `error`, a terminal `error` closes the stream. So "the last frame is `done` OR `error`"
    // always holds, which is the post-condition that was missing.
    if (state.sawError) {
      if (state.lastEventType !== 'error') {
        yield {
          type: 'error',
          code: 'RUN_FAILED',
          message: 'The turn ended with an error; see the earlier `error` event.',
          retryable: false,
        }
      }
    } else {
      // `modelIdOf(model)` and not `compiled.model`: `model` here is the RESOLVED value
      // (`overrides.model ?? compiled.model ?? 'openai/gpt-4o-mini'`), which is what actually ran
      // and therefore what a cost is computed against (usetheokit/theokit#368).
      yield realUsageDone(await (await sendPromise).wait(), t0, modelIdOf(model))
    }
  } finally {
    await agent.dispose()
  }
}

/**
 * The minimal `SDKAgent` surface a serving host needs (ACP checks `agentId: string` + `send: fn`).
 * `Agent.getOrCreate` returns the real SDK agent — this alias just types what {@link toAgentFactory}
 * hands back without re-exporting the full `@theokit/sdk` `Agent` type.
 */
/**
 * The minimum a turn returns. Structural on purpose (M91's ADR-2).
 *
 * Re-exporting the SDK's type would tie this layer's public signature to theirs — the opposite of
 * what the boundary exists to do, and the same reason `SdkAgentHandle` was already an alias rather
 * than a
 * re-export.
 */
export interface SdkTurnHandle {
  wait: () => Promise<{ result?: string; usage?: { totalTokens?: number } }>
}

/** Per-turn options. Open for now — the SDK accepts more than the layer needs to declare. */
export type SdkSendOptions = Record<string, unknown>

export interface SdkAgentHandle {
  readonly agentId: string
  /**
   * B-062 — a tool-using run that returns schema-validated output.
   *
   * The SDK's `agent.generate(input, { output })` "runs the agent's NORMAL tool loop (the user's
   * tools run first) and then coerces the final answer into a Zod schema". It existed and this
   * handle did not declare it, so a consumer of `@theokit/agents` could reach it only by importing
   * `@theokit/sdk` directly — the one thing this layer's doctrine forbids.
   *
   * The survey that filed this concluded the capability was absent, having measured `generateObject`
   * — which is the TOOLLESS path by design: it builds a transient agent whose only tool is the
   * synthetic output tool. Both paths exist and answer different questions.
   *
   * OPTIONAL, because a caller-injected handle (tests, a custom transport) need not implement it,
   * and requiring it would break every such double to add a method most of them never call.
   *
   * BOTH wrappers below forward it. A wrapper that rebuilds the handle silently removes every method
   * it does not name, and the consumer meets the loss at runtime as "the handle has no `generate`"
   * after the types said it had one. Each forward is pinned by its own mutation.
   *
   * It is NOT put through the output guards, stated rather than assumed: `generate` resolves to a
   * validated OBJECT and those guards moderate TEXT, so running them over a serialised object would
   * moderate a shape no guard was written against. Guarding the structured path needs its own
   * decision about what a redaction means to a schema, and inventing one would be the gate that
   * reports without gating this module already refuses to build.
   */
  readonly generate?: (
    message: string,
    options: { output: unknown; [key: string]: unknown },
  ) => Promise<unknown>
  /**
   * M91 — era `(msg: string, opts?: unknown) => unknown`.
   *
   * The `unknown` return cost the consumer a whole module: `agents/lib/goal/runner-facade.ts`, 38
   * lines whose only job was to re-narrow this return into the `send → wait` contract the goal loop
   * requires. That module's docstring records that, before it, the caller wrote `as never` — and that
   * **it was under that cover that the goal surface diverged from the real agent for several
   * milestones**. The layer always knew the shape; it simply did not declare it.
   *
   * The shape is **asynchronous**: `SDKAgent.send` returns `Promise<Run>`, and the SDK's
   * `GoalLoopAgent` declares `send(prompt): Promise<{ wait(): Promise<…> }>`. This milestone's first
   * attempt typed it as synchronous and the consumer's `tsc` would not have caught it — the facade's
   * `as never` absorbed the difference. It is literally the divergence the facade's docstring
   * described, met again while trying to remove it.
   */
  send: (msg: string, opts?: SdkSendOptions) => Promise<SdkTurnHandle>
  dispose: () => Promise<void>
}

/**
 * #12 — bridge a builder/`defineAgent` {@link TheokitAgentDefinition} to a real `SDKAgent` FACTORY,
 * so surfaces that require an `SDKAgent` (or `(sessionId) => SDKAgent`) — notably `theokit acp`,
 * whose entry default-export must be one — can serve an agent defined with the `AgentBuilder.create()` chain.
 *
 * The factory reuses the SAME projection the streaming path uses (`compileAgentDefinition` → tools /
 * model / `assembleM8CreateOptions`), so the served agent has identical tools, model, system prompt,
 * skills, and `mcpServers`. Keyed per `sessionId` via `Agent.getOrCreate` (matches the run path).
 *
 * M96 — the surface DECLARES its {@link ApprovalPosture} and the factory installs the plugin the
 * variant requires. Before, the `compiled.hitl` map was compiled and DISCARDED here. Rationale in
 * `./approval-posture.ts`.
 */
export function toAgentFactory(
  def: DefinitionOrThunk,
  // M74 — the seam the consumer's surfaces actually use (ACP, autonomous loop, delegation).
  // M96 — `approvals` is MANDATORY: absence was the defect, and an optional field would reintroduce it.
  opts: {
    apiKey: string | (() => string | Promise<string>)
    approvals: ApprovalPosture
    overrides?: RuntimeOverrides
  },
): (sessionId: string) => Promise<SdkAgentHandle> {
  const overrides = opts.overrides ?? {}
  const projectPerSession = resolveProjection(def, overrides)
  return async (sessionId: string): Promise<SdkAgentHandle> => {
    // OBJECT shape: returns the projection already built. THUNK shape: projects now, for this session.
    const { compiled, model, reasoningEffort, runContext } = await projectPerSession(sessionId)
    const rt = await loadSdkRuntime()
    if (!rt) {
      throw new Error(
        '[@theokit/agents] @theokit/sdk is not installed — run: pnpm add @theokit/sdk',
      )
    }
    const sdkTools = buildSdkTools(compiled.tools, rt.defineTool, overrides.sdkTools, runContext)
    // Auto-wire `skill_read` for inline skills (mirror createSdkAgentStream) so an inline skill's
    // body stays reachable to the model when this factory serves the agent.
    const inlineSkills = compiled.skills?.inline
    if (
      inlineSkills !== undefined &&
      inlineSkills.length > 0 &&
      rt.defineSkillReadTool !== undefined &&
      !compiled.tools.some((t) => t.name === 'skill_read')
    ) {
      sdkTools.push(rt.defineSkillReadTool(inlineSkills))
    }
    const { options: m8 } = assembleM8CreateOptions(compiled)
    if (overrides.cwd !== undefined) m8.local = { ...m8.local, cwd: overrides.cwd }
    if (overrides.baseDir !== undefined) m8.local = { ...m8.local, baseDir: overrides.baseDir }
    const extra = buildExtraCreateOptions(overrides, compiled)
    applyPosture(extra, m8, opts.approvals, compiled.hitl)
    const agent = await rt.Agent.getOrCreate(sessionId, {
      apiKey: await resolverApiKey(opts.apiKey),
      model: buildModelSelection(model, reasoningEffort),
      tools: sdkTools,
      ...m8,
      ...extra,
    })
    return withGuardrails(
      withStepCeiling(agent as unknown as SdkAgentHandle, compiled.maxIterations),
      compiled.guardrails,
    )
  }
}

/**
 * theokit#139 — wrap a served handle so the declared guardrails actually run.
 *
 * The other half of the reported bypass. `compileAgentDefinition` produces `compiled.guardrails`
 * from `.guardrails([...])`, and only `loop/agent-runner.ts` ever read it — so the SAME definition
 * served over ACP ran with every input and output guard absent. An agent whose author declared
 * "block prompt injection" answered injected prompts; one that declared "redact secrets" returned
 * them. (The HITL half was closed by M96, which made `approvals` a mandatory `ApprovalPosture`.)
 *
 * ## Why here, and not as an SDK plugin
 *
 * The issue proposes compiling guardrails into a `Plugin` so enforcement is runtime-level. Measured
 * against the SDK's hook surface at 4.37.0, that is not achievable: `pre_user_send` returns only
 * `PreUserSendResult { recalledContext? }`, so a handler can add memory context but cannot block or
 * rewrite the prompt; and `post_assistant_reply` is documented fire-and-forget — its return value is
 * discarded and `wait()` never blocks on it. Neither can reject or redact, which is the entire job
 * of a guard. Enforcing there would produce a gate that reports without gating, which is worse than
 * the current honest absence.
 *
 * So it lands where the framework already owns the boundary (ADR-0040 § D2 — guards at the boundary
 * are framework core, not runtime), reusing `runInputGuards`/`runOutputGuards` rather than
 * reimplementing the policy: two copies of a security rule is how the two paths diverged in the
 * first place.
 *
 * ## The residual gap, stated
 *
 * The runner moderates the STREAM as it flows (`moderateOutputStream`); this handle exposes no
 * stream, only `wait()`, so output guards land on the completed reply. A blocked output is still
 * blocked — it is simply not blocked mid-token. Closing that needs a streaming seam on the handle,
 * which is a change to the served contract and belongs to its own slice.
 */
