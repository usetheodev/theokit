import { TheokitAgentError } from '@theokit/sdk/errors'
import type { RetryOptions } from '@theokit/sdk/retry'

import type { StreamEvent } from './agent-sse-handler.js'

/**
 * Per-turn transient retry for the SDK-adapter stream — the seam the SERVED path never had.
 *
 * ## Why `runReflectiveLoop`'s retry does not reach here
 *
 * `AgentRunnerRunOptions.retry` (V4-P) wraps the START of a reflective round in the SDK `Retry`, and
 * that works because a `RoundStreamFactory` is allowed to THROW. This path is a different runtime:
 * `streamAgentTurnInProcess` → `streamAgentUIMessages` → `createSdkAgentStream` runs ONE SDK turn
 * with no loop, and the SDK does not throw a provider failure at it. Measured in the shipped
 * `@theokit/sdk@4.52.1`:
 *
 *  - `agent.send()` resolves BEFORE the model is called — the loop is detached
 *    (`bootstrap()` → `setTimeout(() => void driveLoop())`, `chunk-KELIQH7K.js:7166`). So a 429 can
 *    never surface as a rejected `send()`.
 *  - the loop's own failure is caught (`executeAgentLoop`'s `catch` → `emitErrorEvent` →
 *    `transitionTo("error")`, `chunk-KELIQH7K.js:7239`) and reported as the run's TERMINAL EVENT:
 *    `events()` ends with a `status: "ERROR"` message, and this layer translates that to
 *    `{type:'error'}`.
 *
 * A `Retry.run` around the stream's creation would therefore have been INERT for the exact
 * failure it was asked to cover — it would have compiled, shipped, and never fired. What makes it
 * real is treating that first `error` event as the throw the SDK declined to make.
 *
 * ## Why retrying is safe here, and only here
 *
 * The retry window closes on the FIRST event. Nothing has reached the caller, no `tool_call` has
 * been emitted, and therefore no edit has been applied — the same invariant `startRound` states for
 * the loop ("a transient before any event is yielded is recovered without re-applying an edit").
 * Once one event is out, a failure propagates untouched.
 *
 * That window is not a technicality on this path: when the first LLM call fails, the run's timeline
 * is EMPTY. The loop seeds its `system` + `user` events into the event log and subscribes the live
 * sink AFTERWARDS (`createEventLog(...)` then `events.subscribe(...)`,
 * `chunk-KELIQH7K.js:4824-4831`), so those two are never delivered live, and the terminal
 * `status: "ERROR"` is the first and only thing `events()` yields.
 *
 * ## Why retryability is read off the run, not off the event
 *
 * The translated event carries `retryable: false` for every agent error — `translateStatusEvent` has
 * nothing better to read, since a `status` message is text. Deciding from that text is the heuristic
 * this ecosystem already paid for (M93: `ECONNREFUSED …:443` classified as a 4xx because the port
 * matched). `RunResult.error.cause` is the SDK's own typed error (`script.errorDetail.cause`, set
 * from what the loop threw), so the adapter hands it over in {@link TurnOutcome} and the SDK's
 * `isTransientError` — the default `RetryOptions.isRetryable` — answers from the error CLASS. A rate
 * limit retries; a bad key does not.
 */

/**
 * The box one attempt's typed failure lands in.
 *
 * An out-parameter rather than a return value because the failure is discovered mid-iteration, by
 * the generator that is also yielding events — there is no return channel until it ends, and by then
 * the retry decision is over.
 */
export interface TurnOutcome {
  /** The SDK's typed error for a turn that failed, when the adapter could recover it. */
  failure?: unknown
}

/** One attempt at a turn: its event stream, and the box its typed failure lands in. */
export interface TurnAttempt {
  readonly stream: AsyncIterable<StreamEvent>
  readonly outcome: TurnOutcome
}

