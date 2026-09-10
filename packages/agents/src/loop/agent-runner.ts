/**
 * AgentRunner — the imperative twin of `@MainLoop` (plan ADR D4, V4-B).
 *
 * `AgentRunner.fromSpec(spec).reflection().stream().build()` resolves the loop strategy from
 * an already-compiled spec (the capability-authored agent). `delegate()` shares the same runtime.
 * `build()` is the compile boundary (no I/O, no IoC — standalone, mirrors
 * Spring's `ChatClient.builder(...).build()`); `stream()`/`run()` do the I/O via
 * `runReflectiveLoopStream` (the SAME loop `delegate()` drains — DRY, ADR 0031).
 * V4-D-stream: `stream()` yields events live (SSE-first); `run()` drains it to a result.
 *
 * reference: knowledge-base/references/spring-ai DefaultChatClientBuilder.java (build() returns standalone).
 */
import type {
  AgentDefinition,
  BudgetTracker,
  CustomTool,
  Plugin,
  PluginsSettings,
  ProviderRoutingSettings,
} from '@theokit/sdk'
import type { RetryOptions } from '@theokit/sdk/retry'

import type { CompiledAgentOptions, CompiledTool } from '../bridge/agent-compiler.js'
import type { StreamEvent } from '../bridge/agent-sse-handler.js'
import type { DelegationResult } from '../bridge/delegation-types.js'
import { createSdkAgentStream } from '../bridge/sdk-adapter.js'
import { moderateOutputStream, runInputGuards } from '../guardrails/index.js'
import type { MainLoopMeta, ReasoningEffort } from '../types.js'

import {
  resolveCompactionStrategy,
  type TranscriptCompactionStrategy,
} from './compaction-strategy.js'
import {
  assertValidCustomLoopStrategy,
  type LoopStrategy,
  resolveLoopStrategy,
} from './loop-strategy.js'
import {
  ladderReflectionStrategy,
  noopReflectionStrategy,
  type ReflectionStrategy,
} from './reflection-strategy.js'
import { type RoundStreamFactory, runReflectiveLoopStream } from './run-reflective-loop.js'

/**
 * Resolves the credential at the start of the stream, instead of demanding the value ready before the call.
 *
 * M74 — the credential injection point was ALREADY per run; what blocked it was the type. With a
 * `string`, the caller must hold the value beforehand, so the *moment* is per run but the *value* is
 * frozen earlier — and a short-lived OAuth bearer crosses the whole run without being re-fetched. It
 * was the structural cause of a silent turn in production.
 */
export type CredentialResolver = () => string | Promise<string>

