# Plan: TheoKit Security Hardening — close 9 gaps to enterprise-ready

> **Version 1.1** — Closes nine identified security gaps in TheoKit's baseline: rate limit goes from per-IP/in-memory to distributed/per-route/per-user; CORS becomes a first-class configurable; session secret gains a dual-key rotation window; audit log lands as a pluggable interface; login throttling, TOTP, and backup codes ship as RFC-level primitives; Permissions-Policy header default-denies sensitive APIs; CSP violations route to a built-in `/__theo/csp-report` endpoint; OAuth/OIDC is explicitly delegated to libraries with an ADR + docs page + 5 protocol-stable helpers (PKCE, state, OIDC discovery). Outcome: TheoKit moves from "Production-OK for indie/startup" to "Enterprise/SOC2-pending" — only secret rotation automation and audit log persistence remain as TheoCloud-side work after this.
>
> **v1.1 changelog (2026-05-19):** Incorporated 4 MUST FIX edge cases from `/edge-case-plan` review (`docs/reviews/edge-case/security-hardening-2026-05-19.md`):
> - **EC-1** (T3.1): Session secret array cap of 5 is now **enforced via throw at construction** (not just documented). +1 RED test.
> - **EC-2** (T5.1): CSP report handler **null-guards `csp-report` inner object and `reports+json` `body` field** to prevent crash on legitimate browser POSTs containing `{"csp-report": null}` / entries without `body`. +3 RED tests.
> - **EC-3** (T1.1): Permissions-Policy schema now **refuses CR/LF in header value** (CWE-113 HTTP Response Splitting mitigation). Same refinement applies to every other string-valued header config in the plan (CORS exposedHeaders/allowedHeaders, CSP report-uri). +1 RED test.
> - **EC-4** (T3.2): Session re-encrypt **wired in `api-middleware.ts` BEFORE the handler runs**, not in `execute.ts` post-handler — required for streaming SSR routes (the framework default) where Set-Cookie is locked once the shell flushes. +1 RED integration test.
>
> v1.1 also accepts 5 SHOULD TEST entries (EC-5..EC-9) and 4 DOCUMENT entries (EC-10..EC-13) — full review at the reviews artifact above.

## Context

What exists today (verified in code, 2026-05-19):

- **CSRF strict** (`packages/theo/src/server/csrf.ts:160-200`) — `X-Theo-Action: 1` header + Origin match. Default `strict` since 0.3.0.
- **CSP enforce + per-request nonce** (`security-headers.ts:1-194` + `nonce.ts`). `'unsafe-inline'` dropped from `script-src`, replaced by `'nonce-<token>'`.
- **Encrypted sessions** (`session.ts:1-106` + `crypto.ts:1-42`). AES-256-GCM via Web Crypto, IV per encrypt, HttpOnly/SameSite=Lax cookies, 7-day default.
- **Production secret guard** (`session.ts:79-106`) — refuses to boot in prod with `<32 chars` OR placeholder pattern. Fail-fast.
- **Rate limit** (`rate-limit.ts:1-68`) — sliding window, in-memory `Map<ip, {count, resetAt}>`. **Per-IP only. Global. In-memory.**
- **Body size limit** (`body-parser.ts:22-31`) — 10 MB file / 1 MB field / 10 files default.
- **Trace propagation** (`trace-context.ts`) — W3C Trace Context + `x-trace-id` header.
- **Default security headers** — HSTS (prod), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy.
- **No CORS** (zero code).
- **No Permissions-Policy** (zero code).
- **No audit log** (`csrf.warn` goes to `console.warn` via `warnOnce`; no persistence interface).
- **No CSP report endpoint** (`cspMode: 'report-only'` supported but no route to receive reports).
- **No OAuth/OIDC** (by design — delegated to libs, but not documented).
- **No 2FA primitives** (zero code).
- **No login throttling** (rate limit is global; no per-credential throttle).
- **No session rotation** (`SessionManager` lacks a `rotate()` method — OWASP A07:2021 gap).

Evidence motivating the work:

- This-conversation audit identified the 9 gaps explicitly with line-level code references.
- `.claude/knowledge-base/reference/oauth-oidc-delegation.md` (793 LOC, 2026-05-19) documents the OAuth/OIDC delegation pattern across 8 frameworks. Established conclusion: ship 5 RFC-stable protocol primitives (PKCE, state, OIDC discovery, TOTP, backup codes) + ADR + docs; do NOT ship provider implementations.
- `CLAUDE.md` 0.4.0 roadmap names "Production-ready for startups scaling to 10k MAU" as the bar. Without these 9 gaps closed, the claim is overstated.
- Adjacent: TheoCloud issue #60 (`SESSION_SECRET rotation`) is **blocked** on TheoKit's session manager not supporting dual-key window. This plan unblocks it.
- TheoCloud issues #58 and #59 (SSE + CSP nonce E2E) consume the framework's defense layer; if these gaps stay open, the layer below them is weaker than the test surface advertises.

Why this plan, why now:

- Three planned product surfaces (Theo PaaS Enterprise tier, TheoKit 0.4.0 "production-ready" claim, TheoCode customer day-trial) all require the gaps closed. Punting them post-0.4.0 means GA ships with a known-incomplete security posture, contradicting the marketing claim in `README.md:30` ("**Sessions that just work** — encrypted cookies, …").
- All 9 gaps share infrastructure (the same `RateLimitStore` interface backs distributed rate limit AND login throttling; the same `AuditLogger` interface backs CSP reports AND CSRF warns; the same `SessionManager.rotate()` backs both OAuth login flows AND password login flows). Bundling them = ~30% less work than 9 separate plans.

## Objective

**Done = TheoKit ships 6 new server modules + 3 modified server modules + 2 docs pages + 1 ADR + 14 new test files, closing all 9 identified security gaps; backwards-compatible at every change; bundle budget stays ≤ 350 KB gzipped for default template; dogfood QA passes with zero CRITICAL/HIGH issues.**

Specific, measurable goals:

1. `RateLimitStore` interface exists with default `InMemoryStore`; `rate-limit.ts` refactored to use it; per-route + per-user keying supported via `rateLimit: { default, routes, keyBy }` config.
2. `cors.ts` middleware exists; `config.security.cors` schema accepts `origins | methods | credentials | exposedHeaders | maxAge`; preflight (`OPTIONS`) handled before route matching.
3. `SessionManager` accepts `secret: string | string[]` (newest first); decrypt falls back through the array; legacy decrypts trigger transparent re-encrypt on next response.
4. `SessionManager.rotateSession(req, res)` method exists (EC-6 / OWASP A07:2021 mitigation).
5. `AuditLogger` interface exists with default `JsonStdoutSink`; framework wires `csrf.warn` and rate-limit hits to the logger.
6. `/__theo/csp-report` endpoint auto-registered; forwards violations to dev devtools dispatcher + audit log + optional user hook.
7. Default Permissions-Policy emitted: `geolocation=(), camera=(), microphone=(), payment=(), usb=()`; configurable via `config.security.headers.permissionsPolicy`.
8. `oauth-pkce.ts` (RFC 7636), `oauth-state.ts`, `oidc-discovery.ts` (OIDC Discovery 1.0) ship as standards-level helpers.
9. `auth-totp.ts` (RFC 6238) + `auth-backup-codes.ts` ship; RFC 6238 Appendix B test vectors pass.
10. `auth-throttle.ts` ships using `RateLimitStore`; lockout window supported.
11. `ADR-AUTH-DELEGATION` exists in CLAUDE.md "Architectural decisions on record"; `docs/concepts/auth-providers.md` lists Auth.js + Better Auth + DIY GitHub with worked examples.
12. `tests/fixtures/auth-providers/{with-authjs,diy-github}` exist, runnable.
13. Zero new npm deps added (everything uses Web Crypto + native fetch).
14. Bundle budget remains ≤ 350 KB gzipped for `template-default` (verified by `tests/unit/bundle-budget-script.test.ts`).
15. `tsc --noEmit` clean; 1569+ vitest pass; 34+ Playwright pass; `/dogfood full` green.

## ADRs

### D1 — `RateLimitStore` as a pluggable interface, NOT bundled Redis
- **Decision:** Provide `RateLimitStore` interface (`get`, `incr`, `expire`, `reset`). Ship `InMemoryStore` (default — current behavior). Document Redis adapter as an optional follow-up package (`@theokit/rate-limit-redis`), NOT bundled.
- **Rationale:** Bundling Redis client (~ 50 KB) into framework core violates KISS for users who don't run multi-instance. Pluggable interface lets distributed deployments opt-in without bloating single-instance apps. Pattern matches Vite's `Storage` interface and Next.js's `unstable_cache` adapter shape.
- **Consequences:** + Single-instance apps see zero change. + Multi-instance apps install adapter explicitly. + Adapter packages can evolve independently of core. − Need explicit interface design; cannot retrofit later without breaking adapter contract.

### D2 — Per-route rate limit via path matching, NOT per-handler decorator
- **Decision:** Extend `rateLimit` config schema to `{ default: {...}, routes: { '/api/login': {...}, '/api/users': {...} }, keyBy: 'ip' | 'session' | 'user' | (req) => string }`. Path matching is exact-string OR regex (mirrors `disallowedRoutes` pattern in csrf).
- **Rationale:** Per-handler decorator (`defineRoute({ rateLimit: {...} })`) requires touching every route definition and clutters route signatures. Centralized config = single source of truth, greppable, declarative. Trade-off: less local; chose centralization because security policies are infrastructure-shaped, not handler-shaped.
- **Consequences:** + Operator changes rate-limit policy without code review of every route. + Login endpoints get strict limits (5/minute) while health checks stay loose (100/minute). − Path-based matching can mismatch if routes are renamed without updating config; mitigation: validator warns on unknown paths.

### D3 — CORS as global middleware run BEFORE CSRF, NOT per-route opt-in
- **Decision:** Single global CORS middleware fed by `config.security.cors`. Runs in middleware order: **CORS preflight → rate limit → CSRF → security headers → handler**.
- **Rationale:** CORS preflight (`OPTIONS`) MUST respond before route matching (browsers send it without a body, with `Access-Control-Request-Method`/`Access-Control-Request-Headers`). Putting it in middleware (not per-route) is the only correct architecture. Per-route CORS would require dedicated OPTIONS handler in every route — non-starter for ergonomics.
- **Consequences:** + Cross-origin POST works correctly out of the box once configured. + Preflight responses are deterministic. − One global config means user can't have different origins per route (acceptable — multi-tenant CORS is a domain product wants to own anyway).

### D4 — `AuditLogger` adapter pattern; default = JSON stdout
- **Decision:** Define `AuditLogger` interface (`log({action, actor, resource, metadata, timestamp})`). Ship default `JsonStdoutSink`. Reserve adapter shapes for `PostgresSink`, `FileSink`, `OpenTelemetrySink` as follow-up packages.
- **Rationale:** Persistence has heavy deps (`pg`, `better-sqlite3`). Default JSON-to-stdout works in any environment — Vercel captures stdout, Cloudflare Workers logs to Tail Workers, TheoCloud captures stdout → Loki, Docker captures stdout. Users opt-in to durable storage when they need SQL semantics.
- **Consequences:** + Zero new framework deps. + Compatible with all deploy targets (Vercel, CF, Bun, Deno, AWS Lambda). − Persistence requires user setup or external adapter. + Audit log surface forms the basis for future compliance (SOC2 control matrix).

### D5 — Session secret as array; index 0 = newest; transparent re-encrypt on legacy decrypt
- **Decision:** `createSessionManager({ secret: string | string[] })`. Array = `[current, ...previous]`. Encrypt always uses `secret[0]`. Decrypt tries `secret[0]`, then `secret[1]`, etc. On successful decrypt with index > 0, the next response re-encrypts the session with `secret[0]` (transparent migration).
- **Rationale:** Backwards-compatible (string still works — wrapped to `[string]` internally). Zero new env vars (no separate `SESSION_SECRET_PREV`). Operator rotation is "prepend new secret"; old keys naturally age out as users hit the app. Pattern matches what Iron Session does in Next.js ecosystem.
- **Consequences:** + Rotation possible without logging anyone out. + Compromised key can be deprecated by removing it from array after grace period. − Array length bound (cap at 5 secrets) prevents pathological accumulation. − Re-encrypt on every legacy hit costs ~ 1 ms CPU on each affected request — acceptable.

### D6 — OAuth/OIDC stays out of core; ship 5 protocol primitives + ADR + docs
- **Decision:** TheoKit ships `oauth-pkce.ts` (RFC 7636), `oauth-state.ts`, `oidc-discovery.ts` (OIDC Discovery 1.0), `auth-totp.ts` (RFC 6238), `auth-backup-codes.ts`. Concrete provider implementations (Google, GitHub, etc.) NEVER ship. Auth.js, Better Auth, Lucia, Iron Session, etc. are recommended in docs.
- **Rationale:** OAuth providers have constant deltas (scope changes, endpoint moves, breaking flow updates). Specialist libs maintain them. TheoKit's single-maintainer constraint cannot keep up. Standards-level primitives (RFC 6749 / 7636 / 6238 / OIDC Discovery) don't churn. The §4.1 / §4.4 / §5.1 conclusions in `.claude/knowledge-base/reference/oauth-oidc-delegation.md` document the prior-art for this decision (6 of 8 frameworks delegate; Remix 3 outliers by bundling 9 providers — explicitly contraindicated for single-maintainer scope).
- **Consequences:** + Maintenance burden bounded to RFC-stable primitives. + Auth libs (Auth.js et al.) get unopinionated integration surface. + Users picking different auth strategies (sessions/JWT/hosted IdP) all work. − Users with "I just want Google login" hit one extra hop ("install Auth.js"). Mitigation: `docs/concepts/auth-providers.md` is the first hop with copy-paste examples.

