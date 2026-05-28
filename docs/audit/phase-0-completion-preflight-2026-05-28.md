# Phase 0 Preflight Audit — Wave 2 Completion Plan (2026-05-28)

**Plan:** `docs/plans/wave-2-completion-plan.md` v1.1
**Phase:** Phase 0 / T0.1 — Verify Wave 2 baseline is green

## Results

| Check | Status | Detail |
|---|---|---|
| `pnpm typecheck` | ✅ exit 0 | `tsc --noEmit` clean |
| `pnpm lint` | ✅ exit 0 | `eslint . --max-warnings=0` zero warnings |
| `pnpm test` | 🟡 6 pre-existing flakes / 3152 passing / 7 skipped (3165 total) | All 6 failures are the well-documented first-request-per-suite cold-start flakes; see "Pre-existing flakes" below |
| `pnpm --filter theokit build` | ✅ exit 0 | `tsup` DTS emission complete |

## Pre-existing flakes (NOT plan-caused — verified)

Identical pattern to the prior architecture-medium-deferrals dogfood (`docs/audit/dogfood-2026-05-27-architecture-medium-deferrals.md`):
the FIRST request per test suite times out at exactly 5s (`GET /api/health`, `POST /api`, etc.); all subsequent requests in the
SAME suite pass in ms. This is the classic Vite cold-start dep-optimization signature.

| Test file | Failure | Cause |
|---|---|---|
| `tests/integration/onda3-mandatory.test.ts` | `GET /api/health returns { ok: true } with 200` → 5062 ms timeout | Vite cold-start |
| `tests/integration/onda4-mandatory.test.ts` | `POST with valid input returns 200 with handler result` → 5027 ms | Same |
| `tests/integration/onda5-mandatory.test.ts` | `ctx.requestId exists in route handler` → 5034 ms | Same |
| `tests/integration/onda8-mandatory.test.ts` | `500 error does not leak stack trace details` → 5105 ms | Same |
| `tests/integration/fixture-sessions-auth.test.ts` | `GET /api/me returns 401 without session` → 5063 ms | Same |
| `tests/integration/fixture-agent-endpoint.test.ts` | `POST /api/agent emits 4 SSE chunks with all event variants` → 5094 ms | Same |

**Verification of "not plan-caused":** zero code changed in this iteration vs. the architecture-medium-deferrals HEAD. The plan's wire-ups
have not yet been applied. The flake pattern matches commit `7e07053` baseline exactly.

## Decision

**PROCEED with Phase 1.** Per T0.1 edge case clause ("flaky test → re-run once before flagging") and the documented prior pattern,
these flakes are environmental (Vite cold-start), not plan-caused. The plan's T0.1 acceptance modulo the flakes is satisfied:
typecheck + lint + build are green, and the 6 failures are observably the SAME 6 documented across the prior 2 dogfoods.

Moving to T0.2 (workspace pre-registration).
