---
"@theokit/agents": patch
---

An agent served over HTTP or the terminal now applies its declared guardrails. It applied none of them.

`streamAgentUIMessages` called `createSdkAgentStream` directly on both of its branches. Guardrails
were applied in exactly two other places — `AgentRunner.stream()` and `withGuardrails`, the latter
reached only from `toAgentFactory` — and neither is on this path. Measured:
`grep -c guardrail agent-endpoint.ts` → 0, against 23 files in `packages/agents/src`.

Its reachable callers are the HTTP mount, the terminal runner and the streamer builder: every surface
a deployed agent is actually reached through. So a `defineAgent({ guardrails: [...] })` served to a
browser ran no input guard, applied no `redact`, and a `block` never threw.

This is the same shape as three defects already closed in this release, one layer up. B-014 and B-018
measured *channels* inside a stream that was already being moderated; this is the surface where the
moderation never started.

**The composition is copied from `AgentRunner.stream()`, not reinvented** — two passes over the two
text-carrying kinds, visible inner and reasoning outer. NOT one wider extractor: two kinds under one
`extractText` collapse into a single event, so the model's private reasoning would be promoted into
the visible answer, and the moderation would create the disclosure it exists to close. That mutation
survived the first version of the test, which asserted over the flattened stream where every word is
still present; the assertions are per channel now.

Moderation runs on the wire chunks rather than upstream events, because the translator sits between
them — moderating upstream and letting the translator re-derive text would moderate one channel and
deliver another. `done.result` and `task_progress.text` remain uncovered here, exactly as in
`AgentRunner`: there is one `done` per round, so a pass keyed on it would collapse every round's into
one. They need a different mechanism and are tracked separately.

An agent that declared no guardrail takes an untouched pass-through — wrapping unconditionally would
buffer every served stream to enforce an empty list.