### D7 — 2FA primitives (TOTP + backup codes), NOT 2FA UX
- **Decision:** Ship pure-function `generateTotp` / `verifyTotp` / `generateBackupCodes` / `verifyBackupCode`. No storage opinions. No UI. No enrollment flow. No recovery flow.
- **Rationale:** TheoKit can't opine on SMS vs app-based vs hardware key as primary. Storage of TOTP secrets is user's database choice. Recovery flow is product choice. We ship the cryptographic primitives correctly per RFC 6238; user wires the policy.
- **Consequences:** + Crypto-correct primitives users compose. + Apps with WebAuthn-first or passwordless flows aren't forced to adopt TOTP. − User has to wire enrollment UI themselves; this is consistent with the auth-delegation stance (D6).

### D8 — Permissions-Policy default-deny stance
- **Decision:** Default Permissions-Policy disables sensitive Web APIs: `geolocation=(), camera=(), microphone=(), payment=(), usb=()`. Configurable via `config.security.headers.permissionsPolicy` (override entire string OR augment via merge helper).
- **Rationale:** Defaults should be safe. Most apps don't need camera/mic/geolocation/payment/USB. Apps that DO need these opt-in. Aligns with Mozilla baseline, OWASP Secure Headers, and Google Lighthouse PWA recommendations.
- **Consequences:** + Apps that don't use these APIs gain defense-in-depth. + Lighthouse audit score improves. − Apps that DO need these APIs need to override the default; surface this in error pages when a user hits a denied API.

### D9 — CSP report endpoint as built-in route with user hook
- **Decision:** Framework auto-registers `/__theo/csp-report` (POST `application/csp-report` AND `application/reports+json`). Body parsed + forwarded to: (a) `dispatcher.onCspViolation` (devtools in dev), (b) `auditLogger.log({action: 'csp.violation', ...})` (prod), (c) optional `config.security.headers.onCspViolation?: (report) => void` user hook.
- **Rationale:** Without an endpoint, `cspMode: 'report-only'` is useless (browser violations go to the void). Built-in endpoint keeps the surface ergonomic. Hook allows user-defined sinks (Sentry, etc.). `/__theo/*` prefix follows existing reserved-route convention (`/__theo/health`, `/@theo/entry-client`).
- **Consequences:** + CSP report-only mode becomes actually useful for visibility. + Hook integrates with existing error tracking. − Need to whitelist `/__theo/csp-report` in default CSP `report-uri` directive.

