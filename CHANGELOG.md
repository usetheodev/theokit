# Changelog

Workspace-level changes for the `theokit` monorepo. Per-package changes live in each package's `CHANGELOG.md` (`packages/theo/CHANGELOG.md`, `packages/create-theo/CHANGELOG.md`).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
