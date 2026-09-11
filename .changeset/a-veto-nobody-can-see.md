---
'@theokit/agents': patch
---

A permission-gate veto now emits a debug line.

`grantGate` refused and emitted nothing — no log, no counter, no debug line. An operator could
observe the refusal only through the tool result the model received, and the two causes the veto
message distinguishes ("no standing grant matches" versus "the permission store could not be read,
so no grant applies") are indistinguishable from there.

That is pillar 3 of the wiring triad missing on a refusal seam. `bridge/approval-posture.ts`, the
sibling gate, already logged through this exact seam.

The QUERY is logged — tool, scope, and which of the two causes fired — and the grant is not: a query
names what an operator needs to diagnose, while the store's contents are the thing being protected.
A classifier that threw logs as its own event rather than as an ordinary veto, so a consumer-code
defect is not read as a denied tool.
