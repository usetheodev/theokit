# Edge Case Review — nextjs-maturity

**Data:** 2026-05-18
**Tasks analisadas:** 16 (11 phases)
**Edge cases encontrados:** 7 (MUST FIX: 4, SHOULD TEST: 2, DOCUMENT: 1)

## MUST FIX

### EC-1: CSRF default-on breaks every existing app using raw `fetch` for POST

- **Task afetada:** T5.1 (D3)
- **Família:** Backward compat
- **Cenário:** All apps that use `fetch('/api/whatever', { method: 'POST' })` instead of `theoFetch` start getting 403 the moment they upgrade. No migration window. The `agent-saas` example itself does this (`fetch('/api/login', ...)` in `app/page.tsx`).
- **Impacto:** Major breaking change with silent failure mode (user sees 403, doesn't know why).
- **Fix sugerido:** Add a 1-release deprecation window: in `0.2.0`, CSRF is opt-IN via `theo.config.ts > security.csrf: true`. In `0.3.0`, flip default to true. Document loudly in CHANGELOG. Alternatively: emit a `console.warn` in dev whenever a state-mutating request lacks the header → users see it during development. Pick the warn-first approach.
- **Plan amendment:** T5.1 changes: default behavior in 0.2.0 is "warn but don't block". Add `theo.config.ts > security.csrf: 'strict' | 'warn' | 'off'` (default `'warn'`). Document the flip-to-strict in 0.3.0 changelog.

### EC-2: Default CSP breaks every app using `<script>` inline OR third-party CDN scripts

- **Task afetada:** T6.1 (D4)
- **Família:** Backward compat / Security
- **Cenário:** Default CSP set to `script-src 'self' 'nonce-{nonce}'`. Any app that has `<script src="https://www.googletagmanager.com/gtag/js">` in `index.html`, or any inline `<script>` without nonce, breaks. Browser console fills with CSP violations and scripts don't run.
- **Impacto:** Same shape as EC-1 — silent failure for users.
- **Fix sugerido:** Default CSP is **report-only** (`Content-Security-Policy-Report-Only`) for one release. In 0.3.0, switch to enforcing. Also: framework auto-detects `<script>` tags in `index.html` and adds their domains to `script-src`. Document the manual escape hatch (`security.csp: 'off'`).
- **Plan amendment:** T6.1 changes: default mode is "report-only". Add a `security.cspMode: 'enforce' | 'report-only' | 'off'` (default `'report-only'`). Auto-scan `index.html` for `<script src="https://...">` and append the host to `script-src`.

### EC-3: Phase 4 (code-splitting back) is high-risk for hydration regression

- **Task afetada:** T4.1 (D2)
- **Família:** Type / Boundary
- **Cenário:** The new pre-load step has to await EXACTLY the matched-route IDs before hydrate. If the SSR-emitted `__theoMatchedRouteIds` list doesn't match what the client router decides to render (e.g., race condition, URL changed by browser auto-redirect, trailing slash mismatch), Suspense fires during hydration and we're back to the original bug.
- **Impacto:** Re-introduce the bug we just fixed in last session. Worst possible outcome.
- **Fix sugerido:** Two safeguards:
  1. The pre-load step uses the SAME route-matcher logic on the client (call `matchRoutes(routes, currentUrl)`) instead of trusting `__theoMatchedRouteIds` blindly. This avoids URL-drift races.
  2. The pre-load step has a 1500ms timeout. On timeout, fall back to client-only render (logged). Better to lose hydration on one slow connection than break every connection on a logic bug.
- **Plan amendment:** T4.1 task list adds: "use `matchRoutes(routes, location.pathname)` on the client to derive IDs; do NOT trust `__theoMatchedRouteIds` for correctness — use it only as a hint for which routes to start fetching first". Test scenario adds: `test_preload_timeout_falls_back_gracefully`.

### EC-4: Argon2id native module unavailable on Alpine / serverless cold-start environments

- **Task afetada:** T8.1 (D5)
- **Família:** Resource / Environment
- **Cenário:** `@node-rs/argon2` is a native module. On Alpine Linux (musl), some serverless platforms (Vercel Edge Functions), or fresh CI cold starts without native compiling, it fails to load. Demo app crashes on first `hashPassword` call.
- **Impacto:** Demo unbootable in common deployment targets.
- **Fix sugerido:** Use `hash-wasm` (pure WASM Argon2, no native compile) as the primary path. Falls back to PBKDF2 only when WASM is unavailable (very rare). This eliminates the native-module fragility entirely.
- **Plan amendment:** T8.1 changes: dep changes from `@node-rs/argon2` to `hash-wasm`. Verify on Alpine + Vercel Edge in T8.1 acceptance criteria.

## SHOULD TEST

### EC-5: TraceId — long-running connection (SSE) keeps the same traceId across all chunks

- **Task afetada:** T7.1
- **Família:** Timing
- **Teste sugerido:** `test_sse_stream_preserves_traceId_across_chunks` — Given an SSE stream emitting 10 chunks over 5 seconds, Then every log line for that request has the same traceId. Avoid the common bug where async work emits with a NEW traceId.

### EC-6: Playwright tests assume `pnpm dev` boots within 30s — flake risk on slow CI

- **Task afetada:** T10.1
- **Família:** Timing / Resource
- **Teste sugerido:** `spawnDev()` helper polls `/api/health` until 200 or 60s timeout. If 60s exceeded, fail the test with a clear "dev server didn't boot" message (not a generic Playwright timeout). Document expected boot time (~5-10s on M1, ~15-20s on shared CI).

## DOCUMENT

### EC-7: Phase 8 (Argon2id migration) — existing users sign in once before hash upgrades

- **Risco aceito:** During the rollout, existing PBKDF2-hashed users continue to verify with the legacy code path. The rehash happens on their next login. Until then, their stored hash is the old format. This is intentional (transparent migration) but should be called out in the migration guide so admins know to expect a slow conversion curve over weeks.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T4.1 (code-split-back) | 1 | 1 | 0 | 0 |
| T5.1 (CSRF default-on) | 1 | 1 | 0 | 0 |
| T6.1 (security headers) | 1 | 1 | 0 | 0 |
| T7.1 (traceId) | 1 | 0 | 1 | 0 |
| T8.1 (Argon2) | 2 | 1 | 0 | 1 |
| T10.1 (Playwright) | 1 | 0 | 1 | 0 |

**Veredicto:** **PLANO PRECISA DE AJUSTE** — 4 MUST FIX a incorporar.

## Mudanças requeridas no plano antes de salvar v1.1

1. **EC-1 (T5.1):** CSRF default in 0.2.0 = `'warn'` (not blocking). Flip to `'strict'` in 0.3.0. Add `security.csrf: 'strict' | 'warn' | 'off'` config.

2. **EC-2 (T6.1):** Default CSP mode = `'report-only'`. Auto-scan `index.html` `<script src="">` hosts and add to `script-src`. Add `security.cspMode: 'enforce' | 'report-only' | 'off'` config.

3. **EC-3 (T4.1):** Use `matchRoutes(routes, location.pathname)` on client (don't trust SSR hint blindly). Add `test_preload_timeout_falls_back_gracefully` scenario.

4. **EC-4 (T8.1):** Use `hash-wasm` (pure WASM) instead of `@node-rs/argon2` (native). Verify Alpine + Vercel Edge in acceptance.
