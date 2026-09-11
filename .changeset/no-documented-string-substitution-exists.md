---
"@theokit/agents": patch
---

`$ARGUMENTS` works, and the substitutions this module does and does not perform are written down.

The template understood `$1`, `$2`, … and nothing else. A command that wanted everything the user
typed had to guess how many positions to concatenate, and stopped being correct at the first
invocation that passed one more. Measured: `$ARGUMENTS` returned 0 hits against a control of 31.

It expands to the **raw** string, not the split tokens rejoined. Splitting strips the quotes that
decided the grouping — `"two words" solo` is two arguments and five words — so rejoining would hand
the model `two words solo` and lose the only mark saying which three belonged together. A placeholder
whose whole job is "what the user typed" must not quietly retype it. The backslash escape works the
same way `$N`'s does.

**`templateHints` no longer asks for escaped placeholders.** `\$1` is prose about a placeholder, not
a request for one, and listing it asked the user to supply an argument the template would never
substitute. It also broke the sort outright: the match carries the backslash, so `slice(1)` produced
`"$1"`, `Number` produced `NaN`, and a comparator returning `NaN` leaves the order unspecified.
`$ARGUMENTS` sorts first — reading it after `$3` suggests it is a fourth position.

A table above the regex now states the supported set where an author will meet it, including two
deliberate absences: `${CLAUDE_SKILL_DIR}` belongs to a skill body rather than a command template
(and is substituted by `@theokit/sdk`'s `skill_read`, the only place that knows which directory the
skill came from), and `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` are **out of scope rather
than pending** — the plugin format is not implemented on either side, so substituting a root for a
plugin that cannot be loaded would have to invent the layout it points into.
