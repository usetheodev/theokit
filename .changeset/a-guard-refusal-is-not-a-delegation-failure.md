---
'@theokit/agents': patch
---

A guardrail refusal thrown inside a round is no longer renamed into a delegation failure.

`runReflectiveLoop` wrapped any error that was not already a delegation error into
`DelegationError`, whose message reads `Delegation to agent "X" failed: ${cause.message}`. That code
is on the delegate tool's message allowlist — a delegation failure's text is a fact about the work —
so the wrapper carried the guard's own words to the model: `Guardrail "pii-detector" blocked output:
ssn found`, naming the guard and its exact trigger.

Measured through `createDelegateTool` with a consumer-supplied `streamFactory` that throws
mid-round. `streamFactory` is a public option, so this was reachable rather than theoretical.

`GuardrailViolationError` now passes through as itself, alongside the two delegation errors that
already did, so the tool classifies it `guardrail_violation` and withholds the message.

Fixed by classification rather than by suppressing text downstream: a guard refusal is not a
delegation failure, and a layer that renames an error cannot be expected to maintain a list of what
the new name must hide.
