# Plan: TheoKit → Next.js-level Technical Maturity

> **Version 1.1** — Edge-case review applied: 4 MUST FIX incorporated (EC-1 CSRF warn-first rollout, EC-2 CSP report-only-first, EC-3 client-side matchRoutes safeguard, EC-4 WASM-Argon2). Promote TheoKit from "works for one happy-path example in dev" to "production-grade web framework with the technical maturity of Next.js 14+". This plan attacks 6 categories of real, observed gaps: hydration robustness, production runtime correctness, security baseline, code-splitting, observability, and template/fixture quality. Each task starts from evidence collected in this session's smoke (see Context). Outcome: a framework where shipping a real app is dull, not a debugging adventure.

## Context

**Evidence collected 2026-05-18 from a live smoke of `examples/agent-saas`:**

| Layer | Evidence | Problem |
|---|---|---|
| Type system | `tsc --noEmit` → 0 errors | OK |
| Unit + integration tests | `vitest run` → 1178/1178 | OK on paper, but ~80% are grep-structural tests, not functional. Only 5 of 24 fixtures have real integration tests. |
| Dogfood smoke | 41/41 | OK on paper, same caveat — most checks are file-existence + grep. |
| `index.html` audit across 20 files | **4 missing `<script src="/@theo/entry-client">`** (`saas` template, `theoui-autoinject` fixture, `ssr-streaming` fixture, `adapter-targets/_base`) | Silent dead-HTML failure — page renders SSR but zero JS executes. User in this session hit this exact bug in `agent-saas/index.html`. |
| Production build | `pnpm build && pnpm start` of `agent-saas` exits 0, page returns HTTP 200, has entry-client + hydration data script | Initial bundle = **688 KB** (>500 KB Vite warning). Code-splitting lost when we removed `lazy()` from route manifest to fix hydration bug #6 in last session. |
| Production runtime | Console logs `Error: React currently only supports piping to one writable stream.` on every request | `entry-server.ts` streaming path calls `pipe()` twice. Page still responds 200 by accident — fallback path catches it. |
| Hydration | 6 cascading bugs found and fixed in last session (defineAgentEndpoint signal, alias gaps, theoSrcDir, SSR/CSR tree mismatch, missing hydrationData, lazy routes) | **No regression test for any of them.** Bug #6 in particular is a one-line revert away from breaking again. |
| Security | `defineRoute` POST has no CSRF. PBKDF2 100k iters (OWASP recommends 600k+). Cookie `secure: false` always. No CSP/HSTS/X-Frame headers. | Demo SaaS has working auth but security baseline is below 2020 standards. |
| Observability | `req.start`/`req.end` JSON logs exist. No trace context propagation. No metrics. No correlation IDs through error path. | Cannot debug a real production incident with current logs. |
| Templates / fixtures browser test | `examples/agent-saas` validated end-to-end manually. The 5 templates (`default`, `dashboard`, `api-only`, `postgres`, `saas`) **were never opened in a real browser**. | Each could have its own version of bug #6 or the missing-script bug. |

**What "Next.js-level maturity" means concretely for this plan:**
1. Hydration "just works" — no 6-bug cascades.
2. Production build works correctly on every adapter.
3. Code-splitting is recovered.
4. Security headers + CSRF are default-on.
5. Observability has trace context, structured errors, and request correlation.
6. Every template and fixture has a real browser-level integration test (`gstack browse` or Playwright) — not just grep tests.
7. The framework auto-injects what users keep forgetting (entry-client script being the canonical example).

## Objective

**Done = ship `theokit@0.2.0` with the 7 maturity pillars below all passing real (not grep) tests, and ten fresh installs of every template booting cleanly in a real headless browser with onClick handlers attached.**

Specific measurable goals:
- Zero `index.html` files in templates/fixtures missing the entry-client script (enforced by build-time validator + auto-injection)
- Production SSR runs without React stream errors on every request
- Initial bundle ≤ 350 KB gzipped for `default` template (vs current 197 KB after the lazy regression — measure)
- All 5 templates pass a headless-browser smoke (page loads → click button → state updates) in CI
- CSRF default-on for state-mutating routes, with documented opt-out for explicitly-marked routes
- Structured logging emits `traceId` propagated from `cf-trace-id`/`x-request-id`/generated
- Default `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy` headers
- 6 regression tests — one per bug from last session

## ADRs

### D1 — Auto-inject the entry-client script via `transformIndexHtml`

**Decision:** The Vite plugin injects `<script type="module" src="/@theo/entry-client">` into `<body>` of every served HTML if the user did not already include it.

**Rationale:** This bug killed an hour of debugging in a live session. The script tag has exactly one correct form; making the user remember it offers zero value and infinite downside. Next.js never asks the user to remember the analogous step.

**Consequences:** Users keep authoring `index.html` like a normal HTML file but get the framework's JS for free. An explicit `<script src="/@theo/entry-client">` in the HTML is still honored (no double-injection). The validator emits a deprecation hint when the user wrote it manually — encouraging the more idiomatic shorter `index.html`.

### D2 — Restore code-splitting via SSR-aware lazy resolution (EC-3 safeguard)

**Decision:** Re-introduce `lazy()` for route components, but the entry-client pre-loads the matched-route modules BEFORE calling `hydrateRoot`. **Important (EC-3 safeguard):** the client derives the matched route IDs by calling `matchRoutes(routes, location.pathname)` locally — it does NOT trust the SSR-emitted `__theoMatchedRouteIds` blindly. The SSR hint is used only as a "warm start" optimization (begin fetching those modules in parallel as soon as the script tag loads), but the authoritative list for the pre-load gate comes from the client matcher. Pre-load gate has a 1500ms timeout → on timeout, fall back to client-only render with a logged warning. Better to lose hydration on one slow connection than to silently break every connection on a logic bug.

**Rationale:** The "static import everything" fix from last session made hydration correct but blew the initial bundle past 500 KB. Code-splitting is a Next.js table-stakes feature. Trusting the SSR hint blindly would re-introduce the original hydration bug under URL drift (trailing-slash redirect, browser auto-rewrite). Using `matchRoutes` on the client guarantees the IDs match what the router actually wants to render.

**Consequences:** Initial bundle returns to per-route splitting. Non-matched routes load on demand. Entry-client gains a small async pre-load step (with timeout). Server changes: entry-server still emits `__theoMatchedRouteIds` as a warm-start hint. Failure mode is graceful (CSR fallback) — never the original hydration cascade.

### D3 — CSRF protection: warn-first in 0.2.0, strict default in 0.3.0 (EC-1)

**Decision:** POST/PUT/PATCH/DELETE routes get CSRF validation, but in 0.2.0 the default mode is `'warn'`: missing/invalid token logs a `console.warn` in dev (and structured warning log in prod) but does NOT block the request. In 0.3.0, default flips to `'strict'` (returns 403). Explicit `security.csrf: 'strict' | 'warn' | 'off'` config available immediately.

**Rationale:** Original plan defaulted to strict, which would have silently broken every existing app using raw `fetch` for POSTs (including our own `agent-saas/app/page.tsx`). Warn-first gives a release of visibility before enforcement. Same pattern Next.js used for server-actions CSRF.

**Consequences:** Apps that don't migrate by 0.3.0 break. CHANGELOG calls out the timeline explicitly. The warn messages tell the developer exactly what to fix. `theoFetch` is auto-correct (sends token); apps using raw `fetch` get the warning and have one release window to migrate.

### D4 — Default security headers: CSP report-only in 0.2.0, enforce in 0.3.0 (EC-2)

