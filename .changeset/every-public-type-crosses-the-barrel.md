---
"@theokit/agents": patch
---

Thirteen types named in exported signatures now cross a barrel, and the guard that finds them derives the requirement instead of listing it.

`bridge/index.ts` enumerates this shape four times by issue number — #663, #668, #675, #686 — and
B-004 was the fifth. Each was found by *installing* the published package, because the source is
correct every time: the type is exported from its own module and only the barrel omits it.

The guard that followed reads the emitted barrel, which was the right move, and it is a **hand-written
list** — so it catches the entries somebody remembered to add. B-004 was added to it *after* a review
found the miss, which is precisely what the list existed to prevent.

**This one derives it.** It parses every built `.d.ts`, collects the names each chunk imports and uses
in an exported signature, and flags any that no public barrel re-exports. Measured on the built
output: thirteen, including `BudgetTracker`, `InlineSkill`, `PluginsSettings`, `SkillsOptions`,
`ContextWindowOptions`, `Plugin`, `ProviderRoutingSettings`, `RetryOptions`,
`DiscoverSubagentsOptions`, and four reached through subpath entries.

Two things the first version of the guard got wrong are worth recording, because both produced a
green over nothing:

- **A rollup does not put `export` on its declarations.** It emits them bare and lists every public
  name in one `export { … }` clause at the end. A single forward pass keyed on the `export` modifier
  visited zero exported declarations and reported no problem — while `index.d.ts` imported
  `PluginsSettings` on line 1, used it in a signature on line 359, and did not carry it in the clause
  on line 1445. It takes two passes.
- **Reachable means every barrel a consumer can import from**, not just the root. A type exported from
  `auth.d.ts` is nameable through `@theokit/agents/auth`; the hashed internal chunks are not
  importable at all, so what they export is not reachable and what they import is still a finding.

The guard caught one of the changes made in this same release — `PermissionMode`, added to
`PermissionGate` hours earlier — which is the difference between a list and a derivation.