### D10 — Middleware order: CORS → rate limit → CSRF → security headers → handler
- **Decision:** Document and enforce a single middleware order at the API middleware level (`vite-plugin/api-middleware.ts`):
  1. **CORS preflight** — responds OPTIONS before any other check (so cross-origin clients can probe what's allowed)
  2. **Rate limit** — cheap, prevents downstream work from running on flooded routes
  3. **CSRF** — gates state-mutating methods
  4. **Security headers** — applied to ALL responses including 4xx/5xx (set BEFORE handler runs so handler-set headers can override)
  5. **Route handler**
- **Rationale:** Order is correctness, not preference. CORS preflight must NOT be CSRF-checked (no body, no Origin matching for OPTIONS). Rate limit must run before CSRF so authenticated brute-force gets blocked AT the rate gate. Security headers must apply to errors so 4xx pages don't leak nonce-less HTML.
- **Consequences:** + Single audit point for security middleware ordering. + Easy to document. − Constrains future plugins from injecting middleware in arbitrary order (acceptable — security order is a hard rule).

## Dependency Graph

```
Phase 1 (Headers + CORS) ─────────────────────────────┐ (parallel)
                                                       │
Phase 2 (Rate limit reform) ──▶ Phase 6 (Auth primitives — uses RateLimitStore)
                                                       │
Phase 3 (Session rotation) ───────────────────────────┤ (parallel after Phase 6.session-rotate)
                                                       │
Phase 4 (Audit log) ──▶ Phase 5 (CSP report endpoint — uses AuditLogger)
                                                       │
Phase 7 (OAuth/OIDC docs + protocol primitives) ──────┤ (parallel)
                                                       ▼
                                          Phase 8 (Dogfood QA — MANDATORY)
```

Parallelism notes:
- **Phase 1** (Permissions-Policy + CORS) — fully independent. Quick wins (~1 day each).
- **Phase 2** (RateLimitStore + per-route/per-user) — BLOCKING for Phase 6's login throttling (T6.1).
- **Phase 3** (Session secret array + rotation) — independent. Phase 6's `auth-totp` doesn't need it, but Phase 7's OAuth docs reference `rotateSession()` so Phase 3 should land before Phase 7's docs are finalized.
- **Phase 4** (AuditLogger interface) — BLOCKING for Phase 5 (CSP report endpoint forwards to audit).
- **Phase 5** (CSP report endpoint) — depends on Phase 4.
- **Phase 6** (Login throttling + TOTP + backup codes) — Login throttling depends on Phase 2; TOTP + backup codes are independent.
- **Phase 7** (OAuth/OIDC delegation) — protocol primitives independent; docs + ADR best landed last so all referenced primitives exist.

Suggested execution order: **1 + 2 + 4 in parallel → 5 + 6 in parallel after their deps → 3 + 7 in parallel → 8**. Wall-clock estimate: ~ 3 weeks for a single engineer working full-time.

---

## Phase 1: Permissions-Policy + CORS (quick wins, parallel)

**Objective:** Ship two missing defense headers / middlewares that are table-stakes for modern web baseline. Both are fully independent of other phases.

### T1.1 — Permissions-Policy default-deny header

#### Objective
Emit `Permissions-Policy` header on every `/api/*` response with default-deny on geolocation, camera, microphone, payment, USB. User-configurable via `config.security.headers.permissionsPolicy`.

#### Evidence
Mozilla Observatory + OWASP Secure Headers Project both flag missing Permissions-Policy as a defense-in-depth gap. Current `applySecurityHeaders` (`security-headers.ts:107-194`) emits CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy — but NOT Permissions-Policy. Adding it is a 1-line per directive; ROI is immediate Lighthouse/Observatory score bump.

#### Files to edit
```
packages/theo/src/server/security-headers.ts — extend SecurityHeadersConfig + DEFAULT_PERMISSIONS_POLICY const + emit in applySecurityHeaders (~ 20 LOC)
packages/theo/src/config/schema.ts — add `permissionsPolicy: z.union([z.string(), z.literal(false)]).optional()` to securityHeadersSchema
tests/unit/security-headers.test.ts — add 4 new tests
```

#### Deep file dependency analysis
- `security-headers.ts` exports `applySecurityHeaders(res, config, env, options)` called from `vite-plugin/api-middleware.ts:73`. Adding a new header is purely additive — no caller changes.
- `config/schema.ts` `securityHeadersSchema` is the source of truth; T6.1 of the 0.3.0 cutover already extended this same schema, so the pattern is well-trodden.
- Downstream: `tests/unit/security-headers.test.ts` has 15 existing tests covering CSP/HSTS/frame-options/etc.; adding 4 keeps regression coverage.

#### Deep Dives

**Default policy string:**
```
geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=()
```

The seven features listed are: (a) the most-abused for tracking (geolocation, accelerometer, gyroscope), (b) the most-abused for spyware (camera, microphone), (c) the most-abused for fraud (payment), (d) the most-abused for hardware exfiltration (usb).

**Override behavior:**
- `permissionsPolicy: false` → header NOT emitted
- `permissionsPolicy: 'geolocation=(self)'` → header emitted verbatim (overrides default)
- `permissionsPolicy: undefined` → default emitted

**Invariants:**
- Header value is a single string (not array). Permissions-Policy syntax uses parentheses + comma separation; emit one header.
- If user sets a header inside their handler with `res.setHeader('Permissions-Policy', ...)`, that should win (framework emits BEFORE handler runs).
- **Header value must not contain CR/LF** (EC-3 mitigation — CWE-113 HTTP Response Splitting). Schema-level refinement rejects any string with `\r` or `\n`. **The SAME refinement applies to every other string-valued header config in this plan** (CORS `exposedHeaders` / `allowedHeaders` entries, CSP `report-uri` string, etc.).

**Edge cases:**
- Empty string `permissionsPolicy: ''` → emit empty header (denies nothing AND is parseable). Document as no-op.
- Handler sets header THEN framework emits — won't happen because framework emits FIRST. Handler-set wins by overwrite, which is the desired behavior.
- **EC-3:** User passes `permissionsPolicy` derived from untrusted input containing `\r\n` → schema MUST reject at parse time. Without this, attacker injects `Set-Cookie`/`Location` headers.

#### Tasks
1. Add `DEFAULT_PERMISSIONS_POLICY` const to `security-headers.ts`
2. Extend `SecurityHeadersConfig` interface with `permissionsPolicy?: string | false`
3. In `applySecurityHeaders`, after the Referrer-Policy block, add Permissions-Policy emission with the same `config !== false` gate as HSTS
4. Extend `securityHeadersSchema` in `config/schema.ts` — string variant uses `.refine((s) => !/[\r\n]/.test(s), { message: 'Header value must not contain CR/LF' })` (EC-3)
5. Add 5 tests in `security-headers.test.ts` (4 original + 1 EC-3 injection test)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_permissions_policy_default_emitted() — Given default SecurityHeadersConfig, Then response has 'Permissions-Policy' header matching DEFAULT_PERMISSIONS_POLICY (MUST fail before impl)
RED:     test_permissions_policy_custom_override() — Given config.permissionsPolicy='geolocation=(self)', Then response has that exact header value
RED:     test_permissions_policy_disabled_when_false() — Given config.permissionsPolicy=false, Then NO Permissions-Policy header set
RED:     test_permissions_policy_schema_accepts_string_or_false() — Given securityHeadersSchema.parse({permissionsPolicy: 'x=()'}), Then success; given .parse({permissionsPolicy: 123}), Then fail
RED:     test_permissions_policy_rejects_crlf_injection() — EC-3: Given config.permissionsPolicy='x=(); \r\nX-Injected: yes', Then schema.parse throws ZodError (CWE-113 mitigation)
GREEN:   Implement the const + interface field + applySecurityHeaders branch + schema extension
REFACTOR: None expected (additive)
VERIFY:  npx vitest run tests/unit/security-headers.test.ts
```

BDD scenarios:
- **Happy path:** Default config → header emitted with default policy.
- **Validation error:** Schema rejects non-string non-false values.
- **Edge case:** `permissionsPolicy: false` → header absent.
- **Error scenario:** Custom user policy overrides default cleanly.

#### Acceptance Criteria
- [ ] `DEFAULT_PERMISSIONS_POLICY` exported from `security-headers.ts`
- [ ] `SecurityHeadersConfig.permissionsPolicy` field present
- [ ] `applySecurityHeaders` emits the header when config doesn't disable it
- [ ] `securityHeadersSchema` accepts the new field
- [ ] **EC-3:** Schema refinement rejects CR/LF in header value (`/[\r\n]/.test` → ZodError)
- [ ] All 5 new tests pass (4 original + 1 EC-3 injection test)
- [ ] All 15 existing `security-headers.test.ts` tests still green
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/security-headers.test.ts`

#### DoD
- [ ] Code committed
- [ ] No new deps
- [ ] CHANGELOG entry under `[Unreleased]` mentioning Permissions-Policy default

---

### T1.2 — CORS middleware + config schema

#### Objective
Ship a `cors.ts` middleware that handles CORS preflight + adds `Access-Control-*` headers on responses, configurable via `config.security.cors`. Runs FIRST in middleware order (D10).

#### Evidence
TheoKit has zero CORS code today. Users wanting cross-origin API access must implement it manually. This is a baseline requirement for any SaaS exposing an API; Next.js, Express, Hono all ship CORS or trivial middleware. The gap is real.

#### Files to edit
```
packages/theo/src/server/cors.ts                   — (NEW) CORS middleware factory + preflight handler (~ 100 LOC)
packages/theo/src/config/schema.ts                  — add corsSchema + `cors` field to securitySchema
packages/theo/src/vite-plugin/api-middleware.ts     — wire createCorsHandler() in middleware order (BEFORE rate limit)
tests/unit/cors.test.ts                             — (NEW) 12 tests covering preflight + simple requests + edge cases
```

#### Deep file dependency analysis
- `cors.ts` is NEW. Pure function exports: `createCorsHandler(config)` returns `{ handlePreflight(req, res): boolean, applyHeaders(req, res): void }`. Caller integrates into request lifecycle.
- `config/schema.ts` extension follows the `disallowedConfigSchema` pattern (T5.1 of 0.3.0 cutover) — Zod object, optional, with sensible defaults.
- `api-middleware.ts` adds CORS check at the START of the request pipeline. Preflight short-circuits (returns 204 with headers, no further processing). Non-preflight requests get `Access-Control-*` headers added then continue to rate limit → CSRF → handler.

#### Deep Dives

**CORS config schema:**
```ts
export const corsSchema = z.object({
  origins: z.union([
    z.literal('*'),                          // permissive (no credentials)
    z.array(z.string().url()),               // exact match list
    z.instanceof(RegExp),                    // pattern (advanced)
    z.function().args(z.string()).returns(z.boolean()), // callback (advanced)
  ]),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])).optional(),
  allowedHeaders: z.array(z.string()).optional(), // e.g. ['Content-Type', 'X-Theo-Action']
  exposedHeaders: z.array(z.string()).optional(), // e.g. ['X-Trace-Id']
  credentials: z.boolean().default(false),
  maxAge: z.number().int().min(0).max(86400).default(600), // 10 min preflight cache
})
```

**Algorithm — preflight handling:**
```ts
function handlePreflight(req, res, config): boolean {
  if (req.method !== 'OPTIONS') return false
  const requestedMethod = req.headers['access-control-request-method']
  if (!requestedMethod) return false
  const origin = req.headers['origin']
  if (!origin) return false

  // Match origin
  if (!matchesOrigin(origin, config.origins)) {
    res.statusCode = 403
    res.end()
    return true
  }

  // Echo what we allow
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', (config.methods ?? DEFAULT_METHODS).join(', '))
  res.setHeader('Access-Control-Allow-Headers', (config.allowedHeaders ?? DEFAULT_ALLOWED).join(', '))
  res.setHeader('Access-Control-Max-Age', String(config.maxAge ?? 600))
  if (config.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.statusCode = 204
  res.end()
  return true
}
```

**Algorithm — applyHeaders (for non-preflight):**
Adds `Access-Control-Allow-Origin` + `Access-Control-Expose-Headers` + `Access-Control-Allow-Credentials` based on matched origin. Does NOT short-circuit.

**Invariants:**
- `origins: '*'` combined with `credentials: true` → reject at config-parse time (CORS spec disallows; browsers ignore wildcard with credentials). Zod refinement catches.
- Origin matching is exact-string OR regex OR callback — NEVER substring match (security risk).
- Preflight response is ALWAYS 204 No Content. No body.
- Non-preflight `Access-Control-Allow-Origin` echoes the request's `Origin` header (not `'*'`) when credentials enabled — required by CORS spec.

**Edge cases:**
- Origin header is `null` (file:// or sandboxed iframe) → reject preflight, no Access-Control-Allow-Origin on response (browser will block).
- Multiple Origin headers (proxy doubled) → take first non-empty, log warn.
- Request method is `OPTIONS` but no `Access-Control-Request-Method` (regular OPTIONS request, not preflight) → return false; let normal routing handle (currently 405).
- Origin matches but method not in allowedMethods → preflight responds with allowed methods list; browser caller's actual request will fail by browser.

#### Tasks
1. Write `cors.ts` with `createCorsHandler`, `matchesOrigin`, `handlePreflight`, `applyHeaders`
2. Extend `securitySchema` in `config/schema.ts` with `cors` field
3. Modify `api-middleware.ts` to invoke `handlePreflight` FIRST, then `applyHeaders` if non-preflight
4. Write `tests/unit/cors.test.ts` with 12 BDD scenarios
5. Document in CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_preflight_returns_204_with_correct_headers() — Given OPTIONS request with allowed origin + method, Then 204 + Access-Control-Allow-* headers set
RED:     test_preflight_rejects_unknown_origin() — Given OPTIONS from origin not in list, Then 403 + no allow-origin header
RED:     test_simple_request_gets_allow_origin_header() — Given GET request from allowed origin, Then response has Access-Control-Allow-Origin echoed
RED:     test_origin_wildcard_with_credentials_rejected_at_parse() — EC: corsSchema.parse({origins: '*', credentials: true}) throws (spec violation)
RED:     test_origin_match_exact_string() — Given config.origins=['https://app.example.com'], Then 'https://app.example.com' matches, 'https://other.com' does not
RED:     test_origin_match_regex() — Given config.origins=/\.example\.com$/, Then 'sub.example.com' matches, 'sub.evil.com' does not
RED:     test_origin_match_callback() — Given config.origins=fn, Then fn called with origin and result used
RED:     test_exposed_headers_added_to_response() — Given config.exposedHeaders=['X-Trace-Id'], Then response has Access-Control-Expose-Headers: X-Trace-Id
RED:     test_credentials_flag_added_when_enabled() — Given config.credentials=true + matched origin, Then Access-Control-Allow-Credentials: true header set
RED:     test_max_age_used_in_preflight() — Given config.maxAge=3600, Then preflight response has Access-Control-Max-Age: 3600
RED:     test_options_without_AC_request_method_passes_through() — Given OPTIONS request lacking Access-Control-Request-Method, Then handler returns false (let routing handle)
RED:     test_multiple_origin_headers_takes_first() — EC: req.headers.origin is array, Then first value used
GREEN:   Implement cors.ts + schema extension + middleware wiring
REFACTOR: Extract matchesOrigin if pattern reused
VERIFY:  npx vitest run tests/unit/cors.test.ts
```

BDD scenarios:
- **Happy path:** Preflight with allowed origin/method → 204 + correct headers.
- **Validation error:** `origins: '*'` + `credentials: true` rejected at parse.
- **Edge case:** Non-preflight OPTIONS passes through to routing.
- **Error scenario:** Unknown origin in preflight → 403.

#### Acceptance Criteria
- [ ] `cors.ts` exists with documented exports
- [ ] `corsSchema` validates configs; wildcard+credentials rejected
- [ ] `api-middleware.ts` wires CORS BEFORE rate limit
- [ ] All 12 new tests pass
- [ ] Integration test: real request from another origin to fixture app gets allow-origin echoed
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/cors.test.ts`

#### DoD
- [ ] Code committed
- [ ] Fixture project `tests/fixtures/cors-enabled/` runs with `origins: ['http://localhost:5174']`
- [ ] CHANGELOG entry

---

## Phase 2: Rate limit reform — `RateLimitStore` + per-route + per-user

**Objective:** Refactor `rate-limit.ts` to use a pluggable store; add per-route + per-user keying support. Unlocks both distributed rate-limit deployments AND login throttling primitive (Phase 6).

### T2.1 — `RateLimitStore` interface + `InMemoryStore` adapter

#### Objective
Extract the in-memory `Map<string, StoreEntry>` from `rate-limit.ts` behind a `RateLimitStore` interface; ship `InMemoryStore` as the default implementation. No behavior change — pure refactor.

#### Evidence
`rate-limit.ts:1-68` has the store baked into `createRateLimiter` as a closure-scope `Map`. Multi-instance deployments (TheoCloud canary with 2-10 replicas per plan) share NOTHING — each instance has its own counter. A user with 100 req/window passes through 2 instances → 200 effective requests/window. Documented bypass.

Per D1: pluggable interface lets users opt-in to Redis later without bloating single-instance deployments.

#### Files to edit
```
packages/theo/src/server/rate-limit-store.ts        — (NEW) RateLimitStore interface + InMemoryStore (~ 80 LOC)
packages/theo/src/server/rate-limit.ts              — refactor to consume the interface (~ 30 LOC modified)
tests/unit/rate-limit-store.test.ts                 — (NEW) interface contract + InMemoryStore behavior (8 tests)
tests/unit/rate-limit.test.ts                       — verify refactor preserves existing behavior (existing tests must stay green)
```

#### Deep file dependency analysis
- `rate-limit.ts:17-67` currently does:
  - `const store = new Map<string, StoreEntry>()` — extract to `InMemoryStore`
  - Periodic GC (every 1000 checks) — moves into the store
  - `store.get/set/delete` — becomes `store.incr / store.reset / store.expire`
- Caller (`api-middleware.ts:47`) gets `createRateLimiter(config)` — signature unchanged for backwards compat.
- New consumer: `auth-throttle.ts` (Phase 6 T6.1) will accept a `RateLimitStore` directly.

#### Deep Dives

**RateLimitStore interface:**
```ts
export interface RateLimitStore {
  /** Atomic increment-and-get; create with expiry if absent. */
  incr(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>
  /** Read current state without incrementing. */
  get(key: string): Promise<{ count: number; resetAt: number } | null>
  /** Reset key (used by login throttling on success). */
  reset(key: string): Promise<void>
}
```

**InMemoryStore implementation:**
- Backed by `Map<string, { count: number; resetAt: number }>`
- `incr`: if entry missing OR `now > resetAt`, create with `count=1, resetAt=now+windowMs`. Else `count++`.
- GC: periodic cleanup every 1000 calls (preserved from current behavior — `rate-limit.ts:30-34`)
- Async signature even though in-memory is sync — keeps the interface honest for Redis adapter.

**Invariants:**
- `incr` is idempotent in terms of "ever-creates-with-expiry". Two parallel calls for the same key SHOULD both increment by 1, both observe the same resetAt. (In-memory has GIL-equivalent via Node single-thread; Redis adapter uses `INCR` + `EXPIRE NX`.)
- `get` returns `null` for expired entries (not just absent — checks `now > resetAt`).
- `reset` removes the key (next `incr` creates fresh).

**Edge cases:**
- `incr` with `windowMs=0` → throw (invalid input)
- `incr` on key with very-recent resetAt (clock-skew, ms-resolution boundary) → use `>=` comparison, not `>`, to avoid never-expiring keys
- Map grows unbounded with infinite distinct keys → periodic GC handles. For pathological cases, cap at ~ 100k entries (LRU evict).

#### Tasks
1. Create `rate-limit-store.ts` with interface + `InMemoryStore` class
2. Modify `rate-limit.ts` `createRateLimiter` to accept `store?: RateLimitStore` (default: `new InMemoryStore()`)
3. Update API middleware wire-up: no change required (createRateLimiter signature backwards-compat)
4. Add 8 contract tests + verify existing rate-limit tests still pass
5. Document the interface in JSDoc

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_in_memory_store_incr_creates_entry() — Given empty store, When incr('user:a', 60_000), Then result.count===1 and resetAt > now
RED:     test_in_memory_store_incr_increments_existing() — Given existing entry, When incr again, Then count===2 (same resetAt)
RED:     test_in_memory_store_incr_resets_after_window() — Given entry with resetAt < now, When incr, Then new entry created with count===1
RED:     test_in_memory_store_get_returns_null_for_expired() — Given expired entry, When get, Then returns null (not stale data)
RED:     test_in_memory_store_reset_removes_entry() — Given entry, When reset, Then subsequent get returns null
RED:     test_in_memory_store_incr_with_zero_window_throws() — EC: incr('x', 0) throws InvalidWindowError
RED:     test_in_memory_store_gc_removes_expired_entries() — Given 1100 incr calls with expired entries, Then internal map size < 100 after GC
RED:     test_rate_limit_refactor_preserves_behavior() — Existing rate-limit.test.ts integration: all 5+ existing tests still pass with the refactored impl
GREEN:   Implement RateLimitStore + InMemoryStore + refactor rate-limit.ts
REFACTOR: Verify rate-limit.ts is purely a consumer of the store (no Map operations left in it)
VERIFY:  npx vitest run tests/unit/rate-limit-store.test.ts tests/unit/rate-limit.test.ts
```

BDD scenarios:
- **Happy path:** First incr creates entry; second incr increments.
- **Validation error:** Zero or negative windowMs rejected.
- **Edge case:** Expired entry → new window starts.
- **Error scenario:** Reset clears state.

#### Acceptance Criteria
- [ ] `RateLimitStore` interface exported from `rate-limit-store.ts`
- [ ] `InMemoryStore` class implements it correctly
- [ ] `rate-limit.ts` no longer contains Map operations directly
- [ ] All 8 new contract tests pass
- [ ] All existing `rate-limit.test.ts` integration tests still green
- [ ] Backwards compat: `createRateLimiter(config)` (no store arg) works identically to before
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] No new deps
- [ ] JSDoc on interface explains Redis adapter contract

---

### T2.2 — Per-route + per-user rate limit

#### Objective
Extend `rateLimit` config schema to support `{ default, routes, keyBy }`. Routes is a map of path → `RateLimitConfig`. `keyBy` determines what string to key by (IP / session / user / callback).

#### Evidence
Current behavior (verified in `rate-limit.ts:24`): `const key = req.socket?.remoteAddress ?? 'unknown'`. All routes share the same limit. Login endpoints get the same budget as `/api/health` — brute-force friendly.

#### Files to edit
```
packages/theo/src/server/rate-limit.ts              — extend createRateLimiter signature to accept per-route map + keyBy callback (~ 60 LOC modified)
packages/theo/src/config/schema.ts                  — extend rateLimitSchema to support nested structure
packages/theo/src/vite-plugin/api-middleware.ts     — pass req.url to matched-route resolution
tests/unit/rate-limit-per-route.test.ts             — (NEW) 8 tests for path matching + keyBy behavior
```

#### Deep file dependency analysis
- Current `rateLimitSchema`:
  ```ts
  export const rateLimitSchema = z.object({
    windowMs: z.number().min(1),
    max: z.number().int().min(1),
  })
  ```
- New shape (backwards compatible — top-level shape still works, just becomes the `default`):
  ```ts
  const baseRateLimitSchema = z.object({ windowMs: z.number().min(1), max: z.number().int().min(1) })
  export const rateLimitSchema = z.union([
    baseRateLimitSchema, // legacy shape — becomes default
    z.object({
      default: baseRateLimitSchema.optional(),
      routes: z.record(z.string(), baseRateLimitSchema).optional(),
      keyBy: z.union([
        z.enum(['ip', 'session', 'user']),
        z.function().args(z.unknown()).returns(z.string()),
      ]).default('ip'),
    }),
  ])
  ```
- `rate-limit.ts:createRateLimiter` becomes path-aware: returns a function that takes `req` AND `path` (route's matched path, not raw URL), returns the appropriate config + key.

#### Deep Dives

**Key derivation algorithm:**
```ts
function deriveKey(req: IncomingMessage, keyBy: KeyBy): string {
  if (typeof keyBy === 'function') return keyBy(req)
  switch (keyBy) {
    case 'ip':
      return `ip:${req.socket?.remoteAddress ?? 'unknown'}`
    case 'session':
      const cookie = getCookie(req, 'theo_session')
      return cookie ? `session:${hashCookie(cookie)}` : `ip:${req.socket?.remoteAddress ?? 'unknown'}`
    case 'user':
      // Requires upstream middleware to set req.user; if absent, fall back to IP
      const user = (req as any).user
      return user?.id ? `user:${user.id}` : `ip:${req.socket?.remoteAddress ?? 'unknown'}`
  }
}
```

**Path matching:**
- Exact string OR regex (mirrors `disallowedRoutes` pattern in csrf.ts)
- Longest-prefix match for nested paths (`/api/admin/*` more specific than `/api/*`)
- Routes not in the map fall through to `default` config (if set) or no rate limit at all

**Invariants:**
- Per-route config overrides default for matched paths.
- `keyBy: 'session'` hashes the session cookie (NEVER stores raw token).
- Backwards compat: legacy flat `rateLimit: { windowMs, max }` still works (treated as `default`).

**Edge cases:**
- Empty routes map + no default → no rate limit (effectively off).
- Path matches multiple routes (overlapping patterns) → longest match wins. Document the precedence rule.
- `keyBy: 'user'` but no auth middleware sets `req.user` → falls back to IP (don't crash).
- Session cookie missing for `keyBy: 'session'` → fall back to IP (so anonymous users still get rate-limited).

#### Tasks
1. Extend `rateLimitSchema` (Zod union for backwards compat)
2. Rewrite `createRateLimiter` to accept the new shape + return a path-aware checker
3. Wire path resolution in `api-middleware.ts` (use matched route's pattern, not raw URL)
4. Add 8 tests covering per-route + keyBy variants
5. Document in CHANGELOG (BREAKING? — no, backwards compat preserved)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_per_route_config_used_when_path_matches() — Given config.routes={'/api/login': {windowMs:60000,max:5}}, When path='/api/login', Then max=5 applies
RED:     test_default_config_used_when_path_unmatched() — Given config.default={max:100}, When path='/api/users', Then max=100 applies
RED:     test_no_rate_limit_when_no_default_no_match() — Given config.routes only, When path doesn't match, Then no rate limit applied (passes through)
RED:     test_keyBy_ip_uses_remote_address() — Given keyBy='ip', When req.socket.remoteAddress='1.2.3.4', Then key='ip:1.2.3.4'
RED:     test_keyBy_session_hashes_cookie() — Given keyBy='session', cookie='abc', Then key='session:<sha256-prefix-of-abc>' (NOT raw 'abc')
RED:     test_keyBy_user_falls_back_to_ip_when_no_user() — Given keyBy='user', req.user undefined, Then key starts with 'ip:'
RED:     test_keyBy_callback_invoked() — Given keyBy=fn, Then fn called with req and result used as key
RED:     test_legacy_flat_config_works_as_default() — BACKWARDS COMPAT: Given config={windowMs, max} (flat), Then treated as default
GREEN:   Implement schema extension + rewriter
REFACTOR: Extract deriveKey + matchRoute as pure helpers
VERIFY:  npx vitest run tests/unit/rate-limit-per-route.test.ts
```

BDD scenarios:
- **Happy path:** Login endpoint gets strict limit (5/min), other endpoints get default (100/min).
- **Validation error:** Schema rejects invalid keyBy value.
- **Edge case:** No matching route + no default → pass through (no limit).
- **Error scenario:** Missing session cookie under `keyBy: 'session'` → fall back to IP (no crash).

#### Acceptance Criteria
- [ ] Schema accepts both legacy flat and new nested shape
- [ ] Path matching respects longest-prefix
- [ ] keyBy: ip / session (hashed) / user (with IP fallback) / callback all work
- [ ] All 8 new tests pass
- [ ] All existing rate-limit + integration tests still green
- [ ] Backwards compat verified (legacy flat config in `tests/fixtures/template-default/theo.config.ts`)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Fixture `tests/fixtures/rate-limit-per-route/` demonstrates `/api/login` strict + others loose
- [ ] CHANGELOG entry

---

## Phase 3: Session secret rotation (dual-key window)

**Objective:** Enable session secret rotation without logging users out. `createSessionManager` accepts `secret: string | string[]`; decrypt walks the array; legacy hits transparently re-encrypt with the newest key. Also adds `rotateSession()` method (OWASP A07:2021 mitigation — EC-6 from oauth-oidc-delegation reference doc).

### T3.1 — Accept `secret: string | string[]` in SessionManager

#### Objective
Backwards-compat extension: `createSessionManager` accepts either a single secret (current behavior, wrap to array internally) or an array (newest first). Encrypt always uses `secrets[0]`. Decrypt tries each secret in order.

#### Evidence
Per oauth-oidc-delegation §4.5 (Pattern 4.5 — session rotation is mandatory per OWASP A07:2021) and §EC-6 (TheoKit gap). Current `session.ts:18-30`: `if (config.secret.length < 32) throw ...` — single string.

Adjacent TheoCloud issue #60 is blocked on this: rotation cronjob can't rotate without dual-key support.

#### Files to edit
```
packages/theo/src/server/session.ts                 — accept secret array, walk on decrypt (~ 40 LOC modified)
packages/theo/src/server/crypto.ts                  — already takes a single secret; no change to interface
tests/unit/session.test.ts                          — extend with 6 new dual-key tests
```

#### Deep file dependency analysis
- `session.ts:22-23`: `if (config.secret.length < 32) throw ...` becomes a per-secret-in-array check. ALL secrets in the array must be ≥ 32 chars.
- `assertProductionSecret` (`session.ts:79-106`) extends to accept array, validate each entry.
- `getSession` (`session.ts:30-42`): instead of `decrypt(raw, config.secret)` (single shot), loops `for (const s of secrets) { result = await decrypt(raw, s); if (result) break }`.
- `crypto.ts:decrypt` already returns `null` on failure (no throws on bad-secret); zero changes needed there.

#### Deep Dives

**Invariants:**
- **Array length cap: 5 — ENFORCED via throw at construction (EC-1 mitigation).** Plan-of-record fail-loud: if user passes 6+ secrets, `normalizeSecrets()` throws with actionable message "drop the oldest before adding a new one". Silent truncation would create false sense of rotation; silent acceptance would create unbounded CPU cost on legacy decrypt walks.
- Every secret ≥ 32 chars. Mixed-length array fails at construction.
- Encrypt always uses `secrets[0]` (newest first convention).
- Decrypt walks `secrets[0]` → `secrets[1]` → ... — first successful decrypt wins.
- If decrypt succeeds at index > 0, the session is "stale" — mark for re-encrypt on next response (T3.2).

**Edge cases:**
- Empty array `secret: []` → throw at construction.
- Single-element array `secret: ['xyz']` → behaves identically to legacy `secret: 'xyz'`.
- Array with one short secret (`['valid32chars...', 'shrt']`) → throw at construction (BEFORE first request).
- Array with placeholder pattern in any entry → `assertProductionSecret` throws (each entry checked).
- **EC-1:** Array with > 5 entries → throw at construction with `Error('Session secret array exceeds maximum of 5 entries — drop the oldest before adding a new one')`.

#### Tasks
1. Update `SessionConfig.secret` type to `string | string[]`
2. Internally normalize to array
3. Validate each secret with existing length + placeholder rules; **also enforce length cap of 5 (EC-1)**
4. Rewrite `getSession` to walk the array
5. Add `which` return helper (returns index of secret that decrypted — used by T3.2 for re-encrypt detection)
6. Add 7 unit tests (6 original + 1 EC-1 cap test)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_session_manager_accepts_string_secret() — Backwards compat: createSessionManager({secret: '32-char-...'}) works as before
RED:     test_session_manager_accepts_array_secret() — Given secret=['new', 'old'], createSession encrypts with 'new'
RED:     test_session_decrypt_falls_back_to_old_key() — Given session encrypted with 'old', secret=['new', 'old'], Then getSession returns data (decrypted via fallback)
RED:     test_session_decrypt_returns_null_when_no_secret_works() — Given session encrypted with 'unknown', secret=['new', 'old'], Then getSession returns null
RED:     test_session_empty_array_throws_at_construction() — EC: createSessionManager({secret: []}) throws
RED:     test_session_array_with_short_secret_throws() — VALIDATION: createSessionManager({secret: ['long32...', 'shrt']}) throws (each must be ≥32)
RED:     test_session_array_with_more_than_5_secrets_throws() — EC-1: createSessionManager({secret: [s1,s2,s3,s4,s5,s6]}) throws with 'exceeds maximum of 5' message (fail-loud, no silent truncation)
GREEN:   Implement array support + decrypt walk
REFACTOR: Hoist `normalizeSecrets()` as pure helper (length cap check lives here)
VERIFY:  npx vitest run tests/unit/session.test.ts
```

BDD scenarios:
- **Happy path:** Array of 2 secrets; encrypted-with-old session decrypts.
- **Validation error:** Empty array rejected.
- **Edge case:** Single-element array equivalent to string.
- **Error scenario:** All secrets fail → null returned (no exception).

#### Acceptance Criteria
- [ ] `SessionConfig.secret` accepts `string | string[]`
- [ ] All existing session.test.ts tests still pass
- [ ] 7 new dual-key tests pass (6 original + 1 EC-1 cap)
- [ ] `assertProductionSecret` validates each entry
- [ ] **EC-1:** `normalizeSecrets()` throws on `length > 5` with actionable error message
- [ ] Backwards compat: existing apps with `secret: 'xyz'` work unchanged
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/session.test.ts`

#### DoD
- [ ] Code committed
- [ ] CHANGELOG entry mentioning rotation support

---

### T3.2 — Transparent re-encrypt on legacy-secret decrypt

#### Objective
When `getSession` decrypts using a secret at index > 0 (legacy), the next response re-issues the session cookie encrypted with `secrets[0]`. User experiences no logout; framework "migrates" each session lazily on first hit.

#### Evidence
Without this, rotation requires forcibly invalidating all sessions (which is what we're trying to avoid). Pattern matches Iron Session's behavior — described in their README as "graceful key rotation".

#### Files to edit
```
packages/theo/src/server/session.ts                 — extend getSession to return {data, needsReencrypt} OR provide separate method
packages/theo/src/server/execute.ts                  — call createSession with same data when needsReencrypt=true (~ 5 LOC)
tests/unit/session-reencrypt.test.ts                 — (NEW) 5 tests
```

#### Deep file dependency analysis
- Currently `getSession` returns `TSession | null`. We need to surface the "decrypted via legacy" info.
- Two options:
  - (A) Change `getSession` return shape (breaking).
  - (B) Add `getSessionWithMeta`, leave `getSession` shape stable. Existing callers stay backwards-compat.
- Choose (B): non-breaking.
- `execute.ts` is the API request executor. It calls `getSession` for routes that need auth (`requireAuth`). Need to add a hook that checks `needsReencrypt` and calls `createSession(res, data)` to overwrite the cookie. This happens transparently before the response is finalized.

#### Deep Dives

**New API:**
```ts
export interface SessionManagerExtended<TSession> extends SessionManager<TSession> {
  getSessionWithMeta(req: IncomingMessage): Promise<{
    data: TSession | null
    needsReencrypt: boolean
    secretIndex: number  // 0 = newest, > 0 = legacy
  }>
}
```

`getSession` (existing) is implemented in terms of `getSessionWithMeta`:
```ts
async getSession(req) {
  const { data } = await this.getSessionWithMeta(req)
  return data
}
```

**Re-encrypt invariant:**
- Re-encrypt happens at MOST once per request. (No re-encrypt loop.)
- Re-encrypt preserves the original session expiry (`envelope.exp` unchanged — only the wrapping crypto rotates).
- If a request handler calls `destroySession()`, re-encrypt is skipped (cookie is being deleted anyway).
- **EC-4 — TIMING (CRITICAL):** Re-encrypt MUST happen in `api-middleware.ts` BEFORE the route handler executes — same pass that already reads session for `requireAuth`. NEVER inside the handler body, NEVER after the SSR shell flushes. Once `res.writeHead()` (or `renderToPipeableStream`'s `onShellReady`) fires, Set-Cookie is locked → re-encrypt becomes a silent no-op and the user stays on the legacy secret forever. This rule is what makes the "transparent" claim honest for streaming SSR routes (the framework's default).

**Edge cases:**
- Decrypt succeeds at index 0 → `needsReencrypt: false` (already on newest).
- Decrypt succeeds at index 1+ → `needsReencrypt: true`.
- No session cookie → no decrypt attempt; `needsReencrypt: false`.
- All decrypts fail → `data: null, needsReencrypt: false` (no session to re-encrypt).
- **EC-4:** Handler streams response via `renderToPipeableStream` → re-encrypt must already have happened in middleware pass; never deferred to post-handler.

#### Tasks
1. Add `getSessionWithMeta` to interface
2. Refactor internal decrypt loop to track index
3. Wire `api-middleware.ts` (NOT `execute.ts` alone — middleware runs BEFORE any streaming) to: (a) call `getSessionWithMeta` once per request, (b) if `needsReencrypt`, call `createSession(res, data)` immediately, (c) cache the result on `ctx` so the handler reuses it via `getSession` without re-decrypting. **(EC-4 mitigation)**
4. Add 6 tests (5 original + 1 EC-4 streaming integration)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_getSessionWithMeta_returns_needsReencrypt_true_for_legacy() — Given session encrypted with secrets[1], Then needsReencrypt=true, secretIndex=1
RED:     test_getSessionWithMeta_returns_needsReencrypt_false_for_newest() — Given session encrypted with secrets[0], Then needsReencrypt=false
RED:     test_getSession_returns_data_unchanged_after_split() — Backwards compat: existing getSession() callers still get TSession | null only
RED:     test_legacy_session_cookie_reencrypted_after_request() — INTEGRATION: req with legacy-encrypted cookie, processed, then response Set-Cookie contains a different cookie value (new encryption)
RED:     test_no_session_means_no_reencrypt() — EC: no cookie present, Then needsReencrypt=false, no Set-Cookie emitted
RED:     test_streaming_route_with_legacy_session_still_reencrypts() — EC-4 INTEGRATION: SSR route using renderToPipeableStream + legacy-encrypted cookie. Verify Set-Cookie present in response HEADERS (before shell flush) and cookie value != original. Without middleware-level re-encrypt this test fails (header would be locked by first byte).
GREEN:   Implement getSessionWithMeta + api-middleware hook (pre-handler)
REFACTOR: Verify getSession() body is just a delegate to getSessionWithMeta; verify no re-encrypt call site lives inside any handler / render path
VERIFY:  npx vitest run tests/unit/session-reencrypt.test.ts tests/integration/session-rotation.test.ts tests/integration/session-rotation-streaming.test.ts
```

BDD scenarios:
- **Happy path:** Legacy session → re-encrypted on next response → subsequent requests use newest secret.
- **Validation error:** N/A.
- **Edge case:** Session encrypted with secrets[0] → no re-encrypt.
- **Error scenario:** `destroySession` called by handler → re-encrypt skipped.

#### Acceptance Criteria
- [ ] `getSessionWithMeta` exported
- [ ] Existing `getSession` works unchanged
- [ ] Re-encrypt observable via Set-Cookie diff in integration test
- [ ] **EC-4:** Re-encrypt wired in `api-middleware.ts` BEFORE handler runs (not in `execute.ts` post-handler, not in handler body, not in render path)
- [ ] **EC-4:** Streaming SSR route with legacy cookie produces Set-Cookie in response headers (test `test_streaming_route_with_legacy_session_still_reencrypts` green)
- [ ] All 6 new tests pass (5 original + 1 EC-4 streaming)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Integration test in `tests/integration/session-rotation.test.ts` demonstrates 7-day rotation grace
- [ ] CHANGELOG entry

---

### T3.3 — `SessionManager.rotateSession()` method (OWASP A07 mitigation)

#### Objective
Add `rotateSession(req, res): Promise<TSession | null>` method that re-encrypts the current session with the same data but a new IV (effectively rotating the session ID — preventing session fixation per OWASP A07:2021).

#### Evidence
Per oauth-oidc-delegation §4.5 / §EC-6: Remix's `completeAuth()` rotates after every login. Rails' `sessions_controller.rb` calls `reset_session`. TheoKit lacks the primitive.

This is called by auth flow code AFTER successful login (credentials, OAuth callback, etc.) to thwart fixation attacks.

#### Files to edit
```
packages/theo/src/server/session.ts                 — add rotateSession method to SessionManager interface + impl (~ 15 LOC)
tests/unit/session-rotate.test.ts                    — (NEW) 4 tests
```

#### Deep file dependency analysis
- New method is purely additive to the `SessionManager` interface.
- Implementation: `getSession` → `createSession(res, samedata)` with a fresh IV. Returns the data.
- `crypto.ts:encrypt` already generates a fresh random IV per call — no change needed.

#### Deep Dives

**Invariants:**
- Rotate preserves session data (`envelope.data` unchanged).
- Rotate REFRESHES the expiry (`envelope.exp = now + maxAge`). This is the desired behavior — successful auth extends the session.
- Rotate ALWAYS overwrites the cookie (new IV → new ciphertext → new value).
- If no session present, `rotateSession` returns `null` and does NOT set a cookie (no-op).

**Edge cases:**
- No cookie present → null returned, no Set-Cookie emitted (safe to call defensively).
- Session expired between getSession and createSession → cookie deleted (consistency: don't re-issue expired session).
- Race: two concurrent rotations for the same session — last write wins. Document; this is HTTP-level not race-safe (cookies are serial per browser).

#### Tasks
1. Add `rotateSession` to `SessionManager` interface
2. Implement: `const data = await getSession(req); if (data) { await createSession(res, data) }; return data`
3. Add 4 tests
4. Document use in auth-providers docs (Phase 7)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_rotateSession_preserves_data() — Given session {userId:1}, When rotateSession, Then returned data === {userId:1}
RED:     test_rotateSession_changes_cookie_value() — Given cookie 'abc', When rotateSession, Then Set-Cookie has different value (new IV → new ciphertext)
RED:     test_rotateSession_no_cookie_returns_null() — EC: no session cookie, Then rotateSession returns null, no Set-Cookie emitted
RED:     test_rotateSession_refreshes_expiry() — Given session with old exp, When rotateSession with maxAge=1h, Then new envelope exp ~= now+1h
GREEN:   Implement rotateSession method
REFACTOR: None expected (15 LOC)
VERIFY:  npx vitest run tests/unit/session-rotate.test.ts
```

BDD scenarios:
- **Happy path:** Rotate active session → new cookie value, same data.
- **Validation error:** N/A.
- **Edge case:** No session → null + no-op.
- **Error scenario:** Expired session → cookie deleted (consistent state).

#### Acceptance Criteria
- [ ] `rotateSession` on `SessionManager` interface
- [ ] All 4 new tests pass
- [ ] Cookie value observably changes between calls
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Phase 7 docs reference this method in OAuth callback example

---

## Phase 4: Audit log

**Objective:** Ship `AuditLogger` interface + default JSON stdout sink. Wire framework events (csrf.warn, rate-limit hits, CSP violations from Phase 5) to it. Persistence adapters (Postgres, File) are out-of-scope for this plan but the interface is forward-compatible.

### T4.1 — `AuditLogger` interface + default `JsonStdoutSink`

#### Objective
Define the interface. Ship the default. Allow plugging adapters later via `config.audit: { logger: ... }`.

#### Evidence
Current state: `csrf.warn` lands in `console.warn` via `warnOnce`. No persistence interface exists. SOC2/ISO27001 require an audit trail for security events; without an interface, every user implements their own (or doesn't).

#### Files to edit
```
packages/theo/src/server/audit-log.ts                — (NEW) AuditLogger interface + JsonStdoutSink (~ 80 LOC)
packages/theo/src/config/schema.ts                   — add `audit: z.object({...}).optional()` to root config
tests/unit/audit-log.test.ts                         — (NEW) 6 tests
```

#### Deep file dependency analysis
- `audit-log.ts` is NEW. Exports `AuditLogger` interface, `AuditEvent` type, `JsonStdoutSink` class, `createNoOpLogger()` (default when audit not configured).
- `config/schema.ts` adds top-level `audit` field; absent → no-op logger; present → user-provided logger or framework default.
- Downstream: Phase 4 T4.2 wires events. Phase 5 wires CSP violations.

#### Deep Dives

**Interface:**
```ts
export interface AuditEvent {
  action: string                       // 'csrf.warn' | 'rate-limit.exceeded' | 'csp.violation' | 'session.rotated' | ...
  actor?: { type: 'user' | 'system' | 'anonymous'; id?: string }
  resource?: { type: string; id?: string }
  metadata?: Record<string, unknown>
  timestamp?: string                   // ISO 8601; framework fills if missing
  traceId?: string                     // populated from x-trace-id when available
}

export interface AuditLogger {
  log(event: AuditEvent): void | Promise<void>
}
```

**JsonStdoutSink:**
```ts
export class JsonStdoutSink implements AuditLogger {
  log(event: AuditEvent): void {
    const enriched = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    }
    try {
      console.log(JSON.stringify({ level: 'audit', ...enriched }))
    } catch {
      // Circular ref / BigInt safety — fallback
      console.log(`[audit] ${event.action} (payload could not be serialized)`)
    }
  }
}
```

**Invariants:**
- `log` is fire-and-forget from caller's perspective. Async sinks return Promise; callers may await for consistency, but framework wiring does not (don't block response).
- `JsonStdoutSink` is sync (console.log is sync in Node).
- `action` field is REQUIRED. Convention: `<domain>.<verb>` (csrf.warn, session.rotated, login.failed).
- `timestamp` auto-filled by framework if caller doesn't provide.

**Edge cases:**
- Event metadata contains circular ref → fallback to `[audit] <action>` log line.
- Event metadata contains BigInt → same fallback (consistent with `warnOnce` EC-2).
- User-provided logger throws → caught by framework wrapper (audit failure must never crash a request).

#### Tasks
1. Write `audit-log.ts` with interface + JsonStdoutSink + createNoOpLogger
2. Extend root config schema with `audit: { logger? }` field
3. Add 6 unit tests
4. Document interface for future SQL/File adapter packages

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_json_stdout_sink_writes_to_console() — Given JsonStdoutSink, When log({action:'csrf.warn'}), Then console.log called with JSON line
RED:     test_json_stdout_sink_enriches_timestamp() — Given event without timestamp, Then output includes ISO 8601 timestamp
RED:     test_json_stdout_sink_preserves_custom_timestamp() — Given event with timestamp, Then output uses provided value
RED:     test_json_stdout_sink_falls_back_on_circular() — EC: event.metadata has circular ref, Then console.log called with [audit] fallback line (no crash)
RED:     test_no_op_logger_does_nothing() — Given createNoOpLogger().log(event), Then console.log NOT called
RED:     test_config_schema_accepts_audit_field() — Given theoConfigSchema.parse({audit: {logger: undefined}}), Then success
GREEN:   Implement audit-log.ts + schema extension
REFACTOR: Extract serializeSafely helper if reused
VERIFY:  npx vitest run tests/unit/audit-log.test.ts
```

BDD scenarios:
- **Happy path:** Event logged to stdout as JSON.
- **Validation error:** Schema rejects malformed audit config.
- **Edge case:** Circular metadata doesn't crash.
- **Error scenario:** No-op logger is opt-out path.

#### Acceptance Criteria
- [ ] `AuditLogger` interface + `JsonStdoutSink` + `createNoOpLogger` exported
- [ ] Config schema accepts `audit` field
- [ ] All 6 new tests pass
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/audit-log.test.ts`

#### DoD
- [ ] Code committed
- [ ] No new deps
- [ ] CHANGELOG entry

---

### T4.2 — Wire framework events to audit logger

#### Objective
Auto-log: `csrf.warn`, `rate-limit.exceeded`, `session.rotated`. Each event populated from the existing emission site (`csrf.ts`, `rate-limit.ts`, `session.ts`).

#### Evidence
T4.1 ships the interface; T4.2 makes it useful. Without wiring, users have to manually call `auditLogger.log(...)` everywhere — defeats the purpose.

#### Files to edit
```
packages/theo/src/server/csrf.ts                     — emit audit event when csrf.warn fires (~ 5 LOC)
packages/theo/src/server/rate-limit.ts               — emit audit event when limited (~ 5 LOC)
packages/theo/src/server/session.ts                   — emit audit event on rotateSession (~ 5 LOC)
packages/theo/src/vite-plugin/api-middleware.ts       — instantiate logger from config and pass to dependent modules (~ 10 LOC)
tests/integration/audit-log-wiring.test.ts            — (NEW) 4 tests verifying events emitted
```

#### Deep file dependency analysis
- Each emission site currently has access to a "logger" of some shape. csrf.ts gets `CsrfLogger` (`csrf.ts:18-23`). Add `audit?: AuditLogger` to the same struct or pass via context.
- `api-middleware.ts` is the central wiring point (already injects rateLimitConfig, securityHeaders, disallowed). Add audit logger to the deps.

#### Deep Dives

**Event shapes:**
```ts
// csrf.ts emission
auditLogger.log({
  action: 'csrf.warn',
  actor: { type: 'anonymous' }, // anonymous because CSRF check happens before auth
  metadata: { code, docsUrl, method, path, reason },
})

// rate-limit.ts emission
auditLogger.log({
  action: 'rate-limit.exceeded',
  actor: { type: 'anonymous', id: keyOrIp },
  metadata: { path, windowMs, max, count },
})

// session.ts rotate emission
auditLogger.log({
  action: 'session.rotated',
  actor: { type: 'user', id: <userId from session> },
})
```

**Invariants:**
- Audit emission happens AFTER the framework's primary action. Never blocks the request.
- If no audit logger configured (default NoOp), emission is a single nullish-check (zero overhead).
- Logger errors NEVER propagate to the request handler.

**Edge cases:**
- `audit?.log` throws — caught at the emission site, console.warn'd.
- High-volume rate-limit hits → audit volume spike. Audit logger may need its own deduplication (out of scope; future enhancement).

#### Tasks
1. Plumb `AuditLogger` instance through api-middleware to csrf/rate-limit/session
2. Add emission calls at the appropriate points
3. Add 4 integration tests
4. Wrap emissions in try/catch (audit-must-not-crash invariant)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_csrf_warn_emits_audit_event() — Given audit logger configured + CSRF violation, Then logger.log called with {action: 'csrf.warn'}
RED:     test_rate_limit_exceeded_emits_audit() — Given limited request, Then logger.log called with {action: 'rate-limit.exceeded', actor.id: <ip>}
RED:     test_session_rotate_emits_audit() — Given rotateSession called, Then logger.log called with {action: 'session.rotated'}
RED:     test_audit_logger_throw_does_not_crash_request() — EC: logger.log throws, Then request still completes normally (status 200, response body intact)
GREEN:   Wire emissions
REFACTOR: Extract a `safeAudit(logger, event)` helper if pattern repeats
VERIFY:  npx vitest run tests/integration/audit-log-wiring.test.ts
```

BDD scenarios:
- **Happy path:** Three core events flow to audit logger.
- **Validation error:** N/A.
- **Edge case:** No logger configured → no overhead, no errors.
- **Error scenario:** Logger throws → request unaffected.

#### Acceptance Criteria
- [ ] csrf.warn, rate-limit.exceeded, session.rotated all emit audit events
- [ ] Audit failure does not affect request lifecycle
- [ ] All 4 integration tests pass
- [ ] Existing csrf + rate-limit + session tests still green
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] CHANGELOG entry naming each event

---

## Phase 5: CSP report endpoint built-in

**Objective:** Auto-register `/__theo/csp-report` endpoint. Receives browser CSP violation reports. Forwards to: dev devtools dispatcher + audit log + optional user hook. Closes the loop on `cspMode: 'report-only'`.

### T5.1 — `/__theo/csp-report` route auto-registered

#### Objective
Framework registers a built-in route handler for `POST /__theo/csp-report` accepting `application/csp-report` and `application/reports+json` content types. Parses body, normalizes shape, forwards to sinks.

#### Evidence
Today: `cspMode: 'report-only'` directs browser to send reports but TheoKit has no endpoint. Reports go to the void. Use case (CSP nonce E2E validation in TheoCloud issue #59) is blocked without this.

#### Files to edit
```
packages/theo/src/server/csp-report.ts               — (NEW) endpoint handler + body parser (~ 90 LOC)
packages/theo/src/vite-plugin/api-middleware.ts       — register the built-in route BEFORE user-defined routes
packages/theo/src/server/security-headers.ts         — add report-uri to default CSP (configurable)
tests/unit/csp-report.test.ts                        — (NEW) 8 tests
tests/integration/csp-report-pipeline.test.ts        — (NEW) 3 tests
```

#### Deep file dependency analysis
- `csp-report.ts` is NEW. Exports `handleCspReport(req, res, opts)`. Parses both legacy and new report formats.
- `api-middleware.ts` matches `/__theo/csp-report` BEFORE user routes (similar to how `/api/__theo_batch__` is reserved).
- `security-headers.ts`: when nonce is in play, the CSP string can include `report-uri /__theo/csp-report` automatically. User can override via config.

#### Deep Dives

**Two CSP report formats:**
1. **Legacy (`application/csp-report`):**
   ```json
   {
     "csp-report": {
       "blocked-uri": "https://evil.com/x.js",
       "document-uri": "https://app.example.com/page",
       "violated-directive": "script-src 'self'",
       ...
     }
   }
   ```
2. **New (`application/reports+json`, Reporting API):**
   ```json
   [{
     "age": 1234,
     "body": {
       "blockedURL": "...",
       "documentURL": "...",
       "violatedDirective": "...",
       ...
     },
     "type": "csp-violation",
     "url": "..."
   }]
   ```

**Normalized internal shape:**
```ts
export interface CspViolation {
  blockedUrl: string
  documentUrl: string
  violatedDirective: string
  effectiveDirective?: string
  originalPolicy?: string
  disposition?: 'enforce' | 'report'
  statusCode?: number
  sourceFile?: string
  lineNumber?: number
  columnNumber?: number
}
```

**Algorithm:**
```ts
async function handleCspReport(req, res, opts) {
  const ct = req.headers['content-type'] ?? ''
  let raw
  try {
    raw = await readBody(req, { maxBytes: 16 * 1024 }) // 16KB cap
  } catch {
    res.statusCode = 413
    res.end()
    return
  }
  let violations: CspViolation[]
  try {
    if (ct.startsWith('application/csp-report')) {
      // EC-2: Browsers may POST {"csp-report": null} or {} on disposition='report' policies.
      // Guard against null/undefined/non-object before normalizing.
      const inner = JSON.parse(raw)?.['csp-report']
      if (!inner || typeof inner !== 'object') {
        res.statusCode = 204
        res.end()
        return
      }
      violations = [normalizeLegacy(inner)]
    } else if (ct.startsWith('application/reports+json')) {
      // EC-2: Filter out entries lacking a body BEFORE normalizing (avoids null deref).
      const parsed = JSON.parse(raw)
      const entries = Array.isArray(parsed) ? parsed : []
      violations = entries
        .filter((e) => e && typeof e === 'object' && e.body && typeof e.body === 'object')
        .map(normalizeNew)
        .filter(Boolean)
    } else {
      res.statusCode = 415
      res.end()
      return
    }
  } catch {
    res.statusCode = 400
    res.end()
    return
  }
  for (const v of violations) {
    opts.auditLogger?.log({ action: 'csp.violation', metadata: v })
    opts.devtoolsDispatcher?.onCspViolation?.(v)
    try { opts.onViolation?.(v) } catch (err) { /* ignore user hook errors */ }
  }
  res.statusCode = 204
  res.end()
}
```

**Invariants:**
- Body cap: 16 KB. CSP reports are tiny (< 2 KB typically); 16 KB is generous.
- Both content types accepted.
- Always 204 No Content on success (browser ignores response body).
- Always 4xx on malformed input (400 invalid JSON, 413 too big, 415 unknown content-type).
- Endpoint is NOT CSRF-protected (browser-initiated, no user action; CSRF check would block legitimate reports).
- Endpoint is rate-limited via `keyBy: 'ip'` default (browsers can flood reports — protect the audit log).

**Edge cases:**
- Empty body → 400.
- Array with 0 entries → 204 (no violations to log, but valid format).
- Violation lacks `blockedUrl` or `violatedDirective` → log with `(missing)` placeholder.
- Report directive points at our own endpoint → infinite loop risk → audit log entry doesn't trigger another CSP violation (we control what gets logged).
- **EC-2:** Browser POSTs `{"csp-report": null}` or `{"csp-report": "string"}` or empty `{}` — handler must short-circuit to 204 (valid format, no violation to record), NOT crash via null deref in `normalizeLegacy`. Same for `application/reports+json` array entries with missing/non-object `body`.

#### Tasks
1. Write `csp-report.ts` with parser + handler + normalizer
2. Wire into `api-middleware.ts` BEFORE user routes
3. Modify `security-headers.ts` to optionally include `report-uri` in default CSP
4. Add 8 unit + 3 integration tests
5. Document in CHANGELOG + `docs/concepts/csp.md` (new short page)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_csp_report_legacy_format_parsed() — Given POST /__theo/csp-report with application/csp-report body, Then violation normalized + audit logger called
RED:     test_csp_report_new_format_parsed() — Given POST with application/reports+json body, Then violation normalized + audit logger called
RED:     test_csp_report_returns_204_on_success() — Given valid report, Then status 204 + empty body
RED:     test_csp_report_415_for_unknown_content_type() — EC: text/plain body, Then 415
RED:     test_csp_report_400_for_invalid_json() — EC: malformed JSON, Then 400
RED:     test_csp_report_413_for_oversize() — EC: body > 16KB, Then 413
RED:     test_csp_report_no_csrf_check() — Given POST without X-Theo-Action, Then 204 (not 403 — endpoint exempts itself)
RED:     test_csp_report_user_hook_invoked() — Given onViolation hook, Then called with normalized violation
RED:     test_csp_report_user_hook_throw_does_not_crash() — EC: hook throws, Then 204 still returned
RED:     test_default_csp_includes_report_uri() — Given default config, Then DEFAULT_CSP contains 'report-uri /__theo/csp-report'
RED:     test_devtools_dispatcher_receives_violation() — INTEGRATION: in dev, fire a report, Then dispatcher.onCspViolation called
RED:     test_csp_report_legacy_null_inner_returns_204() — EC-2: POST application/csp-report body '{"csp-report": null}', Then 204 (NOT 500 — no null deref into normalizeLegacy)
RED:     test_csp_report_legacy_missing_inner_returns_204() — EC-2: POST body '{}' (no csp-report key), Then 204 with NO audit emission
RED:     test_csp_report_new_format_entry_without_body_skipped() — EC-2: POST application/reports+json '[{"type":"csp-violation","url":"..."}]' (no body field), Then 204, audit logger NOT called for that entry
GREEN:   Implement handler + wire integration (with EC-2 null guards in legacy + new format paths)
REFACTOR: Extract normalizers (legacy + new) as pure helpers
VERIFY:  npx vitest run tests/unit/csp-report.test.ts tests/integration/csp-report-pipeline.test.ts
```