**Decision:** The api-middleware emits `Strict-Transport-Security` (prod), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` immediately (no risk — these are additive). CSP is emitted as `Content-Security-Policy-Report-Only` in 0.2.0 — violations log to browser console + optional `report-uri` but DO NOT block scripts. Config flag `security.cspMode: 'enforce' | 'report-only' | 'off'` defaults to `'report-only'`. Additionally, the plugin auto-scans `index.html` for `<script src="https://...">` and appends those hosts to the default `script-src`.

**Rationale:** Original plan was enforce-by-default which would have silently broken every app with a Google Analytics tag, Stripe.js, etc. Report-only is the standard "soak" mechanism browsers themselves recommend — exposes violations without breaking anything. Auto-scan removes the most common false-positive.

**Consequences:** 0.2.0 users get CSP visibility without breakage. They have a full release window to add their CDNs to the allow-list explicitly. 0.3.0 flips to enforce. Inline scripts (`__staticRouterHydrationData`, `__theoMatchedRouteIds`) get a per-request `nonce` (already needed for Phase 4 anyway).

### D5 — Hash upgrade: PBKDF2 → Argon2id via WASM (EC-4)

**Decision:** Use `hash-wasm` (pure WASM Argon2id, zero native compilation) as the primary KDF. PBKDF2 stays for verification of legacy hashes (transparent re-hash on next login). NO native `@node-rs/argon2` because it fails to load on Alpine/Vercel-Edge/cold-start environments.

**Rationale:** PBKDF2 100k is below OWASP 2023 (recommends 600k+). Argon2id is OWASP-preferred. Native argon2 modules are fragile across deployment targets — `hash-wasm` runs anywhere a modern V8/Workerd runs. WASM perf is ~80% of native, still ~50x faster than PBKDF2 100k.

**Consequences:** Hash strings change format (`argon2id$…` instead of `pbkdf2$…`). Framework recognizes both and re-hashes on next login. No native module compilation step in any deployment pipeline. Documented in migration guide.

### D6 — Headless browser tests for every template + fixture

**Decision:** Add `tests/e2e/templates.spec.ts` (Playwright) that, for each template and each interactive fixture, scaffolds a project into `/tmp/`, runs `pnpm dev`, opens the page, clicks the primary action, and asserts state changed.

**Rationale:** 1178 unit tests pass while the live page was dead. Grep + structural tests miss the hydration class of bugs entirely. Playwright is the same tool Next.js uses for its own integration suite.

**Consequences:** CI gets a 2-3 minute browser-test stage. New cost: Playwright + Chromium download. Benefit: every template change gets validated against the only thing that matters — does it work in a browser. Templates can no longer regress to dead HTML silently.

### D7 — Trace context propagation + structured error envelopes

**Decision:** The framework reads `traceparent` (W3C Trace Context), `x-request-id`, or generates a ULID per request. The value is attached to `ctx.traceId` AND emitted on every log line AND every error envelope. Errors get a stable shape: `{ code, message, traceId, status }`.

**Rationale:** "Reproduce this in production" requires correlating client error → server log → DB query log. Without `traceId` propagation that takes hours. Next.js plus most observability vendors (Datadog, Honeycomb, OTLP) pivot on this exact field.

**Consequences:** Every log line gains a `traceId`. Every error response gains it (already had `requestId`; rename for consistency with OTel). Clients can include `traceparent` outbound. Server includes `x-trace-id` in every response so the browser DevTools can see it.

### D8 — Six explicit regression tests, one per bug fixed in last session

**Decision:** Each of the 6 bugs from the previous session gets a dedicated test in `tests/unit/regression-{N}-{slug}.test.ts`. The test is the smallest case that would have caught the bug.

**Rationale:** Without regression tests, the framework is one bad refactor from re-breaking. Of the 6 bugs only two were caught by any existing test pattern.

**Consequences:** ~6 new test files. Each runs in <100ms. Adds confidence that the cascade can't return.

## Dependency Graph

```
Phase 0 (evidence baseline)
        │
        ▼
