---
'@theokit/agents': minor
---

New `grantGate(store, classify)` in `@theokit/agents/auth` — the supported way to put a
`PermissionStore` in force.

The store shipped with a careful grant key, a "deny by default, always" docblock and no reader.
Measured: `isGranted` had zero callers outside its own unit test, and `PermissionStore` appeared in
zero files across six sibling repositories. An operator reading `.theokit/tool-permissions.json` to
learn what an agent may run was reading a control that was not in force — a grant and its revocation
produced identical behaviour.

`grantGate` adapts the store to `pre_tool_call`, which is documented as the only hook with veto
power and runs before the tool by construction, so a refusal is a refusal before the side effect. No
new gate and no framework wiring: nothing is enforced unless a consumer attaches the handler, and an
agent that does not is unaffected.

`classify` returns `{ governed: true, query }` **or** `{ governed: false }` — a tagged union whose
BOTH arms carry the discriminant. A bare `undefined` would say "this tool needs no permission" and
"I forgot this tool" in the same word, and on a security gate the second must not silently pass.

The discriminant is on both arms because the first shape — discriminated by whether a `governed` KEY
was present — **failed open**: a consumer writing a policy record `{ governed: true, scope }` and
spreading it into the query got the tool waved through, and so did `governed: undefined`. TypeScript
does not stop that; excess properties pass freely through a variable or a spread. Fail-closed is now
measured across `true` / `undefined` / `false` / `null`, and only `false` passes.

Named `grantGate`, not `permissionGate`, because `@theokit/sdk` already exports `PermissionGate`,
`PermissionGateContext`, `PermissionGateDecision`, `PermissionEngine` and `PermissionPlugin`. The
rename also says something true: this gates on a standing grant the operator made, and the SDK's
permission engine is a separate system — neither satisfies the other.

A classifier that throws DENIES, naming the throw, rather than ending the turn. A corrupt store
denies and carries its read error into the veto message, because an operator staring at an
unexpected prompt needs to tell "you have no grant" from "your grants stopped applying".

**Composing with a `pre_tool_call` you already have**: the field is singular, so assigning the gate
over an existing handler loses one of the two silently. Compose explicitly —
`async (ctx) => (await gate(ctx)) ?? (await mine(ctx))`; first veto wins.

`PermissionStore`'s docblock now states that the class enforces nothing on its own, and records the
precedence between the four surfaces that can refuse a tool.