/** Options for {@link AgentRunner.run}. */
export interface AgentRunnerRunOptions {
  /**
   * The LLM API key, or a resolver called when the stream starts.
   *
   * `string` remains valid and is the path for anyone holding an API key — it does not expire, and
   * demanding a resolver there would be ceremony with no gain. The resolver exists for credentials
   * that EXPIRE.
   */
  readonly apiKey: string | CredentialResolver
  /** Session id override (default: a fresh isolated id). */
  readonly sessionId?: string
  /** Cumulative USD budget across rounds. */
  readonly budget?: number
  /** Cancellation — aborts stop the reflective loop from re-entering. */
  readonly signal?: AbortSignal
  /**
   * V4-J: per-run tool override. When provided, REPLACES the build-time
   * `compiled.tools` for this call only (e.g. a consumer that selects tools by
   * request mode/permission). Absent ⇒ the agent's compiled tools (unchanged).
   */
  readonly tools?: readonly CompiledTool[]
  /**
   * V4-L.2 (Axis-A SWAP): per-run model override. Merge-over-compiled —
   * `opts.model ?? compiled.model ?? default`. Absent ⇒ the compiled model.
   */
  readonly model?: string
  /**
   * M1 (Axis-A SWAP): per-run extended-thinking effort. Merge-over-compiled —
   * `opts.reasoningEffort ?? compiled.reasoningEffort` (resolved in the adapter, single site).
   * Mapped to the SDK `ModelSelection.params` so the provider reasons (surfaced as `thinking`
   * StreamEvents). Absent ⇒ the compiled reasoning effort (or none).
   */
  readonly reasoningEffort?: ReasoningEffort
  /**
   * M2 (Axis-A SWAP): per-run opt-in to convert inline `<think>…</think>` text into `thinking`
   * events. Merge-over-compiled (`opts.parseThinkTags ?? compiled.parseThinkTags ?? false`). For
   * models that emit reasoning as inline tags (qwen/deepseek) instead of a native reasoning param.
   */
  readonly parseThinkTags?: boolean
  /**
   * theocode#32 (Axis-A SWAP): per-run opt-in to strip a leaked Hermes `<function=…></tool_call>`
   * tool-call dialect out of the text stream. Merge-over-compiled
   * (`opts.stripToolDialect ?? compiled.stripToolDialect ?? false`). For models (qwen/qwen3-coder)
   * that leak tool calls as text instead of native `tool_calls`.
   */
  readonly stripToolDialect?: boolean
  /**
   * theokit#58 (Axis-A SWAP): per-run opt-in to RECOVER a leaked Hermes `<function=…></tool_call>`
   * tool-call dialect so the call EXECUTES (enables the SDK route's `extractToolCallsFromContent`).
   * Merge-over-compiled (`opts.recoverLeakedToolCalls ?? compiled.recoverLeakedToolCalls ?? false`).
   * Sibling of {@link stripToolDialect} (display-only); typically enabled together. Has effect only
   * when {@link providers} routes a provider.
   */
  readonly recoverLeakedToolCalls?: boolean
  /**
   * V4-L.2 (Axis-A SWAP): per-run working directory, forwarded into
   * `Agent.create({ local: { cwd } })` so the SDK populates `SystemPromptContext.cwd`
   * (read by a `SystemPromptResolver` / `@ProjectContext`). Absent ⇒ no `local.cwd`.
   */
  readonly cwd?: string
  /**
   * SDK 4.0 (SE40): per-run root of the native `.jsonl` session transcript, forwarded into
   * `Agent.create({ local: { baseDir } })`. Absent ⇒ the SDK default (`~/.theokit`).
   */
  readonly baseDir?: string
  /**
   * V4-L.2 (Axis-A SWAP): per-run loop-ceiling override. When provided, the loop
   * strategy is re-resolved with this ceiling for this call only (zod-validated —
   * `< 1` throws, never a silent unbounded loop). Absent ⇒ the build-time ceiling.
   */
  readonly maxIterations?: number
  /**
   * V4-L.3 (Axis-A SWAP): per-run plugins (e.g. permission gate by request mode).
   * Accepts EITHER named-plugin discovery settings (`{ enabled: [...] }`) OR an
   * array of code `Plugin` objects (`[permissionPlugin, cachePlugin]`). Both are
   * forwarded RAW through the duck-typed `Agent.create` bridge to the SDK runtime,
   * which accepts either form (mirrors the @theokit/sdk `AgentOptions.plugins` widen).
   */
  readonly plugins?: PluginsSettings | readonly Plugin[]
  /** V4-L.3 (Axis-A SWAP): per-run provider routing. */
  readonly providers?: ProviderRoutingSettings
  /** V4-L.3 (Axis-A SWAP): per-run sub-agent definitions (opts-only; @SubAgents stays deferred). */
  readonly agents?: Record<string, AgentDefinition>
  /**
   * V4-L.3 (Axis-A SWAP): per-run SDK budget tracker — caps the INNER SDK tool-loop per
   * send. Distinct from {@link AgentRunnerRunOptions.budget} (the OUTER reflective-loop USD ceiling).
   */
  readonly budgetTracker?: BudgetTracker
  /**
   * V4-Q: pre-built SDK `CustomTool[]` forwarded RAW to `Agent.create.tools` (appended after the
   * agent's compiled tools), bypassing `defineTool`. For an app whose tools come from imperative
   * SDK factories (no `@Tool` compile path / no recoverable Zod schema). Distinct from `tools`
   * (which REPLACES the compiled `CompiledTool[]`).
   */
  readonly sdkTools?: readonly CustomTool[]
  /**
   * V4-R: inject the per-round stream factory, driving the reflective loop with a caller-provided
   * stream INSTEAD of the SDK adapter (tests / custom transport). When set, the SDK-create options
   * (`tools`/`sdkTools`/`model`/`cwd`/`plugins`/...) are NOT used for this call — the consumer owns
   * the stream. Absent ⇒ `createSdkAgentStream` (the default runtime).
   */
  readonly streamFactory?: RoundStreamFactory
  /**
   * V4-P: per-round transient retry. When set, the START of each reflective round (factory
   * creation + first event, before any event is yielded) is wrapped in the SDK `withRetry` —
   * a 429/5xx/network blip is recovered without re-applying an edit. Absent ⇒ single attempt.
   * Default `isRetryable` is the SDK `isTransientError`.
   */
  readonly retry?: RetryOptions
}

/**
 * A built, runnable agent. Construct via {@link AgentRunner.fromSpec} — the
 * constructor takes already-resolved state and is an internal detail.
 */
