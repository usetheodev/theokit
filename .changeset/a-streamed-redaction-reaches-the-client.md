---
'@theokit/agents': minor
---

`moderateOutputStream` now delivers the redacted text to the client instead of computing it and
replaying the original events.

It called `runOutputGuards` and discarded the return value, so a guard that redacted correctly had
its work thrown away: measured against the built artifact, a guard returning `[REDACTED]` delivered
`sk-abc123`. Only `block` reached the client honestly.

**Signature change**: `moderateOutputStream` takes a fourth argument, `rebuildText: (text: string)
=> E`, which builds one event carrying the moderated text. It is required rather than optional —
optional would let the function compute a redaction it cannot apply, which is the defect being
removed. Only the caller knows how to construct its own events.

When the text is unchanged, the buffered events are replayed verbatim as before. When it changed,
the first text-carrying event becomes the whole moderated string and the remaining text events are
dropped; events carrying no text pass through in position, so a redaction never costs a tool call.
