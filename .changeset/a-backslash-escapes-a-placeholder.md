---
'@theokit/agents': patch
---

A backslash escapes a `$N` placeholder: `\$1` now renders as the literal `$1` with the backslash
dropped, instead of being substituted with the first argument.

Measured before the fix: `price \$1.00 here` with argument `alpha` produced `price \alpha.00 here`.
A template describing a price produced a template describing an argument, and the backslash the
author typed to prevent that survived into the output as stray punctuation.

**Two neighbouring behaviours are deliberately unchanged**, because a parity survey flagged all three
together and only one of them is a defect:

- `$1` is the FIRST argument here. That convention is stated in the module docblock, fixed by its
  existing tests, and depended on by its own `` !`git diff $1` `` example. Changing it would silently
  rebind every argument of every command already written — a compatibility decision, not a fix.
- An unmatched `$3` expands to empty rather than to the literal, which the call site documents:
  "Empty, never the literal. A leaked `$3` reads to the model as text the user wrote."

The escape was the one of the three with no decision behind it.