/** Already-resolved state handed to the {@link AgentRunner} constructor (internal). */
interface AgentRunnerState {
  readonly compiled: CompiledAgentOptions
  readonly agentName: string
  /** The resolved terminal-decision strategy (parity with `delegate()`). */
  readonly loopStrategy: LoopStrategy
  /**
   * M54 — true when `loopStrategy` came from `.loopStrategy(custom)` rather than a built-in name.
   * A custom must NOT be re-resolved by name (its name is outside the `z.enum`); a per-run
   * `maxIterations` override applies to it as a runner ceiling instead (see `stream`). Optional and
   * defaults to `false`: a state built directly (tests, `delegate()`) is a by-name built-in.
   */
  readonly loopStrategyIsCustom?: boolean
  /** The resolved between-round reflection (default or `.reflection(custom)` override). */
  readonly reflectionStrategy: ReflectionStrategy
  /** Recorded streaming preference (see {@link AgentRunner.streamEnabled}). */
  readonly streamEnabled: boolean
  /** The resolved compaction strategy, or `undefined` when none is declared (EC-4). */
  readonly compaction?: TranscriptCompactionStrategy
}

export class AgentRunner {
  private readonly compiled: CompiledAgentOptions
  private readonly agentName: string
  /** The resolved terminal-decision strategy (parity with `delegate()`). */
  readonly loopStrategy: LoopStrategy
  /** M54 — whether {@link loopStrategy} is a caller-injected custom (see {@link AgentRunnerState}). */
  private readonly loopStrategyIsCustom: boolean
  /** The resolved between-round reflection (default or `.reflection(custom)` override). */
  readonly reflectionStrategy: ReflectionStrategy
  /**
   * Recorded streaming preference. The reflective loop currently always streams via
   * the SDK `Run.stream()`; a non-streaming collect mode is future work — the flag is
   * captured + exposed here, not yet branched on (honest per G10: documented, not a
   * silent no-op).
   */
  readonly streamEnabled: boolean
  /**
   * V4-F: the resolved compaction strategy (from `@Compaction` or `.compaction()`),
   * or `undefined` when neither is declared — compaction is opt-in (EC-4). CALLABLE
   * by the app (ADR D1: `runner.compaction?.compact(messages, { summarize })`); the
   * reflective loop does NOT auto-invoke it (the SDK owns per-turn context).
   */
  readonly compaction?: TranscriptCompactionStrategy

  constructor(state: AgentRunnerState) {
    this.compiled = state.compiled
    this.agentName = state.agentName
    this.loopStrategy = state.loopStrategy
    this.loopStrategyIsCustom = state.loopStrategyIsCustom ?? false
    this.reflectionStrategy = state.reflectionStrategy
    this.streamEnabled = state.streamEnabled
    this.compaction = state.compaction
  }

  /** Start a fluent builder from an already-compiled spec. */
  static fromSpec(spec: AgentRunnerSpec): AgentRunnerBuilder {
    return new AgentRunnerBuilder(spec)
  }

  /**
   * V4-D-stream: stream the agent's events LIVE across the reflective loop, returning
   * the aggregated {@link DelegationResult} as the generator's return value. This is the
   * on-ramp for streaming-first apps (SSE) — `runReflectiveLoopStream` yields every
   * round's events before the loop terminates. `streamEnabled` is honored: when the
   * builder set `.stream(false)`, callers should use {@link run} instead.
   */
  stream(
    message: string,
    opts: AgentRunnerRunOptions,
  ): AsyncGenerator<StreamEvent, DelegationResult> {
    // M9 — apply input guardrails at the boundary BEFORE the SDK runtime sees the message.
    // A `block` throws GuardrailViolationError fail-fast; a `redact` rewrites the message.
    // Absent/empty guard list ⇒ no wrapper, zero overhead (identity path).
    const guardrails = this.compiled.guardrails
    if (guardrails && guardrails.length > 0) {
      // Arrow captures `this` lexically (no `const self = this` aliasing) for the generator below.
      const runUnguarded = (m: string): AsyncGenerator<StreamEvent, DelegationResult> =>
        this.streamUnguarded(m, opts)
      return (async function* guarded(): AsyncGenerator<StreamEvent, DelegationResult> {
        const safe = await runInputGuards(message, guardrails)
        // Output guards moderate the accumulated text before it reaches the client (M9).
        // `moderateOutputStream` is a transparent pass-through when no output guard is present.
        return yield* moderateOutputStream(
          runUnguarded(safe),
          guardrails,
          (e) => (e.type === 'text_delta' && typeof e.content === 'string' ? e.content : undefined),
          // B-012: how to re-emit moderated text. Required, so a redaction cannot be computed here
          // and silently dropped on the way to the client. The second parameter is the event being
          // replaced — unused here because `extractText` above matches exactly ONE kind, which is
          // the contract that keeps a collapse from crossing kinds.
          (content) => ({ type: 'text_delta', content }),
          // The aggregate channel. `run()` drains this generator and returns exactly this value,
          // and `response` is accumulated upstream from the same `text_delta` events `extractText`
          // reads — so the moderated string replaces it directly.
          (content, result) => ({ ...result, response: content }),
        )
      })()
    }
    return this.streamUnguarded(message, opts)
  }

