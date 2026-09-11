---
"@theokit/agents": patch
---

A malformed guardrail result no longer hands the model the name of the guard that failed, and a third guardrail error class is covered by construction.

B-015 made `GuardrailViolationError` pass through `run-reflective-loop.ts` unwrapped, because
`DelegationError` interpolates its cause and `delegation_failed` is on the delegate tool's message
allowlist. Its sibling in the same file was not added. `MalformedGuardrailResultError` takes the same
wrapping, and its message also names the guard: `Guardrail "X" returned action 'redact' for output
with no replacement text.`

Smaller payload than a violation — the guard's name and phase, not its trigger text — and the same
leak through the same allowlist. It additionally **mislabelled a guard defect as a delegation
failure**, which is a fact about the work the model would act on.

**The passthrough is now structural.** `GuardrailError` is the abstract base every guardrail error
shares, and `run-reflective-loop.ts` and `errorCodeOf` both key on it — so a new class is covered by
its own declaration rather than by someone remembering to extend a list of two. A list of two is how
this defect existed.

A base alone is not airtight: a class can still extend `TheokitAgentError` directly. The test walks
the guardrails barrel and fails on any exported error class that skipped the base. The two together
are the construction; either alone is a convention.

A malformed result crosses as `guardrail_error`, not `guardrail_violation`: a guard that is written
wrong did not refuse anything, and telling the model it was refused would be wrong in the other
direction. Neither code is on the message allowlist, so both withhold. `CostBudgetExceededError` now
descends from the same base and crosses as a refusal instead of being rethrown as a defect.
