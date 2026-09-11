---
"@theokit/agents": patch
---

Sub-agents declared through the authoring chain now spawn, and the per-run door is nameable.

Three halves that did not connect: `SubAgentsCapability` wrote `draft.agents`,
`CompiledAgentOptions.agents` held it, and `assembleM8CreateOptions` had no `agents` field to
project it into. Declaring a sub-agent compiled cleanly and spawned nothing.

`agent-compiler.ts` recorded the gap as ADR D3 — "a resolver here is carried, not invoked" — and a
test pinned the boundary with an instruction attached: if someone wires the projection, go red and
record that the deferral ended. **That deferral has ended.** What could not be defended was the shape
a consumer meets: `SubAgentsCapability`, `SubagentDefinition`, `discoverSubagents`,
`loadSubagentDefinition` and `listSubagentNames` all cross the public barrel, so the authoring chain
reads as complete. This package already names that failure four times by issue number (#663, #668,
#675, #686): the type crosses, the capability does not.

**Why projecting rather than un-exporting.** The shapes already agreed everywhere except in the one
type nothing consumed. `RuntimeOverrides.agents` — the per-run door that always worked — is
`Record<string, AgentDefinition>`, the SDK's own shape, and that same shape already crossed the
barrel as `SubagentDefinition`. The odd one out was `CompiledSubAgent` (`{ model?, systemPrompt? }`),
referenced in exactly two places, both of them its own declaration and the field that held it. It
could not have been projected as it stood: `AgentDefinition` requires `description` and `prompt`, and
a sub-agent with no description is one the parent model has no basis to delegate to.
`CompiledSubAgent` is now an alias of the SDK type, so `model` is `ModelSelection | "inherit"` rather
than a bare string.

**`RuntimeOverrides` is exported, type-only.** It was declared by the adapter and exported by zero
barrels, so a consumer could pass the value and could not name the type — no helper, no wrapper, no
typed variable to hold one.

Per-run overrides still win over the compiled set: `sdk-adapter.ts` spreads `...m8, ...extra`, and a
per-run value that lost to a compile-time one would be the opposite of what "override" promises. The
key is written only when something was declared — an unconditional `agents: {}` would hand
`Agent.create` a claim ("this agent has children") that no author made.
