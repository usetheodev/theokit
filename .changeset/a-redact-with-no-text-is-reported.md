---
'@theokit/agents': minor
---

A guardrail returning `action: 'redact'` with no replacement `text` now throws
`MalformedGuardrailResultError` instead of silently redacting nothing.

`GuardrailResult.text` is optional, so such a guard compiles and reads like a working one. The
pipeline tested `r.text !== undefined` and moved on, so the caller received the original text and
believed a guard had run on it — the operator believing a protection is in place when none is.

**This is a behaviour change.** A guard relying on the previous no-op will now throw. That is
deliberate: the alternative is unredacted output reaching a model because a guard was written wrong.
`text: ''` is unaffected and always was a real redaction — a guard choosing to erase everything.

`MalformedGuardrailResultError` is exported from `@theokit/agents`, carries the guard's name and the
phase, and is not retryable.
