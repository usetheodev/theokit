/**
 * runReflectiveLoop — the multi-round reflective driver that gives `@MainLoop`
 * its runtime (closes the metadata-only gap, V4-A / plan ADR D2).
 *
 * Per round it consumes ONE SDK stream turn (the model call stays in the SDK —
 * the factory is `createSdkAgentStream(...)`, injected for testability), derives
 * a {@link LoopOutcome}, asks the {@link ReflectionStrategy} for feedback, then
 * the {@link LoopStrategy} whether to continue. Bounded by `maxIterations`
 * (forced terminal at the ceiling — never an infinite loop). The bridge owns the
 * loop; the SDK owns the model call (sdk-runtime.md / ADR 0031 — no second runtime).
 *
 * `runReflectiveLoop` is INTERNAL (not re-exported from the package barrel,
 * Drawback #4) — consumed by `delegate()` (T2.2) and `AgentRunner` (T3.1).
 *
 * reference: knowledge-base/references/mastra agent.ts (re-enter the loop with feedback).
 */
// V4-P: type-only import (erased at runtime) so the loop stays SDK-optional; the `withRetry`
// VALUE is dynamic-imported inside consumeOneRound only when `retry` is configured.
import type { RetryOptions } from '@theokit/sdk/retry'

import type { StreamEvent } from '../bridge/agent-sse-handler.js'
import {
  DelegationBudgetExceededError,
  type DelegationResult,
  DelegationError,
} from '../bridge/delegation-types.js'
import { debugLog } from '../debug-log.js'
import { GuardrailError } from '../guardrails/index.js'

import type { LoopFinishReason, LoopOutcome, LoopStrategy } from './loop-strategy.js'
import type { ReflectionContext, ReflectionStrategy } from './reflection-strategy.js'

/** One SDK stream turn: `createSdkAgentStream(...)` returns this shape. */
/**
 * Opens one round's SDK stream. `opts.disableTools` (step-cap force-close) asks the factory to
 * gate tools OFF for THIS round (the SDK adapter maps it to `tool_choice:"none"` at send-time, so a
 * cached agent — whose tools can't be un-registered — is still forced to a text summary). Optional +
 * ignored by injected test factories ⇒ backward-compatible.
 */
export type RoundStreamFactory = (
  message: string,
  sessionId: string,
  opts?: { disableTools?: boolean },
) => AsyncIterable<StreamEvent>

/** Per-round inputs bundled to keep helper signatures within the parameter budget (G6). */
interface RoundInputs {
  factory: RoundStreamFactory
  prompt: string
  sessionId: string
  signal: AbortSignal | undefined
  retry: RetryOptions | undefined
}

