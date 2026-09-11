---
'@theokit/agents': minor
---

`delegate()` now applies the guardrails its spec declares. It accepted them and never consulted them.

Measured against the built artifact with a guard declaring both halves: the input reached the model
with its injection intact and the caller received `sk-abc123`. `bridge/agent-orchestrator.ts`
contained **zero** occurrences of `guardrail` — control on the same sweep: `loop/agent-runner.ts`
has 9 — and called `runReflectiveLoop` bare. The operator had declared guardrails and the run was
green.

This is the same defect class as the streamed-redaction fix in this release, on a sibling public
API, and it is model-reachable: `tools/delegate-tool.ts` wraps `delegate()`, so an agent can invoke
a sub-agent whose declared guards do nothing.

`checkInput` runs after `onDelegationStart` and `checkOutput` after `onDelegationComplete` — each
moderating what actually crosses the boundary rather than a string a hook may then rewrite. A
blocking input guard throws before the model is called at all, so a refused delegation costs
nothing.

`response` only. `toolCalls[].output` is tool output rather than model text, and `agent-runner.ts`
excludes it from `extractText` on the same reasoning; the docblock says so, because leaving it alone
should be a decision somebody reads rather than an omission somebody discovers.

A spec declaring no guardrails behaves byte-identically.
