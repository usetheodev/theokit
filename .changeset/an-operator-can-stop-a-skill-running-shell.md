---
"@theokit/agents": minor
---

An operator can stop a skill body from running shell.

A skill is a markdown file a repository can carry, and `` !`command` `` in its body executes at
expansion time. Measured: `disableSkillShellExecution` returned 0 files here and 0 in the SDK dist,
against a control of 31 on the word `hooks`. The only way to decline was to stop reading skills at
all.

**The switch lives inside the expander, and that inverts an invariant on purpose.** The module's rule
was "never spawns anything and never opens a file — `shell` and `readFile` are injected, [because]
the trust decision is the caller's, not this module's." That *reason* is what the operator-tier
decision overturned (README § "Who decides policy"): the caller decides everything the operator has
not spoken about. Leaving the check to the caller would have made it a constructor argument again,
which is the shape the decision replaced. The module still spawns nothing — it refuses *before*
calling the injected `shell`, and that ordering is pinned by a mutation test.

**This package reads the policy file itself**, rather than importing `@theokit/sdk`'s reader. It
ships from a separate repository against a published SDK (`^4.52.1 || ^5.0.0`), so a symbol added to
that package's source is not importable here until it is released — and a control that only works
after somebody else cuts a release is a control nobody can reach. One FORMAT (Claude Code's path and
key names) is the contract; two readers that release independently is a consequence of the repository
boundary, stated rather than hidden.

**What this does not pretend:** `expandCommandTemplate` has zero production callers, measured across
`theokit`, `theokit-sdk`, `theokit-tui`, `theokit-studio` and `theokit-hub`. The hazard has no live
path today. Enforcing at a call site that does not exist would have been the unreachable-control
failure; enforcing here means the switch bites the moment a caller appears rather than being
remembered then.

A value the reader cannot understand — `"disableSkillShellExecution": "true"`, a string — is reported
and ignored, never coerced. Accepting it by truthiness would make `"false"` forbid shell too.