BDD scenarios:
- **Happy path:** Browser sends report → endpoint accepts → audit + devtools both informed.
- **Validation error:** Malformed JSON → 400.
- **Edge case:** Empty array of reports → 204 (valid, just no-op).
- **Error scenario:** User hook throws → 204 still returned.

#### Acceptance Criteria
- [ ] `/__theo/csp-report` accepts both legacy and new formats
- [ ] Audit logger + devtools dispatcher + user hook all wired
- [ ] CSP default includes `report-uri /__theo/csp-report` (configurable)
- [ ] Endpoint exempt from CSRF
- [ ] **EC-2:** `{"csp-report": null}`, `{}`, and reports+json entries lacking `body` all return 204 (no crash, no spurious audit entry)
- [ ] All 11 unit + 3 integration tests pass (8 original + 3 EC-2 null guards)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Fixture `tests/fixtures/csp-reports/` demonstrates the loop end-to-end
- [ ] CHANGELOG entry
- [ ] Short doc page `docs/concepts/csp.md` explaining report-uri usage

---

## Phase 6: Auth primitives — login throttling + TOTP + backup codes

**Objective:** Three RFC-stable primitives users compose into their own auth flow. No UX, no storage opinions. Throttling depends on Phase 2's RateLimitStore.

### T6.1 — `throttleLoginAttempts` primitive

