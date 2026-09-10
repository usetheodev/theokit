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
 *                    **`extractText` MUST match exactly one event kind.** This is the parameter's
 *                    real contract and it is a constraint, not a convenience.
 *
 *                    When it matches several, they COLLAPSE INTO ONE. Measured against the built
 *                    artifact: `[thinking('CoT: the key is sk-abc'), message(' Here you go.')]`
 *                    yields a single `message` reading `"CoT: the key is [R] Here you go."` — the
 *                    model's private reasoning inside a visible event, and no `thinking` event
 *                    survives. Reverse the order and the visible answer is swallowed into a
 *                    `thinking` event instead.
 *
 *                    `replaced` does NOT prevent that, and an earlier version of this docblock, of
 *                    the changeset and of a test comment all said it did. What it buys is narrower
 *                    and worth having: the surviving event keeps the KIND and the metadata of the
 *                    text-carrying event it replaces, instead of being rebuilt from the text alone.
 *                    Without it, `[thinking, message]` collapsed into whatever kind `rebuildText`
 *                    hard-coded; with it, the caller chooses. The collapse itself is unchanged.
 *
 *                    So a consumer who wants reasoning moderated must run a SECOND
 *                    `moderateOutputStream` over that kind, not widen one `extractText` to cover
 *                    both.
 *
 *                    `replaced` is `undefined` in exactly one case, and the type says so rather
 *                    than asserting it away: no event in the stream carried text and the guard
 *                    produced some from `''`. There is nothing to preserve, so the caller builds
 *                    from the text alone. Note the boundary — an event whose extracted text is the
 *                    EMPTY STRING is still text-carrying, and can be the one replaced. For
 *                    `[text('secret'), text('')]` the moderated string lands on the trailing empty
 *                    delta, so a `{ ...replaced }` caller inherits the terminator's metadata rather
 *                    than the content-bearing event's.
 * @param rebuildResult applies the moderated text to the generator's RETURN value.
 *
 *                      A stream has two channels and this function moderated one of them for a
 *                      release. The events were redacted; `step.value` — the aggregate a caller
 *                      reads from `run()`, or from the generator's return — was accumulated
 *                      upstream from the PRE-moderation events and carried the original text.
 *                      Measured against the built artifact: the guard computed `"the key is [R]"`
 *                      and `run().response` was `"the key is sk-abc123"`.
 *
 *                      That is this function's own defect, verbatim, one channel over: the
 *                      redaction was computed and not applied. Required for the same reason
 *                      `rebuildText` is — optional would restore it under a nicer name — and
 *                      passed rather than re-derived, because re-running `runOutputGuards` on the
 *                      aggregate would apply a non-idempotent guard twice (a disclaimer appender
 *                      would append two disclaimers).
 *
 *                      Return `result` unchanged when it carries no moderated text. That is
 *                      correct and not a no-op only in that case; when it DOES carry the text,
 *                      returning it unchanged drops the redaction, and no type can tell the two
 *                      apart.
 *
 */
export async function* moderateOutputStream<E, R>(
  inner: AsyncGenerator<E, R>,
  guards: readonly Guardrail[],
  extractText: (event: E) => string | undefined,
  rebuildText: (text: string, replaced: E | undefined) => E,
  rebuildResult: (text: string, result: R) => R,
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
  // The aggregate travels the same fix as the events. On the fast path above it is untouched by
  // construction: `moderated === accumulated`, so there is nothing to apply.
  return rebuildResult(moderated, step.value)
}
