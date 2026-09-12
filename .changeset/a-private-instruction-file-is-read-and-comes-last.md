---
"@theokit/agents": minor
---

`THEO.local.md` and `AGENTS.local.md` are read, and composed after the files they refine.

The gitignored companion is where an operator keeps the standing corrections that matter most to
them — the ones too personal or too situational to commit. Nothing read it. Measured 2026-09-12: a
grep for the four `.local` spellings returned **0 files** across every package source tree, against
a control of 4 for `AGENTS.md`; the same query over the newly-resolved `@theokit/sdk@5.5.0`
returned **0** against a control of 23 for `CLAUDE.md`. The gap is in both layers, and raising the
SDK floor did not close it.

The failure is the silent kind: the file exists, it is named the documented way, nothing loads it,
and nothing complains. The agent behaves exactly as it would if the operator had written nothing,
which from the outside is indistinguishable from the instructions being wrong.

**Order shipped with membership, because membership alone would have shipped broken.**
`localeCompare` sorts `AGENTS.local.md` BEFORE `AGENTS.md` — `'l' < 'm'` — so adding the names to
`DEFAULT_FILE_NAMES` and nothing else would compose the operator's correction *before* the rule it
was written to correct. The file would load and lose: a subtler version of the original defect, and
just as quiet. `walkOrder` now emits three bands within a directory — public files, private files,
then subdirectories — each boundary carrying its reason. The `lexicographic` mode stays literally
alphabetical; it is the documented escape for a caller who wants the raw order.

**The two chains are independent.** A local file never replaces its public sibling; both load. The
trap avoided is one chain falling back to the other, where adding a `THEO.md` would silently orphan
an existing `AGENTS.local.md` — a file the operator wrote, disabled by a file they added for an
unrelated reason.

**`CLAUDE.local.md` is deliberately not included.** `CLAUDE.md` is not in the public half of this
list either, so a private companion to a file this seam does not read would pair with nothing. If
`CLAUDE.md` is ever added, its companion comes with it.

Also corrects two comments in the same file that `@theokit/sdk@^5.0.0` made false: one described a
cast removed when the type began resolving — the symlink-escape **control it guards is untouched**,
and the note stays so its removal does not read as the control being relaxed — and one duplicated an
ordering rationale that now lives with the ordering.