#### Objective
Helper that records login attempts, returns `{ allowed, remainingAttempts, lockedUntil }`. Uses any `RateLimitStore` backend. Implements lockout window after maxAttempts failures.

#### Evidence
Currently zero login throttling exists. Brute-force attack at scale is bounded only by per-IP rate limit (which is bypassable via distributed attackers). Per-credential throttling is OWASP A07:2021 mitigation.

#### Files to edit
```
packages/theo/src/server/auth-throttle.ts            — (NEW) recordAttempt + checkThrottle (~ 80 LOC)
tests/unit/auth-throttle.test.ts                     — (NEW) 8 tests
```

#### Deep file dependency analysis
- DEPENDS on T2.1 (RateLimitStore must exist).
- Pure helper module; doesn't auto-wire into framework. User explicitly calls it in their login handler.

#### Deep Dives

**API:**
```ts
export interface ThrottleOptions {
  store: RateLimitStore
  identifier: string                  // 'user:alice@example.com'
  maxAttempts?: number                // default 5
  windowMs?: number                   // default 15 * 60_000 (15 min)
  lockoutMs?: number                  // default 60 * 60_000 (1h) after maxAttempts hit
}

export interface ThrottleResult {
  allowed: boolean
  remainingAttempts: number
  lockedUntil?: Date
}

export async function checkThrottle(opts: ThrottleOptions): Promise<ThrottleResult>
export async function recordAttempt(opts: ThrottleOptions, success: boolean): Promise<ThrottleResult>
```

