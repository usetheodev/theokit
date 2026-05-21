# Framework Maturity Hardening — Progress

Tracking implementation of `docs/plans/framework-maturity-hardening-plan.md`
(Ralph loop iteration).

## Status legend
- `[x]` — DONE + tests green
- `[~]` — IN PROGRESS
- `[ ]` — TODO
- `[BLOCKED]` — needs secret/external service this session can't access

---

## Phase 0 — useAgentStream X-Theo-Action

- [x] **T0.1** — `consumeAgentStream` attaches `X-Theo-Action: '1'`
  - Verified at `packages/theo/src/client/agent-stream-core.ts:75`
  - 3 unit tests at `tests/unit/agent-stream-core.test.ts:196,216,235`
  - Playwright lock at `tests/e2e/template-default.spec.ts:113`
  - **Status: pre-existing — Phase 0 ALREADY DONE before plan started.**

## Phase 1 — Static upgrade-readiness analyzer

- [ ] **T1.1** — `theokit check` CLI + 3 rules (csrf-fetcher, csp-inline, form-csrf)
- [ ] **T1.2** — `--fix` mode for csrf-fetcher

## Phase 2 — Structured CSRF telemetry

- [ ] **T2.1** — Pluggable sink (fire-and-forget) + Sentry/OTel adapters
- [ ] **T2.2** — `/__theo/csrf-readiness` endpoint + devtools tab

## Phase 3 — Migration guide 0.2 → 0.3

- [ ] **T3.1** — `docs/migration/0.2-to-0.3.md` + recipe auto-test

## Phase 4 — Vercel deploy validation

- [BLOCKED] **T4.1** — Real Vercel deploy requires `VERCEL_TOKEN` secret unavailable in this session. Will implement scripts + smoke harness; real deploy must run in CI.

## Phase 5 — Playwright for 4 remaining templates

- [ ] **T5.1** — `dashboard`, `api-only`, `postgres`, `saas` E2E

## Phase 6 — WebSocket E2E

- [ ] **T6.1** — Chromium WS upgrade + bidi + reconnect

## Phase 7 — Load testing SSR

- [ ] **T7.1** — autocannon harness + baseline + nightly CI

## Phase 8 — api-middleware coverage hardening

- [ ] **T8.1** — Lift to 80% lines / 75% branches

## Phase 9 — Release engineering

- [BLOCKED] **T9.1** — `pnpm publish` requires npm credentials unavailable in this session. Will implement coordinated-publish script; actual publish must run in CI/release pipeline.

## Phase 10 — Dogfood QA (MANDATORY)

- [ ] Run `/dogfood full` after all implementable phases complete.

---

## Verifiable completion criteria

A task counts as "verified done" only when:
1. Code is committed to disk
2. All RED tests in the task's TDD section pass `npx vitest run`
3. All BDD scenarios for the task are present and green
4. `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm format:check` clean

Tasks that depend on external services (VERCEL_TOKEN, NPM_TOKEN) are
implemented to the script/script-test level. Their `[BLOCKED]` status
documents what part is not verifiable in this session.