/** Strategies + options for {@link runReflectiveLoop}. */
interface RunReflectiveLoopConfig {
  /** The terminal-decision strategy (resolved from `@MainLoop.strategy`). */
  readonly loop: LoopStrategy
  /** Between-round reflection (default `'ladder'` for `'plan-act-reflect'`). */
  readonly reflection: ReflectionStrategy
  /** Cumulative USD budget across ALL rounds (EC-4). Exceeding throws DelegationBudgetExceededError. */
  readonly budget?: number
  /** Cancellation — when aborted, the loop stops re-entering and advancing the in-flight stream. */
  readonly signal?: AbortSignal
  /** Name surfaced in typed errors. */
  readonly agentName?: string
  /**
   * V4-P: per-round transient retry. When set, the START of each round (factory creation + first
   * event, before any event is yielded → no re-applied edit) is wrapped in the SDK `withRetry`.
   * Absent ⇒ single attempt (backward-compatible). Default `isRetryable` is the SDK `isTransientError`.
   */
  readonly retry?: RetryOptions
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

/** Consecutive no-progress rounds before terminating with `'no_progress'` (K=2 tolerates one retry — V4-D). */
const NO_PROGRESS_THRESHOLD = 2

/** Runtime metric key (wiring triad — G10): observable proof the loop ran, with terminal + round count. */
const MAINLOOP_METRIC = '[THEO_AGENT_MAINLOOP_RUNTIME_APPLIED]'

/** The "still working" continuation signal — a tool-using turn re-enters the loop. */
const TOOL_CALLS: LoopFinishReason = 'tool-calls'

/** Final-round graceful-degradation hint (V4-D step_limit — modeled on opencode MAX_STEPS_PROMPT). */
const STEP_LIMIT_HINT =
  'This is your final round — do not call any more tools; summarize the work done so far and list any remaining tasks.'

/**
 * Deterministic JSON: object keys are emitted in sorted order so two semantically
 * equal tool inputs serialize identically regardless of key insertion order (a
 * stuck-loop detector must not be fooled by re-ordered keys — review NF, robustness).
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const entries = Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
  return `{${entries.join(',')}}`
}

/**
 * A round's progress fingerprint = its tool-call set ONLY (name+input, SORTED so call
 * ORDER is irrelevant — EC-3; input keys canonicalized so KEY order is irrelevant too).
 * Two consecutive rounds with an equal signature made no new progress. The assistant
 * narration text is DELIBERATELY excluded (theokit#53): a model that re-runs identical
 * tool calls while rephrasing its prose ("…and run it." → "Now I will run…") would
 * otherwise evade the detector and spin. Mirrors opencode's `doom_loop`, which compares
 * tool name + JSON.stringify(input) and nothing else. Tool `output` is also excluded:
 * repeating the same call is no-progress even if the result text wobbles. (V4-D, ADR D2)
 */
function roundSignature(toolCalls: readonly { name: string; input: unknown }[]): string {
  return toolCalls
    .map((tc) => `${tc.name}:${stableStringify(tc.input)}`)
    .sort((a, b) => a.localeCompare(b))
    .join(',')
}

/**
 * The loop's terminal reason: `'step_limit'` when the round wanted to continue
 * (tool-calls + reflection continue) but the `maxIterations` ceiling stopped it;
 * otherwise the round's own natural reason (`'stop'`/`'length'`). (V4-D, ADR D1)
 */
function terminalReason(
  reflectionContinue: boolean,
  roundReason: LoopFinishReason,
  round: number,
  maxIterations: number,
): LoopFinishReason {
  if (reflectionContinue && roundReason === TOOL_CALLS && round >= maxIterations)
    return 'step_limit'
  // A tool-using round that terminates BELOW the ceiling means a (custom) reflection chose to
  // stop while the turn could have continued — surface 'stop', never leak the per-round
  // 'tool-calls' signal as the loop's terminal reason (review NF; shipped ladder/noop never hit this).
  if (roundReason === TOOL_CALLS) return 'stop'
  return roundReason
}

/**
 * Default round-2+ continuation when the reflection produced no feedback (V4-M): the
 * persisted session (getOrCreate, sdk-adapter) already holds the prior turns, so a short
 * nudge is enough — re-sending the original task would duplicate it in the session.
 */
const CONTINUE_PROMPT =
  'Continue from the prior turns above; finish the task and give a final answer.'

/**
 * Build the round's prompt. V4-M: rounds carry conversation via the persisted SDK session,
 * so round 1 sends the original `message`; rounds 2+ send the reflection `feedback` (or a
 * default continuation) WITHOUT re-sending `message`. Final-round summary hint preserved (V4-D).
 */
function buildPrompt(
  round: number,
  maxIterations: number,
  message: string,
  feedback: string | undefined,
): string {
  const hint = round === maxIterations ? `${STEP_LIMIT_HINT}\n\n` : ''
  // Round 1 sends the original task; rounds 2+ rely on the persisted session (V4-M) and send
  // ONLY the reflection block (tag preserved) or a default continuation — never re-sending `message`.
  const continuation = feedback ? `[reflection] ${feedback}` : CONTINUE_PROMPT
  const body = round === 1 ? message : continuation
  return hint + body
}

/**
 * Consume one round, normalizing a RAW stream/iterator exception (not an `error` event —
 * e.g. the SDK dynamic import rejecting) into a typed `DelegationError` (M2). Typed errors
 * (`DelegationBudgetExceededError`/`DelegationError`) propagate unchanged.
 */
async function* consumeRoundOrThrow(
  inputs: RoundInputs,
  agentName: string,
): AsyncGenerator<StreamEvent, RoundResult> {
  try {
    return yield* consumeOneRound(
      inputs.factory,
      inputs.prompt,
      inputs.sessionId,
      inputs.signal,
      inputs.retry,
    )
  } catch (err) {
    // A guardrail refusal passes through as ITSELF, like the two delegation errors above.
    //
    // Wrapping it made `delegate-tool.ts` classify it `delegation_failed` — which is on that file's
    // message allowlist, because a delegation failure's text is a fact about the work. So the
    // wrapper's message, `Delegation to agent "X" failed: ${cause.message}`, carried the guard's own
    // words to the model: `Guardrail "pii-detector" blocked output: ssn found`. Measured through
    // `createDelegateTool` with a consumer-supplied `streamFactory` that throws mid-round — a public
    // option, so this is reachable rather than theoretical.
    //
    // Fixed here and not by suppressing the message downstream, because the defect is the
    // CLASSIFICATION: a guard refusal is not a delegation failure, and a layer that renames it
    // cannot be expected to keep a list of what the new name must hide.
    if (
      err instanceof DelegationBudgetExceededError ||
      err instanceof DelegationError ||
      err instanceof GuardrailError
    ) {
      throw err
    }
    throw new DelegationError(agentName, err)
  }
}

/**
 * V4-N/V4-O: fold one round's usage into the accumulator — cost + total/split tokens (V4-N) and
 * the reasoning/cache buckets (V4-O). Extracted from the loop body to keep its complexity within
 * budget (G6); the optional `acc` fields default to 0 before adding.
 */
function accumulateUsage(acc: DelegationResult, r: RoundResult): void {
  acc.cost += r.cost
  acc.tokens += r.tokens
  acc.tokensInput = (acc.tokensInput ?? 0) + r.tokensInput
  acc.tokensOutput = (acc.tokensOutput ?? 0) + r.tokensOutput
  acc.reasoningTokens = (acc.reasoningTokens ?? 0) + r.reasoningTokens
  acc.cacheReadTokens = (acc.cacheReadTokens ?? 0) + r.cacheReadTokens
  acc.cacheWriteTokens = (acc.cacheWriteTokens ?? 0) + r.cacheWriteTokens
}

/** Stamp the terminal state on the accumulator + emit the runtime metric (DRY for the 2 exit points). */
function finalize(
  acc: DelegationResult,
  round: number,
  reason: LoopFinishReason,
  strategyName: string,
): DelegationResult {
  acc.rounds = round
  acc.finishReason = reason
  debugLog(MAINLOOP_METRIC, { strategy: strategyName, rounds: round, terminal: reason })
  return acc
}

/** One round's accumulated facts + the signals needed to derive `finishReason`. */
interface RoundResult {
  responseText: string
  toolCalls: { id: string; name: string; input: unknown; output: string }[]
  cost: number
  tokens: number
  tokensInput: number
  tokensOutput: number
  // V4-O: reasoning/cache token buckets folded from the done event.
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  finishReason: LoopFinishReason
  errorMessage: string
}

/**
 * Derive the round's terminal signal from the events seen this round.
 *
 * Precedence (B1 — the load-bearing fix):
 *  1. error event           ⇒ 'error'
 *  2. explicit done.finishReason==='tool-calls' ⇒ 'tool-calls' (if a future SDK adapter sets it)
 *  3. ANY tool_result seen  ⇒ 'tool-calls' — the turn USED TOOLS ("still working"), so the
 *     outer reflective loop should reflect + re-prompt. The real `@theokit/sdk` adapter ALWAYS
 *     appends a terminal `done` WITHOUT finishReason after a turn (sdk-adapter.ts / event-translator.ts);
 *     letting that `done` short-circuit a tool-using turn to 'stop' is exactly what made the loop
 *     dead in production (single-round). tool_result therefore OUTRANKS the bare done. Bounded by
 *     `maxIterations` so it can never spin.
 *  4. otherwise (pure-answer `done`, text-only, or empty round) ⇒ 'stop' (terminal). EC-1: a
 *     degenerate/empty round defaults to 'stop', NEVER 'tool-calls'.
 *
 * This is an honest heuristic: the SDK runs the inner tool loop to completion per turn, so the
 * outer loop treats a tool-using turn as "continue/reflect" and a pure-text answer as "done".
 */
function deriveFinishReason(signals: {
  sawError: boolean
  sawDone: boolean
  doneFinishReason: string
  sawToolResult: boolean
}): LoopFinishReason {
  if (signals.sawError) return 'error'
  if (signals.sawDone && signals.doneFinishReason === TOOL_CALLS) return TOOL_CALLS
  if (signals.sawToolResult) return TOOL_CALLS
  return 'stop'
}

/** Mutable round signals used to derive the round's {@link LoopFinishReason}. */
interface RoundSignals {
  sawError: boolean
  sawDone: boolean
  doneFinishReason: string
  sawToolResult: boolean
}

/** V4-N: push a faithful `{id,name,input,output}` toolCall, correlating input from the tool_call. */
function pushToolResult(
  event: StreamEvent,
  r: RoundResult,
  callInputs: Map<string, { name: string; input: unknown }>,
): void {
  const id = asString(event.callId, '')
  const call = callInputs.get(id)
  r.toolCalls.push({
    id,
    name: call?.name ?? asString(event.toolName, 'unknown'),
    // Prefer the correlated tool_call input (real SDK shape); fall back to an input on the
    // result event itself (some streams/tests carry it there), else {}.
    input: call?.input ?? event.input ?? {},
    output: asString(event.output, ''),
  })
}

/** V4-N: fold a `done` event's cost + split/total token usage into the round (V4-O: + buckets). */
function applyDone(event: StreamEvent, r: RoundResult): void {
  r.cost = asNumber(event.cost, 0)
  const usage = event.usage as
    | {
        totalTokens?: number
        inputTokens?: number
        outputTokens?: number
        reasoningTokens?: number
        cacheReadTokens?: number
        cacheWriteTokens?: number
      }
    | undefined
  r.tokens = usage?.totalTokens ?? 0
  r.tokensInput = usage?.inputTokens ?? 0
  r.tokensOutput = usage?.outputTokens ?? 0
  // V4-O: fold the reasoning/cache buckets (0 when the provider/adapter omits them).
  r.reasoningTokens = usage?.reasoningTokens ?? 0
  r.cacheReadTokens = usage?.cacheReadTokens ?? 0
  r.cacheWriteTokens = usage?.cacheWriteTokens ?? 0
}

/**
 * Fold ONE stream event into the round accumulator (V4-N: extracted from `consumeOneRound`
 * to keep its complexity within budget — G6).
 */
function accumulateEvent(
  event: StreamEvent,
  r: RoundResult,
  signals: RoundSignals,
  callInputs: Map<string, { name: string; input: unknown }>,
): void {
  if (event.type === 'text_delta' && typeof event.content === 'string') {
    r.responseText += event.content
  } else if (event.type === 'tool_call') {
    callInputs.set(asString(event.callId, ''), {
      name: asString(event.toolName, 'unknown'),
      input: event.input ?? {},
    })
  } else if (event.type === 'tool_result') {
    signals.sawToolResult = true
    pushToolResult(event, r, callInputs)
  } else if (event.type === 'done') {
    signals.sawDone = true
    signals.doneFinishReason = asString(event.finishReason, '')
    applyDone(event, r)
  } else if (event.type === 'error') {
    signals.sawError = true
    r.errorMessage = asString((event as { message?: unknown }).message, 'Unknown agent error')
  }
}

/**
 * Consume exactly one SDK stream turn and derive its {@link LoopFinishReason}.
 * V4-D-stream: an async generator — it `yield`s each event to the consumer LIVE
 * (so SSE-first apps see tokens/tool-calls incrementally) AND returns the
 * aggregated {@link RoundResult} as the generator's return value.
 */
/**
 * V4-P: open the round's stream + read its first event. When `retry` is set, the whole START
 * (creation + first `next()`) is wrapped in the SDK `withRetry` (dynamic-imported to keep the
 * loop SDK-optional) — a transient before any event is yielded is recovered without re-applying
 * an edit. Once the first event is obtained, the caller iterates WITHOUT retry.
 */
async function startRound(
  factory: RoundStreamFactory,
  prompt: string,
  sessionId: string,
  signal: AbortSignal | undefined,
  retry: RetryOptions | undefined,
): Promise<{ it: AsyncIterator<StreamEvent>; first: IteratorResult<StreamEvent> }> {
  const open = async () => {
    const it = factory(prompt, sessionId)[Symbol.asyncIterator]()
    try {
      return { it, first: await it.next() }
    } catch (err) {
      // The first event threw — release THIS attempt's iterator (run its finally → SDK dispose)
      // before `withRetry` opens a fresh stream, so a failed retry attempt leaks nothing.
      await it.return?.(undefined)
      throw err
    }
  }
  if (!retry) return open()
  // SE36 (SDK v3.0) — `withRetry` became `Retry.create`; same call shape.
  const { Retry } = await import('@theokit/sdk/retry')
  return Retry.create(open, { ...retry, signal: retry.signal ?? signal })
}

async function* consumeOneRound(
  factory: RoundStreamFactory,
  prompt: string,
  sessionId: string,
  signal: AbortSignal | undefined,
  retry: RetryOptions | undefined,
): AsyncGenerator<StreamEvent, RoundResult> {
  const r: RoundResult = {
    responseText: '',
    toolCalls: [],
    cost: 0,
    tokens: 0,
    tokensInput: 0,
    tokensOutput: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    finishReason: 'stop',
    errorMessage: '',
  }
  const signals: RoundSignals = {
    sawError: false,
    sawDone: false,
    doneFinishReason: '',
    sawToolResult: false,
  }
  // V4-N: the tool-call `input` (command/args) lives ONLY on the `tool_call` event; the
  // `output` on the paired `tool_result`. Correlate by callId so toolCalls is faithful.
  const callInputs = new Map<string, { name: string; input: unknown }>()

  // V4-P: the round START (creation + first event) is retried when `retry` is set; once an
  // event is yielded we iterate without retry (a mid-stream throw may have applied an edit).
  const { it, first } = await startRound(factory, prompt, sessionId, signal, retry)
  let next = first
  while (!next.done) {
    if (signal?.aborted) {
      // Cancellation: release the underlying iterator (parity with `for await`'s `.return()`
      // on break — runs the factory generator's `finally`, e.g. the SDK adapter's dispose).
      await it.return?.(undefined)
      break
    }
    yield next.value // V4-D-stream: surface the event to the consumer before accumulating
    accumulateEvent(next.value, r, signals, callInputs)
    next = await it.next()
  }

  r.finishReason = deriveFinishReason(signals)
  return r
}

/**
 * Step-cap force-close: on the ceiling round (`round === maxIterations`) wrap the factory so it is
 * called with `disableTools: true` (the adapter maps it to `tool_choice:"none"` at send-time),
 * forcing the model to emit the closing summary STEP_LIMIT_HINT requests instead of more tool calls.
 * Below the ceiling, the factory is returned unchanged. NOT exported (M55): its only caller is
 * `runReflectiveLoopStream` below — a stray `export` used to leak it and split that function's JSDoc.
 */
function ceilingRoundFactory(
  factory: RoundStreamFactory,
  round: number,
  maxIterations: number,
): RoundStreamFactory {
  if (round !== maxIterations) return factory
  return (m, s) => factory(m, s, { disableTools: true })
}

/**
 * Drive the reflective loop to a terminal {@link DelegationResult}.
 *
 * Terminates when: the reflection/strategy says stop, the `maxIterations` ceiling
 * is reached (via `loop.shouldContinue`), the signal aborts, or a degenerate round
 * resolves to `stop`. Throws `DelegationError` on a mid-round error event
 * (fail-fast, typed) and `DelegationBudgetExceededError` when cumulative cost crosses `budget`.
 */
export async function* runReflectiveLoopStream(
  factory: RoundStreamFactory,
  message: string,
  sessionId: string,
  config: RunReflectiveLoopConfig,
): AsyncGenerator<StreamEvent, DelegationResult> {
  const {
    loop,
    reflection,
    budget = Number.POSITIVE_INFINITY,
    signal,
    agentName = loop.name,
    retry,
  } = config
  const acc: DelegationResult = {
    response: '',
    toolCalls: [],
    cost: 0,
    tokens: 0,
    tokensInput: 0,
    tokensOutput: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    rounds: 0,
  }
  // V4-K: one mutable scratch bag per run, threaded to every reflect() so a stateful
  // strategy accumulates across rounds. The framework writes NOTHING into it.
  const reflectionContext: ReflectionContext = {}
  let round = 1
  let feedback: string | undefined
  let prevSig: string | undefined // V4-D: prior round's progress signature (no_progress detection)
  let stuck = 0 // V4-D: consecutive no-progress rounds

  while (!signal?.aborted) {
    const prompt = buildPrompt(round, loop.maxIterations, message, feedback)
    const roundFactory = ceilingRoundFactory(factory, round, loop.maxIterations)
    const r = yield* consumeRoundOrThrow(
      { factory: roundFactory, prompt, sessionId, signal, retry },
      agentName,
    )

    acc.response += r.responseText
    acc.toolCalls.push(...r.toolCalls)
    accumulateUsage(acc, r)

    if (r.finishReason === 'error') throw new DelegationError(agentName, r.errorMessage)
    if (Number.isFinite(budget) && acc.cost > budget) {
      throw new DelegationBudgetExceededError(agentName, acc.cost, budget)
    }

    // V4-D no_progress: only on would-continue rounds (EC-1: stop/error/length/empty already
    // terminate with their own reason), evaluated BEFORE the ceiling (EC-4: the earlier signal wins).
    // Require ≥1 tool call: a TOOL_CALLS round with an empty tool-call set (reachable only via the
    // dormant deriveFinishReason path 2 — done.finishReason==='tool-calls' with no tool_result) has
    // an empty signature; without this guard two such rounds would collide ('' === '') into a false
    // no_progress (theokit#53 review, architecture+tests LOW). An empty round made no tool progress
    // to compare — skip it (don't accumulate or reset).
    if (r.finishReason === TOOL_CALLS && r.toolCalls.length > 0) {
      const sig = roundSignature(r.toolCalls)
      stuck = sig === prevSig ? stuck + 1 : 0
      if (stuck >= NO_PROGRESS_THRESHOLD) return finalize(acc, round, 'no_progress', loop.name)
      prevSig = sig
    }

    const outcome: LoopOutcome = {
      finishReason: r.finishReason,
      round,
      toolCalls: r.toolCalls,
      responseText: r.responseText,
    }
    const reflectionResult = reflection.reflect(outcome, reflectionContext)
    // M54 — the `round < loop.maxIterations` term makes the ceiling the RUNNER's guarantee, not each
    // strategy's convention. Redundant for the three built-ins (they already embed it in
    // `shouldContinue`, so the whole expression is unchanged — zero-behavior), determinative for a
    // custom `.loopStrategy()` that never returns false: without it such a strategy loops forever.
    if (
      !(reflectionResult.continue && loop.shouldContinue(outcome) && round < loop.maxIterations)
    ) {
      const reason = terminalReason(
        reflectionResult.continue,
        r.finishReason,
        round,
        loop.maxIterations,
      )
      return finalize(acc, round, reason, loop.name)
    }

    feedback = reflectionResult.feedback
    round += 1
  }

  // Aborted before (re-)entering a round. L1: record the rounds that DID run
  // (round is 1-indexed and points at the next round, so `round - 1` ran).
  acc.rounds = round - 1
  return acc
}

/**
 * Collect-mode wrapper (backward-compatible): drains {@link runReflectiveLoopStream}
 * and returns ONLY the aggregated {@link DelegationResult}. `delegate()` and
 * `AgentRunner.run()` use this; streaming-first consumers use the generator directly.
 */
export async function runReflectiveLoop(
  factory: RoundStreamFactory,
  message: string,
  sessionId: string,
  config: RunReflectiveLoopConfig,
): Promise<DelegationResult> {
  const gen = runReflectiveLoopStream(factory, message, sessionId, config)
  let res = await gen.next()
  while (!res.done) res = await gen.next()
  return res.value
}
