import type { WireChunk as UIMessageChunk } from '@theokit/presenter/wire'
import { TheokitAgentError } from '@theokit/sdk/errors'

/**
 * M2 (theokit-ai-first) — the file-convention runtime bridge.
 *
 * Turns a loaded `agents/<name>.ts` module into the M0/M1 canonical `UIMessageStream`:
 *
 *   module (defineAgent value | @Agent class) ──compileAgentModule──▶ CompiledAgentOptions
 *   CompiledAgentOptions ──createSdkAgentStream──▶ AgentStreamEvent* ──translate──▶ UIMessageChunk*
 *
 * Both agent surfaces converge here (ADR-B1): a `defineAgent` value lowers via
 * `compileAgentDefinition`, an `@Agent`-decorated class lowers via `compileAgent`
 * (which requires the full `@MainLoop` decoration — its existing errors surface for
 * DI-heavy classes). Neither runs an LLM directly — `@theokit/sdk` stays the sole
 * runtime (G2 / sdk-runtime.md); this module only wires its output onto the wire.
 */

import { moderateOutputStream, runInputGuards, textPayloadExtractor } from '../guardrails/index.js'
import type { Guardrail } from '../guardrails/index.js'

import { type CompiledAgentOptions } from './agent-compiler.js'
import type { StreamEvent } from './agent-sse-handler.js'
import type { AgentStreamEvent } from './agent-stream-events.js'
import { type AgentDefinition, compileAgentDefinition, isAgentDefinition } from './define-agent.js'
import { createHitlPlugin, type HitlWiring } from './hitl-plugin.js'
import { presentUIMessageStream, type MaskError } from './present-ui-message-stream.js'
import { createSdkAgentStream, type RuntimeOverrides } from './sdk-adapter.js'

/** Thrown when an `agents/` file default-exports neither a `defineAgent` value nor an `@Agent` class. */
/**
 * M80 — extends {@link TheokitAgentError}, not plain `Error`.
 *
 * `isTransientError` is defined over `TheokitAgentError`, so a class outside that hierarchy is
 * INVISIBLE to it and the only recourse left to a consumer is matching on message text. `code` is
 * stable across a rename; `isRetryable` is DECLARED, because a default would be a retry policy
 * nobody chose.
 */
export class AgentDefinitionError extends TheokitAgentError {
  override readonly name = 'AgentDefinitionError'
  constructor(source: string) {
    super(
      `[@theokit/agents] ${source}: an agents/ file must default-export a ` +
        `defineAgent(...) value or an @Agent-decorated class.`,

      {
        code: 'AGENT_DEFINITION_INVALID',
        // a malformed module does not become well-formed by being loaded twice.
        isRetryable: false,
      },
    )
  }
}

/** Unwrap a module namespace `{ default: X }` to `X`; pass a bare value through. */
/**
 * What {@link compileAgentModule} accepts: an agent definition, a capability-built options object,
 * or the module object that default-exports either of those.
 *
 * The compiled arm mirrors `isCompiledAgentOptions` — `tools` plus `agents` — rather than the fuller
 * `CompiledAgentOptions`, whose required `stream` the runtime guard never asks for. A parameter type
 * STRICTER than the guard would refuse shapes that work today, which is a different defect from the
 * one being fixed (usetheokit/theokit#663).
 *
 * The parameter was `unknown` until #663. The runtime was never wrong — it refused a bad shape and
 * threw `AgentDefinitionError` — but `unknown` moved the refusal to the first turn, and a consumer
 * shipped two releases in which no turn could run, with every static check green.
 */
export type AgentModule =
  | AgentDefinition
  | AcceptedCompiledOptions
  | { readonly default: AgentDefinition | AcceptedCompiledOptions }

/**
 * `CompiledAgentOptions` as `isCompiledAgentOptions` actually accepts it: an array under `tools` and
 * an object under `agents`. The guard inspects neither element type nor `stream`, so neither is
 * demanded here — a parameter that demanded them would reject modules the runtime compiles today,
 * which is a new defect rather than a fix for #663.
 */
type AcceptedCompiledOptions = Omit<Partial<CompiledAgentOptions>, 'tools' | 'agents'> & {
  readonly tools: readonly unknown[]
  readonly agents: Readonly<Record<string, unknown>>
}

function extractDefaultExport(mod: unknown): unknown {
  if (typeof mod === 'object' && mod !== null && 'default' in mod) {
    return mod.default
  }
  return mod
}

