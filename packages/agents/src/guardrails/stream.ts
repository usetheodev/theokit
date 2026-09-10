/**
 * M9 — apply output guards to a stream (ADR-0040 § D2).
 *
 * Generic over the event type (no dependency on the bridge's `StreamEvent` — keeps this module
 * pure per G1). When any guard defines `checkOutput`, the stream is BUFFERED: every event is held,
 * the accumulated text is moderated, and only on pass are the events replayed. A `block` throws
 * {@link GuardrailViolationError} BEFORE any event reaches the client — the honest "blocked before
 * reaching the client" semantics. Streaming is traded for safety only when an output guard exists;
 * with none, this is a transparent pass-through (streaming preserved).
 */
import { runOutputGuards } from './pipeline.js'
import type { Guardrail } from './types.js'

/**
 * Wrap `inner`, moderating its accumulated text output.
 *
 * @param inner       the source stream (yields events, returns a result).
 * @param guards      the guardrails; only those with `checkOutput` participate.
 * @param extractText pulls the human-visible text out of an event (return `undefined` for non-text).
 * @param rebuildText builds ONE event carrying the moderated text. Required, not optional (B-012):
 *                    optional would let this function compute a redaction it cannot apply, which is
 *                    the defect it was added to remove. Only the caller knows its own event shape.
 */
export async function* moderateOutputStream<E, R>(
  inner: AsyncGenerator<E, R>,
  guards: readonly Guardrail[],
  extractText: (event: E) => string | undefined,
  rebuildText: (text: string) => E,
): AsyncGenerator<E, R> {
  const hasOutputGuard = guards.some((g) => g.checkOutput != null)
  // Fast path: nothing to moderate — pass through, streaming preserved.
  if (!hasOutputGuard) return yield* inner

  const buffered: E[] = []
  let accumulated = ''
  let step = await inner.next()
  while (!step.done) {
    const event = step.value
    const text = extractText(event)
    if (text !== undefined) accumulated += text
    buffered.push(event)
    step = await inner.next()
  }

  // Moderate the FULL output before emitting anything — throws on block.
  const moderated = await runOutputGuards(accumulated, guards)

  // B-012: the return value used to be discarded and the ORIGINAL events replayed, so a guard that
  // redacted correctly had its work thrown away and the secret reached the client. Measured against
  // the built artifact: `[REDACTED]` computed, `sk-abc123` delivered.
  if (moderated === accumulated) {
    // Nothing was changed — replay verbatim, which keeps event boundaries a guard did not object to.
    for (const event of buffered) yield event
    return step.value
  }

  // The text changed, and reassembling it costs something that has to be said out loud.
  //
  // The guard saw ONE string and never saw the event boundaries, so splitting its answer back across
  // N deltas would be a guess presented as a boundary. The whole moderated string therefore lands on
  // the FIRST text-carrying event and the later text events are dropped.
  //
  // KNOWN CONSEQUENCE, measured rather than discovered later: when text events straddle a non-text
  // event, their relative order does not survive. Given
  //
  //     text('tok ') , tool_call , text('sk-abc')
  //
  // the client receives `text('tok [R]') , tool_call` — text that FOLLOWED the tool call now
  // precedes it. If the model was commenting on a tool result, that comment moves ahead of the
  // result it comments on.
  //
  // No position is correct, because the redaction is about the whole string and the boundaries are
  // gone by the time it exists. Emitting at the LAST text event moves the problem rather than
  // solving it. The alternatives that would solve it — refusing to moderate a straddling stream, or
  // asking guards to work per event — are both larger than this defect and belong to their own
  // measurement. What must not happen is this being found by someone reading a transcript that
  // stopped making sense; `stream-order-is-not-preserved-across-a-redaction` pins it.
  let emittedText = false
  for (const event of buffered) {
    if (extractText(event) === undefined) {
      yield event
      continue
    }
    if (!emittedText) {
      emittedText = true
      yield rebuildText(moderated)
    }
  }
  // A guard that redacted every text event away still owes the client the moderated string.
  if (!emittedText) yield rebuildText(moderated)
  return step.value
}
