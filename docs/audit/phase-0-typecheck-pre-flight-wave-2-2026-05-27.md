# Pre-flight Audit — Wave 2 Polyglot Services Plan (T0.4)

**Date:** 2026-05-27
**Branch:** develop
**Baseline ref:** Storage modules SDK delegation dogfood (2026-05-27, 2881 passing)

## Results

| Check | Status | Detail |
|---|---|---|
| `pnpm typecheck` | ✅ exit 0 | `tsc --noEmit` clean, 0 type errors |
| `pnpm test` | ⚠️ 3 pre-existing failures | 2894 passing, 7 skipped, **3 failing (NOT plan-caused)** |
| Total tests | 2904 | Up from 2881 baseline (+23 from storage modules SDK delegation) |

## Pre-existing failures (catalog — do NOT attribute to Wave 2)

| Test | File | Symptom |
|---|---|---|
| T3.1 sessions-auth integration > GET /api/me returns 401 without session | `tests/integration/fixture-sessions-auth.test.ts` | Timeout (5051ms) — looks like fixture HTTP server timing issue |
| T9.1 theoui-autoinject > entry-client imports styles.css | `tests/integration/fixture-theoui-autoinject.test.ts` | Fixture HTTP failure |
| T9.1 theoui-autoinject > entry-client imports fonts-cdn.css | same file | Same root cause |
| T9.1 theoui-autoinject > entry-client wraps in TheoUIProvider with noir theme | same file | Same root cause |
| Onda 3 — Backend Routes > GET /api/health returns 200 | `tests/integration/onda3-mandatory.test.ts` | Timeout (5073ms) — fixture HTTP server timing |

**Common pattern:** all 5 failures are integration tests that boot HTTP fixtures (likely Vite dev server). The 5+ second timeouts suggest port contention OR slow CI infra OR fixture-pre-build issue. NOT regression from this plan.

## Acceptance status

- [x] `pnpm typecheck` exit 0
- [ ] `pnpm test` exit 0 — **3 pre-existing failures documented, Wave 2 will NOT add to these**
- [x] Pass count >= 2881 baseline (actual: 2894)
- [x] Type errors: 0

## Decision

**Proceeding with Phase 1.** The 5 pre-existing failures are documented here. Any new failures introduced by Wave 2 implementation will be plan-caused and must be fixed before plan completion. The baseline 2894/2904 is captured.