/**
 * Compile a loaded `agents/` module to SDK-ready options. Accepts a `defineAgent` value
 * (zero-config surface) OR an `@Agent`-decorated class (advanced surface). `source` labels
 * the fail-fast error (typically the file path).
 *
 * For a class agent, its `@Mixin(...)` toolboxes are gathered (the declared tool-association
 * mechanism, same as `app.ts`/`theokit-plugin.ts`) and instantiated with a no-arg `new` — the
 * zero-config file convention has no DI container. This is what makes a `@HumanInTheLoop`-gated
 * tool on a mixin actually gate through the M2 endpoint (M4): its config reaches `compiled.hitl`.
 */
/** A capability-built waist: has the two collection fields `applyCapabilities` always seeds. */
function isCompiledAgentOptions(value: unknown): value is CompiledAgentOptions {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.tools) && typeof v.agents === 'object' && v.agents !== null
}

export function compileAgentModule(
  mod: AgentModule,
  source = 'agent module',
): CompiledAgentOptions {
  const def = extractDefaultExport(mod)
  if (isAgentDefinition(def)) {
    return compileAgentDefinition(def)
  }
  // M53 — the decorated-class branch is gone with the decorators. An agent module now default-exports
  // either a `defineAgent(...)` definition or a capability-built `CompiledAgentOptions`.
  if (isCompiledAgentOptions(def)) return def
  throw new AgentDefinitionError(source)
}

/**
 * Compile a module whose shape the typechecker CANNOT know — one that arrived from a dynamic
 * `import()` of a path discovered at runtime, which is what every HTTP / CLI / MCP entry point in
 * this framework receives.
 *
 * Identical to {@link compileAgentModule} at runtime. The separate name exists so `unknown` cannot
 * quietly re-enter the typed entry points: a genuine disk boundary says so by calling this, and
 * anything else has to satisfy {@link AgentModule}. Before #663 both cases shared one `unknown`
 * parameter, so the boundary that had a reason was indistinguishable from the one that did not.
 */
export function compileLoadedAgentModule(
  mod: unknown,
  source = 'agent module',
): CompiledAgentOptions {
  return compileAgentModule(mod as AgentModule, source)
}

/**
 * Bridge the SDK stream (typed loosely as `StreamEvent`) to the strict `AgentStreamEvent`
 * union the translator consumes. `createSdkAgentStream` yields `AgentStreamEvent`-shaped
 * values (its `type` IS the union tag) — this is the single sanctioned narrowing boundary
 * (G3: via `unknown`); the translator ignores any variant it does not map.
 */
async function* asAgentStream(
  events: AsyncIterable<StreamEvent>,
): AsyncGenerator<AgentStreamEvent> {
  // The two unions do not structurally overlap (StreamEvent's index signature vs the
  // discriminated AgentStreamEvent), so tsc requires the `unknown` hop; this is the one
  // sanctioned narrowing point (the runtime values ARE AgentStreamEvents — same producer).
  for await (const e of events) yield e as unknown as AgentStreamEvent
}

/**
 * A minimal single-consumer async queue for merging the SDK event stream with the HITL
 * plugin's out-of-band `approval_required` events (M4). Both the SDK-stream pump and the
 * plugin's `emit` push here; the translator drains it. When a gated tool pauses the SDK run
 * (the awaited `pre_tool_call` hook), the pump blocks with no SDK events — but the plugin's
 * approval event is already queued, so the client sees the approval request while paused.
 */
