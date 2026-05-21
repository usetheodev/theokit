# Changelog

Workspace-level changes for the `theokit` monorepo. Per-package changes live in each package's `CHANGELOG.md` (`packages/theo/CHANGELOG.md`, `packages/create-theo/CHANGELOG.md`).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (Framework Maturity Hardening — close operational safety-net gaps, 2026-05-21)

Implements `docs/plans/framework-maturity-hardening-plan.md` against the
2026-05-21 honest maturity audit. Adds operational safety nets for the
0.3.0 strict cutover (structured telemetry + static analyzer + migration
guide), Playwright E2E across all 4 templates (2 unconditional + 2
env-gated), real-Chromium WebSocket E2E, load-test harness with baseline,
and CI workflows for deploy + atomic multi-package publish.

- **T1.1 EC-3 guard for `theokit check --upgrade-readiness 0.3`** —
  refuses to scan non-TheoKit projects (reads `package.json`, requires
  `theokit` in deps or devDeps). 4 new BDD scenarios. New status
  `'not-a-theokit-project'`.
- **T2.2 `/__theo/csrf-readiness` endpoint + bounded store** —
  `csrf-readiness-store.ts` (1000-entry LRU) + `csrf-readiness-endpoint.ts`
  (GET summary; POST `/reset` enforces CSRF + Origin per EC-15) +
  Vite middleware mount. 13 unit tests.
- **T3.1 Migration guide 0.2 → 0.3** — `docs/migration/0.2-to-0.3.md`
  with jq + Node-only recipes (EC-6 portable to Windows/Alpine) +
  auto-tested against JSONL fixture so the guide can't rot. 7 tests.
- **T4.1 Vercel adapter end-to-end validation** —
  `examples/deploy-vercel/` SSR-enabled minimal app +
  `scripts/deploy-smoke-vercel.sh` (5-min timeout per EC-7) +
  `.github/workflows/deploy-vercel-smoke.yml` (path-gated CI).
  Local smoke PASS recorded in `deploy-evidence.jsonl`. 9 tests.
- **T5.1 Playwright E2E for 4 templates** — `dashboard` (5 scenarios),
  `api-only` (6 scenarios incl. CRUD + validation), `postgres`
  (4 env-gated scenarios), `saas` (4 env-gated scenarios). Postgres +
  saas use `test.skip()` when `DATABASE_URL` is absent.
- **T6.1 WebSocket E2E** — `tests/e2e/websocket-echo.spec.ts` validates
  real Chromium WS upgrade + echo + reconnect against
  `fixtures/websocket-basic/`. 4/4 scenarios PASS in 13s.
- **T7.1 Load-test harness** — `scripts/load-test-streaming.mjs`
  (autocannon) + RELATIVE thresholds (EC-11). First baseline:
  50 conn × 5s → p99=39ms, RPS=2839, 0 errors. 8 tests.
- **T8.1 api-middleware integration tests** —
  `tests/integration/api-middleware-coverage.test.ts` covers
  uncovered branches (rate-limit 429, batch endpoint, suggestion,
  pass-through). Minimal `ViteLike` mock (only `ssrLoadModule`).
- **T9.1 Atomic multi-package publish** —
  `scripts/publish-coordinated.sh` (dry-run all → publish all →
  rollback on partial failure per EC-12). 7 tests +
  `.github/workflows/release-coordinated.yml` (manual dispatch).
- **Dogfood report** — `docs/audit/dogfood-2026-05-21.md` documents
  health 78/100 across critical phases (above 70 ship threshold).

### Changed (Framework Maturity Hardening, 2026-05-21)

- **CSRF telemetry plan T2.1 documented as DONE via existing infra** —
  the `AuditLogger` interface + `safeAudit` fire-and-forget wrapper
  (from 2026-05-19 security release) already satisfy EC-4 + EC-5.
- **`fixtures/websocket-basic/`** — added `index.html` + `tsconfig.json`
  so the dev server can serve the SSR page (was previously a
  compile-only fixture).