  /** The core stream path, after input guardrails have run (M9). */
  private streamUnguarded(
    message: string,
    opts: AgentRunnerRunOptions,
  ): AsyncGenerator<StreamEvent, DelegationResult> {
    // V4-J: per-run tool override replaces compiled.tools for this call only.
    const tools = opts.tools ? [...opts.tools] : this.compiled.tools
    // Re-resolve the ceiling per call (see {@link resolvePerRunLoop} for the M54 D4 rules).
    const loop = this.resolvePerRunLoop(opts.maxIterations)
    // V4-R: a caller-injected factory drives the loop directly (tests / custom transport); absent ⇒
    // the SDK adapter. V4-L.2 + V4-L.3 (Axis-A SWAP): the per-request overrides forwarded to Agent.create.
    // `model` resolves against compiled.model in the adapter (single resolution site).
    const streamFactory =
      opts.streamFactory ??
      createSdkAgentStream(this.compiled, tools, opts.apiKey, {
        model: opts.model,
        reasoningEffort: opts.reasoningEffort, // M1: per-run extended-thinking effort
        parseThinkTags: opts.parseThinkTags, // M2: per-run <think>-tag extraction opt-in
        stripToolDialect: opts.stripToolDialect, // theocode#32: per-run tool-dialect strip opt-in
        recoverLeakedToolCalls: opts.recoverLeakedToolCalls, // theokit#58: per-run leaked-dialect recovery opt-in
        cwd: opts.cwd,
        baseDir: opts.baseDir,
        plugins: opts.plugins,
        providers: opts.providers,
        agents: opts.agents,
        budgetTracker: opts.budgetTracker,
        sdkTools: opts.sdkTools, // V4-Q: pre-built SDK tools forwarded raw
      })
    const sessionId = opts.sessionId ?? `runner-${crypto.randomUUID()}`
    return runReflectiveLoopStream(streamFactory, message, sessionId, {
      loop,
      reflection: this.reflectionStrategy,
      budget: opts.budget,
      agentName: this.agentName,
      signal: opts.signal,
      retry: opts.retry, // V4-P: per-round transient retry (opt-in)
    })
  }

  /** Run the agent to a terminal result via the shared reflective loop (collect mode). */
  /**
   * Apply a per-call `maxIterations` override (M54 D4). A custom strategy must NOT be re-resolved by
   * name — its name is outside the `z.enum`, which would throw — and its `shouldContinue` closure
   * must survive; since the runner enforces the ceiling via `round < loop.maxIterations` (T1.1),
   * overriding just that field bounds a custom without touching its logic. A built-in keeps the
   * by-name re-resolution (zod fail-loud on `< 1`) — unchanged, zero-behavior.
   */
  private resolvePerRunLoop(maxIterations: number | undefined): LoopStrategy {
    if (maxIterations == null) return this.loopStrategy
    if (this.loopStrategyIsCustom) {
      // Preserve the prototype: a class-based strategy carries `shouldContinue` on its prototype, and
      // an object-literal spread (`{ ...loop }`) copies only OWN enumerable props — dropping the method
      // and crashing the run. `Object.create` + `assign` keeps the prototype chain, overriding only the
      // ceiling field (M54 review F-2; ADR-0004 D4 promised the custom's shouldContinue survives).
      const base = this.loopStrategy
      return Object.assign(Object.create(Object.getPrototypeOf(base) as object), base, {
        maxIterations,
      }) as LoopStrategy
    }
    return resolveLoopStrategy(this.loopStrategy.name, maxIterations)
  }

  async run(message: string, opts: AgentRunnerRunOptions): Promise<DelegationResult> {
    const gen = this.stream(message, opts)
    let res = await gen.next()
    while (!res.done) res = await gen.next()
    return res.value
  }
}

/**
 * M53 — what the runner actually needs in order to run: an already-compiled agent plus the two
 * loop knobs. It used to derive all of this from `walkAgentMetadata`, which chained the runner to
 * the decorator surface. `strategy` and `compaction` are the two non-waist channels ADR 0002 keeps
 * (the builder's `.compaction()` already outranked the decorator; this just names the input).
 */