/** Coerce an unknown index-signature field to a string, or `undefined`. */
function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The failure to hand the retry policy: the run's typed error when the adapter recovered one,
 * otherwise a typed stand-in built from the event.
 *
 * The stand-in declares `isRetryable` from the event's own flag rather than defaulting it. A default
 * of `true` would retry an authentication failure three times; a default of `false` would be a
 * policy nobody chose, stated by omission — the objection `in-process-turn.ts` already records
 * against defaulted retryability.
 */
function startFailure(event: StreamEvent, outcome: TurnOutcome): unknown {
  if (outcome.failure !== undefined) return outcome.failure
  return new TheokitAgentError(
    asText(event.message) ?? 'The turn failed before producing any output.',
    {
      code: asText(event.code) ?? 'TURN_START_FAILED',
      isRetryable: event.retryable === true,
    },
  )
}

/** Open the turn and read its first event, retrying while the attempt produced nothing. */
async function startTurn(
  open: () => TurnAttempt,
  retry: RetryOptions,
): Promise<{ it: AsyncIterator<StreamEvent>; first: IteratorResult<StreamEvent> }> {
  const attempt = async (): Promise<{
    it: AsyncIterator<StreamEvent>
    first: IteratorResult<StreamEvent>
  }> => {
    const { stream, outcome } = open()
    const it = stream[Symbol.asyncIterator]()
    try {
      const first = await it.next()
      if (!first.done && first.value.type === 'error') throw startFailure(first.value, outcome)
      return { it, first }
    } catch (err) {
      // Release THIS attempt before a fresh one opens. The adapter generator's `finally` disposes
      // the SDK agent, and disposal is what removes it from the SDK's agent registry — without it
      // the retry's `Agent.getOrCreate(sessionId, …)` would hit the cache and reuse the very agent
      // whose turn just failed, with the previous attempt's options.
      await it.return?.(undefined)
      throw err
    }
  }
  // SE36 (SDK v3.0) — `withRetry` became `Retry.create`, and 5.x renamed that to `Retry.run`; same
  // call shape throughout. B-029 is what surfaced the second rename: the deprecation is type-aware,
  // so it was invisible while the workspace resolved 4.52.1. `Retry.run` exists across the whole
  // declared range — verified in the 5.0.0, 5.3.0 and 5.4.0 tarballs, not just the installed copy.
  // Dynamic-imported so the
  // symbol is loaded only by a caller that opted in, matching `run-reflective-loop`'s discipline.
  const { Retry } = await import('@theokit/sdk/retry')
  return Retry.run(attempt, retry)
}

/**
 * Drive one turn with start-retry. Yields the attempt that committed; a failure after the first
 * event propagates to the caller untouched.
 */
async function* withTurnStartRetry(
  open: () => TurnAttempt,
  retry: RetryOptions,
): AsyncGenerator<StreamEvent> {
  const { it, first } = await startTurn(open, retry)
  let next = first
  while (!next.done) {
    yield next.value
    next = await it.next()
  }
}

/**
 * Run one turn, with start-retry when the caller declared a policy and without any wrapper when it
 * did not.
 *
 * The `undefined` branch is the whole back-compat floor and is why this function exists rather than
 * a ternary at the call site: a run that declared nothing gets the exact stream it always got, from
 * the exact call it always made, with no `outcome` box and no extra `wait()` lookup.
 *
 * `open` is handed a fresh {@link TurnOutcome} per ATTEMPT — reusing one across attempts would let
 * the first failure decide the second — and `undefined` when there is no retry to inform.
 */
export function runTurnWithRetry(
  open: (outcome?: TurnOutcome) => AsyncIterable<StreamEvent>,
  retry: RetryOptions | undefined,
): AsyncIterable<StreamEvent> {
  if (retry === undefined) return open()
  return withTurnStartRetry(() => {
    const outcome: TurnOutcome = {}
    return { stream: open(outcome), outcome }
  }, retry)
}
