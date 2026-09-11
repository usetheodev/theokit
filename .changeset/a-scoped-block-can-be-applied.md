---
'@theokit/agents': minor
---

`blockAppliesTo(block, filePath)` is exported from `@theokit/agents/config`.

`InstructionBlock.scopes` carries the `paths:` frontmatter, and the package shipped no way to apply
it — no glob matcher existed anywhere in the tree. A consumer who wanted to honour a scope had to
invent the semantics, and two consumers would invent two.

The field's own docblock names the consequence of getting it wrong: "A consumer rendering the block
would then apply a rule written for one subtree EVERYWHERE — the one frontmatter failure with a
consequence, and a silent one."

Delegating the **decision** to the product is deliberate and unchanged: a consumer still chooses
whether to filter. What changes is that it now has the **means**.

`scopesUnreadable` answers `false` for every path. That is the fail-closed half the flag was invented
for — a `paths:` key that was declared and yielded nothing must not read as "no scope declared",
because those two are indistinguishable in `scopes` alone and only one of them is safe to publish
everywhere.

**Supported:** `**` (crosses separators), `*` (does not), `?` (one character) — the three the SDK's
own rule activation implements. **Not supported:** brace expansion `{a,b}` and character classes
`[abc]`, which match literally and therefore almost certainly not at all. That floor is deliberate:
three wildcards are a dozen lines, and a glob dependency would carry a transitive tree into a package
with three direct dependencies. Needing the fuller grammar is a decision to make out loud.
