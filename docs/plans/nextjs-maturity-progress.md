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

## Phase 4 — Code-splitting back (EC-3 safeguard) ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T4.1 SSR-aware preload with matchRoutes safeguard | **DONE** | `generate.ts` emits `React.lazy()` for pages and a parallel `__theoPreloadMap` keyed by absolute route path. Layouts/error/loading/not-found stay static (always-needed). `entry.ts` (SSR mode) imports `matchRoutes`, awaits matched-route preloads with a 1500ms timeout, THEN calls `hydrateRoot`. EC-3 safeguards in place: client-side re-match (no SSR hint trust) and timeout fallback. **Bundle measurement** (default template prod build): initial JS gzipped **193.90 KB** (target ≤350 KB) + lazy page chunk **6.77 KB gzipped** separated. 14 unit tests + Playwright `template-default.spec.ts` validates hydration still works end-to-end (7/7 PASS). Regression-5 + regression-6 tests rewritten to lock the new invariant ("layouts static, pages lazy") so future PRs can't accidentally lazy() the layout and re-introduce the original hydration bug. |

## Phase 5 — CSRF warn-first (EC-1) ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T5.1 CSRF default-warn rollout | **DONE** | `enforceCsrf(req, mode, logger?)` + `CsrfMode` union in `csrf.ts`; wired into `execute.ts` for POST/PUT/PATCH/DELETE; `defineRoute({ csrf: false })` opt-out; `securitySchema` in config; `X-Theo-Action: 1` auto-attached in `theoFetch`. 10 unit + 8 integration tests + dogfood check #42 + live smoke (curl POST without header → warn line in stderr + 200; with header → silent 200). EC-1 closed. |

## Phase 6 — Security headers (EC-2) ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T6.1 Headers + CSP report-only | **DONE** | `packages/theo/src/server/security-headers.ts` exports pure `buildSecurityHeaders(config, env)` + `applySecurityHeaders(res, ...)`. `securityHeadersSchema` added to config (`csp` / `cspMode` / `hsts` / `frameOptions` / `contentTypeOptions` / `referrerPolicy`). Wired into `api-middleware.ts` BEFORE handler invocation so route handlers can still override via `res.setHeader`. EC-2: default `cspMode = 'report-only'` so existing apps with inline scripts don't break — 0.3.0 will flip to `enforce`. HSTS prod-only. Live curl confirmed all 4 default headers + report-only CSP on `/api/chat`. 15 unit tests cover defaults, override semantics, env gating, opt-out paths. Dogfood check #45 wired. |

## Phase 7 — Observability ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T7.1 TraceId end-to-end | **DONE** | `packages/theo/src/server/trace-context.ts` exports `parseTraceparent` + `extractTraceId` with precedence: W3C `traceparent` → `x-request-id` → generated UUID. Wired into `api-middleware.ts` (replaces ad-hoc `randomUUID`). Every response carries BOTH `x-trace-id` (canonical) and `x-request-id` (legacy alias). Backward compat preserved — existing `sendError`/`logRequest` continue to receive the same value under the `requestId` field name. 12 unit tests cover W3C parsing edge cases (zero trace-id, wrong version byte, malformed), header precedence, array headers, uniqueness. Live smoke confirmed: generated UUID round-trips, traceparent extracts 32-hex, x-request-id falls through. Playwright spec test `Phase 7 — every response carries an x-trace-id` validates two paths end-to-end. Dogfood check #46 wired. |

## Phase 8 — Argon2id (EC-4)

| Task | Status | Notes |
|---|---|---|
| T8.1 hash-wasm Argon2 + PBKDF2 legacy | PENDING | |

## Phase 9 — index.html audit ✅ COMPLETE

| Task | Status | Notes |
|---|---|---|
| T9.1 Fix 4 missing scripts + validator | **DONE** | 4 files patched (saas, theoui-autoinject, ssr-streaming, adapter-targets/_base); validator `tests/unit/template-html-validator.test.ts` (17 tests, all 20 tracked index.html files validated). Auto-inject (T2.1) is the runtime safety net; this is the source-of-truth tripwire. |

## Phase 10 — Playwright e2e (T10.1 ✅)

| Task | Status | Notes |
|---|---|---|
| T10.1 Templates browser test | **DONE (default)** | `fixtures/template-default/` wired into pnpm workspace + playwright.config; `tests/e2e/template-default.spec.ts` 7 tests covering app shell + black-page regression + chat composer + SSE order + CommandPalette via button + Ctrl+K shortcut + zero console errors. Full Playwright suite 20/20 PASS. Other templates (dashboard / api-only / postgres / saas) deferred — same fixture pattern can be reused. |
| T10.2 agent-saas full-flow browser test | PENDING | Postgres required — defer to Phase 11 |

## Phase 11 — Dogfood QA final

| Task | Status | Notes |
|---|---|---|
| Final dogfood + Playwright | PENDING | |

## Promise

`Phases 1-11 DONE, theokit@0.2.0 ready to publish` — FALSE (0/16 tasks).
