---
'@theokit/agents': minor
---

`moderateOutputStream` now delivers the redacted text to the client instead of computing it and
replaying the original events.

It called `runOutputGuards` and discarded the return value, so a guard that redacted correctly had
its work thrown away: measured against the built artifact, a guard returning `[REDACTED]` delivered
`sk-abc123`. Only `block` reached the client honestly.

**Signature change**: `moderateOutputStream` takes a fourth argument,
`rebuildText: (text: string, replaced: E | undefined) => E`, which builds one event carrying the
moderated text, given the text-carrying event it replaces. It is required rather than optional —
optional would let the function compute a redaction it cannot apply, which is the defect being
removed. Only the caller knows how to construct its own events.

`replaced` exists because `extractText` may match SEVERAL event kinds while `rebuildText` builds
exactly one. A consumer moderating reasoning as well as visible text is doing the obvious thing,
and without the parameter those collapse into one event of the kind `rebuildText` builds —
measured: a `thinking` event and a visible one became a single visible event, promoting the model's
private reasoning into assistant output. Handing over the replaced event lets the caller keep its
kind and its metadata. `replaced` is `undefined` whenever no event in the stream carried text —
including a stream that carried only tool calls. It is never a non-text event: an event that is not
being replaced must not be handed to a function whose job is to build the replacement, or a caller
spreading it emits a duplicate of it.

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
takes this path on every stream carrying a tool call, and adds a text event to rounds that produced
none. The cost is not proportional to how much the guard changed.
