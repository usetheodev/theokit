---
'@theokit/agents': patch
---

Document which `.claude/` surfaces this package reads, and which it refuses

The parity work landed across several releases and the README said nothing about any of it. A
consumer had to read the source to learn that `agent-memory/` has three roots, that an unrecognised
`memory:` scope is refused rather than defaulted, or that `workflows/*.js` is found and deliberately
not executed.

The table states each surface's state, and the `agent-memory/` section states the one thing a reader
must not get wrong: the three roots differ in who can see the notes, so `local` never falls through
to the committed root.
