---
"@theokit/agents": patch
---

A text event whose `content` is not a string is refused instead of delivered unexamined.

Both extractors tested `typeof e.content === 'string'` and returned `undefined` otherwise.
`moderateOutputStream` reads `undefined` as "this event carries no text", so the payload was never
accumulated, never shown to a guard, and yielded **verbatim**.

The failure direction is DELIVER, not block: a guard declared to stop that payload silently never saw
it, and the run reported green. Reachable in practice — `StreamEvent` is
`{ type: string; [key: string]: unknown }`, `event-translator.ts` casts an unvalidated provider
content block to `{ text?: string }`, and a consumer-supplied `streamFactory` is a public option.

**Two different questions had been collapsed into one answer.** "Not this event kind" and "this kind,
content unreadable" both returned `undefined`, and they need opposite handling. The new
`textPayloadExtractor` keeps `undefined` for the first and throws `UnreadableTextPayloadError` for
the second.

**Refused, not coerced.** Coercing would moderate `"[object Object]"` — a guard consulted about a
string the model never produced, returning a verdict about nothing, while the real payload rides
along underneath. That is the redaction-computed-and-discarded shape with an extra step.

One implementation, used by both seams. The defect existed as two hand-written copies of the same
predicate in `AgentRunner.stream()` and the served endpoint; fixing one and leaving the other is the
half-fix this release keeps finding.

Only runs that declared an output guard can meet the error: `moderateOutputStream` is a transparent
pass-through when no guard defines `checkOutput`, so the extractor is never consulted otherwise.
