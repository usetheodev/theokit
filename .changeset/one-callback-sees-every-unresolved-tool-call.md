---
"@theokit/agents": minor
---

A declared `canUseTool` gate reaches the runtime, so a tool call the earlier steps did not resolve has somebody to ask.

Measured: `canUseTool` returned 0 files in this layer, against controls of `hooks` 31 and `session`
37. The SDK has the seam — a permission plugin invoked on an `ask` verdict — and this layer offered
no way to reach it.

**The default was never the problem, and saying so matters.** The SDK's engine is fail-closed: an
unmatched call resolves to `ask`, and an *absent* gate blocks it. A tool added after the approvals
were written already defaulted to asking. What was missing is that the ask reached nobody, so it
resolved to a refusal with no way to decide otherwise.

`CanUseToolCapability` writes the gate and the adapter projects it as a permission plugin over an
engine with **no rules** — so every call resolves to `ask` and every call reaches the gate. That is
what "sees every tool call the earlier steps did not resolve" means when there are no earlier steps.
A consumer who also wants rules composes them through the SDK directly; accepting both here would
mean inventing a precedence between a rule set and a gate that nobody stated.

The plugin is **appended**, never replacing: a consumer that already registers lifecycle plugins must
not have them dropped by declaring a gate. And only when a gate was declared — installing an empty
permission plugin would gate every `ask` verdict on a callback that does not exist, which the SDK
resolves by blocking. That is strictly worse than the absence it would replace.

**`updatedInput` is decided upstream, not by silence here.** The spec lets a gate *correct* a call,
and the SDK states its position: the `pre_tool_call` seam is veto-only, and arg rewrite is
intentionally unsupported. Surfacing a gate that accepted an `updatedInput` this runtime would
discard is the fabricated mechanism this backlog keeps finding; the narrower contract is carried as
it is.
