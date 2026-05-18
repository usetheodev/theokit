# Next.js Maturity — Progress Tracker

Persistent state across iterations. Mark task DONE only when tests are green AND committed.

## Phase 1 — Regression tests ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T1.1 defineAgentEndpoint accepts IncomingMessage | **DONE** | 4 tests; fake IncomingMessage + close-event |
| T1.2 Vite plugin aliases cover all subpaths | **DONE** | 5 tests; order + existsSync |
| T1.3 theoSrcDir detection (refactor + test) | **DONE** | extracted `resolveTheoRootDir()`; 4 tests |
| T1.4 SSR/CSR React trees identical | **DONE** | 5 tests; extractWrapSequence helper |
| T1.5 Entry-client passes hydrationData | **DONE** | 4 tests; both ssr branches |
| T1.6 Route manifest static imports (no lazy) | **DONE** | 5 tests; pins static-import shape |

**Phase 1 totals:** 27 regression tests green. Suite: 1205/1205 (pre-existing isolation issue in theo-fetch.test.ts when other tests share fetch mock).

## Phase 2 — transformIndexHtml auto-inject ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T2.1 transformIndexHtml hook | **DONE** | 7 unit + 3 integration tests; `injectEntryClient()` helper + plugin hook `order: 'pre'`. Silent dead-HTML bug impossible now. |

## Phase 3 — Production SSR pipe bug ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T3.1 Single-pipe per request | **DONE** | Switched from `onAllReady` to `onShellReady` (Next.js pattern) + `piped` guard flag. Smoke real: 5 prod requests, 0 pipe errors. 5 regression tests + 1 existing test updated. |

## Phase 4 — Code-splitting back (EC-3 safeguard)

| Task | Status | Notes |
|---|---|---|
| T4.1 SSR-aware preload with matchRoutes safeguard | PENDING | |

## Phase 5 — CSRF warn-first (EC-1) ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T5.1 CSRF default-warn rollout | **DONE** | `enforceCsrf(req, mode, logger?)` + `CsrfMode` union in `csrf.ts`; wired into `execute.ts` for POST/PUT/PATCH/DELETE; `defineRoute({ csrf: false })` opt-out; `securitySchema` in config; `X-Theo-Action: 1` auto-attached in `theoFetch`. 10 unit + 8 integration tests + dogfood check #42 + live smoke (curl POST without header → warn line in stderr + 200; with header → silent 200). EC-1 closed. |

## Phase 6 — Security headers (EC-2)

| Task | Status | Notes |
|---|---|---|
| T6.1 Headers + CSP report-only | PENDING | |

## Phase 7 — Observability

| Task | Status | Notes |
|---|---|---|
| T7.1 TraceId end-to-end | PENDING | |

## Phase 8 — Argon2id (EC-4)

| Task | Status | Notes |
|---|---|---|
| T8.1 hash-wasm Argon2 + PBKDF2 legacy | PENDING | |

## Phase 9 — index.html audit ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T9.1 Fix 4 missing scripts + validator | **DONE** | 4 files patched (saas, theoui-autoinject, ssr-streaming, adapter-targets/_base); validator `tests/unit/template-html-validator.test.ts` (17 tests, all 20 tracked index.html files validated). Auto-inject (T2.1) is the runtime safety net; this is the source-of-truth tripwire. |

## Phase 10 — Playwright e2e

| Task | Status | Notes |
|---|---|---|
| T10.1 Templates browser test | PENDING | |
| T10.2 agent-saas full-flow browser test | PENDING | |

## Phase 11 — Dogfood QA final

| Task | Status | Notes |
|---|---|---|
| Final dogfood + Playwright | PENDING | |

## Promise

`Phases 1-11 DONE, theokit@0.2.0 ready to publish` — FALSE (0/16 tasks).