**Algorithm:**
- `checkThrottle`: read store; if count >= maxAttempts AND within lockoutMs → `{allowed: false, lockedUntil}`. Else `{allowed: true, remainingAttempts}`.
- `recordAttempt(opts, true)`: success → `store.reset(identifier)` (clears counter)
- `recordAttempt(opts, false)`: failure → `store.incr(identifier, windowMs)` → recompute throttle state

**Invariants:**
- Successful login wipes the failure counter (reset).
- Lockout window starts from the LAST failed attempt (sliding lockout).
- Identifier should NOT be raw email (use hashed/normalized form to avoid leaking PII into rate-limit store).

**Edge cases:**
- First-ever attempt → `count=0`, `allowed=true`, `remainingAttempts=maxAttempts`.
- Exactly at maxAttempts → next checkThrottle returns `{allowed: false}` for the lockoutMs duration.
- Concurrent failed attempts (race) → counter overshoots maxAttempts; lockout still applies. OK.
- Lockout expired between check and record → next attempt starts a fresh window.

#### Tasks
1. Write `auth-throttle.ts`
2. Add 8 tests using mock RateLimitStore
3. Document in CHANGELOG + auth-providers docs

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_first_attempt_allowed() — Given no prior attempts, When checkThrottle, Then allowed=true, remaining=5
RED:     test_after_5_failures_locked() — Given 5 failed recordAttempt(false), When checkThrottle, Then allowed=false, lockedUntil set
RED:     test_successful_recordAttempt_resets_counter() — Given 3 failures + 1 success, When checkThrottle, Then allowed=true, remaining=5
RED:     test_lockout_expires_after_lockoutMs() — Given locked state, When time advances past lockoutMs, Then allowed=true (fresh window)
RED:     test_remainingAttempts_decrements() — Given 2 failed attempts, When checkThrottle, Then remaining=3
RED:     test_custom_maxAttempts_respected() — Given maxAttempts=3, Then locks after 3 failures (not 5)
RED:     test_identifier_isolation() — Given alice has 5 failures, bob has 0, Then bob.allowed=true and alice.allowed=false
RED:     test_concurrent_failures_overshoot_safe() — EC: 10 simultaneous recordAttempt(false), Then lockedUntil still set, no crash
GREEN:   Implement auth-throttle.ts
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/auth-throttle.test.ts
```

BDD scenarios:
- **Happy path:** First attempt allowed; after 5 failures, locked.
- **Validation error:** N/A.
- **Edge case:** Success resets counter.
- **Error scenario:** Concurrent failures don't crash.

#### Acceptance Criteria
- [ ] `checkThrottle` and `recordAttempt` exported from `auth-throttle.ts`
- [ ] All 8 tests pass
- [ ] Works with any RateLimitStore
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/auth-throttle.test.ts`

#### DoD
- [ ] Code committed
- [ ] Documented in `docs/concepts/auth-providers.md` example

---

### T6.2 — TOTP primitive (RFC 6238)

#### Objective
`generateTotp`, `verifyTotp`, `generateTotpSecret`, `totpUri` — pure RFC 6238 implementation using Web Crypto.

#### Evidence
RFC 6238 stable since 2011. No 2FA primitive in TheoKit today. Lifted from `.claude/knowledge-base/reference/oauth-oidc-delegation.md` §7.4.

#### Files to edit
```
packages/theo/src/server/auth-totp.ts                — (NEW) generateTotp + verifyTotp + helpers (~ 120 LOC)
tests/unit/auth-totp.test.ts                         — (NEW) RFC 6238 Appendix B test vectors (~ 12 tests)
```

#### Deep Dives

**RFC 6238 test vectors (Appendix B, SHA-1, 8-digit, secret = "12345678901234567890"):**

| T (seconds) | TOTP |
|---|---|
| 59 | 94287082 |
| 1111111109 | 07081804 |
| 1111111111 | 14050471 |
| 1234567890 | 89005924 |
| 2000000000 | 69279037 |
| 20000000000 | 65353130 |

**API:**
```ts
export interface TotpOptions {
  secret: Uint8Array | string  // base32 if string
  step?: number                // seconds, default 30
  digits?: 6 | 7 | 8           // default 6
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512'  // default SHA-1 (RFC)
  time?: number                // ms since epoch; default Date.now()
}

export async function generateTotp(opts: TotpOptions): Promise<string>
export async function verifyTotp(token: string, opts: TotpOptions & { window?: number }): Promise<boolean>
export function generateTotpSecret(bytes?: number): Uint8Array  // default 20 bytes (RFC recommended)
export function totpUri(opts: { secret: Uint8Array; issuer: string; account: string; ... }): string  // otpauth:// URI for QR code
```

**Invariants:**
- `verifyTotp` accepts `window` (default 1, RFC 6238 §5.2 recommends ±1 step = 90s total tolerance).
- Default algorithm is SHA-1 per RFC. SHA-256 and SHA-512 are RFC-allowed extensions.
- Constant-time comparison for `verifyTotp` (prevent timing attacks).

