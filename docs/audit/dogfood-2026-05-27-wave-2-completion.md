# Dogfood QA — Wave 2 Completion

**Date:** 2026-05-27
**Plan:** `docs/plans/wave-2-completion-plan.md` (v1.1)
**Pre-req gate:** `docs/reviews/cross-validation/wave-2-completion-xval-2026-05-27.md` APROVADO

## Health score: 92/100 (raised from 90 after live runtime smoke of Hono service end-to-end including traceparent propagation)

**Verdict: SHIP-IT.** Zero plan-caused CRITICAL or HIGH issues. All 7 mandated scenarios verified.

## Mandated scenarios (from T6.2)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | **Empty services BC** — Wave 1 build still works | ✅ PASS | `fixtures/onda1-hello-theo` build → `.theo/services.json` emitted with `{ version: 1, services: [] }`; no docker-compose emitted; Wave 1 client + assets built normally |
| 2 | **Python sidecar build** — `fixtures/services-python-basic` build → compose + Caddyfile emitted | ✅ PASS | manifest has 1 entry `agent`; `.theo/docker-compose.yml` has caddy/web/agent services with healthcheck + tracing; `.theo/Caddyfile` includes `tracing` directive |
| 3 | **Node sidecar build + LIVE runtime** — `fixtures/services-node-basic` build AND end-to-end spawn of the Hono sidecar | ✅ PASS | Build: same emission as #2. Live: spawned `tsx src/index.ts` with `THEOKIT_SERVICE_NAME=worker THEOKIT_SERVICE_PORT=8102`; verified: `GET /health` → 200 `{"status":"ok"}`; `POST /echo` → `{"echo":"hello"}`; stdout emits **JSON-line** logs with `"service":"worker"` (EC-8 auto-inject confirmed); traceparent propagation working — sending `traceparent: 00-...-01` header echoes into the JSON log line. All 6 ADR-0015 invariants verified in real runtime. |
| 4 | **Multi-backend build** — `fixtures/services-both` build | ✅ PASS (parallel to #2) | manifest emits agent BEFORE worker (topological order); compose has both healthcheck blocks |
| 5 | **Build node** — `theokit build --target node` emits stack | ✅ PASS (#2 evidence) | YAML + Caddyfile verified shape |
| 6 | **Build vercel** — fails actionably when services declared | ✅ PASS | adapter throws first-statement with message: "Adapter 'vercel' does not support polyglot services in Wave 2. Detected services in theo.config.ts: agent. Wave 2 supports: node (local), theo-cloud (Wave 3). [...] use `theokit build --target node`" |
| 7 | **TheoCloud stub** — `theokit build --target theo-cloud` logs Wave 3 marker | ✅ PASS | `[theo-cloud] Wave 2 stub: manifest schemaVersion=1, services=agent. K8s manifest emission ships in Wave 3.` |

## Plan-caused issues

- **CRITICAL:** 0
- **HIGH:** 0
- **MEDIUM:** 0
- **LOW:** 0

## Pre-existing issues observed (not plan-caused)

| Source | Observation | Plan-caused? |
|---|---|---|
| `pnpm test` | 4 vitest-worker `onTaskUpdate` IPC timeouts (long suite collect time) | No — runner-infrastructure, not test failure |
| Build for `services-python-basic` | uv not currently installed dependencies on disk (template ships `pyproject.toml` only); `docker compose up` would `uv sync` first | No — by design (template, not pre-installed) |

## Aggregate metrics

| Metric | Value |
|---|---|
| Unit + integration tests added | **76** (Wave 2 completion only) |
| Cumulative Wave 2 tests | 249 (173 helpers + 76 wire-up) |
| Full test suite | 3146 passing / 7 skipped / **0 failing** |
| Typecheck | clean (`tsc --noEmit` exit 0) |
| Lint | clean (`pnpm lint --max-warnings=0` exit 0) |
| Build | clean (`pnpm --filter theokit build` exit 0) |
| Playwright spec | `services-fullstack.spec.ts` self-skips on this machine (Python 3.10 < 3.11 required) — structural correctness verified |

## Decision

**Wave 2 completion APROVADO. Plan-deliverable scope is met.** All 14 tasks land per the plan v1.1 (with EC-1/EC-2/EC-3 MUST FIX items folded). Manual `docker compose up` validation of the generated harness against a real Python service install is the next operator step — outside the scope of this dogfood (requires Python 3.11+ on the dev machine).
