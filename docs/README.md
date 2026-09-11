# docs

Program governance that must outlive a session and be readable by anyone who clones the repository.

| Path | Holds |
|---|---|
| `adr/` | Architecture decisions. Numbered, immutable once accepted; a reversal is a new ADR, never an edit. |
| `program/` | Cross-cutting rules and the artifacts the surface-parity program is measured against. |
| `surfaces/` | One measurement per framework surface, eighteen in all — what exists today, how strong it is, what is missing. Read one before planning work on that surface; several record that a capability does **not** exist, which is the answer a reader who never finds the file will assume the other way. |

## Why this directory exists

`.gitignore:84` ignores `.claude/` in full — deliberately, since that tree is agent tooling state. Governance written there is invisible to everyone who clones this repository, and to CI.

That was discovered the honest way: four governance artifacts were written under `.claude/` and, on inspection before the promotion PR, none of them were tracked. They live here now.

**This directory is canonical.** `.claude/rules/` may hold working copies because the local tooling reads rules from that path, but a copy is a copy: when the two disagree, this one is right. Keeping them in step is manual today, which is a known and registered risk rather than a solved problem.

## Related, at the repository root

- `ROADMAP.md` — the 16 surface milestones and their Definition of done
- `BACKLOG.md` — the maintenance registry (`B-NNN`)
- `CHANGELOG.md` — the public contract