**Edge cases:**
- Token with non-digit chars → false (don't crash).
- Token wrong length → false.
- Secret too short (< 16 bytes) → throw at construction (RFC minimum).
- Token from previous window (window=1, drift OK) → accepted.
- Token from window > N (window=1, large drift) → rejected.

#### Tasks
1. Implement HMAC-SHA-1 / 256 / 512 via Web Crypto
2. Implement TOTP counter derivation (8-byte big-endian counter from time/step)
3. Implement truncation algorithm (RFC 4226 §5.3)
4. Implement constant-time string compare
5. Implement `totpUri` for QR code generation (URI format per `otpauth://` spec)
6. Add 12 tests covering RFC 6238 Appendix B vectors + drift + edge cases

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_rfc6238_vector_T59() — Given secret=ASCII'12345678901234567890', T=59, digits=8, Then code='94287082'
RED:     test_rfc6238_vector_T1111111109() — RFC vector
RED:     test_rfc6238_vector_T1111111111() — RFC vector
RED:     test_rfc6238_vector_T1234567890() — RFC vector
RED:     test_generate_totp_default_6_digits() — Given default opts, generated code has length 6
RED:     test_verify_totp_accepts_current_window() — Given valid current code, Then verifyTotp returns true
RED:     test_verify_totp_accepts_prev_window_with_drift_1() — Given code from T-30 with window=1, Then true
RED:     test_verify_totp_rejects_far_drift() — Given code from T-120 with window=1, Then false
RED:     test_verify_totp_rejects_non_digit_token() — EC: token='abc123', Then false (no crash)
RED:     test_verify_totp_rejects_wrong_length() — EC: token='12345' (5 digits), Then false
RED:     test_generate_totp_secret_default_20_bytes() — Given generateTotpSecret(), Then length === 20
RED:     test_totp_uri_format() — Given opts, Then URI matches otpauth://totp/<issuer>:<account>?secret=...&issuer=...
GREEN:   Implement auth-totp.ts (HMAC + truncation + base32 + URI builder)
REFACTOR: Pure helpers (truncate, counterToBytes, hexToBytes) extracted
VERIFY:  npx vitest run tests/unit/auth-totp.test.ts
```

BDD scenarios:
- **Happy path:** RFC test vectors pass; current code verifies.
- **Validation error:** Non-digit token rejected.
- **Edge case:** Drift within window accepted; outside rejected.
- **Error scenario:** Bad secret throws (RFC minimum length).

#### Acceptance Criteria
- [ ] All 12 tests pass (RFC vectors + edge cases)
- [ ] Constant-time compare verified (assertion via timing test if feasible)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Documented in `docs/concepts/auth-providers.md`

---

### T6.3 — Backup codes primitive

#### Objective
`generateBackupCodes` produces N random codes + their argon2id hashes. `verifyBackupCode(code, hashes)` constant-time checks. User stores hashes only.

#### Evidence
Standard 2FA recovery pattern. Companion to TOTP (T6.2).

#### Files to edit
```
packages/theo/src/server/auth-backup-codes.ts        — (NEW) generate + verify (~ 100 LOC)
tests/unit/auth-backup-codes.test.ts                  — (NEW) 8 tests
```

#### Deep Dives

**API:**
```ts
export interface BackupCodeOptions {
  count?: number                 // default 10
  length?: number                // default 8 chars
  separator?: '-' | null         // default '-' → 'XXXX-XXXX' style; null → 'XXXXXXXX'
  alphabet?: string              // default 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' (no I/O/0/1)
}

export interface BackupCode {
  plaintext: string              // show to user once
  hash: string                   // store in DB
}

export async function generateBackupCodes(opts?: BackupCodeOptions): Promise<BackupCode[]>
export async function verifyBackupCode(code: string, hashes: string[]): Promise<{
  valid: boolean
  matchedHash?: string           // caller removes from storage
}>
```

**Invariants:**
- Default alphabet excludes ambiguous chars (I/L/O/0/1) — fewer dictation errors.
- Hashing uses Argon2id (via `hash-wasm` — same dep used by `examples/agent-saas`). Same params: 19 MiB memory, 2 iterations, 1 parallelism.
- `verifyBackupCode` walks hashes constant-time (don't short-circuit on first mismatch).
- `matchedHash` returned so caller can delete the used code from storage (prevent replay — EC-9 from reference doc).

**Edge cases:**
- Empty hashes array → `{valid: false}` (don't crash on cold start).
- Code with stripped separator (`'XXXXXXXX'` vs `'XXXX-XXXX'`) → both forms accepted.
- Code in lowercase → normalize to uppercase before hash compare.
- Duplicate codes generated (extremely unlikely with 32-char alphabet) → regenerate the duplicate.

#### Tasks
1. Write `auth-backup-codes.ts`
2. Add 8 tests
3. Document use pattern in auth-providers.md

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_generate_backup_codes_default_10() — Given default opts, Then array.length === 10
RED:     test_generate_backup_codes_unique() — Given 10 codes, Then all plaintexts unique
RED:     test_generate_backup_codes_separator_format() — Given default, Then plaintext matches /^[A-Z0-9]{4}-[A-Z0-9]{4}$/
RED:     test_verify_backup_code_happy_path() — Given generated codes, When verify plaintext, Then valid=true and matchedHash provided
RED:     test_verify_backup_code_wrong_returns_invalid() — EC: random code, Then valid=false, no matchedHash
RED:     test_verify_backup_code_empty_hashes() — EC: hashes=[], Then valid=false (no crash)
RED:     test_verify_backup_code_separator_optional() — Given hash for 'XXXX-XXXX', verify 'XXXXXXXX', Then valid=true (normalized)
RED:     test_verify_backup_code_case_insensitive() — Given hash for 'ABCD-EFGH', verify 'abcd-efgh', Then valid=true
GREEN:   Implement auth-backup-codes.ts
REFACTOR: Extract normalizeCode helper
VERIFY:  npx vitest run tests/unit/auth-backup-codes.test.ts
```

BDD scenarios:
- **Happy path:** Generated code verifies; returned matchedHash for storage cleanup.
- **Validation error:** Empty hashes → false (no crash).
- **Edge case:** Separator-stripped code still verifies.
- **Error scenario:** Wrong code → false.

#### Acceptance Criteria
- [ ] `generateBackupCodes` + `verifyBackupCode` exported
- [ ] Argon2id hashing via hash-wasm (already in workspace via agent-saas)
- [ ] Constant-time iteration verified
- [ ] All 8 tests pass
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Documented in auth-providers.md

---

## Phase 7: OAuth/OIDC delegation — ADR + docs + protocol primitives

**Objective:** Lock the delegation decision (ADR) + ship the recommendation page + ship 3 standards-stable helpers (PKCE, state, OIDC discovery) that both libraries and DIY users consume.

### T7.1 — ADR-AUTH-DELEGATION in CLAUDE.md

#### Objective
Add formal architectural decision record to `CLAUDE.md` "Architectural decisions on record" section. References the reference doc as artifact.

#### Evidence
Without ADR, future maintainers will face pressure to "just add Google login built-in." Need the named decision + the prior-art reference to defuse that.

#### Files to edit
```
CLAUDE.md                                            — add new entry under "Architectural decisions on record"
```

#### Deep file dependency analysis
- Existing pattern (devtools + RSC entries) — add new entry parallel to them.
- Link to `.claude/knowledge-base/reference/oauth-oidc-delegation.md`.

#### Deep Dives

**ADR text follows the established structure: decision → rationale → re-evaluation triggers → if-we-adopt-later → artifact.**

**Re-evaluation triggers (all three required to reopen):**
1. TheoKit reaches a team of 3+ engineers committed to long-term framework maintenance
2. Concrete user demand from shipped TheoKit apps with measured pain — "I tried Auth.js and couldn't make it work" reports >5 per month
3. A specialist auth lib (Auth.js / Better Auth) breaks compatibility with TheoKit's session primitives without an actively maintained fix

#### Tasks
1. Write ADR entry following existing format
2. Update the section intro if needed
3. Commit

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_claude_md_contains_oauth_delegation_adr() — Given CLAUDE.md, Then includes 'ADR-AUTH-DELEGATION' or equivalent section heading
RED:     test_claude_md_oauth_adr_links_reference_doc() — Given ADR section, Then contains link to .claude/knowledge-base/reference/oauth-oidc-delegation.md
RED:     test_claude_md_oauth_adr_documents_three_reevaluation_triggers() — Given ADR section, Then enumerates ≥3 re-evaluation triggers (regex match for numbered list 1./2./3.)
RED:     test_claude_md_oauth_adr_lists_recommended_libs() — Given ADR section, Then mentions Auth.js AND Better Auth as recommended alternatives
GREEN:   Author the ADR text in CLAUDE.md
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/claude-md-adr-oauth.test.ts
```

BDD scenarios:
- **Happy path:** ADR present + linked to reference + 3 triggers listed.
- **Validation error:** N/A (docs change).
- **Edge case:** Future ADR additions don't disturb the heading anchor.
- **Error scenario:** N/A.

#### Acceptance Criteria
- [ ] CLAUDE.md has the new ADR entry
- [ ] Link to reference doc valid
- [ ] Re-evaluation triggers explicit
- [ ] Tests assert the markers present
- [ ] Pass: existing CLAUDE.md tests still green

#### DoD
- [ ] Code committed

---

### T7.2 — `docs/concepts/auth-providers.md` with 3 worked examples

#### Objective
Recommendation page that lands a developer choosing how to add auth. Covers Auth.js, Better Auth, and DIY GitHub OAuth (using TheoKit's protocol primitives).

#### Evidence
Per oauth-oidc-delegation §4.3: every framework that delegates has a docs page surfacing the recommendation. TheoKit's README lacks this; without it, users hit a wall when they ask "how do I add Google login?"

#### Files to edit
```
docs/concepts/auth-providers.md                       — (NEW) ~ 400 LOC of worked examples
README.md                                             — add link to the new page in "Sessions" section
tests/unit/docs-auth-providers.test.ts                — (NEW) 4 tests verifying the page exists with required sections
```

#### Deep Dives

**Page structure:**

```markdown
# Auth Providers in TheoKit

TheoKit ships session primitives (encrypted cookies, requireAuth, CSRF strict) — NOT OAuth providers.
Recommended path: install an auth library (Auth.js or Better Auth). DIY path: use TheoKit's protocol primitives.

## Option A — Auth.js (NextAuth)
[worked example wiring Auth.js to TheoKit's createSessionManager]

## Option B — Better Auth
[worked example with same scope]

## Option C — DIY OAuth (GitHub)
[~ 50 LOC example using oauth-pkce + oauth-state + manual fetch]

## When to choose what

| Need | Option |
|---|---|
| 5+ providers (Google, GitHub, Facebook, etc.) | Auth.js |
| Modern TypeScript-first DX, fewer providers | Better Auth |
| Just GitHub OAuth, no library | Option C (DIY) |
| Hosted IdP (Clerk, Auth0, WorkOS) | Their SDK + TheoKit session |

## What TheoKit provides

- createSessionManager — encrypted session cookie (AES-256-GCM)
- requireAuth — type-narrowing guard
- CSRF strict + nonce CSP
- Rate limit (per-route + per-user)
- generatePkceChallenge — RFC 7636 helper
- generateOAuthState — anti-CSRF state token
- discoverOidcProvider — OIDC well-known fetcher
- generateTotp / verifyTotp — RFC 6238 2FA
- generateBackupCodes / verifyBackupCode — recovery codes
- throttleLoginAttempts — brute-force defense

## What TheoKit does NOT provide

- Concrete provider implementations (Google, GitHub, Facebook, etc.) — use a library
- JWT signing/verification — use jose
- ID token verification (JWKS) — use jose
- Login UI components — use TheoUI or roll your own
```

**Invariants:**
- All 3 examples must compile (we test them as fixtures).
- README link must point to the docs page (not 404).

#### Tasks
1. Author the page with all 3 examples
2. Wire examples to fixtures in `tests/fixtures/auth-providers/` (T7.5)
3. Update README link
4. Add presence test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_auth_providers_md_exists() — Given docs/concepts/auth-providers.md, Then file exists
RED:     test_auth_providers_md_has_three_options() — Given page, Then contains '## Option A', '## Option B', '## Option C'
RED:     test_readme_links_to_auth_providers() — Given README.md, Then contains link to docs/concepts/auth-providers.md
RED:     test_auth_providers_lists_theokit_provided_primitives() — Given page, Then mentions createSessionManager, generatePkceChallenge, generateTotp
GREEN:   Author the page + update README
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/docs-auth-providers.test.ts
```

BDD scenarios:
- **Happy path:** Page exists with 3 sections.
- **Validation error:** N/A.
- **Edge case:** N/A.
- **Error scenario:** Missing section → test fails.

#### Acceptance Criteria
- [ ] Page authored with 3 worked examples
- [ ] README links it
- [ ] All 4 tests pass
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Examples in fixtures runnable

---

### T7.3 — `oauth-pkce.ts` (RFC 7636)

#### Objective
`generatePkceChallenge()` returns `{ codeVerifier, codeChallenge, codeChallengeMethod: 'S256' }`. Pure RFC 7636.

#### Evidence
RFC 7636 stable since 2015. Lifted from oauth-oidc-delegation §7.1.

#### Files to edit
```
packages/theo/src/server/oauth-pkce.ts                — (NEW) generatePkceChallenge (~ 50 LOC)
tests/unit/oauth-pkce.test.ts                         — (NEW) RFC 7636 test vector + properties (5 tests)
```

#### Deep Dives

**RFC 7636 test vector (Appendix B):**
- `code_verifier`: `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`
- `code_challenge`: `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` (SHA-256 + base64url)

**Algorithm:**
1. Generate 32 random bytes via `crypto.getRandomValues`
2. Base64url-encode → `code_verifier` (43 chars)
3. SHA-256 the verifier via `crypto.subtle.digest`
4. Base64url-encode the hash → `code_challenge`
5. Method = 'S256'

**Invariants:**
- Verifier length: 43-128 chars per RFC. Default 43 (32 bytes).
- Challenge method: 'S256' only — no 'plain' fallback.
- Pure function: same input (entropy) → same output. (For testing, accept optional `entropy` argument.)

**Edge cases:**
- Web Crypto unavailable (Node < 19 in some envs) → fall back to `node:crypto` (already proven path in `nonce.ts`).

#### Tasks
1. Write `oauth-pkce.ts`
2. Add 5 tests (RFC vector via injected entropy + properties)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_rfc7636_vector() — Given verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' (test override), Then challenge='E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
RED:     test_default_verifier_length_43() — Given generatePkceChallenge(), Then codeVerifier.length === 43
RED:     test_challenge_method_S256() — Given output, Then codeChallengeMethod === 'S256'
RED:     test_unique_across_calls() — Given 100 calls, Then 100 unique verifiers (no collisions)
RED:     test_verifier_uses_url_safe_charset() — Given output, Then verifier matches /^[A-Za-z0-9_-]+$/ (base64url alphabet)
GREEN:   Implement oauth-pkce.ts
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/oauth-pkce.test.ts
```

BDD scenarios:
- **Happy path:** RFC vector matches.
- **Validation error:** N/A (no input).
- **Edge case:** 100 calls all unique.
- **Error scenario:** Web Crypto unavailable → fallback works.

#### Acceptance Criteria
- [ ] `generatePkceChallenge` exported
- [ ] RFC 7636 vector passes
- [ ] All 5 tests pass
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Used in DIY GitHub example (T7.5)

---

### T7.4 — `oauth-state.ts` + `oidc-discovery.ts`

#### Objective
- `generateOAuthState(opts?)` → cryptographically random base64url string for OAuth state parameter
- `verifyOAuthState(provided, stored)` → constant-time string compare
- `discoverOidcProvider(issuer)` → fetches `.well-known/openid-configuration`, caches in module scope

#### Evidence
Lifted from oauth-oidc-delegation §7.2-§7.3. RFC 6749 §10.12 + OpenID Connect Discovery 1.0. Stable.

#### Files to edit
```
packages/theo/src/server/oauth-state.ts               — (NEW) generate + verify (~ 30 LOC)
packages/theo/src/server/oidc-discovery.ts            — (NEW) well-known fetcher + cache (~ 60 LOC)
tests/unit/oauth-state.test.ts                        — (NEW) 5 tests
tests/unit/oidc-discovery.test.ts                     — (NEW) 4 tests with mock fetch
```

#### Deep Dives

**oauth-state.ts:**
- `generateOAuthState({bytes=32})` → 32 random bytes → base64url
- `verifyOAuthState(provided, stored)` → constant-time compare, length-equal check first

**oidc-discovery.ts:**
- `discoverOidcProvider(issuer)`:
  ```ts
  const cache = new Map<string, Promise<OidcMetadata>>()
  export async function discoverOidcProvider(issuer: string | URL) {
    const key = String(issuer)
    if (cache.has(key)) return cache.get(key)!
    const url = new URL('.well-known/openid-configuration', issuer)
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`)
      return r.json() as Promise<OidcMetadata>
    })
    cache.set(key, p)
    return p
  }
  ```
- Cache: module scope. Cleared by `clearOidcCache()` (test helper).
- Failed fetch → cache rejection so subsequent calls retry (don't cache failures).

**Invariants:**
- `verifyOAuthState` returns boolean only (no truthy/falsy ambiguity).
- `discoverOidcProvider` cache key is the EXACT issuer string (trailing-slash sensitive — RFC 8414 §3 issues with normalization).
- Failed discovery throws; user catches.

**Edge cases:**
- `provided` is empty string → false (don't crash on `===`).
- `stored` is empty string → false.
- Length mismatch → false (constant-time after length check).
- OIDC metadata missing `authorization_endpoint` → throw (invalid provider).
- HTTP 404 on `/.well-known/openid-configuration` → throw with clear message.

#### Tasks
1. Write `oauth-state.ts`
2. Write `oidc-discovery.ts` with module-scope cache + clear helper
3. Add 5 + 4 tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_oauth_state_generates_unique() — Given 100 calls, Then 100 unique values
RED:     test_oauth_state_default_length() — Given default opts, Then state.length matches 32-byte base64url
RED:     test_verify_oauth_state_happy() — Given generated state, When verifyOAuthState(s, s), Then true
RED:     test_verify_oauth_state_mismatch() — Given different strings, Then false
RED:     test_verify_oauth_state_empty_returns_false() — EC: provided='', stored='', Then false (don't accept empty)
RED:     test_oidc_discovery_fetches_well_known() — Given mock fetch returns 200 + metadata, Then discoverOidcProvider returns parsed metadata
RED:     test_oidc_discovery_caches_result() — Given same issuer twice, Then fetch called once
RED:     test_oidc_discovery_throws_on_404() — EC: fetch returns 404, Then throws
RED:     test_oidc_discovery_does_not_cache_failures() — EC: first call throws, second call retries fetch
GREEN:   Implement oauth-state.ts + oidc-discovery.ts
REFACTOR: Pure constant-time compare helper (already in redact.ts?) — extract if reused
VERIFY:  npx vitest run tests/unit/oauth-state.test.ts tests/unit/oidc-discovery.test.ts
```

BDD scenarios:
- **Happy path:** Generate + verify match.
- **Validation error:** Empty inputs → false.
- **Edge case:** Cache hit on second call.
- **Error scenario:** 404 throws; doesn't poison cache.

#### Acceptance Criteria
- [ ] Both files exported
- [ ] All 9 tests pass
- [ ] Cache cleared between tests
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Used in DIY GitHub example (state) and Auth.js example (discovery indirectly)

---

### T7.5 — Fixture `tests/fixtures/auth-providers/`

#### Objective
Two runnable mini-projects: (a) `with-authjs/` — Auth.js wired to TheoKit session; (b) `diy-github/` — bare-bones GitHub OAuth using TheoKit primitives only.

#### Evidence
Per to-plan quality rule 12: "every framework feature MUST have a fixture project". Auth primitives need provable integration; docs without fixtures rot.

#### Files to edit
```
tests/fixtures/auth-providers/with-authjs/            — (NEW) Auth.js + TheoKit integration
tests/fixtures/auth-providers/diy-github/             — (NEW) GitHub OAuth, no library
tests/integration/auth-providers-fixtures.test.ts     — (NEW) build + smoke each fixture
```

#### Deep Dives

**`with-authjs/` shape:**
- `package.json` adds `@auth/core` as dev dependency
- `server/auth.ts` defines Auth.js config with GitHub provider, GoogleProvider
- `server/routes/auth/[...all].ts` — Auth.js route handler
- `theo.config.ts` — TheoKit standard
- Adapter glue: Auth.js's session → TheoKit's `createSessionManager` (or just use Auth.js's own cookie if simpler)

**`diy-github/` shape:**
- `server/routes/auth/start.ts` — uses `generatePkceChallenge` + `generateOAuthState`, stores in session, redirects to GitHub
- `server/routes/auth/callback.ts` — uses `verifyOAuthState`, exchanges code, calls `rotateSession`, writes user to session
- `app/login.tsx` — link to `/api/auth/start`
- `app/dashboard.tsx` — uses `requireAuth(session)`
- ~ 100 LOC total

**Integration test:**
```ts
describe('auth-providers fixtures', () => {
  it('with-authjs builds cleanly', () => {
    execSync('pnpm --filter fixture-auth-providers-with-authjs build')
  })
  it('diy-github builds cleanly', () => {
    execSync('pnpm --filter fixture-auth-providers-diy-github build')
  })
  it('diy-github start endpoint redirects with PKCE+state params', async () => {
    // spin dev server, hit /api/auth/start, assert 302 + Location contains code_challenge + state
  })
})
```

**Invariants:**
- Both fixtures build without errors.
- Both fixtures have a `README.md` explaining how to copy-adapt for production.

**Edge cases:**
- Auth.js version drift might require periodic update; lock to a version with `^`.

#### Tasks
1. Build `with-authjs/` fixture
2. Build `diy-github/` fixture (DOES NOT require GitHub OAuth secrets — uses mocked provider for the test path)
3. Add to `pnpm-workspace.yaml`
4. Add integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_with_authjs_fixture_builds() — Given fixture, When build, Then exit 0
RED:     test_diy_github_fixture_builds() — Given fixture, When build, Then exit 0
RED:     test_diy_github_start_endpoint_redirects() — Given dev server, When GET /api/auth/start, Then 302 + Location has code_challenge param
RED:     test_diy_github_callback_validates_state() — Given dev server, When POST /api/auth/callback with mismatched state, Then 400
RED:     test_diy_github_callback_uses_rotateSession() — Given valid callback, Then Set-Cookie has new session value (rotation)
GREEN:   Build fixtures + wire test
REFACTOR: Extract shared test helpers
VERIFY:  npx vitest run tests/integration/auth-providers-fixtures.test.ts
```

BDD scenarios:
- **Happy path:** Both fixtures build and run.
- **Validation error:** State mismatch in callback → 400.
- **Edge case:** PKCE challenge present in redirect.
- **Error scenario:** rotateSession called after successful callback.

#### Acceptance Criteria
- [ ] Both fixtures exist + build
- [ ] Both have READMEs
- [ ] Workspace includes them
- [ ] All 5 integration tests pass
- [ ] Pass: `pnpm install && pnpm --filter ... build` for both
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Code committed
- [ ] Fixtures linked from `docs/concepts/auth-providers.md`

---

## Phase 8: Final Dogfood QA (MANDATORY)

**Objective:** Validate the full plan end-to-end as a real user would experience it.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

Manual additional steps:
1. `npm create theokit@latest my-saas`
2. Edit `theo.config.ts` to enable rate limit per-route + CORS + audit logger
3. `pnpm dev` → manually trigger each of: CSRF violation (raw fetch without `X-Theo-Action`), rate limit exceed (loop 200 requests), CSP violation (try to load inline script), session creation
4. Open devtools panel → Requests tab shows requests; Errors tab shows CSRF + CSP entries; audit log lines visible in `pnpm dev` stdout
5. `pnpm build` → ensure bundle ≤ 350 KB gzipped (verified via existing bundle budget script)
6. Rotate session secret in `theo.config.ts` (prepend new secret), reload — existing sessions decrypt fine (transparent re-encrypt observed in audit log)
7. Verify `Permissions-Policy` header present via `curl -I /api/...`
8. Hit `/__theo/csp-report` with mock report → see entry in audit log + devtools Errors tab
9. Auth provider fixtures: run both `with-authjs` and `diy-github` dev servers; complete a login flow (mock GitHub callback) — session created, rotated, requireAuth gates dashboard

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] All 9 manual steps pass
- [ ] Bundle budget ≤ 350 KB gzipped (`scripts/check-bundle-budget.sh` green)
- [ ] All 1569+ vitest tests + new ones (~ 100 additional) green
- [ ] All Playwright tests still pass (34+ existing)
- [ ] No new npm deps introduced (verified by `git diff packages/theo/package.json`)
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing.
2. Fix plan-caused CRITICAL + HIGH issues before declaring the plan complete.
3. Re-run `/dogfood full`.
4. Pre-existing issues are logged but do NOT block plan completion.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Rate limit distribuído + per-user + per-route | T2.1 (RateLimitStore interface), T2.2 (per-route + per-user keying), [follow-up: separate Redis adapter package] | Pluggable store with default in-memory; per-route + per-user keying configurable in `config.rateLimit` |
| 2 | CORS configurável | T1.2 | Middleware + Zod schema; preflight handled before CSRF |
| 3 | Secret rotation com dual-key window | T3.1 (secret array), T3.2 (transparent re-encrypt), T3.3 (rotateSession method) | Array of secrets, newest first; transparent re-encrypt on legacy decrypt; rotateSession primitive |
| 4 | Audit log persistido | T4.1 (interface + JsonStdoutSink), T4.2 (wire framework events) | AuditLogger interface + default stdout sink; csrf/rate-limit/session events wired |
| 5 | Login throttling | T6.1 | `throttleLoginAttempts` primitive using RateLimitStore |
| 6 | Permissions-Policy | T1.1 | Default-deny header in `applySecurityHeaders`; configurable |
| 7 | CSP report endpoint built-in | T5.1 | `/__theo/csp-report` auto-registered; forwards to audit + devtools + user hook |
| 8 | OAuth/OIDC built-in — delegated to libraries | T7.1 (ADR), T7.2 (docs), T7.3 (PKCE), T7.4 (state + OIDC discovery), T7.5 (fixtures) | ADR locks delegation; docs surface Auth.js + Better Auth + DIY; 5 RFC-stable primitives ship for both lib and DIY consumers |
| 9 | 2FA/MFA primitives | T6.2 (TOTP RFC 6238), T6.3 (backup codes) | Pure protocol primitives; no UX/storage opinions |
| Adjacent: OWASP A07 session fixation | T3.3 | `rotateSession()` method on SessionManager |

**Coverage: 10/10 gaps covered (100%)** — 9 explicit + 1 adjacent (session fixation) discovered during oauth-oidc-delegation reference dive.

## Global Definition of Done

- [ ] All 7 phases completed (Phase 8 = Dogfood QA)
- [ ] All tests passing (Vitest + Playwright)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved
  - [ ] Legacy `rateLimit: { windowMs, max }` flat config still works
  - [ ] Legacy `secret: string` still works
  - [ ] All existing csrf/session/security-header tests still green
- [ ] Code-audit checks passing across all modified packages
- [ ] **Plan-specific criteria:**
  - [ ] `RateLimitStore` interface + `InMemoryStore` exported
  - [ ] CORS middleware + `corsSchema` shipped
  - [ ] Session manager accepts string OR array; legacy decrypt → transparent re-encrypt
  - [ ] `rotateSession()` method on `SessionManager`
  - [ ] `AuditLogger` interface + `JsonStdoutSink` shipped
  - [ ] csrf.warn / rate-limit.exceeded / session.rotated events emit to audit logger
  - [ ] `/__theo/csp-report` endpoint accepts both formats; forwards to audit + devtools + user hook
  - [ ] `Permissions-Policy` header emitted with default-deny stance; configurable
  - [ ] `oauth-pkce.ts`, `oauth-state.ts`, `oidc-discovery.ts` shipped (RFC 7636 / RFC 6749 / OIDC Discovery 1.0)
  - [ ] `auth-totp.ts`, `auth-backup-codes.ts` shipped (RFC 6238)
  - [ ] `auth-throttle.ts` shipped (uses RateLimitStore)
  - [ ] `ADR-AUTH-DELEGATION` in CLAUDE.md with 3 re-evaluation triggers
  - [ ] `docs/concepts/auth-providers.md` with 3 worked examples
  - [ ] `tests/fixtures/auth-providers/{with-authjs,diy-github}` shipped + tested
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70
- [ ] **Fixture proof** — every new framework feature has a reproducible fixture project
- [ ] Bundle budget green (≤ 350 KB gzipped for default template)
- [ ] Zero new npm deps in `packages/theo/package.json` (everything uses Web Crypto + native fetch + hash-wasm already in workspace)
- [ ] CHANGELOG entry under `[Unreleased]` for the security hardening release

## Final Phase: Dogfood QA (MANDATORY)

See **Phase 8** above. Always full. No shortcuts. Plus the 9 manual steps.
