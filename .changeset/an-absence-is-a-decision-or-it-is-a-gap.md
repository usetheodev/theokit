---
"@theokit/agents": patch
---

Four `.claude` mechanisms are now declared out of scope, with the reason and the owner.

An absence that reads as an oversight gets re-investigated at full cost by the next person. The
`.claude` sweep produced a table with absences in it, and shipping that without separating "we
decided not to" from "we have not got to it" reproduces the defect the table exists to prevent.

Measured 2026-09-12: `keybindings`, `themes/` and `.claude.json` each return **0 files** across every
package source tree, against a control of 31 for `skills`.

| Surface | Verdict |
|---|---|
| `keybindings.json` | out of scope — `@theokit/tui` |
| `themes/*.json` | out of scope — `@theokit/tui` |
| `~/.claude.json` — OAuth state, UI toggles | out of scope — a CLI's own state |
| `~/.claude.json` — personal-scope MCP servers | **not read yet**, and in scope |

**A framework has no keyboard and no colour.** It produces text and tool calls; the process that
renders them owns which key does what and which escape codes it emits. Reading those here would let
this package hold configuration it cannot act on, which is the accepted-and-ignored failure the whole
table exists to prevent.

**`~/.claude.json` is two things under one name, and the split is the point.** One verdict over the
whole file would be wrong about one half whichever way it went: the OAuth state is a specific
program's own session, and a library reading another program's login state reaches into something it
neither owns nor can refresh — while an MCP server the operator registered for themselves is a
framework concern, and this package already reads project-scope servers from `.mcp.json`. That half
is **not refused; it is not done**, and the two stay distinguishable because the reader deciding
whether to file a bug needs to know which one they are looking at.

Declared in `README.md` and not only in the project's rules directory, because that directory is
gitignored — a decision recorded only there is a decision made for one checkout.

Separately, `SettingSourcesSelection.user`'s docblock stops describing a capability the runtime does
not have: nothing reads the operator's root because of that flag (`includesSetting` is called with
exactly `"project"` and `"plugins"` at `@theokit/sdk@5.5.0`). What the SDK *does* read from
`~/.theokit/` — model-provider plugins, the provider trust file, transcripts, the HTTP cache — it
reads unconditionally, governed by nothing. The flag is still accepted rather than refused: the
measured consumer passes it on every run, including the untrusted-directory path where it is the only
grant, so refusing would turn a graceful degradation into a throw for the case it exists to survive.