class EventQueue<T> {
  #items: T[] = []
  #resolvers: ((v: IteratorResult<T>) => void)[] = []
  #closed = false
  push(item: T): void {
    if (this.#closed) return
    const r = this.#resolvers.shift()
    if (r) r({ value: item, done: false })
    else this.#items.push(item)
  }
  close(): void {
    this.#closed = true
    for (const r of this.#resolvers.splice(0)) r({ value: undefined as never, done: true })
  }
  async *drain(): AsyncGenerator<T> {
    for (;;) {
      if (this.#items.length > 0) {
        yield this.#items.shift() as T
        continue
      }
      if (this.#closed) return
      const next = await new Promise<IteratorResult<T>>((resolve) => this.#resolvers.push(resolve))
      if (next.done) return
      yield next.value
    }
  }
}

/**
 * Append a `checkpoint_saved` event just before the terminal `done` (M4). The translator breaks on
 * `done`, so the checkpoint MUST precede it to reach the wire. `resumeToken` is the `sessionId` a
 * follow-up request replays through the SDK conversation storage. On a run that ends without a clean
 * `done` (e.g. error — the translator already broke), the trailing emit is inert. The SDK genuinely
 * persisted the turns via its conversation storage; this is the resume-handle signal, not a new store.
 */
async function* appendCheckpointSaved(
  source: AsyncGenerator<AgentStreamEvent>,
  sessionId: string,
): AsyncGenerator<AgentStreamEvent> {
  let emitted = false
  const checkpoint = (): AgentStreamEvent => ({
    type: 'checkpoint_saved',
    checkpointId: crypto.randomUUID(),
    step: 0,
    resumeToken: sessionId,
  })
  for await (const ev of source) {
    if (ev.type === 'done' && !emitted) {
      emitted = true
      yield checkpoint()
    }
    yield ev
  }
  if (!emitted) yield checkpoint()
}

/** HITL wiring supplied by the harness (mount-agent): the gated-tool map + the approval resolver. */
interface StreamHitlOptions {
  gated: HitlWiring['gated']
  awaitApproval: HitlWiring['awaitApproval']
}

interface StreamAgentOptions {
  message: string
  sessionId: string
  /**
   * What the browser is told a failure was (usetheokit/theokit#390).
   *
   * Absent ⇒ masked to a fixed string. The server's raw error text — a driver's message, an HTTP
   * client's, a filesystem call's — used to reach the client verbatim, and `ai@7` on the same
   * protocol masks by default for the reason its own comment gives. The full text still reaches
   * the logs and the `agent.run` span; what stops is it reaching a browser unless a host decides.
   */
  onError?: MaskError
  /** M35 (multimodal) — images to send alongside the text. Absent ⇒ the string send path is unchanged. */
  images?: RuntimeOverrides['images']
  /** Enable human-in-the-loop tool approval (M4). Absent ⇒ the M2 non-HITL path, byte-unchanged. */
  hitl?: StreamHitlOptions
  /**
   * theokit-file-based-config (EC-1) — the app root `cwd` the SDK resolves `.theokit/` against when
   * `settingSources` is active. The framework boundary (`mountAgent`) threads its resolved
   * `projectRoot` here so discovery points at the app root, NOT `process.cwd()`. Absent ⇒ no `local.cwd`.
   */
  cwd?: RuntimeOverrides['cwd']
  /**
   * SDK 4.0 (SE40) — root of the native `.jsonl` session transcript. The framework boundary
   * (`mountAgent`) threads the resolved app root here so sessions persist per-app; absent ⇒ the SDK
   * default (`~/.theokit`).
   */
  baseDir?: RuntimeOverrides['baseDir']
  /**
   * The request's abort signal (M4). On client disconnect, the HITL merge queue is closed so the
   * detached SDK pump stops buffering (bounded memory) and the client stream terminates at once.
   * The paused SDK run itself is released by the approval timeout, not instantly — a durable-store
   * follow-up. The non-HITL path is pull-based and already tears down on the consumer's return.
   */
  signal?: AbortSignal
  /**
   * theokit#132 — observe the SDK's typed `RunEvent`s for this run (`tool_progress`, `rate_limit`,
   * `permission_denied`, `task_*`, `compact_boundary`, `tripwire`, `completion_check`).
   *
   * The seam theokit-studio's M1 event inspector needs: without it the run endpoint can only stream
   * `{kind:"message"}`, and the inspector degrades to showing nothing about the run itself.
   *
   * Deliberately a SINK rather than extra chunks on the returned generator. The generator's contract
   * is the UIMessage protocol a chat consumer renders; run diagnostics are a different audience, and
   * multiplexing them would make every chat consumer step over frames it has no use for. Absent ⇒
   * the stream is byte-identical to before.
   */
  onRunEvent?: RuntimeOverrides['onRunEvent']
  /**
   * theokit#474 — per-turn transient retry.
   *
   * `AgentRunnerRunOptions.retry` has existed since V4-P, and it belongs to the OTHER runtime: the
   * reflective loop, whose round factory is allowed to throw. This entry point runs one SDK turn,
   * and the SDK reports a provider failure as the run's terminal `error` EVENT rather than as a
   * rejection — so the option could not simply be forwarded, and a wrapper that only caught throws
   * would have been inert. See `turn-retry.ts`.
   *
   * Absent ⇒ the key is omitted from the SDK call entirely and the turn is a single attempt, exactly
   * as before.
   */
  retry?: RuntimeOverrides['retry']
  /**
   * theokit#475 — expose the run's REAL token usage to tool handlers as `ctx.usage`.
   *
   * The seam a `get_context_remaining`-style tool needs: without it the only figure reachable from
   * inside a handler is a character-count estimate over `ctx.messages`. Read it with `readRunUsage`
   * from `@theokit/agents/usage`.
   *
   * Absent ⇒ handlers receive exactly the ctx they did before and the SDK receives no tracker it
   * was not already given.
   */
  exposeUsageToTools?: RuntimeOverrides['exposeUsageToTools']
}

/**
 * Run a compiled agent and yield the M0/M1 `UIMessageStream` chunks. `apiKey` is resolved by the
 * caller (`resolveProvider`). One `textId` per run (G8: `crypto.randomUUID`). When `hitl` is
 * supplied (M4), a HITL `pre_tool_call` plugin pauses the run for gated tools — the pause is the
 * SDK's own awaited hook, never a second loop (ADR 0038).
 */
export function streamAgentUIMessages(
  compiled: CompiledAgentOptions,
  apiKey: string,
  input: StreamAgentOptions,
): AsyncGenerator<UIMessageChunk> {
  // theokit#725 — the declared guardrails, on the surface a deployed agent is actually reached
  // through. This function is the ONLY path `mount-agent` (HTTP), `run-terminal-agent` and
  // `build-agent-streamer` take, and it called `createSdkAgentStream` directly on both its
  // branches. Guardrails were applied in exactly two other places — `AgentRunner.stream()` and
  // `withGuardrails`, the latter reached only from `toAgentFactory` — so a
  // `defineAgent({ guardrails: [...] })` served to a browser ran no input guard, applied no
  // `redact`, and a `block` never threw.
  //
  // Same shape as three defects already closed in this release, one layer up: a safety property
  // that holds on the path somebody looked at.
  //
  // No double-consult: none of this function's callers moderate. `AgentRunner` composes its own two
  // passes and does not route through here.
  const guardrails = compiled.guardrails
  if (guardrails !== undefined && guardrails.length > 0) {
    return guardedStream(compiled, apiKey, input, guardrails)
  }
  return unguardedStream(compiled, apiKey, input)
}

/**
 * The guarded wrapper: input guards before the model sees the prompt, output guards over the stream.
 *
 * A generator so `runInputGuards` can be awaited BEFORE anything is created — a guard that blocks
 * must stop the prompt from reaching the model, not annotate it afterwards, and
 * `streamAgentUIMessages` is synchronous.
 *
 * TWO passes over the two text-EVENT kinds, copied from `AgentRunner.stream()` rather than
 * reinvented, including the reason they are two. NOT one wider `extractText`: two kinds under one
 * extractor COLLAPSE into a single event, so the model's private reasoning would be promoted into a
 * visible one and the moderation would create the disclosure it exists to close. The VISIBLE pass is
 * inner; the reasoning pass must not touch a channel the visible one owns.
 *
 * `done.result` and `task_progress.text` are NOT covered here, exactly as they are not in
 * `AgentRunner` — they need a different mechanism (there is one `done` per round, so a pass keyed on
 * it would collapse every round's into one) and are tracked separately. Naming them is what keeps
 * this from claiming a coverage it does not have.
 */
async function* guardedStream(
  compiled: CompiledAgentOptions,
  apiKey: string,
  input: StreamAgentOptions,
  guardrails: readonly Guardrail[],
): AsyncGenerator<UIMessageChunk> {
  const safe = await runInputGuards(input.message, guardrails)
  const inner = moderateOutputStream(
    unguardedStream(compiled, apiKey, { ...input, message: safe }),
    guardrails,
    textPayloadExtractor<UIMessageChunk>('text-delta', (e) => (e as { delta?: unknown }).delta),
    (delta, replaced) => ({ ...replaced, delta }) as UIMessageChunk,
    (_text, result) => result,
  )
  yield* moderateOutputStream(
    inner,
    guardrails,
    textPayloadExtractor<UIMessageChunk>(
      'reasoning-delta',
      (e) => (e as { delta?: unknown }).delta,
    ),
    (delta, replaced) => ({ ...replaced, delta }) as UIMessageChunk,
    (_text, result) => result,
  )
}

function unguardedStream(
  compiled: CompiledAgentOptions,
  apiKey: string,
  input: StreamAgentOptions,
  // `void` as the RETURN type, declared rather than defaulted. `AsyncGenerator<T>` leaves it `any`,
  // which made `moderateOutputStream`'s `R` an `any` that the identity rebuilder returned — an
  // honest `no-unsafe-return`. Nothing on this path produces a result to moderate, and saying so
  // once here is what lets the two call sites infer it instead of writing a type argument each.
): AsyncGenerator<UIMessageChunk, void> {
  const textId = crypto.randomUUID()
  const overrides: RuntimeOverrides = {}
  // theokit-file-based-config (EC-1) — thread the app-root cwd so the adapter merges it into
  // `local.cwd` (sdk-adapter `overrides.cwd`), pointing `.theokit/` discovery at the app root.
  if (input.cwd !== undefined) overrides.cwd = input.cwd
  // SDK 4.0 (SE40) — thread the app-root session dir so the SDK writes the native transcript per-app.
  if (input.baseDir !== undefined) overrides.baseDir = input.baseDir
  // M35 (multimodal) — thread images so the adapter sends the structured `{ text, images }` form.
  if (input.images !== undefined) overrides.images = input.images
  // theokit#132 — thread the RunEvent sink so it reaches `SendOptions.onRunEvent`.
  if (input.onRunEvent !== undefined) overrides.onRunEvent = input.onRunEvent
  // theokit#474 — thread the retry policy, defaulting its abort signal to the run's own. Without
  // that default an aborted turn would keep sleeping out its backoff before noticing, which is the
  // same `retry.signal ?? signal` the reflective loop's `startRound` already applies.
  if (input.retry !== undefined) {
    overrides.retry = { ...input.retry, signal: input.retry.signal ?? input.signal }
  }
  // theokit#475 — thread the usage opt-in so tool handlers receive `ctx.usage`.
  if (input.exposeUsageToTools !== undefined) {
    overrides.exposeUsageToTools = input.exposeUsageToTools
  }

  let source: AsyncGenerator<AgentStreamEvent>
  if (!input.hitl || input.hitl.gated.size === 0) {
    // M2 non-HITL path — unchanged.
    const events = createSdkAgentStream(
      compiled,
      compiled.tools,
      apiKey,
      overrides,
    )(input.message, input.sessionId)
    source = asAgentStream(events)
  } else {
    // M4 HITL path — inject the plugin + merge its approval events with the SDK stream.
    const queue = new EventQueue<AgentStreamEvent>()
    // On client disconnect, stop buffering into the detached pump's queue (bounded memory) and
    // terminate the client stream at once; `EventQueue.push` no-ops once closed.
    input.signal?.addEventListener(
      'abort',
      () => {
        queue.close()
      },
      { once: true },
    )
    const plugin = createHitlPlugin({
      gated: input.hitl.gated,
      emit: (e) => {
        queue.push(e)
      },
      awaitApproval: input.hitl.awaitApproval,
    })
    const sdkStream = createSdkAgentStream(compiled, compiled.tools, apiKey, {
      ...overrides,
      // The HITL plugin is a structural @theokit/sdk Plugin (createHitlPlugin returns the
      // { name, register } shape); the RuntimeOverrides.plugins union is widened at the SDK edge.
      plugins: [plugin] as unknown as RuntimeOverrides['plugins'],
    })(input.message, input.sessionId)
    // Pump the SDK stream into the shared queue; close when it ends. A thrown SDK stream (e.g.
    // dispose() rejecting) is SURFACED as an `error` event into the queue — never a `void`-IIFE
    // unhandled rejection (mirrors sdk-adapter's mergeDeltaStream capture), so the client still gets
    // a well-formed error chunk + a terminated stream instead of a silent clean end.
    void (async () => {
      try {
        for await (const e of sdkStream) queue.push(e as unknown as AgentStreamEvent)
      } catch (err) {
        queue.push({
          type: 'error',
          code: 'SDK_STREAM_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        })
      } finally {
        queue.close()
      }
    })()
    source = queue.drain()
  }

  // M4 @Checkpoint: emit `checkpoint_saved` (→ `data-checkpoint`) ONLY when the agent opted into a
  // durable checkpoint (`@Checkpoint({ storage: 'filesystem' })`) — the theokit-side signal that the
  // client may resume. SDK 4.0 (SE40) persists EVERY session to the native `.jsonl` transcript, so
  // resume is available under the hood; this gate keeps the pre-4.0 emit contract unchanged (G10:
  // don't retroactively promise a resume handle the agent never asked to advertise).
  const durableCheckpoint = compiled.checkpoint?.storage === 'filesystem'
  const events = durableCheckpoint ? appendCheckpointSaved(source, input.sessionId) : source
  return presentUIMessageStream(events, { textId, onError: input.onError })
}
