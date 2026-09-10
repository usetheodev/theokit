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
 * @param rebuildText builds ONE event carrying the moderated text, GIVEN the text-carrying event it
 *                    replaces. Required, not optional (B-012): optional would let this function
 *                    compute a redaction it cannot apply, which is the defect it was added to remove.
 *
 *                    The second parameter arrived from review, and the reason is a disclosure path
 *                    the first version created. `extractText` may match SEVERAL event kinds — a
 *                    consumer moderating reasoning as well as visible text is doing the obvious
 *                    thing — while `rebuildText` builds exactly one. Measured: a `thinking` event
 *                    and a `text_delta` collapsed into a single `text_delta`, promoting the model's
 *                    private reasoning into visible assistant output. Pre-fix that was impossible,
 *                    because events were replayed verbatim.
 *
 *                    Handing the caller the event being replaced lets them keep its kind, its id,
 *                    its citations — anything the moderated text alone does not carry. What the
 *                    function still cannot do is preserve the DROPPED events' payloads; a consumer
 *                    whose text events carry per-event metadata should moderate one kind only.
 *
 *                    `replaced` is `undefined` in exactly one case, and the type says so rather
 *                    than asserting it away: no event in the stream carried text and the guard
 *                    produced some from `''`. There is nothing to preserve, so the caller builds
 *                    from the text alone. Note the boundary — an event whose extracted text is the
 *                    EMPTY STRING is still text-carrying, and can be the one replaced. For
 *                    `[text('secret'), text('')]` the moderated string lands on the trailing empty
 *                    delta, so a `{ ...replaced }` caller inherits the terminator's metadata rather
 *                    than the content-bearing event's.
 */
export async function* moderateOutputStream<E, R>(
  inner: AsyncGenerator<E, R>,
  guards: readonly Guardrail[],
  extractText: (event: E) => string | undefined,
  rebuildText: (text: string, replaced: E | undefined) => E,
): AsyncGenerator<E, R> {
  const hasOutputGuard = guards.some((g) => g.checkOutput != null)
  // Fast path: nothing to moderate — pass through, streaming preserved.
  if (!hasOutputGuard) return yield* inner

  const buffered: E[] = []
  /** Parallel to `buffered`: which events carried text. Recorded HERE so `extractText` is called
   *  exactly once per event — see the note above `last`. */
  const textAt: boolean[] = []
  let accumulated = ''
  let step = await inner.next()
  while (!step.done) {
    const event = step.value
    const text = extractText(event)
    if (text !== undefined) accumulated += text
    buffered.push(event)
    textAt.push(text !== undefined)
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
  // N deltas would be a guess presented as a boundary. The whole moderated string lands on the LAST
  // text-carrying event, and the earlier ones are dropped.
  //
  // LAST rather than FIRST, changed on review, and the reasoning is worth keeping because the first
  // version argued from symmetry and the consequences are not symmetric. The stream is fully
  // buffered — nothing is emitted until `inner` is exhausted — so emitting text early buys no
  // time-to-first-token, and FIRST's only advantage was a simpler loop. What it cost was ordering a
  // COMPLETION CLAIM before the work that produced it: the client read "Done." and then watched four
  // tool events execute. LAST misplaces a preamble instead — "Let me look that up." arriving after
  // the lookup — which is scene-setting, not a state assertion. It also matches how chat surfaces
  // render: tool activity as steps, then the assistant message.
  //
  // KNOWN CONSEQUENCE, measured rather than discovered later: when text events straddle a non-text
  // event, their relative order does not survive. Given
  //
  //     text('tok ') , tool_call , text('sk-abc')
  //
  // the client receives `tool_call , text('tok [R]')` — text that PRECEDED the tool call now
  // follows it. LAST keeps the terminator in place (a trailing non-text event still arrives last)
  // and keeps completion claims after the work, which is why it was chosen; what it cannot keep is
  // the interleaving, because the redaction is about the whole string and the boundaries are gone
  // by the time it exists.
  //
  // The alternatives that WOULD keep it — refusing to moderate a straddling stream, or asking
  // guards to work per event — are both larger than this defect and belong to their own
  // measurement. What must not happen is this being found by someone reading a transcript that
  // stopped making sense; `stream-order-is-not-preserved-across-a-redaction` pins it.
  //
  // A guard that rewrites UNCONDITIONALLY — a disclaimer appender, a trim, an NFC normaliser —
  // takes this path on every stream that carries a tool call, and adds a text event to rounds that
  // produced none. Measured on review; the cost is not proportional to how much the guard changed.
  // `textAt` is recorded during accumulation, where `extractText` is called anyway — see the
  // accumulation loop. An earlier version mapped over `buffered` here, which RELOCATED the second
  // call per event instead of removing it: measured 8 calls before and 8 after, for a comment that
  // claimed a saving. `extractText` is the caller's function and may be neither cheap nor pure.
  const last = textAt.lastIndexOf(true)

  for (const [index, event] of buffered.entries()) {
    if (!textAt[index]) {
      yield event
      continue
    }
    if (index === last) yield rebuildText(moderated, event)
  }
  // The stream carried NO text-carrying event and the guard produced some — there is nothing to
  // replace, so `undefined` is passed and the caller builds from the text alone.
  //
  // This line read `buffered[0]` for one round, and that was the defect this whole function exists
  // to remove, restored on its last branch. For `[tool_call]` — reachable with any guard that
  // rewrites unconditionally — `buffered[0]` IS the tool call, which is not being replaced and is
  // still yielded. A caller following the pattern this module's own test documents as correct,
  // `{ ...replaced, content }`, would emit a SECOND tool call carrying the first one's id and
  // arguments: a duplicated invocation, produced by a redaction. Three documents stated `replaced`
  // was absent here while the code handed over a live event.
  if (last === -1) yield rebuildText(moderated, undefined)
  return step.value
}
