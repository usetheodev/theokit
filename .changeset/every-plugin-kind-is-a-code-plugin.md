---
'@theokit/agents': patch
---

`AgentBuilder.plugins()` and `defineAgent({ plugins })` accept all three plugin kinds the SDK
defines, not just one.

`CodePlugin` required `register`, so it admitted `kind: "general"` and refused `kind:
"model-provider"` (which carries `profile`) and `kind: "memory"` (which carries `createProvider`).
The docblock on `AgentBuilder.plugins`, written in the same change, already described the parameter
as taking "a model provider / memory adapter (`kind: 'general' | 'model-provider' | 'memory'`)" — so
the prose promised three kinds while the type admitted one.

Found by a real consumer rather than by a gate. On `@theokit/agents@13.0.0`, TheoCode's build stopped
with `Property 'register' is missing in type 'BasePlugin & { kind: "model-provider"; profile:
ProviderProfile }'`. Nothing in this package caught it: 1 799 tests, `tsc`, eslint, knip and CodeQL
were all green over a type that refused two thirds of its own contract.

What the guard is FOR is unchanged: the Claude Code filesystem-bundle form (`{ type, path, source,
marketplace }`) is still refused with a message naming where a bundle belongs. An object carrying a
`name` and none of the three capability keys is still refused too — widening to three kinds must not
widen to "anything with a name", which would let the bundle form back in through the front door.