Phase 1 (regression tests — lock in last session's fixes)
        │
        ▼
Phase 2 (transformIndexHtml auto-inject) ────┐
        │                                    │
        ▼                                    │
Phase 3 (SSR pipe-twice runtime bug fix)     │
        │                                    │
        ▼                                    │
Phase 4 (code-splitting back via pre-load)   │   ←── safe to parallelize after Phase 2
        │                                    │
        ▼                                    │
Phase 5 (CSRF default-on)                    │
        │                                    │
        ▼                                    │
Phase 6 (security headers)                   │
        │                                    │
        ▼                                    │
Phase 7 (observability — traceId + structured errors)
        │
        ▼
Phase 8 (Argon2id upgrade)
        │
        ▼
Phase 9 (template + fixture index.html audit + add missing scripts)  ←── runs in parallel with 2-8
        │
        ▼
Phase 10 (Playwright headless browser tests for all 5 templates)
        │
        ▼
Phase 11 (Dogfood QA — including new Playwright stage)
```

- **Phase 1** is independent and can start immediately.
- **Phase 2** unblocks Phases 3-8 (auto-inject removes a class of failures the later phases assume isn't there).
- **Phase 9** can run in parallel with 2-8 since it's just data-fixing the 4 known-bad files.
- **Phase 10** depends on Phase 9 (templates need to boot) and Phase 2 (script tag must be guaranteed).
- **Phase 11** is the final gate.

---

## Phase 1: Regression Tests for the 6 Hydration Bugs

**Objective:** Lock in every fix from the last session so refactors can't silently re-break them.

### T1.1 — Regression: defineAgentEndpoint accepts Node IncomingMessage

#### Objective
Prove `defineAgentEndpoint`'s SSE stream still produces events when invoked with a Node `IncomingMessage` (which has `.aborted` flag instead of `.signal`), not just a Web `Request`.

#### Evidence
Last session, `defineAgentEndpoint` returned an empty body in production because `request.signal.aborted` threw on IncomingMessage. The `resolveAbortSignal()` helper now exists in `packages/theo/src/server/define-agent-endpoint.ts` but has no dedicated test.

#### Files to edit
```
tests/unit/regression-1-define-agent-endpoint-incoming-message.test.ts — (NEW)
```

#### Deep file dependency analysis
- The test imports `defineAgentEndpoint` from `packages/theo/src/server/define-agent-endpoint.ts` directly.
- It creates a fake IncomingMessage-shaped object (only `.aborted` and `.on`) and passes it as `request` to the route handler.
- No production code change — pure test.

#### Deep Dives
The fake IncomingMessage must have:
- `aborted: false` initially
- `on(event, cb)` method that registers a callback (so the abort-listener registration doesn't throw)
- NO `.signal` property

Edge case: invocation should yield all 3 mock events and the stream should close cleanly. Toggling `aborted = true` on the fake AND calling the `close` listener should stop iteration within 100 ms.

#### Tasks
1. Create the test file
2. Define a `makeNodeRequest()` helper that returns the fake IncomingMessage shape
3. Run the handler, read the SSE stream via `response.body.getReader()`
4. Assert all 3 events arrive
5. Add a second scenario: fire the `close` event mid-stream, assert stream closes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_emits_events_when_request_is_node_incoming_message() — Given fake IncomingMessage, When handler invoked, Then 3 SSE chunks emitted (MUST fail if the resolveAbortSignal helper is reverted)
RED:     test_node_close_event_aborts_stream() — Given fake IncomingMessage, When `close` event fires after 1st chunk, Then stream closes within 200ms
RED:     test_aborted_flag_set_initially_closes_immediately() — Given fake IncomingMessage with aborted=true, When handler invoked, Then ReadableStream closes with 0 chunks
RED:     test_web_request_path_still_works() — Given real Web Request, When handler invoked, Then 3 SSE chunks emitted (proves the fix didn't break the original code path)
GREEN:   Helper already exists in production code — the test passes by virtue of the existing fix.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/regression-1-define-agent-endpoint-incoming-message.test.ts
```

BDD scenarios:
- **Happy path** — IncomingMessage works, all 3 events emit
- **Validation error** — N/A (no input validation in this path)
- **Edge case** — already-aborted IncomingMessage → 0 chunks
- **Error scenario** — `close` event mid-stream → stream closes promptly

#### Acceptance Criteria
- [ ] Test file exists
- [ ] All 4 scenarios are explicit `it()` blocks
- [ ] Test would fail if `resolveAbortSignal` is reverted to inline `request.signal.aborted`
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Tests committed
- [ ] Tests run in <100ms total

---

### T1.2 — Regression: Vite plugin aliases cover all subpaths

#### Objective
Ensure the Vite plugin emits aliases for `theokit/server`, `theokit/client`, `theokit/react-query`, `theokit/vite-plugin`, `theokit/adapters/web-shim`, `theokit/adapters/ws-shim`, AND the bare `theokit` — in that order, so the bare alias doesn't shadow.

#### Evidence
Last session, `theokit/client` failed to resolve at runtime because only `theokit/server` and `theokit` had aliases. The bare `theokit` matched anything starting with `theokit/` and produced a broken path.

#### Files to edit
```
tests/unit/regression-2-vite-plugin-aliases.test.ts — (NEW)
```

#### Deep file dependency analysis
- Test calls `theoPlugin()` (the Vite plugin factory), invokes its `config()` lifecycle hook with a fake context, inspects the returned `resolve.alias` array.
- Asserts: presence + order of all 7 aliases.

#### Deep Dives
The alias array must satisfy:
- Length ≥ 7
- The `theokit` (bare) alias is LAST
- Each subpath alias resolves to a real file under `dist/` (in built mode) or `src/` (in source mode)

Edge case: when running from source (the test environment), the alias paths should end in `.ts`; when running from dist, `.js`.

#### Tasks
1. Create test file
2. Call `theoPlugin()`, run `.config()`
3. Extract `resolve.alias`
4. Assert each subpath exists in the correct order
5. Assert the resolved path for `theokit/client` actually exists on disk

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_all_seven_aliases_present() — Given theoPlugin config, Then the alias array contains 7 entries with the expected `find` values
RED:     test_bare_theokit_alias_is_last() — Given alias array, Then `find: 'theokit'` is at the end (so subpaths match first)
RED:     test_theokit_client_alias_resolves_to_real_file() — Given alias for `theokit/client`, Then existsSync(replacement) === true
RED:     test_each_subpath_alias_points_to_correct_file() — For each of the 7 aliases, Then replacement path ends in either `index.ts` or `index.js` AND existsSync is true
GREEN:   Aliases already exist in production code — test passes via existing fix.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/regression-2-vite-plugin-aliases.test.ts
```

BDD scenarios:
- **Happy path** — all 7 aliases present, ordered correctly
- **Validation error** — N/A (no user input)
- **Edge case** — bare `theokit` alias appearing before subpaths would fail the order check
- **Error scenario** — alias pointing to non-existent file fails the existsSync check

#### Acceptance Criteria
- [ ] All 4 scenarios pass
- [ ] Test fails if anyone removes a subpath alias or reorders bare-first
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Tests committed
- [ ] Runs in <50ms

---

### T1.3 — Regression: theoSrcDir detection works from both src and dist

#### Objective
Prove the alias-base-path detection picks `dist/` when running from `dist/chunk-XXX.js` and `src/` when running from `src/vite-plugin/index.ts`.

#### Evidence
The fix `existsSync(resolve(currentDir, 'client')) ? currentDir : resolve(currentDir, '..')` is in `packages/theo/src/vite-plugin/index.ts`. Untested.

#### Files to edit
```
tests/unit/regression-3-theo-src-dir-detection.test.ts — (NEW)
```

#### Deep file dependency analysis
- Test extracts the detection logic to a pure helper (refactor) OR exercises it indirectly by spying on alias output when the plugin is loaded from different paths.
- Pure refactor is cleaner: extract `resolveTheoRootDir(currentDir: string): string` to a module the test can import.

#### Deep Dives
Refactor needed: extract the detection out of `theoPlugin()` body into a top-level pure function `resolveTheoRootDir(currentDir)`. This makes it testable without spinning up a fake Vite plugin.

Cases to cover:
- `/abs/path/to/dist` exists with `client/` child → returns `/abs/path/to/dist`
- `/abs/path/to/src/vite-plugin` exists, `client/` is at `../client` → returns `/abs/path/to/src`
- `/abs/nonexistent/dist` (no `client/` child, but parent has it) → falls through

Use `mkdtempSync` to build a real directory tree per test.

#### Tasks
1. Refactor `packages/theo/src/vite-plugin/index.ts`: extract `resolveTheoRootDir` to top-level exported helper
2. Create regression test that builds 2 temp dir trees (one src-shaped, one dist-shaped) and asserts correct resolution
3. Assert both branches taken

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dist_shape_returns_currentDir() — Given a temp dir with `client/` inside, When resolveTheoRootDir invoked, Then returns that dir
RED:     test_src_shape_returns_parent() — Given a temp dir `src/vite-plugin/` with `src/client/` at parent, When resolveTheoRootDir invoked, Then returns parent
RED:     test_no_client_at_either_level_falls_back_to_parent() — Edge case: returns parent (the original behavior, used as last resort)
RED:     test_pure_function_no_side_effects() — Calling twice returns same value
GREEN:   Refactor extracts function, body unchanged.
REFACTOR: Remove inline detection from `theoPlugin()`, replace with `resolveTheoRootDir(currentDir)`.
VERIFY:  npx vitest run tests/unit/regression-3-theo-src-dir-detection.test.ts
```

BDD scenarios:
- **Happy path** — dist shape detected
- **Validation error** — N/A
- **Edge case** — non-existent path falls back gracefully
- **Error scenario** — refactor must preserve behavior (no Vite plugin changes externally)

#### Acceptance Criteria
- [ ] `resolveTheoRootDir` is exported and pure
- [ ] All 4 scenarios pass
- [ ] `theoPlugin()` no longer contains inline existsSync detection
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Refactor committed
- [ ] Tests green
- [ ] No regression in `tests/unit/vite-plugin-*` existing suite

---

### T1.4 — Regression: SSR and CSR React trees are identical

#### Objective
Prove the React tree emitted by `entry-server` (`StaticRouterProvider` wrapped in `TheoUIProvider` + `Suspense`) is structurally identical to the tree emitted by `entry-client` (`RouterProvider` wrapped in the same).

#### Evidence
Last session, the trees differed (`StaticRouterProvider` raw on server vs full wrap on client). React detected hydration mismatch, fell back to client-only render, handlers were lost.

#### Files to edit
```
tests/unit/regression-4-ssr-csr-tree-mirror.test.ts — (NEW)
```

#### Deep file dependency analysis
- Test calls `generateEntryServer({ theoUi: { theme: 'noir' } })` and `generateEntryClient(true, { theoUi: { theme: 'noir' } })`.
- Extracts the React.createElement structure from each as a normalized string (sequence of `TheoUIProvider`, `Suspense`, `RouterProvider | StaticRouterProvider`).
- Asserts the sequence matches in order and depth.

#### Deep Dives
Parse the generated JS strings looking for the `React.createElement(...)` sequence. Use a regex or simple state machine. Outputs to compare:

Server: `TheoUIProvider, Suspense, StaticRouterProvider`
Client: `TheoUIProvider, Suspense, RouterProvider`

The only allowed difference is the leaf component (StaticRouterProvider vs RouterProvider). Wrapping components must match.

Cases:
- `theoUi` enabled → both have TheoUIProvider at outermost
- `theoUi` disabled → neither has TheoUIProvider, both start with Suspense
- Themes match (`noir` in both outputs)

#### Tasks
1. Create test file
2. Write a tiny parser `extractWrapSequence(generatedJs: string): string[]`
3. Compare server vs client sequences across enabled/disabled theoUi

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_trees_match_with_theoUi_enabled() — Given theoUi: { theme: 'noir' }, When both entries generated, Then wrap sequence is identical except leaf
RED:     test_trees_match_with_theoUi_disabled() — Given no theoUi, Then both start with Suspense
RED:     test_theme_value_consistent_across_entries() — Given theme: 'paper', Then both contain `'paper'`
RED:     test_leaf_components_differ_correctly() — Given enabled, server uses StaticRouterProvider AND client uses RouterProvider
GREEN:   Code already matches — test passes via existing fix.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/regression-4-ssr-csr-tree-mirror.test.ts
```

BDD scenarios:
- **Happy path** — enabled trees match
- **Validation error** — N/A
- **Edge case** — disabled trees also match (no TheoUIProvider)
- **Error scenario** — leaf component differs as required (NOT a bug, this is correct)

#### Acceptance Criteria
- [ ] Sequence comparison helper extracted and tested
- [ ] All 4 scenarios pass
- [ ] Test would fail if someone reverted entry-server to raw StaticRouterProvider
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Tests committed
- [ ] <100ms runtime

---

### T1.5 — Regression: entry-client passes hydrationData to createBrowserRouter

#### Objective
Prove `generateEntryClient(true, ...)` (SSR=true) emits `createBrowserRouter(routes, { hydrationData: window.__staticRouterHydrationData })`, and `generateEntryClient(false, ...)` does NOT.

#### Evidence
Without `hydrationData`, the browser router boots fresh and ignores server-emitted state. Last session bug, now fixed in `packages/theo/src/router/entry.ts`.

#### Files to edit
```
tests/unit/regression-5-hydration-data-wired.test.ts — (NEW)
```

#### Deep file dependency analysis
- Test calls `generateEntryClient(true)` and `generateEntryClient(false)`.
- Greps each output for the exact `hydrationData: window.__staticRouterHydrationData` string.

#### Deep Dives
Assertions:
- `ssr=true` → output contains `hydrationData: window.__staticRouterHydrationData`
- `ssr=false` → output does NOT contain that string (CSR mode, fresh router)
- Both outputs still contain `createBrowserRouter(routes`

Edge case: switching SSR on/off must change only that line — no other diff.

#### Tasks
1. Create test
2. Two assertion blocks (ssr=true, ssr=false)
3. One assertion that the rest of the file is otherwise identical

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_ssr_true_wires_hydrationData() — Given ssr=true, Then output contains `hydrationData: window.__staticRouterHydrationData`
RED:     test_ssr_false_no_hydrationData() — Given ssr=false, Then output does NOT contain that string
RED:     test_createBrowserRouter_called_in_both_modes() — Both modes call createBrowserRouter
RED:     test_only_one_line_diff_between_modes() — diff between ssr=true and ssr=false outputs is exactly the hydration line
GREEN:   Already fixed.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/regression-5-hydration-data-wired.test.ts
```

BDD scenarios:
- **Happy path** — SSR mode wires hydrationData
- **Validation error** — N/A
- **Edge case** — CSR mode skips hydrationData (correct behavior)
- **Error scenario** — diff confined to one line; any other drift fails the test

#### Acceptance Criteria
- [ ] Tests cover both modes
- [ ] Test fails if hydrationData line removed
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Tests committed
- [ ] <50ms runtime

---

### T1.6 — Regression: Route manifest uses static imports (not lazy)

#### Objective
Prove `generateRouteManifest` emits `import X from '...'` lines, never `lazy(() => import('...'))`.

#### Evidence
Last session, `lazy()` caused Suspense to fire during hydration, replacing SSR DOM with the (null) fallback, killing handlers. Switched to static imports in `packages/theo/src/router/generate.ts`. Without a test, a future "we should code-split" PR could revert this and break hydration.

#### Files to edit
```
tests/unit/regression-6-route-manifest-static-imports.test.ts — (NEW)
```

#### Deep file dependency analysis
- Test calls `generateRouteManifest(tree)` with a minimal tree shape.
- Greps output for `lazy(` — must be 0 matches.
- Greps for `^import [A-Z]` static imports — must equal the number of route files in the tree.

#### Deep Dives
Edge: the `import React, { Suspense } from 'react'` line is allowed (uppercase R isn't a route component). Use `^import [A-Z][a-z]_` pattern (the safeVarName scheme: `Page_root`, `Layout_root`, …).

#### Tasks
1. Create minimal RouteNode tree fixture
2. Call generateRouteManifest
3. Assert no `lazy(`
4. Assert static imports match number of files in tree

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_no_lazy_in_manifest_output() — Given any tree, Then output.includes('lazy(') === false
RED:     test_static_import_count_matches_files() — Given tree with 3 files, Then output has 3 `import VarName from` lines
RED:     test_react_import_present() — Output starts with `import React, { Suspense } from 'react'` (Suspense still needed for loading.tsx)
RED:     test_lazy_keyword_not_imported_either() — Output does NOT import `lazy` from react
GREEN:   Already fixed.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/regression-6-route-manifest-static-imports.test.ts
```

BDD scenarios:
- **Happy path** — static imports only
- **Validation error** — N/A
- **Edge case** — empty tree → no imports, no lazy
- **Error scenario** — Future PR adds `lazy()` back → test fails immediately

#### Acceptance Criteria
- [ ] No `lazy(` in output for any tree shape
- [ ] Static imports count matches files
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Tests committed
- [ ] <50ms runtime

---

## Phase 2: Auto-Inject `<script src="/@theo/entry-client">` (D1)

**Objective:** The framework's Vite plugin guarantees the entry-client script tag is in every served HTML. Users can't forget it.

### T2.1 — `transformIndexHtml` hook in vite-plugin

#### Objective
The Theo Vite plugin implements Vite's `transformIndexHtml` hook to inject the entry-client `<script>` before `</body>` when absent.

#### Evidence
Live session: user's `examples/agent-saas/index.html` was missing the script — page rendered SSR perfectly but every button was dead HTML. Also: 4 of 20 audited HTML files in templates/fixtures are missing the script too.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts — add transformIndexHtml hook
tests/unit/vite-plugin-transform-index-html.test.ts — (NEW)
```

#### Deep file dependency analysis
- Plugin gains a new hook. `transformIndexHtml(html, ctx)` receives the raw HTML and returns the transformed HTML or a Vite-shaped object.
- Behavior: if HTML already contains `/@theo/entry-client` → return unchanged. Else inject `<script type="module" src="/@theo/entry-client"></script>` before `</body>` (case-insensitive).
- If no `</body>` at all → inject at end (warn in dev).

#### Deep Dives
Edge cases:
- Two `</body>` tags (malformed HTML) → inject before the FIRST one
- HTML already has the script with different formatting (`<script src='/@theo/entry-client' type='module'>`) → recognize it via URL substring match, don't double-inject
- HTML with `</body>` inside a comment or string → false positive risk; for v1, accept the risk (Vite/Next both do)
- Production build (`apply: 'serve' | 'build'`) — must run in both modes; `build` writes the final HTML

Vite `transformIndexHtml` order: this should run BEFORE Vite's own injection of its dev client, so we don't insert AFTER `</body>`. Use `order: 'pre'`.

#### Tasks
1. Add `transformIndexHtml` hook to plugin
2. Implement the inject logic (pure function `injectEntryClient(html: string): string`)
3. Wire into plugin
4. Unit test the pure function with 5 cases (already-present, missing, no-body, malformed, edge variants)
5. Integration test: run dev server with empty `index.html`, fetch `/`, assert script present

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_injects_script_when_missing() — Given `<body><div id="root"></div></body>`, When transformed, Then output contains `<script type="module" src="/@theo/entry-client"></script>` before </body>
RED:     test_no_double_injection_when_present() — Given HTML with script already, When transformed, Then unchanged
RED:     test_recognizes_variant_quoting() — Given HTML with `<script src='/@theo/entry-client'>`, When transformed, Then unchanged (recognized via URL substring)
RED:     test_handles_missing_body_tag() — Given HTML with no `</body>`, When transformed, Then script appended at end + warning logged
RED:     test_dev_and_build_both_inject() — Both `apply: 'serve'` and `apply: 'build'` paths inject the script
GREEN:   Implement `injectEntryClient(html)` + wire hook.
REFACTOR: Extract pattern matching to constants if reused.
VERIFY:  npx vitest run tests/unit/vite-plugin-transform-index-html.test.ts
```

BDD scenarios:
- **Happy path** — bare HTML gets the script
- **Validation error** — N/A
- **Edge case** — malformed HTML (no `</body>`) → still injects, warns
- **Error scenario** — duplicate detection works under all quoting styles

#### Acceptance Criteria
- [ ] `injectEntryClient` is a pure exported function
- [ ] 5 test scenarios pass
- [ ] Integration test in `tests/integration/auto-inject-entry-client.test.ts` spins up dev server, asserts script in served HTML
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green
- [ ] No regression in existing `tests/integration/onda*` integration suite

#### DoD
- [ ] Hook implemented and wired
- [ ] Both unit and integration tests green
- [ ] Documented in CHANGELOG as "now automatic, no need to write the script tag yourself"

---

## Phase 3: Fix Production SSR `pipe()` Twice Bug

**Objective:** Eliminate the `Error: React currently only supports piping to one writable stream` that fires on every production request.

### T3.1 — Investigate and fix the double-pipe in entry-server

#### Objective
The `entry-server.ts` streaming path emits `onAllReady() { pipe(passthrough) }` AND, in production, the framework ALSO pipes the stream into the HTTP response. The `pipe()` is invoked twice on the same `renderToPipeableStream` result.

#### Evidence
```
[SSR Error] Error: React currently only supports piping to one writable stream.
    at pipe (react-dom-server.node.development.js:10479:19)
    at onAllReady (file:///.../examples/agent-saas/.theo/server/entry-server.js:1605:9)
```

The error is benign in practice (page still returns 200) because Node swallows the second pipe call — but it spams logs and indicates a real architectural issue.

#### Files to edit
```
packages/theo/src/router/entry-server.ts — entry-server generator
packages/theo/src/cli/commands/start.ts — production server (might be the second piper)
tests/integration/regression-prod-no-pipe-twice.test.ts — (NEW)
```

#### Deep file dependency analysis
- The entry-server `render()` calls `pipe(passthrough)` to accumulate HTML to a string.
- The production CLI `start.ts` reads the string result and writes it to response.
- BUT: the streaming generator path emits `pipe(passthrough)` AND `pipe(response)` in different code paths — needs audit.

Audit step: read both files end-to-end, identify both pipe call sites, eliminate the redundant one.

#### Deep Dives
Two acceptable resolutions:
1. **Single-shot** (current state, broken): `render()` writes to a string buffer, `start.ts` writes the string to response. Only the buffer piping should call `pipe()`.
2. **True streaming**: `render()` returns the pipeable stream, `start.ts` calls `pipe(response)`. The buffer accumulation is removed entirely.

(2) is the right long-term answer — streaming SSR is the whole point — but requires `start.ts` rework. (1) is the safe fix to ship now.

For this task, go with (1): make sure exactly one `pipe()` call happens per request.

#### Tasks
1. Read entry-server.ts top-to-bottom, find all pipe call sites
2. Read start.ts, find pipe usage there
3. Identify the redundancy
4. Pick path (1) → make render's pipe the only one
5. Write integration test that fetches `/` 5 times in a production server and asserts NO "React currently only supports piping" in stderr

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_production_request_emits_no_react_pipe_error() — Given production server, When fetching / 5 times, Then stderr contains 0 occurrences of `React currently only supports piping`
RED:     test_production_response_is_200() — Given prod server, When fetching /, Then status 200
RED:     test_response_body_is_html() — Given prod server, When fetching /, Then Content-Type starts with `text/html`
RED:     test_response_includes_hydration_script() — Given prod /, Then HTML body contains `__staticRouterHydrationData`
GREEN:   Make exactly ONE pipe call per request in the active code path.
REFACTOR: Document in entry-server.ts WHY one pipe (link to this task).
VERIFY:  npx vitest run tests/integration/regression-prod-no-pipe-twice.test.ts
```

BDD scenarios:
- **Happy path** — single pipe call, clean stderr
- **Validation error** — N/A
- **Edge case** — concurrent requests don't cross-contaminate streams
- **Error scenario** — if a future refactor adds a second pipe, test fails immediately

#### Acceptance Criteria
- [ ] Test passes (zero pipe errors)
- [ ] Production server still works end-to-end (200 + HTML + script)
- [ ] No regression in existing prod-build tests
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Bug fixed
- [ ] Test catches future regressions
- [ ] CHANGELOG: "Fixed double-pipe error in production SSR (#X)"

---

## Phase 4: Restore Code-Splitting (D2)

**Objective:** Re-introduce per-route lazy loading WITHOUT breaking hydration. Initial bundle target: ≤ 350 KB gzipped for the default template.

### T4.1 — SSR-aware pre-load before hydrate

#### Objective
Entry-server emits the list of matched-route module IDs. Entry-client pre-loads those modules (and only those), then calls `hydrateRoot`. Non-matched routes stay `lazy()`.

#### Evidence
Current state: `route-manifest.tsx` emits static imports for every route → 688 KB initial bundle (vs ~200 KB target). Per-route code splitting is a Next.js table-stakes feature.

#### Files to edit
```
packages/theo/src/router/generate.ts — emit lazy() with a pre-load registry
packages/theo/src/router/entry-server.ts — emit `<script>window.__theoMatchedRouteIds = [...]</script>` based on the matched route
packages/theo/src/router/entry.ts — entry-client awaits pre-loads before hydrateRoot
tests/unit/code-split-aware-hydrate.test.ts — (NEW)
tests/integration/regression-code-split-hydration.test.ts — (NEW)
```

#### Deep file dependency analysis
- `generate.ts` emits BOTH a static import for layout (always-needed) AND `lazy()` for pages (per-route). Plus a sidecar map `__theoPreloadMap: Record<routeId, () => Promise<unknown>>` so the client can drive pre-load by ID.
- `entry-server.ts` reads `context.matches` from `staticHandler.query()` and emits `<script>window.__theoMatchedRouteIds = [...ids]</script>`.
- `entry.ts` (client) calls `await Promise.all(matchedIds.map(id => __theoPreloadMap[id]()))` BEFORE `hydrateRoot`. Outer Suspense fallback no longer fires.

#### Deep Dives
Module ID scheme: use the route's `path` (e.g. `/conversations/[id]`) as the stable ID. The route manifest builds the preload map keyed by this ID.

Edge cases:
- Matched route fails to load (network glitch) → fall back to client-side render, log error
- No matched routes (404) → no pre-load, render NotFound directly
- Multiple route segments matched (nested routes) → pre-load all of them in parallel

This change touches THREE files and is the largest refactor in the plan. Should be split into sub-tasks if too risky.

#### Tasks
1. Define preload map shape in `route-manifest.ts`
2. Update `generate.ts` to emit lazy() pages + the preload map
3. Update `entry-server.ts` to emit `__theoMatchedRouteIds` from context matches
4. Update `entry.ts` (client) to await preloads
5. Write unit test for generate (lazy + map structure)
6. Write integration test: fresh build, fetch /, check JS bundle size and runtime behavior

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_manifest_emits_lazy_for_pages() — Given tree, Then output contains `lazy(() => import(`
RED:     test_manifest_emits_preload_map() — Given tree with N routes, Then output exports `__theoPreloadMap` with N entries keyed by routeId
RED:     test_layout_is_static_import() — Layout still uses `import X from` (always-needed)
RED:     test_entry_server_emits_matched_ids() — Given matched context, Then HTML contains `window.__theoMatchedRouteIds = [...]`
RED:     test_entry_client_awaits_preloads_before_hydrate() — generated client code contains `await Promise.all(__theoMatchedRouteIds.map(...))`
RED:     test_prod_build_initial_bundle_below_target() — After build, gzipped initial bundle of default template ≤ 350 KB
RED:     test_real_browser_button_click_works_with_code_split() — Playwright spins up the prod app, clicks a button, asserts state change (proves hydration STILL works with code-split)
GREEN:   Implement all three file changes.
REFACTOR: Extract preload helper to reusable client utility.
VERIFY:  npx vitest run tests/unit/code-split-aware-hydrate.test.ts && npx vitest run tests/integration/regression-code-split-hydration.test.ts
```

BDD scenarios:
- **Happy path** — preload completes, hydrate runs, button works
- **Validation error** — N/A
- **Edge case** — non-matched routes stay lazy, never loaded on initial
- **Error scenario** — preload fails → fallback client render with logged error (no broken page)

#### Acceptance Criteria
- [ ] 7 test scenarios pass
- [ ] Initial bundle size drops below 350 KB gzipped for default template
- [ ] Browser-level button click still works (Playwright)
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green
- [ ] Existing tests still pass (no regression in entry generation tests)

#### DoD
- [ ] All file changes committed
- [ ] All tests green
- [ ] Bundle size budget enforced in CI (Phase 11)
- [ ] CHANGELOG entry

---

## Phase 5: CSRF Default-On (D3)

**Objective:** State-mutating routes (POST/PUT/PATCH/DELETE) are CSRF-protected by default. Public webhooks can opt out.

### T5.1 — CSRF token issuance + verification middleware

#### Objective
Framework emits a per-session CSRF token, validates it on every state-mutating route. Configurable opt-out per route.

#### Evidence
`defineRoute({ body: ... })` POSTs are accepted from any origin with any auth cookie. `defineAction` already has CSRF — `defineRoute` is the gap. Demo SaaS forms in the live session POSTed without any CSRF guard.

#### Files to edit
```
packages/theo/src/server/csrf.ts — extend existing CSRF helper to cover defineRoute paths
packages/theo/src/server/execute.ts — call CSRF check before handler for state-mutating methods
packages/theo/src/server/define-route.ts — add `csrf?: false` opt-out type
packages/theo/src/client/theo-fetch.ts — auto-attach CSRF header
tests/unit/regression-csrf-default-on.test.ts — (NEW)
tests/integration/csrf-protection.test.ts — (NEW)
```

#### Deep file dependency analysis
- `csrf.ts` likely already has `issueCsrfToken` and `verifyCsrfToken` from the action path. Reuse them.
- `execute.ts`: in the `METHODS_WITH_BODY` block, before handler invocation, check the CSRF header (default header name: `x-csrf-token`).
- `define-route.ts`: type signature gains optional `csrf?: false`.
- `theo-fetch.ts`: reads the cookie OR a `<meta name="csrf-token">` tag in the page, attaches `x-csrf-token` header to non-GET requests.

#### Deep Dives
Token storage: per-session, double-submit cookie pattern. Same encryption as session manager (uses the same SECRET).

Cookie name: `theo_csrf`. Path: `/`. SameSite: `lax`. HttpOnly: false (must be readable by JS to send back).

Opt-out cases (legitimate):
- Webhooks from third parties (Stripe, GitHub)
- OAuth callbacks
- Public read-only endpoints (but those are GETs, no CSRF needed anyway)

Edge cases:
- Form submit via classic HTML form (no theoFetch) → must include a hidden `<input name="_csrf">` OR the response includes the token via `<meta>` for the client to grab
- Multi-tab — token shared across tabs OK
- Token mismatch → 403 with `{ code: 'CSRF_INVALID' }`

#### Tasks
1. Audit `csrf.ts` for existing helpers
2. Add `requireCsrf(req): void` middleware-like helper
3. Wire into `execute.ts` for state-mutating methods (skip if `routeConfig.csrf === false`)
4. Extend `defineRoute` types
5. Add token-emission to context creation
6. Auto-attach in `theo-fetch.ts`
7. Update `agent-saas` example to use `theoFetch` (already does, but verify CSRF header is sent)
8. Unit test
9. Integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_post_without_csrf_returns_403() — Given POST /api/login without csrf header, Then 403 + code CSRF_INVALID
RED:     test_post_with_valid_csrf_returns_200() — Given POST with valid csrf token, Then handler runs, 200
RED:     test_opt_out_route_accepts_without_csrf() — Given route with csrf: false, Then POST without token still 200
RED:     test_get_route_never_checks_csrf() — Given GET, Then no CSRF check (safe method)
RED:     test_theoFetch_auto_attaches_csrf_header() — Client code, given fetch from page with meta tag, Then request has x-csrf-token
RED:     test_token_persists_across_requests() — Given two POSTs in same session, Then same token works for both
GREEN:   Implement CSRF middleware + wire into execute + extend types.
REFACTOR: Extract opt-out documentation comment to a constant.
VERIFY:  npx vitest run tests/unit/regression-csrf-default-on.test.ts && npx vitest run tests/integration/csrf-protection.test.ts
```

BDD scenarios:
- **Happy path** — CSRF token round-trips through theoFetch
- **Validation error** — missing/invalid token → 403
- **Edge case** — `csrf: false` opt-out works
- **Error scenario** — expired token → 403 with clear code

#### Acceptance Criteria
- [ ] 6 scenarios pass
- [ ] Existing routes still work (theoFetch auto-attaches)
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green
- [ ] CSRF is documented as "default on; opt-out per route with `csrf: false`"

#### DoD
- [ ] CSRF wired
- [ ] All tests green
- [ ] Migration note in CHANGELOG (forms using raw fetch must either switch to theoFetch or read the meta tag)

---

## Phase 6: Default Security Headers (D4)

**Objective:** Every response carries OWASP-recommended security headers. Configurable.

### T6.1 — Security headers middleware

#### Objective
The api-middleware (which already wraps `/api/*`) sets default `Content-Security-Policy`, `Strict-Transport-Security` (prod only), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. Configurable via `theo.config.ts > security`.

#### Evidence
Today the framework emits zero security headers. `securityheaders.com` would grade F.

#### Files to edit
```
packages/theo/src/server/security-headers.ts — (NEW)
packages/theo/src/config/schema.ts — add `security` config field
packages/theo/src/vite-plugin/api-middleware.ts — apply headers
tests/unit/security-headers.test.ts — (NEW)
```

#### Deep file dependency analysis
- New `security-headers.ts` exposes `applySecurityHeaders(res: ServerResponse, config: SecurityConfig)`.
- `config/schema.ts` adds:
```ts
security: z.object({
  csp: z.union([z.string(), z.literal(false)]).optional(),
  hsts: z.union([z.string(), z.literal(false)]).optional(),
  frameOptions: z.enum(['DENY', 'SAMEORIGIN']).default('DENY'),
  contentTypeOptions: z.literal('nosniff').default('nosniff'),
  referrerPolicy: z.string().default('strict-origin-when-cross-origin'),
}).optional()
```
- `api-middleware.ts` applies headers before handler runs (so handler can override per-route if needed).

#### Deep Dives
Default CSP (development-friendly):
```
default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'
```

Per-request nonce: generated for the inline `__staticRouterHydrationData` script (used in Phase 4's `__theoMatchedRouteIds` script too).

HSTS: `max-age=31536000; includeSubDomains` in production only. Dev mode skips (localhost without TLS).

Edge cases:
- Setting `csp: false` → no CSP header (developer mode)
- Custom CSP string → used verbatim (user owns the policy)
- Multiple Content-Security-Policy headers → use one; framework's wins by default; user override via response headers takes precedence

#### Tasks
1. Implement `security-headers.ts`
2. Extend config schema
3. Wire into api-middleware
4. Generate per-request nonce, attach to context, use in inline script tags
5. Unit test default values
6. Integration test with `securityheaders.com`-equivalent scoring

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_headers_present() — Given default config, When GET /, Then response has CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
RED:     test_hsts_only_in_production() — Given NODE_ENV !== production, Then no HSTS header
RED:     test_csp_includes_per_request_nonce() — Given default CSP, Then header value contains `nonce-` and the same value appears on inline scripts in HTML
RED:     test_csp_false_disables_header() — Given config.security.csp = false, Then no CSP header
RED:     test_user_override_takes_precedence() — Given handler sets `res.setHeader('X-Frame-Options', 'SAMEORIGIN')`, Then response has SAMEORIGIN (not the default DENY)
GREEN:   Implement middleware + nonce + config + wire.
REFACTOR: Make CSP builder a pure function.
VERIFY:  npx vitest run tests/unit/security-headers.test.ts
```

BDD scenarios:
- **Happy path** — defaults applied
- **Validation error** — bad config rejected by Zod
- **Edge case** — opt-out (`csp: false`)
- **Error scenario** — N/A

#### Acceptance Criteria
- [ ] 5 scenarios pass
- [ ] securityheaders.com grade B+ minimum (A would need user opt-in for HSTS preload)
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Headers shipped
- [ ] Documented
- [ ] Live agent-saas verified with `curl -I` showing headers

---

## Phase 7: Observability — TraceId + Structured Errors (D7)

**Objective:** Every request has a propagated traceId. Every log line and error envelope includes it.

### T7.1 — TraceId propagation

#### Objective
Read `traceparent` (W3C Trace Context), fall back to `x-request-id`, fall back to generated ULID. Attach to `ctx.traceId`. Emit on every log line. Include in every error response. Set `x-trace-id` on response.

#### Evidence
Today the framework emits `requestId` (UUID) on errors only. No correlation between client error → server log → DB query. Next.js + most observability tools rely on W3C Trace Context.

#### Files to edit
```
packages/theo/src/server/trace-context.ts — (NEW)
packages/theo/src/server/context.ts? — N/A (user-owned)
packages/theo/src/server/middleware-runner.ts — attach traceId to ctx before middleware
packages/theo/src/server/logger.ts — include traceId in every log line
packages/theo/src/server/execute.ts — error envelope uses traceId
tests/unit/trace-context.test.ts — (NEW)
```

#### Deep file dependency analysis
- New module `trace-context.ts` exports `extractTraceId(req): string` and `formatTraceparent(traceId): string`.
- `middleware-runner.ts` calls `extractTraceId` and assigns to internal context — exposes `ctx.traceId` to handlers.
- `logger.ts` accepts a `traceId` argument on every log call.
- `execute.ts` error path uses `traceId` instead of (or alongside) `requestId`.

#### Deep Dives
`traceparent` header format: `00-{trace-id}-{span-id}-{flags}` (W3C). We extract `trace-id` (32 hex chars). Generate ULID (Crockford base32) when absent.

`x-trace-id` response header: stable across requests, makes browser DevTools usable for debugging.

Edge cases:
- Malformed `traceparent` → fall back to `x-request-id`
- Missing both → generate
- ULID generation: use built-in `crypto.randomUUID()` → rewrite as ULID format OR just use UUID (simpler, traceable in vendors that accept UUID)

#### Tasks
1. Implement `trace-context.ts`
2. Wire into middleware-runner
3. Update logger calls
4. Update error envelope schema
5. Unit test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_extracts_traceparent_when_present() — Given header `traceparent: 00-{32-hex}-{16-hex}-01`, When extractTraceId invoked, Then returns the 32-hex trace-id
RED:     test_falls_back_to_x_request_id() — Given no traceparent, Then uses `x-request-id`
RED:     test_generates_when_both_absent() — Given empty headers, Then returns a non-empty 32-char string
RED:     test_response_has_x_trace_id_header() — Given any GET /, Then response header `x-trace-id` matches request
RED:     test_error_envelope_includes_traceId() — Given handler throws, Then JSON response has `{ traceId: ... }`
RED:     test_log_line_includes_traceId() — Given any request, Then `req.start` and `req.end` log lines include `traceId`
GREEN:   Implement extract + wire.
REFACTOR: Centralize traceId field name as a constant.
VERIFY:  npx vitest run tests/unit/trace-context.test.ts
```

BDD scenarios:
- **Happy path** — traceparent flows from client → server → log → response
- **Validation error** — malformed traceparent → fall back gracefully
- **Edge case** — no headers at all → generated
- **Error scenario** — handler throws, error envelope has traceId

#### Acceptance Criteria
- [ ] 6 scenarios pass
- [ ] Backward compat: `requestId` still available on errors (aliased to traceId)
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] traceId flows end-to-end
- [ ] Documented
- [ ] Logs visibly include traceId in live test

---

## Phase 8: Argon2id Password Hashing (D5)

**Objective:** Upgrade demo password hashing to Argon2id with PBKDF2 fallback.

### T8.1 — Argon2id implementation + migration

#### Objective
`examples/agent-saas/server/password.ts` switches to argon2id via `@node-rs/argon2` (no native compile in many environments). Falls back to PBKDF2 if argon2 unavailable. Verifies legacy PBKDF2 hashes too (transparent re-hash on next login).

#### Evidence
PBKDF2 100k is below OWASP 2023. Argon2id is OWASP-preferred. Native argon2 is fast and has good Node bindings.

#### Files to edit
```
examples/agent-saas/server/password.ts — implement argon2 + legacy fallback
examples/agent-saas/package.json — add @node-rs/argon2 dep
tests/unit/example-agent-saas-password.test.ts — extend coverage
```

#### Deep file dependency analysis
- `password.ts` gains `hashPassword(plain)` → argon2id, `verifyPassword(plain, stored)` → routes by prefix (`argon2id$...` or `pbkdf2$...`).
- On `verifyPassword` success with PBKDF2 hash → return `{ ok: true, rehashAs: <new argon2id hash> }`. Login handler updates DB.

#### Deep Dives
Argon2id parameters (OWASP recommended for interactive):
- memory: 19 MiB (19456 KiB)
- iterations: 2
- parallelism: 1

Hash format: `argon2id$v=19$m=19456,t=2,p=1$<base64-salt>$<base64-hash>` (the argon2 standard format).

Edge cases:
- argon2 module unavailable → log warning, use PBKDF2 (existing impl)
- Legacy PBKDF2 hash → verify OK, return rehashAs

#### Tasks
1. Add `@node-rs/argon2` to example
2. Refactor password.ts with router by hash prefix
3. Add rehash flag to verifyPassword result
4. Login handler reads rehashAs, updates user row
5. Extend tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_argon2_hash_starts_with_argon2id_prefix() — Given hashPassword('x'), Then result starts with `argon2id$`
RED:     test_legacy_pbkdf2_hash_still_verifies() — Given an existing pbkdf2$ hash, Then verifyPassword returns ok: true
RED:     test_legacy_verify_returns_rehash_flag() — Given pbkdf2$ hash verify, Then result includes `rehashAs` argon2id hash
RED:     test_argon2_verify_does_not_rehash() — Given argon2id$ hash verify, Then no rehashAs (already current)
RED:     test_invalid_hash_format_returns_false() — Given garbage, Then verifyPassword returns false (no throw)
GREEN:   Implement.
REFACTOR: Extract hash-prefix routing to a small function.
VERIFY:  npx vitest run tests/unit/example-agent-saas-password.test.ts
```

BDD scenarios:
- **Happy path** — argon2 hash + verify cycle
- **Validation error** — malformed hash → false
- **Edge case** — legacy PBKDF2 still works AND returns rehash hint
- **Error scenario** — module unavailable → graceful fallback

#### Acceptance Criteria
- [ ] All 5 scenarios pass
- [ ] Demo user can log in with both old and new hash formats
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] Upgrade shipped in example
- [ ] Migration doc

---

## Phase 9: Template + Fixture HTML Audit (parallel)

**Objective:** Fix the 4 `index.html` files missing the entry-client script. After Phase 2's auto-injection, this is belt-and-suspenders — but still fix them so users reading templates as docs see the correct shape.

### T9.1 — Add `<script src="/@theo/entry-client">` to the 4 missing files

#### Objective
Fix the 4 files identified in evidence:
- `packages/create-theo/templates/saas/index.html`
- `fixtures/theoui-autoinject/index.html`
- `fixtures/ssr-streaming/index.html`
- `fixtures/adapter-targets/_base/index.html`

#### Evidence
Smoke audit showed 4 of 20 files missing the script. Each is a silent dead-HTML bug waiting to be triggered.

#### Files to edit
```
packages/create-theo/templates/saas/index.html — add script tag
fixtures/theoui-autoinject/index.html — add script tag
fixtures/ssr-streaming/index.html — add script tag
fixtures/adapter-targets/_base/index.html — add script tag
tests/unit/template-html-validator.test.ts — (NEW)
```

#### Deep file dependency analysis
- Each HTML file gains `<script type="module" src="/@theo/entry-client"></script>` before `</body>`.
- New validator test walks all `index.html` files in templates/ and fixtures/, asserts each contains the script.

#### Deep Dives
Validator must skip:
- `index.html` in `_base/` if Phase 2's transformIndexHtml is reliable AND we don't expect that file to be served standalone (decide: just include it for consistency)
- Negative-test fixtures (e.g., `invalid-no-app`) — actually those don't have index.html
- The actual production-build fixture's output `dist/index.html` (not source)

Glob: `{packages/create-theo/templates,fixtures,examples}/**/index.html` filtered to non-node_modules.

#### Tasks
1. Add script tag to each of the 4 files
2. Write validator test
3. Run test to confirm all green

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_all_template_index_html_have_entry_client_script() — Walk template dirs, assert each `index.html` contains `/@theo/entry-client`
RED:     test_all_example_index_html_have_entry_client_script() — Same for examples
RED:     test_all_fixture_index_html_have_entry_client_script() — Same for fixtures (excluding negative-test fixtures)
RED:     test_validator_finds_at_least_15_files() — Sanity: glob is finding the files (avoid false-positive empty pass)
GREEN:   Add script tag to each of the 4 missing files.
REFACTOR: Extract glob pattern to a constant.
VERIFY:  npx vitest run tests/unit/template-html-validator.test.ts
```

BDD scenarios:
- **Happy path** — all files have script
- **Validation error** — N/A
- **Edge case** — fixture without `index.html` is skipped
- **Error scenario** — any future file added without script → test fails

#### Acceptance Criteria
- [ ] 4 files fixed
- [ ] Validator green
- [ ] Validator runs in dogfood
- [ ] Pass: Vitest green

#### DoD
- [ ] Files updated
- [ ] Test green
- [ ] CHANGELOG entry

---

## Phase 10: Playwright Browser Tests for All Templates (D6)

**Objective:** Every template + key example boots in a real headless browser, button clicks work, state updates verified.

### T10.1 — Playwright spec for the 5 templates

#### Objective
`tests/e2e/templates.spec.ts` iterates `[default, dashboard, api-only, postgres, saas]`, scaffolds each into a temp dir, runs `pnpm dev`, opens the page, clicks the primary button, asserts something changed.

#### Evidence
Last session, button clicks were dead in dev — no test caught it because all tests were grep-structural. Real browser tests are the only way to catch hydration class of bugs.

#### Files to edit
```
playwright.config.ts — ensure baseURL config supports per-test dev server
tests/e2e/templates.spec.ts — (NEW)
tests/e2e/helpers/spawn-dev.ts — (NEW) — scaffold + dev-server helper
package.json — add `test:e2e:templates` script
```

#### Deep file dependency analysis
- `spawn-dev.ts`: `scaffoldTemplate(name)` calls the existing scaffold function with a tmp target, runs `pnpm install` (or `pnpm install --offline` if pnpm cache hits), starts `pnpm dev` on a port, returns `{ port, kill() }`.
- `templates.spec.ts`: 5 tests, one per template. Each: scaffold → dev → open → click primary → assert state changed → teardown.

#### Deep Dives
"Primary action" per template:
- `default`: send chat message → SSE response visible
- `dashboard`: navigate sidebar
- `api-only`: hit `/api/health`, expect JSON
- `postgres`: hit a route that touches DB (need a tmp DB or mock — out of scope, skip postgres template in v1)
- `saas`: sign in as demo, see dashboard

Postgres template special-case: requires a DB. Either skip or use a tmp in-memory pg (pg-mem). For v1, document as known limitation; run only on environments with Postgres available.

Edge cases:
- Port collision between tests → each picks port: 0
- Cleanup — tmp dirs not removed leak disk; ensure teardown
- CI flakiness — generous timeouts, retries on TimeoutError only

#### Tasks
1. Add Playwright config (probably already exists from existing fixture tests)
2. Implement spawn-dev helper
3. Write 4 of 5 specs (skip postgres v1)
4. Add npm script
5. Run locally to confirm green

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_template_button_works() — Scaffold default, dev, open /, click composer, assert SSE chunk received
RED:     test_dashboard_template_navigation_works() — Scaffold dashboard, open /, click sidebar link, assert URL change
RED:     test_api_only_template_health_works() — Scaffold api-only, dev, fetch /api/health, assert JSON
RED:     test_saas_template_demo_login_works() — Scaffold saas, dev, click "Sign in as demo", assert dashboard renders
RED:     test_each_template_has_no_console_errors() — During each test, capture console messages, assert no errors
GREEN:   Implement spec + helper.
REFACTOR: Extract common setup/teardown into beforeEach/afterEach.
VERIFY:  pnpm playwright test tests/e2e/templates.spec.ts
```

BDD scenarios:
- **Happy path** — each template's primary action works
- **Validation error** — N/A
- **Edge case** — postgres template skipped with explicit reason
- **Error scenario** — console errors fail the test

#### Acceptance Criteria
- [ ] 4 templates pass real-browser smoke
- [ ] Postgres skip documented
- [ ] No console errors
- [ ] CI integration (skip on environments without Chromium if needed)

#### DoD
- [ ] Specs written
- [ ] Local run green
- [ ] CHANGELOG note: "every template now passes browser-level integration test"

---

### T10.2 — Browser test for `examples/agent-saas`

#### Objective
Specific browser smoke for the agent-saas example: sign in as demo → land on dashboard → create conversation → send message → see streaming reply → verify message persisted.

#### Evidence
This example was the proving ground for the 6 fixed bugs. Lock its full flow as the canonical integration test.

#### Files to edit
```
tests/e2e/example-agent-saas.spec.ts — (NEW)
```

#### Deep file dependency analysis
- Requires a Postgres running locally on the test box. Document. Skip if unavailable.

#### Deep Dives
Steps:
1. Start docker postgres (or skip)
2. Push schema
3. Start dev
4. Open /
5. Click "Sign in as Demo"
6. Assert dashboard loaded
7. Click "Create" with a title
8. Open the new conversation
9. Type a message + click send
10. Assert at least 3 SSE events appeared in timeline
11. Reload page, assert messages persisted

#### Tasks
1. Spec
2. Postgres skip-helper
3. Schema push

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_agent_saas_full_flow() — Steps 1-11 above
RED:     test_streaming_chunks_arrive_in_order() — Capture network, assert SSE chunks order correct
RED:     test_persisted_after_reload() — Reload, assert messages in DOM
RED:     test_logout_clears_session() — After logout, /api/me returns 401
GREEN:   Implement.
REFACTOR: Extract common test helpers if reused.
VERIFY:  pnpm playwright test tests/e2e/example-agent-saas.spec.ts
```

BDD scenarios:
- **Happy path** — full flow
- **Validation error** — empty message rejected
- **Edge case** — reload persists state
- **Error scenario** — logout works

#### Acceptance Criteria
- [ ] 4 scenarios pass
- [ ] Skipped cleanly when Postgres unavailable
- [ ] No console errors

#### DoD
- [ ] Spec committed
- [ ] Documented as primary integration test for the framework

---

## Phase 11: Final Dogfood QA (MANDATORY)

**Objective:** Validate everything works end-to-end after all phases.

### Execution

```
/dogfood full
pnpm playwright test tests/e2e/templates.spec.ts
pnpm playwright test tests/e2e/example-agent-saas.spec.ts
```

### Acceptance Criteria

- [ ] `/dogfood full` health score ≥ 80/100
- [ ] Zero CRITICAL issues introduced by this plan
- [ ] All Playwright specs pass
- [ ] Initial bundle ≤ 350 KB gzipped for default template (D2 success measure)
- [ ] `securityheaders.com`-equivalent grade ≥ B+ for default template
- [ ] No "React only supports piping to one writable stream" in prod stderr
- [ ] CSRF default-on verified live (manual: GET token, POST without it → 403)
- [ ] traceId visible on every log line and error envelope (manual: tail logs during a real request)

### If Dogfood Fails

1. Triage: plan-caused vs pre-existing
2. Fix plan-caused CRITICAL + HIGH
3. Re-run
4. Pre-existing issues logged but do not block plan completion

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | 4 `index.html` files missing entry-client script (silent dead-HTML failures) | T2.1 + T9.1 | Auto-inject via Vite plugin + fix the 4 files explicitly |
| 2 | `pipe()` called twice in prod SSR | T3.1 | Refactor entry-server / start to single pipe |
| 3 | Lost code-splitting (688 KB initial bundle) | T4.1 (D2) | SSR-aware preload + lazy() for non-matched routes |
| 4 | `defineRoute` POST lacks CSRF | T5.1 (D3) | CSRF default-on with `csrf: false` opt-out |
| 5 | Zero security headers | T6.1 (D4) | Default CSP/HSTS/Frame/Referrer headers |
| 6 | No traceId / correlation in logs/errors | T7.1 (D7) | W3C Trace Context + propagation |
| 7 | PBKDF2 100k (below OWASP 2023) | T8.1 (D5) | Argon2id with PBKDF2 legacy fallback |
| 8 | 6 hydration bugs without regression tests | T1.1–T1.6 (D8) | One regression test per bug |
| 9 | No real-browser tests; all greps | T10.1 + T10.2 (D6) | Playwright on all templates + agent-saas |
| 10 | Bundle size has no budget | T10.1 + Phase 11 | Bundle budget asserted in test |

**Coverage: 10/10 gaps covered (100%)**

## Global Definition of Done

- [ ] All 11 phases complete
- [ ] All Vitest tests pass (existing + new regressions)
- [ ] All Playwright e2e tests pass
- [ ] Zero TypeScript errors (`npx tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] `/dogfood full` ≥ 80/100, zero CRITICAL
- [ ] Initial bundle ≤ 350 KB gzipped (default template)
- [ ] No React stream errors in prod stderr (5 consecutive requests)
- [ ] CSRF default-on, opt-out documented
- [ ] Default security headers shipped and verified
- [ ] traceId flows end-to-end (header → log → error envelope → response)
- [ ] CHANGELOG entry per phase
- [ ] Migration guide for breaking changes (CSRF, password hash format)
- [ ] `theokit@0.2.0` published to npm under `latest` tag (not `alpha`)
- [ ] Every template AND example has a Playwright spec asserting "click works"
- [ ] Six regression tests, one per bug from previous session

## Final Phase: Dogfood QA (already declared above as Phase 11)