/**
 * The already-compiled agent the runner executes. Field-compatible with `SubAgentSpec` on purpose —
 * one spec drives both `AgentRunner.fromSpec` and `delegate`.
 */
interface AgentRunnerSpec {
  readonly name: string
  readonly compiled: CompiledAgentOptions
  readonly strategy?: MainLoopMeta['strategy']
  readonly maxIterations?: number
  readonly compaction?: { name: string; keepTokens?: number }
}

/** Fluent builder — accumulates config; `build()` is the compile boundary. */
export class AgentRunnerBuilder {
  private reflectionOverride?: ReflectionStrategy
  private streamEnabled = true
  private compactionOverride?: { name: string; keepTokens?: number }
  private loopStrategyOverride?: LoopStrategy

  constructor(private readonly spec: AgentRunnerSpec) {}

  /** Override the default reflection strategy (OCP — plan Drawback #2). No arg ⇒ keep default. */
  reflection(strategy?: ReflectionStrategy): this {
    if (strategy) this.reflectionOverride = strategy
    return this
  }

  /**
   * M54 — inject a custom terminal-decision strategy (the fourth OCP axis, alongside
   * `.reflection()`/`.compaction()`/`streamFactory`). WINS over the strategy the spec's name would
   * resolve to, exactly as `.compaction()` outranks the spec. The runner caps ANY strategy at
   * `custom.maxIterations` (T1.1), so a `shouldContinue: () => true` still terminates — never an
   * infinite loop.
   *
   * @example
   * ```ts
   * // Stop as soon as the confidence in the last round crosses 0.9, else run to the ceiling.
   * const stopWhenConfident: LoopStrategy = {
   *   name: 'confident',
   *   maxIterations: 8,
   *   shouldContinue: (o) => !o.responseText.includes('confidence: high'),
   * }
   * AgentRunner.fromSpec(spec).loopStrategy(stopWhenConfident).build()
   * ```
   */
  loopStrategy(custom: LoopStrategy): this {
    // Fail fast at authoring: a custom bypasses the built-ins' zod ceiling check, and a non-finite
    // or `< 1` ceiling would make the runner's `round < maxIterations` guard never fire (M54).
    assertValidCustomLoopStrategy(custom)
    this.loopStrategyOverride = custom
    return this
  }

  /** Record the streaming preference (see {@link AgentRunner.streamEnabled}). */
  stream(enabled = true): this {
    this.streamEnabled = enabled
    return this
  }

  /**
   * V4-F: declare the compaction strategy (e.g. `.compaction('token-budget', { keepTokens: 8000 })`).
   * Resolved + validated at {@link build} (EC-5 — fail-fast there, not here). This builder
   * call WINS over a `@Compaction` decorator on the same agent (EC-1 — explicit override).
   */
  compaction(name: string, options: { keepTokens?: number } = {}): this {
    this.compactionOverride = { name, keepTokens: options.keepTokens }
    return this
  }

  /** Resolve strategies from the spec — the compile→execute boundary (no I/O). */
  build(): AgentRunner {
    const { spec } = this
    // `'simple-chat'` is the default when the spec declares no strategy.
    const strategy = spec.strategy ?? 'simple-chat'
    // M54: `.loopStrategy(custom)` WINS over the spec's name-derived strategy (same precedence as
    // `.compaction()`). `loopStrategyIsCustom` flows to the runner so a per-run `maxIterations`
    // override applies to a custom as a ceiling instead of re-resolving it by name (D4).
    const loopStrategyIsCustom = this.loopStrategyOverride !== undefined
    const loopStrategy =
      this.loopStrategyOverride ?? resolveLoopStrategy(strategy, spec.maxIterations)
    const reflectionStrategy =
      this.reflectionOverride ??
      (strategy === 'plan-act-reflect' ? ladderReflectionStrategy : noopReflectionStrategy)
    // V4-F: builder override WINS over whatever the spec declares (EC-1); undefined when neither
    // declares it (EC-4 — opt-in). resolveCompactionStrategy fails fast (EC-5/EC-2).
    const compactionDecl = this.compactionOverride ?? spec.compaction
    const compaction = compactionDecl
      ? resolveCompactionStrategy(compactionDecl.name, { keepTokens: compactionDecl.keepTokens })
      : undefined
    return new AgentRunner({
      compiled: spec.compiled,
      agentName: spec.name,
      loopStrategy,
      loopStrategyIsCustom,
      reflectionStrategy,
      streamEnabled: this.streamEnabled,
      compaction,
    })
  }
}
