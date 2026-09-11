---
"@theokit/agents": minor
---

The served handle offers a schema-validated, tool-using run. The capability existed and the door did not.

**The survey's conclusion did not survive measurement.** It said "structured output cannot be
combined with tools", on evidence that `outputFormat`, `structuredOutput`, `outputSchema` and
`responseFormat` returned 0 files here, and that `generateObject`'s options carry no `tools` field.
Both facts are true; the conclusion is not.

`generateObject` is the **toolless path by design** — it builds a transient agent whose only tool is
the synthetic output tool. The tool-using path is `agent.generate(input, { output })`, which runs the
agent's normal tool loop, the user's tools first, and then coerces the final answer into a Zod schema.
It exists on the published SDK's agent.

**The real gap was this layer's.** `SdkAgentHandle` — what is served to ACP, the delegation surfaces
and the autonomous loop — declared `send` and `dispose` and not `generate`, so a consumer of
`@theokit/agents` could reach it only by importing `@theokit/sdk` directly. Same shape as the session
store: the capability existed, the door did not.

It is optional on the interface, because a caller-injected handle (tests, a custom transport) need not
implement it, and requiring it would break every such double to add a method most never call.

**Both wrappers forward it**, and that is the half that actually breaks: `withStepCeiling` and
`withGuardrails` each construct a new object, so every method they do not name disappears — the
consumer meets the loss at runtime as "the handle has no `generate`", after the types said it had
one. Each forward is pinned by its own mutation.

`generate` is **not** put through the output guards, stated rather than assumed. It resolves to a
validated object and those guards moderate text; running them over a serialised object would moderate
a shape no guard was written against. Guarding the structured path needs its own decision about what
a redaction means to a schema, and inventing one here would be the gate that reports without gating
this module already refuses to build.
