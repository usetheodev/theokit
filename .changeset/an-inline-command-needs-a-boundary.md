---
'@theokit/agents': patch
---

An inline `` !`command` `` is now recognised only at a boundary: the start of a line, or after
whitespace. When `!` follows another character the placeholder stays literal and the command does
not run, which is what the contract specifies.

`REFERENCE_REGEX` applied its leading-boundary guard `(?<!\S)` to the `@file` branch only, so the
shell branch matched anywhere. Measured before the fix: `` inline !`echo hi` and KEY=!`echo boom` ``
produced `` inline <ran:echo hi> and KEY=<ran:echo boom> `` — both ran.

This was the one place this module did **more** than its contract allows. Every other divergence
found in the same survey is something that fails to happen; this was something that happened, from a
markdown file loaded out of a working directory.

The test keeps three positive cases beside the negative one — a change that stopped recognising
inline commands altogether would satisfy the negative and destroy the feature.
