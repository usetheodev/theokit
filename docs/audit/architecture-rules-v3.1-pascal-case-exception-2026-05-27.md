# Architecture Rules v3.1 — PascalCase exception (decision audit)

**Date:** 2026-05-27
**Plan:** `docs/plans/architecture-medium-deferrals-plan.md` v1.2 (T3.1 / P-3 / ADR D3)
**Source finding:** `/loop-architecture-review` 2026-05-27 — `naming_violations` MEDIUM (Tabs/ PascalCase)

## Context

The architecture review of 2026-05-27 emitted a MEDIUM-severity `naming_violations` row pointing at `packages/theo/src/devtools/components/Tabs/` containing 5 PascalCase `.tsx` files (`CsrfReadinessTab.tsx`, `ErrorsTab.tsx`, `RequestsTab.tsx`, `RoutesTab.tsx`, `SettingsTab.tsx`). The heuristic auditor expected uniform case-style across the directory level.

## Investigation

`.ls-lint.yml` ALREADY permits both `PascalCase | kebab-case` for `.tsx` files (line 18 at audit time). The lint passes; `pnpm check:naming` returns exit 0.

The "violation" is therefore a **false positive on the heuristic side** — the auditor's expectation of uniform case is too strict for React conventions:

1. React components are universally PascalCase by community convention (the file name mirrors the exported component identifier).
2. Component-family directories often follow the same case as the components (e.g., `Tabs/`, `ui/`, `dialogs/` — mixed, all valid React style).
3. The Theo devtools surface follows TanStack devtools and Next.js dev-toolbar patterns, both PascalCase-heavy for component files.

## Options considered

### Option A — Rename `Tabs/` → `tabs/` and `<Name>Tab.tsx` → `<name>-tab.tsx`

Pros: uniform kebab-case at every layer.
Cons: breaks React convention; obscures the component identity; 5 file moves + their import updates; every future audit reader has to learn that "this codebase renames React components"; risk of regression in fixtures referencing the components by path.

### Option B — Document the exception in `.claude/rules/architecture.md` v3.1 (CHOSEN)

Pros: zero code churn; codifies what `.ls-lint.yml` already permits; future audits can be silenced by reference to v3.1 § Naming convention exceptions; React convention preserved.
Cons: requires audit tooling to read the rules file (or accept it as out-of-band documentation).

### Option C — Tighten `.ls-lint.yml` to forbid PascalCase

Pros: enforces uniformity strictly.
Cons: would force Option A's churn; rejected for same reasons.

## Decision

**Option B.** Document the exception. No rename.

## Implementation summary

1. `.claude/rules/architecture.md` bumped to v3.1 with new section "Naming convention exceptions" at end of doc.
2. `.ls-lint.yml` got a top-of-file comment pointing at v3.1 spec.
3. This audit note records the decision rationale.
4. DB `naming_violations` row for `Tabs/` to be annotated `INTENTIONAL` via T4.3 SQL update.

## Consequences

- Future audits that flag PascalCase TSX as inconsistent get a documented response.
- No code change → zero regression risk.
- Reviewers of new PRs see the v3.1 section if they question PascalCase usage.

## Verification

- `pnpm check:naming` continues passing (no `.ls-lint.yml` rule change).
- `.claude/rules/architecture.md` v3.1 marker present (grep "Version 3.1" → match).
- This file (`docs/audit/architecture-rules-v3.1-pascal-case-exception-2026-05-27.md`) exists.