- **Pre-commit secret scanner allowlist** — extended to include
  `tests/e2e/template-*.spec.ts` (env-gated specs document demo creds
  + connection strings as part of the migration recipe).

### Documentation

- `docs/plans/framework-maturity-hardening-plan.md` — 14-task plan
- `docs/plans/framework-maturity-hardening-progress.md` — live tracker
- `docs/reviews/edge-case/framework-maturity-hardening-2026-05-21.md` — 24 edge cases (12 MUST FIX incorporated)
- `docs/audit/dogfood-2026-05-21.md` — dogfood report

### Out of scope / blocked

- **T1.2 (`--fix` mode for `theokit check`)** — deferred per existing
  ADR D1 in `upgrade-readiness.ts:12` ("NEVER writes user files —
  lint-only").
- **T4.1 live Vercel deploy** — workflow committed; unlocks when
  `VERCEL_TOKEN` CI secret is configured.
- **T9.1 live npm publish** — workflow committed; unlocks when
  `NPM_TOKEN` CI secret is configured.
- **T5.1 postgres + saas execution** — fixtures + specs are env-gated;
  unlock when CI adds a Postgres service container + `DATABASE_URL` +
  `THEO_SESSION_SECRET`.

### Validation (2026-05-21 snapshot)

- typecheck (`tsc --noEmit`) ........... PASS
- lint (`eslint --max-warnings=0`) ..... PASS — 0 errors, 0 warnings
- format (`prettier --check`) .......... PASS
- tests ................................ 1774 / 1774
- Playwright ........................... 49 PASS + 8 skipped (env-gated)
- publint .............................. All good (both packages)
- audit (`--prod --audit-level=high`) .. 0 vulnerabilities
- licenses ............................. 214 packages, all permissive
- knip ................................. 0 unused
- Dogfood .............................. 78/100 (above 70 ship threshold)

### Added (Security hardening — close 9 enterprise gaps, 2026-05-19)

This release closes the nine identified gaps that separated TheoKit from "production-OK for indie/startup" to "enterprise-ready / SOC2-pending". All ten of the original-audit gaps (9 explicit + 1 adjacent OWASP A07 session fixation) are now covered. Zero new npm dependencies — everything composes from Web Crypto + native fetch + the existing hash-wasm path.

- **T1.1 — `Permissions-Policy` header default-deny**: `geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=()`. EC-3 mitigation — Zod schema rejects CR/LF in every header-bound string (CWE-113 HTTP Response Splitting). 6 unit tests including the injection regression.
- **T1.2 — CORS middleware** (`packages/theo/src/server/cors.ts`). `corsSchema` accepts `origins` as `'*' | string | RegExp | array | callback`; `credentials`, `maxAge`, `allowedHeaders`, `exposedHeaders` all configurable. Runs FIRST in the request pipeline (D10): preflight → rate limit → CSRF → security headers → handler. EC-8: callback variants that throw fail-closed (deny). 18 unit tests covering exact, regex, callback, wildcard, and `'*'+credentials` rejection at parse.
- **T2.1 — `RateLimitStore` interface + `InMemoryStore` adapter** (`packages/theo/src/server/rate-limit-store.ts`). Pluggable backend per ADR D1 — single-instance apps see zero behavior change; multi-instance deployments install a Redis adapter without bloating the core. 8 contract tests; 9 existing rate-limit integration tests still green.
- **T2.2 — Per-route + per-user rate limit** (`packages/theo/src/server/rate-limit-per-route.ts`). `createRouteRateLimiter({ default, routes, keyBy })`: path map with longest-prefix matching, `keyBy: 'ip' | 'session' | 'user' | callback`. EC-5 trailing-slash normalization. EC-6 session-cookie name reads from config (not hardcoded). Session cookies are SHA-256 hashed before keying — raw token never leaks. 15 unit tests + legacy flat config backwards-compat preserved.
- **T3.1 — Session secret rotation** — `createSessionManager({ secret: string | string[] })`. Index 0 = newest. Decrypt walks the array. EC-1: array length capped at 5 — **enforced via throw at construction** (no silent truncation). 7 unit tests including the cap. `assertProductionSecret` accepts arrays too.
- **T3.2 — Transparent re-encrypt + `rotateIfNeeded` helper** — when decrypt succeeds at index > 0, the session is re-issued with `secrets[0]`. EC-4 timing safety: re-encrypt must fire BEFORE `renderToPipeableStream`/`res.writeHead` (Set-Cookie locks once headers commit) — the `rotateIfNeeded` helper lives in `createContext`, satisfying that constraint for the framework's streaming SSR default. 5 unit tests + 5 integration tests including the EC-4 streaming-headers regression.
- **T3.3 — `SessionManager.rotateSession(req, res)`** — OWASP A07:2021 session-fixation mitigation. Call after successful login / OAuth callback / 2FA upgrade. Preserves session data, fresh IV + refreshed expiry. 4 unit tests.
- **T4.1 — `AuditLogger` interface + `JsonStdoutSink` default** (`packages/theo/src/server/audit-log.ts`). Per ADR D4: zero new framework deps. Default writes JSON-line audit events to stdout (captured by every deploy target). User adapters plug in via `config.audit.logger`. EC: circular-ref + BigInt safe via fallback line. `safeAudit(logger, event)` wrapper isolates logger throws from the request lifecycle. 7 unit tests.
- **T4.2 — Wire framework events to audit logger**. `csrf.warn`, `rate-limit.exceeded`, `session.rotated`, `csp.violation` all flow through `safeAudit`. Logger throws NEVER propagate. 5 integration tests including sync + async throw isolation.
- **T5.1 — `/__theo/csp-report` endpoint built-in** (`packages/theo/src/server/csp-report.ts`). Auto-registered before user routes. Accepts both `application/csp-report` (legacy) and `application/reports+json` (Reporting API). Default CSP now includes `report-uri /__theo/csp-report`. EC-2 null guards: browser POSTs of `{"csp-report": null}`, `{}`, or reports+json entries lacking `body` short-circuit to 204 (no null deref). Forwards to audit + devtools dispatcher + optional user hook. 13 unit + 3 integration tests.
- **T6.1 — `throttleLoginAttempts`** (`packages/theo/src/server/auth-throttle.ts`). `checkThrottle` / `recordAttempt` over any `RateLimitStore`. Successful login resets the counter; max failures locks for `lockoutMs`. 8 unit tests including concurrent-overshoot safety.
- **T6.2 — TOTP RFC 6238 primitive** (`packages/theo/src/server/auth-totp.ts`). `generateTotp` / `verifyTotp` / `generateTotpSecret` / `totpUri`. RFC 6238 Appendix B vectors pass: T=59 → 94287082, T=1111111109 → 07081804, T=1111111111 → 14050471, T=1234567890 → 89005924. Constant-time comparison. 12 unit tests.
- **T6.3 — Backup codes primitive** (`packages/theo/src/server/auth-backup-codes.ts`). `generateBackupCodes({ count, length, separator, alphabet })` returns plaintext (display once) + SHA-256 hashes (store). Default alphabet excludes ambiguous chars (I/L/O/0/1). Constant-time `verifyBackupCode` returns `matchedHash` so caller deletes the used code (replay protection). 9 unit tests.
- **T7.1 — ADR-AUTH-DELEGATION** locked in `CLAUDE.md`. Cites the 793-line prior-art audit at `.claude/knowledge-base/reference/oauth-oidc-delegation.md`. Three re-evaluation triggers required to reopen.
- **T7.2 — `docs/concepts/auth-providers.md`** — recommendation page with Auth.js / Better Auth / DIY GitHub worked examples + a list of every TheoKit primitive shipped for auth. README links to it. 4 unit tests.
- **T7.3 — `oauth-pkce.ts` (RFC 7636)**. `generatePkceChallenge()` returns `{codeVerifier, codeChallenge, codeChallengeMethod: 'S256'}`. RFC 7636 Appendix B vector passes. 6 unit tests.
- **T7.4 — `oauth-state.ts` + `oidc-discovery.ts`**. `generateOAuthState` / `verifyOAuthState` (constant-time, empty inputs always false). `discoverOidcProvider` caches in module scope; failures NOT cached (subsequent calls retry). EC-7: HTTPS enforced for non-loopback issuers (RFC 8414 §3). 11 unit tests including the HTTPS guard.
- **T7.5 — Auth-provider fixtures**: `fixtures/auth-providers-diy-github/` (PKCE + state + rotateSession round-trip in ~50 LOC of route handlers); `fixtures/auth-providers-with-authjs/` (Auth.js bridge pattern + `syncAuthjsUser` action). 5 integration tests asserting fixture shape + PKCE/state round-trip without GitHub secrets.

#### Public exports added to `theokit/server`

`createCorsHandler`, `matchesOrigin`, `InMemoryStore`, `createRouteRateLimiter`, `matchRoutePattern`, `deriveKey`, `JsonStdoutSink`, `createNoOpLogger`, `safeAudit`, `handleCspReport`, `normalizeLegacy`, `normalizeNew`, `CSP_REPORT_PATH`, `checkThrottle`, `recordAttempt`, `generateTotp`, `verifyTotp`, `generateTotpSecret`, `totpUri`, `generateBackupCodes`, `verifyBackupCode`, `generatePkceChallenge`, `pkceChallengeFromVerifier`, `generateOAuthState`, `verifyOAuthState`, `discoverOidcProvider`, `clearOidcCache`, `rotateIfNeeded`. Plus types: `CorsConfig`, `CorsOrigin`, `CorsHandler`, `RateLimitStore`, `RateLimitState`, `RouteRateLimitConfig`, `KeyByMode`, `AuditLogger`, `AuditEvent`, `CspViolation`, `CspReportHandlerOptions`, `ThrottleOptions`, `ThrottleState`, `TotpOptions`, `VerifyTotpOptions`, `TotpAlgorithm`, `TotpUriOptions`, `BackupCode`, `BackupCodeOptions`, `PkceChallenge`, `OidcMetadata`, `SessionMeta`.

#### Schema additions

`config.security.cors` (CORS), `config.security.headers.permissionsPolicy` (Permissions-Policy), `config.audit.logger` (audit sink). New `corsSchema` exported.

#### Default CSP

Now includes `report-uri /__theo/csp-report` so `cspMode: 'report-only'` is useful out of the box.

#### Test surface

+106 new tests across unit + integration. Full sweep: **197 test files / 1601 tests pass / zero TypeScript errors / zero unhandled errors.**

### ⚠️ BREAKING — 0.3.0 cutover (T6.1, 2026-05-19)
Two framework defaults flip in 0.3.0. Both were emitting warnings since 0.2.0; if your app has been ignoring those warnings, it will start failing in production after this release.

- **CSRF default flips from `'warn'` to `'strict'`.** Every state-mutating HTTP method (POST, PUT, PATCH, DELETE) without `X-Theo-Action: '1'` now returns 403 with code `CSRF_INVALID`. `theoFetch` attaches the header automatically; apps using raw `fetch` must add the header explicitly OR opt the route out with `defineRoute({ csrf: false })` OR pin the global back to `'warn'` via `theo.config.ts`. Use `npx theokit check --upgrade-readiness 0.3` to enumerate every violation in your code.
- **CSP default flips from `'report-only'` to `'enforce'`, AND `'unsafe-inline'` is removed from `script-src`.** Inline `<script>` blocks without a per-request nonce are now blocked by the browser. The framework's own SSR hydration script is auto-nonce'd; user-authored inline scripts (gtag, intercom, sentry) must be migrated to external `<script src="...">` files OR threaded through `ctx.nonce`. `'unsafe-inline'` is retained for `style-src` (Tailwind animations) — only scripts are affected.
- **Migration guide** at [docs/migrating/0.2-to-0.3.md](docs/migrating/0.2-to-0.3.md) walks through audit, refactor, escape hatches, per-route gating (`disallowedRoutes`), and rollback.
- **Escape hatches** ship intact for staged rollouts: `config.security.csrf: 'warn'`, `config.security.headers.cspMode: 'report-only'`, `config.security.disallowed: { routes: [...], behavior: 'raise' }`.

### Added (0.3.0 cutover — Phases 1–5, 2026-05-19)
- **T1.1 — `useAgentStream` attaches `X-Theo-Action: '1'`** on every non-GET so the default chat demo passes strict CSRF without a per-route opt-out. Locked via Playwright assertion in `tests/e2e/template-default.spec.ts`.
- **T2.1 — `warnOnce(key, payload)` helper** in `packages/theo/src/server/logger.ts`. Per-key dedup (key = `${event}:${method}:${path}`) so a request loop with 1000 POSTs to the same endpoint emits ONE structured warn line instead of 1000. EC-2: fallback when payload contains circular references.
- **T2.2 — Stable `code` + `docsUrl` fields in every `csrf.warn` payload** (`CSRF_STRICT_CUTOVER` + `https://theokit.dev/upgrade/csrf-strict-cutover`). Apps grep their logs for one stable identifier and click through to the migration guide.
- **T2.3 — `theokit check --upgrade-readiness 0.3` command.** LINT-only scanner that walks `app/`, `server/`, `public/` and reports anticipated 0.3.0 violations with `file:line` + suggested fix per occurrence. Three rule classes: `csrf-missing-header`, `inline-script`, `dangerously-set-inline-script`. Exit code 1 fails CI; `--allow-warnings` softens; `--json` emits machine output. EC-7 skips occurrences in comments + string literals. EC-8 empty project no-crash.
- **T3.1 — `docs/migrating/0.2-to-0.3.md` (432 lines)** + `docs/migrating/README.md` index. TL;DR / Prerequisites / Step-by-step / Escape hatches / Per-route gating / Gotchas / FAQ / Rollback / Known limitations sections, asserted by a markdown linter test.
- **T4.1 — Per-request CSP nonce machinery for SSR.** `generateNonce()` returns 16 bytes of base64-encoded cryptographic entropy via Web Crypto with `node:crypto` fallback. `buildSecurityHeaders(config, env, { nonce, prerender })` substitutes `'unsafe-inline'` in `script-src` with `'nonce-<token>'` and forces `Cache-Control: private, no-store` (EC-3 — CDN cannot cache HTML with a baked-in nonce). EC-4: `prerender: true` bypasses the nonce path. EC-12: `renderToPipeableStream({ nonce })` + `renderToReadableStream({ nonce })` so React's own emitted `<script>` tags carry the attribute.
- **T5.1 — `disallowedRoutes` + `disallowedBehavior` (Rails-pattern)** in `config.security.disallowed`. `routes: Array<string | RegExp>` matches via exact-string OR regex; `behavior: 'raise'` escalates matched warn-mode failures to 403 even when global `csrf` mode is `'warn'`. EC-5: `matchDisallowed` resets `lastIndex` before `RegExp.test`.

### Validated (nextjs-maturity plan — Phase 11 final dogfood QA, 2026-05-19)
- **`docs/reviews/nextjs-maturity-phase11-final-dogfood-2026-05-19.md`** — full Phase 11 closure report. Verdict: **APPROVED.** Plan ready for the release engineer to bump theokit to `0.2.0`.
- Validation chain executed: tsc 0 errors · vitest sequential **1333/1333 PASS** · Playwright **21/21 PASS** · dogfood-smoke **47/47 PASS (Health 100%)** · prod build bundle **193.90 KB gzipped** (45% under the 350 KB target) · 10 consecutive prod SSR requests with **0 React pipe-twice errors** · combined Phase 5+6+7 live curl honoring `traceparent` → `x-trace-id: 32-hex` plus security headers plus CSRF warn line, all in one request.
- 12/16 plan tasks closed (75%). Two follow-ups remain non-blocking: T10.2 agent-saas full-flow Playwright needs a Postgres instance; specs for the four non-default templates share the fixture pattern and can be added at any time.
- All four edge cases from the review resolved (EC-1 CSRF warn-first, EC-2 CSP report-only, EC-3 matchRoutes safeguard + timeout, EC-4 hash-wasm).
- All 10 original-audit gaps closed (entry-client auto-inject, pipe-once, code-split, CSRF, security headers, traceId, Argon2id, 6 hydration regressions, real-browser tests on default, bundle budget).

### Changed (Argon2id password hashing — Phase 8 T8.1 / EC-4, 2026-05-18)
- **`examples/agent-saas` upgrades password hashing from PBKDF2 to Argon2id** via [hash-wasm](https://github.com/Daninet/hash-wasm). Pure WebAssembly — no native build step, works on Alpine and Vercel Edge (EC-4 amendment: chose hash-wasm over `@node-rs/argon2` precisely to avoid runtime portability issues). OWASP 2023 interactive parameters baked in: memory 19 MiB, iterations 2, parallelism 1.
- **Transparent migration** — `verifyPassword` routes by hash prefix. Legacy `pbkdf2$...` hashes still verify, and on success the function returns `{ ok: true, rehashAs: '<fresh argon2id$ hash>' }`. The login handler in `routes/login.ts` writes the new hash back to the user row, so each existing user upgrades on their next login without a downtime migration.
- **API shape change:** `verifyPassword(plain, stored)` now returns `{ ok: boolean, rehashAs?: string }` (was `boolean`). Callers update accordingly. The internal `_legacyHashForTests` is exposed for the regression test that proves the migration round-trip.
- 12 unit tests in `tests/unit/example-agent-saas-password.test.ts` covering argon2id round-trip, PBKDF2 legacy round-trip + rehash flag, malformed input safety, and uniqueness across hashes. Functional tests in `example-agent-saas-functional.test.ts` updated to the new return shape.
- Dogfood check #47 wired.

### Added (TraceId propagation — Phase 7 T7.1, 2026-05-18)
- **Every `/api/*` response now carries an `x-trace-id` header** in addition to the existing `x-request-id`. The traceId follows W3C-aware precedence: incoming `traceparent` (Trace Context spec) is parsed to extract the 32-hex trace-id; on miss, fall back to `x-request-id`; on miss, generate a fresh UUID. The same value flows into `sendError` and `logRequest`, so a single identifier correlates the client request, every server log line, and the response envelope.
- **`packages/theo/src/server/trace-context.ts`** — new module exports `extractTraceId(req)` + `parseTraceparent(value)` + constants (`TRACE_HEADER`, `TRACE_PARENT_HEADER`, `REQUEST_ID_HEADER`). Pure helpers — no side effects.
- W3C edge cases handled: wrong version byte (`99-…`) → null. All-zeros trace-id (spec reserved invalid) → null. Malformed strings → null. Multi-value `x-request-id` (proxy doubled the header) → takes first non-empty value. Empty strings → treated as absent.
- Backward compat: `requestId` field name preserved in log lines and error envelopes — same value, just available under two names while consumers migrate to `traceId`.
- 12 unit tests cover the parser + extractor + header precedence + uniqueness. Live curl confirms all three paths (generated, traceparent, x-request-id). Playwright spec adds a scenario asserting the response surfaces `x-trace-id` for both the generated and the traceparent-honored case.
- Dogfood check #46 wired.

### Added (Default security headers — Phase 6 T6.1 / EC-2, 2026-05-18)
- **Every `/api/*` response now carries OWASP-recommended security headers by default** — `Content-Security-Policy-Report-Only`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production (skipped in dev — no TLS on localhost).
- **CSP ships in `report-only` mode for 0.2.0** (EC-2 backward compat): existing apps with inline scripts or third-party CDN scripts keep working, but every violation lands in DevTools / CSP report collector so consumers can audit before the 0.3.0 cutover to `enforce`.
- **New config field `config.security.headers`** with full control: `csp` (string override or `false`), `cspMode` (`'enforce' | 'report-only' | 'off'`), `hsts` (string override or `false`), `frameOptions` (`'DENY' | 'SAMEORIGIN'`), `contentTypeOptions`, `referrerPolicy`. Handler-level `res.setHeader()` always wins (framework applies headers BEFORE the handler runs).
- **`packages/theo/src/server/security-headers.ts`** — new pure helpers `buildSecurityHeaders(config, env)` + `applySecurityHeaders(res, config, env)` + the exported `DEFAULT_CSP` policy string so docs and tests can reference it.
- 15 unit tests in `tests/unit/security-headers.test.ts` covering defaults, `cspMode` variants, env-gated HSTS, opt-out via `csp: false`, override precedence, and the `applySecurityHeaders` setHeader integration.
- Live verified: `curl -I /api/chat` against the dev server emits CSP report-only + Frame DENY + nosniff + Referrer-Policy. Dogfood check #45 wired.

### Added (Code-splitting back — Phase 4 T4.1, 2026-05-18)
- **Per-route lazy loading** with EC-3 safeguards. `generate.ts` emits `React.lazy(() => import(…))` for pages and a parallel `__theoPreloadMap` keyed by absolute route path. Layouts, errors, loading, and not-found components stay as static imports because they're always needed at boot — only pages get the split.
- **SSR-aware preload** in the entry-client: when `ssr: true`, the generated bootstrap imports `matchRoutes` from react-router, computes the matched routes against `window.location.pathname` (not a server-emitted hint — EC-3 safeguard against URL-drift races), and awaits the matched-route preload promises BEFORE calling `hydrateRoot`. By that point the `React.lazy` modules are cache-resolved, so no Suspense fallback fires during hydration → DOM matches SSR → onClick handlers survive.
- **Timeout fallback** — preload awaits with a 1500ms ceiling. On slow networks the framework proceeds to hydrate anyway; Suspense will then handle the lazy fallback as normal. Better to lose hydration on one slow request than hang every connection on a logic bug.
- **Bundle measurement** (default template, production build): initial JS **193.90 KB gzipped** (well below the 350 KB target) + a lazy page chunk **6.77 KB gzipped** separated. Code-splitting actually splits.
- 14 unit tests in `tests/unit/code-split-aware-hydrate.test.ts` covering manifest shape (lazy pages, static layouts, preload map keys), entry-client wiring (matchRoutes import, Promise.all order, 1500ms timeout, CSR mode emits no preload), and backward compatibility (Suspense still imported, Outlet wrap intact).
- Pre-existing Phase 1 regression tests (T1.5 `regression-5-hydration-data-wired.test.ts` and T1.6 `regression-6-route-manifest-static-imports.test.ts`) rewritten to lock the new invariant ("layouts static, pages lazy") instead of the old one ("nothing is lazy"). Any future PR that lazies the layout — which would re-introduce the hydration bug — now fails loudly.
- Playwright `template-default.spec.ts` updated: page-mounted waits replace synchronous DOM counts where page.tsx is now lazy. All 7 scenarios pass against the new code-split build.
- Dogfood check #44: validates `React.lazy` + `__theoPreloadMap` + `matchRoutes` + 1500ms timeout are all present.

### Added (Playwright browser tests for default template — Phase 10 T10.1, 2026-05-18)
- **`fixtures/template-default/`** — full mirror of the default scaffold template, added to `pnpm-workspace.yaml` so it installs against `theokit` via workspace link. Lives under fixtures because it's not a customer-facing example, it's a test surface.
- **`tests/e2e/template-default.spec.ts`** — 7 Playwright scenarios in real Chromium covering the canonical first-run surface: app shell renders (TopNav + Sidebar + main), regression check that the layout receives `<Outlet />` (the black-page bug from this week), chat composer accepts input and round-trips through SSE, streaming response arrives as 3 events in DOM order, CommandPalette opens via leading-button + Escape closes, keyboard shortcut (Ctrl+K) toggles the palette, zero unhandled console errors during a full chat session.
- **Playwright config** — fifth project `template-default` on port 3460 with its own webServer. Full e2e suite now: **20/20 PASS**.
- The spec also serves as a visibility test for the Phase 5 CSRF warn — every chat POST emits `csrf.warn` to the Playwright web server stdout, confirming the warn-first default is active end-to-end.
- Dogfood check #43: validates the spec + fixture + playwright wiring are all committed. Health now **43/43**.

### Added (CSRF warn-first — Phase 5, 2026-05-18)
- **Default CSRF enforcement on `defineRoute` POST/PUT/PATCH/DELETE** with three-mode policy: `off` / `warn` / `strict`. Default for 0.2.0 is `warn` — existing apps keep working and emit a structured `{"event":"csrf.warn",…}` log line for every state-mutating request without an `X-Theo-Action: 1` header. 0.3.0 will flip the default to `strict`. The check piggybacks on the same custom-header + Origin defense already used by `defineAction`, so no token state machine is added.
- **`config.security.csrf`** (`off | warn | strict`) — new optional config field, default `warn`. Set explicitly to `strict` to opt into the future default early, or `off` to disable for apps using a non-cookie auth scheme.
- **`defineRoute({ csrf: false })`** — per-route opt-out for legitimate cross-origin POSTs (Stripe webhooks, GitHub webhooks, OAuth callbacks). Does not affect other routes' enforcement.
- **`theoFetch` auto-attaches `X-Theo-Action: 1`** on every non-GET/HEAD/OPTIONS request, so consumer code keeps working when servers flip to `strict`.
- 10 unit tests in `tests/unit/csrf-warn-first.test.ts` covering all three modes + the warn payload shape; 8 integration tests in `tests/integration/csrf-protection.test.ts` covering the end-to-end path through `executeRoute` including the `csrf: false` opt-out and cross-origin rejection.
- Dogfood check #42: validates the full wiring (`enforceCsrf` + schema + `theoFetch` header + opt-out type). Health now **42/42**.

### Added (Pitch + landing copy, 2026-05-15)
- **`PITCH.md`** at project root — landing-page copy for TheoKit, intended for `usetheo.dev` and other marketing surfaces. HERO preserved from the locked narrative in the root `CLAUDE.md` (*"Build the app your agent lives in. Routing, auth, real-time, deploy — wired."*). Opening uses Hermes / Cursor / TheoCode as **honest category framing** — they are agents that live in terminal, IDE, and CLI surfaces respectively; TheoKit is positioned as the framework for the web-app surface where the agent meets paying customers. Includes `## What you'd ship` (6 concrete surfaces), `## Why TheoKit` (comparison table against Mastra, Vercel AI SDK + Next.js, and roll-your-own), `## Feel it` snippet (combines `defineRoute`, `defineWebSocket`, `theoFetch`), and an explicit `## How it works` DEEP DIVE delimiter with full technical reference below.
- **`README.md` — `## What you'd ship` section** inserted between `## What You Get` and the `## How it works` DEEP DIVE delimiter. Six concrete surfaces a TheoKit developer would ship; complements the feature-shaped `What You Get` bullets.
- **`README.md` — `## Why TheoKit` section** inserted after `## What you'd ship`. Opens with the Hermes / Cursor / TheoCode framing, then the comparison table against Mastra, Vercel AI SDK + Next.js, and roll-your-own. Closes with the punch line *"Mastra builds the agent. TheoKit ships the product around it. You can use both."*
- **`README.md` — `## Status` section** added before `## License`, replacing the prior `## Roadmap` checklist. Honest claims: Production for everything shipped (framework, CLI, four templates, four deploy targets, stable public API), explicit "on the roadmap" labels for the agent layer (`agents/` directory), documentation site, OpenAPI generation, and additional templates (auth-basic, stripe-saas).

### Changed (README structure, 2026-05-15)
- `## Roadmap` section removed from `README.md` — its content was consolidated into the new `## Status` section with honest production-vs-roadmap framing per the root `CLAUDE.md` Cross-Project Rule 8 ("Honest claims only").
