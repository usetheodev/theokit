---
'@theokit/agents': minor
---

`moderateOutputStream` now delivers the redacted text to the client instead of computing it and
replaying the original events.

It called `runOutputGuards` and discarded the return value, so a guard that redacted correctly had
its work thrown away: measured against the built artifact, a guard returning `[REDACTED]` delivered
`sk-abc123`. Only `block` reached the client honestly.

**Signature change**: `moderateOutputStream` takes a fourth argument,
`rebuildText: (text: string, replaced: E) => E`, which builds one event carrying the
moderated text, given the text-carrying event it replaces. It is required rather than optional —
optional would let the function compute a redaction it cannot apply, which is the defect being
removed. Only the caller knows how to construct its own events.

**`extractText` MUST match exactly one event kind.** When it matches several, they COLLAPSE INTO
ONE — measured: `[thinking('CoT: the key is sk-abc'), message(' Here you go.')]` yields a single
`message` reading `"CoT: the key is [R] Here you go."`, with no `thinking` event surviving. A
consumer who wants reasoning moderated runs a SECOND pass over that kind rather than widening one
extractor.

`replaced` does not prevent that collapse, and an earlier draft of this entry said it did. What it
buys is narrower: the surviving event keeps the KIND and metadata of the text-carrying event it
replaces, instead of being rebuilt from the text alone. `replaced` is ALWAYS the event being replaced.
It was typed `E | undefined` for a case that cannot happen — a stream where no event carried text
returns from the absence check before the guards run, so `rebuildText` is not reached at all. It is
also never a non-text event, because a caller spreading one would emit a duplicate of it.

**Second signature change**: a fifth argument, `rebuildResult: (text, result) => R`, applies the
moderated text to the generator's RETURN value. A stream has two channels and the first release of
this fix moderated one: the events were redacted while `step.value` — the aggregate `run()` returns
— still carried the original text. Measured: the guard computed `"the key is [R]"` and
`run().response` was `"the key is sk-abc123"`, so **`run()`, the primary non-streaming API, kept
delivering the secret**. That was this fix's own defect one channel over. Required for the same
reason `rebuildText` is; passed rather than re-derived, because re-running the guards on the
aggregate would apply a non-idempotent guard twice.

When the text is unchanged, the buffered events are replayed verbatim as before. When it changed,
the **last** text-carrying event is REPLACED by a newly built event carrying the whole moderated
string, and the earlier text events are dropped. Events carrying no text are never dropped. Note
"replaced", not "modified": any non-text payload the surviving event carried is lost, as is that of
the dropped ones — a consumer whose text events carry per-event metadata should moderate one kind
only, or rebuild from `replaced`. An event whose extracted text is the EMPTY STRING is still
text-carrying and can be the one replaced.

**Known consequence:** when text events straddle a non-text event, their relative order does not
survive a redaction. Given `text('tok ') , tool_call , text('sk-abc')` the client now receives
`tool_call , text('tok [R]')` — text that preceded the tool call follows it. Landing on the last
text-carrying event keeps a trailing terminator in place and keeps any completion claim after the
work that produced it; what it cannot keep is the interleaving, because the redaction is about the
whole string and the boundaries are gone by the time it exists. A test pins this so it is found
here rather than in a transcript that stopped making sense.

A guard that rewrites **unconditionally** — a disclaimer appender, a trim, an NFC normaliser —
takes this path on every stream that DOES carry text. The cost is not proportional to how much the
guard changed. It does NOT add a text event to a round that produced none — this entry claimed so,
and the absence check refuses it: a tool-only round yields its tool call and nothing else.
