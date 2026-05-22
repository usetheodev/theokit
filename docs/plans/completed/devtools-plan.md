# Plan: TheoKit Devtools (v0 — Minimum In-Page Dev Overlay)

> **Version 1.0** — Ship the first in-page devtools surface for TheoKit dev mode: a floating chip + expandable panel with four tabs (Requests / Routes / Errors / Settings), auto-injected by the Vite plugin in dev only, rendered inside a Shadow DOM so it never collides with the user's app styles, and tree-shaken to a noop in production. The chip surfaces the data the framework already emits — `x-trace-id`, structured `csrf.warn` with `code`+`docsUrl`, route segments, request status/duration — that today only exists in stdout. Outcome: closing the biggest perceived gap vs Next.js (per `CLAUDE.md:191`) at a cost of one small dep (`goober ~1KB`) and ~ 22 new files under `packages/theo/src/devtools/`. Foundation for the 0.5.0+ "Production debugging story" (the dispatcher swaps sink — UI in dev, OTel exporter in prod).

## Context

What exists today:
- TheoKit ships everything an overlay would need to render, but with no surface to render into. Per-request:
  - `packages/theo/src/server/trace-context.ts` — W3C Trace Context propagation, `x-trace-id` header on every `/api/*` response (commits `cc464c0`, `f13b371`, `3ee9dac` shipped in 0.3.0 cutover).
  - `packages/theo/src/server/logger.ts:7-30` — structured logger with `warn`/`error`/`info`/`debug` levels and `child(context)` chaining.
  - `packages/theo/src/server/csrf.ts:71-180` — `csrf.warn` payload with stable `code: 'CSRF_STRICT_CUTOVER'` + `docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover'` (T2.2 of 0.3.0 cutover).
  - `packages/theo/src/server/security-headers.ts` — security headers + nonce per request.
  - `packages/theo/src/router/scan.ts` + `router/generate.ts` — the framework already knows every route at build time.
- Vite is the dev server. `import.meta.hot.send/.on` is available end-to-end (HMR bridge), and Vite's `/__open-in-editor` middleware is built-in.
- `pnpm dev` today only shows Vite's default error overlay. A developer diagnosing "why did my form submit fail?" must `grep` stdout for `csrf.warn` + match `x-trace-id` to logger lines.

What's broken or missing:
1. **No in-page UI**. `grep -rln "devtools" packages/theo/src/` returns only `server/security-headers.ts` (the word inside a CSP directive string — not a devtools surface).
2. **No way for a server warn to surface in the browser**. Today `csrf.warn` lands in stdout; the user sees a 403 in DevTools Network tab and has no link from that 403 to the `docsUrl` we ship.
3. **No matched-route visibility**. The user knows `pnpm dev` is running; they don't see which file under `app/**` matched their current URL or which layouts wrap it.
4. **No persistent context across reloads**. A dev hits a CSRF warn, fixes it, reloads — the warn is gone from stdout buffer. No history.
5. **The 0.4.0 roadmap names this as the biggest gap vs Next.js** (`CLAUDE.md:191`):
   > **Minimum devtools overlay** — request log + error panel + matched-route info in dev. Closing the biggest perceived gap vs Next.js.
6. **D6 of the 0.3.0 cutover plan explicitly moved devtools to 0.4.0** (`docs/plans/theokit-0.3.0-cutover-execution-plan.md:80`). The 0.3.0 cutover is the last release that ships without devtools.

Evidence:
- `.claude/knowledge-base/reference/devtools.md` — 1163-line deep dive of TanStack Router devtools, Next.js `next-devtools`, Astro `dev-toolbar`. Documents 16 edge cases (EC-1 through EC-16) with file:line citations, 7 convergent patterns, 7 divergent patterns with TheoKit decisions, and a §9 Implementation Guide that this plan operationalizes.
- Remix / SvelteKit / Nitro / Hono / tRPC — verified by content-grep to ship NO devtools surface of their own. Convergent absence is itself a finding: only UI-heavy frameworks (Next, Astro) and data-state libraries (TanStack) ship devtools. TheoKit is closer to the Next/Astro shape than to Remix's "browser is enough" stance.

Why this plan, why now:
- 0.3.0 just shipped its cutover (CSRF strict + CSP enforce + per-request nonce). The framework finally has stable, structured signals to surface — devtools without those signals would be cosmetic.
- The 0.5.0+ "Production debugging story" item names OpenTelemetry exporter + structured error pages. Both share the same dispatcher abstraction. Build the dispatcher correctly now; the exporter is a 200-LOC sink in v1.
- Cost is finite (~ 22 files, 1 dep, 4 phases). Risk is bounded (dev-only module, tree-shaken in prod). Value is real (every dev opens DevTools at every step today; this gives them framework-shaped info).

## Objective

**Done = a dev running `pnpm create theokit my-app && pnpm dev` sees a floating chip bottom-right in 1 second; clicking it expands a panel with 4 working tabs (Requests, Routes, Errors, Settings); every state-mutating request, every `csrf.warn`, every matched route, and every persistent UI preference is visible/restored; the production build (`pnpm build`) ships ZERO bytes of devtools code.**

Specific, measurable goals:
1. `packages/theo/src/devtools/index.ts` exports both `Devtools` (NODE_ENV-gated noop in prod) and `DevtoolsInProd` (real component) — TanStack tree-shake pattern.
2. Vite plugin (`packages/theo/src/vite-plugin/index.ts`) injects `<script src="/@theo/devtools/entry.js">` in dev HTML; serves the virtual module; refuses to serve it in `vite build`.
3. Chip + panel render inside `<theo-devtools-portal>` custom element with `attachShadow({ mode: 'open' })` — zero CSS leakage in either direction.
4. Requests tab: ring-buffered last 50 requests (method, path, status, duration, traceId, csrfWarn flag) updated within 100ms of response.
5. Errors tab: captures `console.error`, unhandled rejection, and `csrf.warn` (via HMR bridge). Each error shows `code` + clickable `docsUrl`.
6. Routes tab: shows the file tree of `app/**`; highlights the currently matched leaf + layout chain. Clicking a node opens the file in editor via `/__open-in-editor?file=<absolute>` (Vite built-in).
7. Settings tab: position (4 corners), theme (light/dark/system). Both persisted to localStorage.
8. `tests/e2e/devtools.spec.ts` runs against `fixtures/template-default` in Chromium + Firefox + WebKit (3 projects, 8+ scenarios each).
9. Production bundle (`fixtures/template-default` `vite build`) DOES NOT contain string `theo-devtools` or `goober`. Verified by grep in `tests/unit/devtools-treeshake.test.ts`.
10. Bundle budget script (`scripts/check-bundle-budget.sh`) stays green at ≤ 350 KB gzipped for default template (devtools adds zero to prod).
11. Dogfood check #50 added: validates devtools is injected in `pnpm dev` and absent in `pnpm build`.

## ADRs

### D1 — React portal into shadow DOM, NOT pure custom elements
- **Decision:** The overlay is rendered via React `createRoot` mounted on a `<theo-devtools-portal>` custom element whose shadow root receives the React tree via `createPortal`. Custom elements are used as the host only — the UI itself is React.
- **Rationale:** TheoKit is React-first. Astro's pure-Web-Components approach (`toolbar.ts:22-576`) means rewriting every UI primitive (button, panel, tooltip, dropdown) by hand. TheoKit already has TheoUI as design system; using React lets us consume those primitives. Shadow DOM is mandatory regardless (no leakage in either direction) — but the rendering inside the shadow root stays in React.
- **Consequences:** + Same UI library as the rest of the framework. + Faster shipping (no custom-element learning curve). − Slightly bigger module than pure DOM (still tree-shaken to noop in prod).

### D2 — Auto-inject via Vite plugin in dev, NOT user-imported component
- **Decision:** The user does not import or render anything. The Vite plugin (`packages/theo/src/vite-plugin/index.ts`) injects `<script type="module" src="/@theo/devtools/entry.js">` into the HTML response during dev. The virtual module path is registered with Vite and resolves to `packages/theo/src/devtools/entry.tsx`. In `vite build`, the plugin does NOT inject — and rejects the virtual-module request with 404.
- **Rationale:** TanStack requires `<TanStackRouterDevtools />` in the user's tree (`react-router-devtools/src/TanStackRouterDevtools.tsx:48-128`). Two leaks: (a) the user must remember to add it, (b) the `process.env.NODE_ENV` tree-shake assumption leaks into user code. Next.js (`dev-overlay.browser.tsx:340-464`) and Astro (`entrypoint.ts:54`) both auto-inject. TheoKit owns the entry-client generator (`router/entry.ts`); injecting one more module in dev is a one-line plugin hook.
- **Consequences:** + Zero user action required. + No leak of dev-only assumptions into user code. + Tree-shake guarantee at framework boundary, not user boundary. − Vite plugin must own the inject/strip logic robustly (covered by `tests/integration/devtools-injection.test.ts`).

### D3 — localStorage for v0 persistence, server endpoint deferred to v1+
- **Decision:** Position, theme, panel-open state persist via `localStorage` keys (`theo-devtools-position`, `theo-devtools-theme`, etc.). No server-side persistence in v0.
- **Rationale:** Next.js POSTs config to `/__nextjs_devtools_config` with zod validation (`save-devtools-config.ts:1-47`). That's right for cross-tab sync — but premature for v0. TanStack and Astro both use `localStorage` (`useLocalStorage.ts:16-52`, Astro `settings.ts`). Single-source-of-truth at the browser is simpler and lets us defer the server endpoint until a real cross-tab use case appears.
- **Consequences:** + No server-side schema validation, no migration story for config fields. + Faster ship. − User dev across tabs / devices doesn't sync (acceptable for v0). + Migration to server endpoint later is additive (add the POST + keep localStorage as fallback).

### D4 — Vite HMR for client↔server bridge, NOT custom WebSocket
- **Decision:** Server-side request/log/csrf-warn events reach the browser via Vite's existing HMR WebSocket using `import.meta.hot.send`/`.on`. Channel names namespaced as `theo:devtools:*`.
- **Rationale:** Astro uses `import.meta.hot.send(\`astro-dev-toolbar:${app.id}:initialized\`)` and `import.meta.hot.on` (`helpers.ts:80-107`). Vite already has the WebSocket open in dev; spawning a second one is overhead. Custom WS requires extra port + lifecycle + CSP exception. HMR channel is dev-only by definition — exactly when the devtools is alive.
- **Consequences:** + Zero new infrastructure. + Bidirectional out of the box. + Dies cleanly in prod build (where `import.meta.hot` is `undefined`). − Bound to Vite (not a problem — TheoKit is Vite-only). − HMR channel events MUST be small (it's a single WS); larger payloads need pagination.

### D5 — Adopt `goober` for shadow-DOM-scoped CSS, NOT lift Tailwind/CSS modules
- **Decision:** Add `goober@^2.1.16` as a direct devtools-only dep. Use `goober.css.bind({ target: shadowRoot })` to inject styles into the shadow root.
- **Rationale:** Tailwind generates a single global stylesheet that doesn't reach into shadow roots without `:host` injection plumbing. CSS modules don't help either — they ship classnames that depend on the parent stylesheet. Goober is 1KB, exactly designed for this (TanStack uses it: `useStyles.tsx:11-12`, `package.json:66`). Devtools is the ONLY consumer; tree-shaken in prod.
- **Consequences:** + 1KB of goober only in dev. + Standard library shape (`css\`...\``). + Compatible with shadow DOM out of the box. − One more dep to bump (low maintenance — goober is stable, 2.1.x for years).

### D6 — Tree-shake to noop in prod via dual-export pattern, NOT bundler config
- **Decision:** `packages/theo/src/devtools/index.ts` exports:
  ```ts
  export const Devtools = process.env.NODE_ENV !== 'development' ? () => null : RealDevtools
  export const DevtoolsInProd = RealDevtools  // escape hatch for opt-in prod (TanStack pattern)
  ```
  The Vite plugin only injects the `Devtools` symbol path. Bundlers see `NODE_ENV !== 'development'` as a constant in prod builds → dead-code-eliminate the real implementation.
- **Rationale:** TanStack pioneered this pattern (`react-router-devtools/src/index.ts:1-25`). It's portable across bundlers (no Vite-specific magic), survives `tsup`/`rollup`/`webpack`/`vite build`, and gives users an explicit `DevtoolsInProd` if they want prod inspection. The alternative (Vite config-only inject) couples the strip to one bundler.
- **Consequences:** + Bundler-agnostic. + Explicit escape hatch (`DevtoolsInProd`). − Two exports to document. + Verifiable: grep the built `index-*.js` for `theo-devtools` — must be absent.

### D7 — Monolith v0, plugin/app extension shape committed for v1
- **Decision:** v0 ships 4 hard-coded tabs (Requests, Routes, Errors, Settings). No `defineDevtoolsTab` extension API. The internal architecture (dispatcher + reducer + tab components) is shaped to accept a `definePlugin`-style extension in v1.
- **Rationale:** Astro's `definePlugin` is mature precisely because Astro has built community apps on it (`entrypoint.ts:31-38`). TheoKit has zero community asks for custom devtools panels. Premature extension is worse than no extension (commits API surface area). Build the right monolith now; extract when the second consumer appears.
- **Consequences:** + Smaller v0 surface. + No public API contract to maintain. − v1 adds extension; this is on the roadmap.

### D8 — React `useReducer` + queued dispatcher, NOT Solid signals or external store
- **Decision:** Devtools state lives in a React reducer (`packages/theo/src/devtools/reducer.ts`). Events that fire BEFORE React mounts (e.g., `console.error` during user-app boot) go into a queue (`createQueuable` pattern from Next.js `dev-overlay.browser.tsx:124-138`); replayed via `useInsertionEffect`.
- **Rationale:** TanStack chose Solid for fine-grained reactivity (`router-devtools-core/src/TanStackRouterDevtoolsCore.tsx:52-160`). Adding Solid as a runtime dep for the devtools is a tax we won't pay (~30KB Solid runtime). React's `useReducer` is sufficient; the queue pattern handles the timing race that Solid's signals would otherwise smooth over.
- **Consequences:** + Zero new runtime dep. + Same mental model as the rest of the app. + Standard React DevTools "just work" inside the overlay during development of the overlay itself. − `useInsertionEffect` is the right gate — must use it (not `useEffect`/`useLayoutEffect`).

### D9 — 4 tabs minimum, NOT full Next.js error overlay
- **Decision:** v0 ships exactly 4 tabs: Requests, Routes, Errors, Settings. No build-error overlay, no code-frame parsing, no runtime-error component-stack rendering. The Errors tab is a list, not a modal — it captures errors but doesn't take over the page.
- **Rationale:** Next.js dev-overlay is ~ 200 files (covered in `.claude/knowledge-base/reference/devtools.md` §2). Maybe ~150 of those are error-overlay UI (dialog, code-frame, call-stack-frame, hydration-diff, etc.). All useful in v2+ but irrelevant to v0's goal of "surface the data the framework already emits." Vite already has an error overlay for build/runtime errors; we don't compete.
- **Consequences:** + Bounded scope. + Vite's error overlay still works (we don't disable it). − No fancy error UX in v0. − Add error overlay in v1 if dogfood shows it's needed (likely yes).

### D10 — Privacy redaction at dispatcher level (Authorization/Cookie/Set-Cookie), with `theo.config.ts.devtools.redact` extensible in v1
- **Decision:** The dispatcher (server-side) redacts the values of `Authorization`, `Cookie`, `Set-Cookie` headers before broadcasting to the HMR bridge. Body payloads truncate at 4KB displayed. In v1, expose `theo.config.ts.devtools.redact: string[]` for additional fields.
- **Rationale:** Devtools shows full request data including headers. A logged-in dev has an `Authorization: Bearer ...` token visible in the chip's Requests tab — accidentally screen-shared, accidentally pasted into a public bug report. Redaction at dispatcher level (NOT at UI level) is the safe default: even if a buggy UI logs the raw object, the secret has already been replaced with `'[REDACTED]'`. Conservative defaults (3 headers) covers 90% of cases.
- **Consequences:** + Safe default. + Truncation prevents accidental large-paste. − v0 doesn't let users add fields (they get the default 3); v1 plan adds config knob. − Multipart bodies (file uploads) are simply truncated to 4KB display.

## Dependency Graph

```
Phase 1 (Core Shell) ──▶ Phase 2 (Requests + Errors) ──▶ Phase 4 (Polish: drag, persist, kbd)
       │                          │                                    │
       │                          ▼                                    │
       │                  Phase 3 (Routes tab) ─────────────────────┐  │
       │                          │                                ▼  ▼
       │                          └──────────────────▶ Phase 5 (Dogfood QA — MANDATORY)
       │
       └─▶ Phase 3 can start in parallel with Phase 2 (independent files: Routes tab vs Requests/Errors)
```

Parallelism notes:
- Phase 1 is BLOCKING — everything builds on the shell.
- Phase 2 and Phase 3 are file-independent (different tabs, different data sources): the Requests+Errors tabs consume HMR events from server-side `logger.ts`/`csrf.ts`; the Routes tab consumes the build-time route manifest. They can run in parallel by two engineers.
- Phase 4 (drag, persistence, polish) depends on Phase 1 (chip exists) only, but value comes after data flows (Phases 2/3 done) — sequence it last.
- Phase 5 (Dogfood QA) is the final mandatory gate. Plan is NOT done until `/dogfood full` passes.

---

## Phase 1: Core Shell — chip, shadow DOM, tree-shake, Vite inject

**Objective:** Make `pnpm dev` show a visible chip bottom-right within 1 second of page load. Click → empty panel opens. `vite build` produces zero bytes of devtools code. No data yet — just the surface.

### T1.1 — Devtools entry module + Shadow DOM portal + dual export tree-shake

#### Objective
Create the foundation: `packages/theo/src/devtools/entry.tsx` mounts the React tree inside `<theo-devtools-portal>` custom element with `attachShadow({ mode: 'open' })`. Export both `Devtools` (NODE_ENV-gated noop) and `DevtoolsInProd` (real). Verify via grep that prod bundle excludes the implementation.

#### Evidence
- Next.js `dev-overlay.browser.tsx:340-378` proves React + custom element + shadow DOM is the right shape: `const container = document.createElement('nextjs-portal'); container.attachShadow({ mode: 'open' }); createRoot(container).render(<Root />)`.
- TanStack `react-router-devtools/src/index.ts:1-25` proves the dual-export tree-shake works across bundlers.
- EC-1 from `.claude/knowledge-base/reference/devtools.md` §8: parent `body { display: flex }` skews overlay layout → mitigation is `script.style.position = 'absolute'` on the wrapper element (Next.js `dev-overlay.browser.tsx:362-364`).

#### Files to edit
```
packages/theo/src/devtools/index.ts                  — (NEW) public exports: Devtools (noop in prod) + DevtoolsInProd (real)
packages/theo/src/devtools/entry.tsx                  — (NEW) bootstrap: createRoot into <theo-devtools-portal> + attachShadow
packages/theo/src/devtools/shadow-portal.tsx          — (NEW) ShadowPortal: createPortal(children, shadowRoot) component
packages/theo/src/devtools/Overlay.tsx                — (NEW) root component (empty shell — chip + closed panel)
packages/theo/src/devtools/shared.ts                  — (NEW) types: DevtoolsPosition, DevtoolsTab, DevtoolsState, RequestRecord, ErrorRecord
packages/theo/src/devtools/styles/styles.ts           — (NEW) goober factory: css.bind({ target: shadowRoot })
packages/theo/src/devtools/styles/tokens.ts           — (NEW) color/spacing tokens (mirror TheoUI design tokens)
packages/theo/src/devtools/components/Indicator.tsx   — (NEW) floating chip (fixed corner, no drag yet — that comes in T4.1)
packages/theo/src/devtools/components/Panel.tsx       — (NEW) expandable panel shell (empty tabs)
packages/theo/src/devtools/hooks/useDevtoolsContext.ts — (NEW) React context for shadow root + state + dispatch
packages/theo/package.json                            — Add goober@^2.1.16 to dependencies
tests/unit/devtools-treeshake.test.ts                 — (NEW) Grep built bundle for 'theo-devtools' + 'goober' — both MUST be absent
```

#### Deep file dependency analysis
- **`packages/theo/src/devtools/index.ts`** (NEW, ~25 LOC): two exports. **EC-17 mitigation**: use `process.env.NODE_ENV === 'production' ? () => null : LazyDevtools` (positive prod check, NOT negative dev check). This makes 'test' and undefined NODE_ENV also resolve to the real component — so vitest can exercise the real `Devtools` export. Tree-shake still works because bundlers (Vite/rollup/webpack) constant-fold `process.env.NODE_ENV === 'production'` to `true` in prod builds, eliminating the real branch. `LazyDevtools` is a `React.lazy` import of `./Overlay`. `DevtoolsInProd` always the real one.
- **`packages/theo/src/devtools/entry.tsx`** (NEW, ~80 LOC): runs at the global scope when the script loads. Creates wrapper `<script data-theo-devtools="true">` (mitigation for EC-1 `display:flex` skew), appends `<theo-devtools-portal>` inside it, `attachShadow({ mode: 'open' })`, `createRoot(shadowRoot).render(<Overlay />)`. Singleton-guarded — if `window.__theoDevtoolsMounted` already true, no-op.
- **`packages/theo/src/devtools/Overlay.tsx`** (NEW, ~60 LOC): top-level component. Uses `useReducer(devtoolsReducer, initialState)`. Wraps children in `DevtoolsContext.Provider`. Renders `<ShadowPortal><Indicator /><Panel /></ShadowPortal>`.
- **`packages/theo/src/devtools/shared.ts`** (NEW, ~120 LOC): TypeScript types only. No runtime code. Zod schema for `DevtoolsState` at end of file for v1 server-persistence ADR-D3 follow-up.
- **`packages/theo/src/devtools/styles/styles.ts`** (NEW, ~80 LOC): wraps `goober.css.bind({ target: shadowRoot })`. Returns a factory that any component can call. Uses tokens.ts for centralized values.
- **`packages/theo/package.json`**: adds `"goober": "^2.1.16"` to `dependencies`. Verify the package has no transitive deps that bloat the bundle (it doesn't — pure ESM, zero deps).
- **`tests/unit/devtools-treeshake.test.ts`** (NEW, ~80 LOC): **EC-22 mitigation** — the test MUST NOT trust stale build artifacts. `beforeAll` runs `execSync('pnpm --filter fixture-template-default build', { stdio: 'pipe' })` (~10s, acceptable for a single grep gate) so the assertion runs against a fresh bundle. Then `fs.readFileSync` of `fixtures/template-default/dist/assets/index-*.js`, `expect(content).not.toContain('theo-devtools')`, `expect(content).not.toContain('goober')`, `expect(content).not.toContain('createShadowRoot')`. Three negative assertions. Without the explicit build, a fresh clone would pass vacuously against missing/old bundles.

Downstream impact:
- `packages/theo/src/vite-plugin/index.ts` (T1.2) will reference `/@theo/devtools/entry.js` as a virtual module pointing at `entry.tsx`.
- `packages/theo/src/router/entry.ts` does NOT change in this phase. Devtools is injected as a separate script tag, not part of the entry-client.
- TheoUI tokens (in `theo-ui/`) are NOT imported here — `styles/tokens.ts` defines its own minimal palette to avoid circular dep (`theokit` depends on `@usetheo/ui` is fine; the inverse would break).

#### Deep Dives

**Singleton guard (EC-16):**
```ts
// entry.tsx
declare global { interface Window { __theoDevtoolsMounted?: boolean } }
if (typeof window === 'undefined') { /* SSR no-op */ }
else if (window.__theoDevtoolsMounted) { /* already mounted, exit */ }
else { window.__theoDevtoolsMounted = true; mount() }
```
Why: HMR can re-execute the module; double-mount would create two chips. Sentinel on `window` is the simplest cross-module flag.

**Custom element naming (EC-12):**
```ts
if (!customElements.get('theo-devtools-portal')) {
  customElements.define('theo-devtools-portal', class extends HTMLElement {})
}
```
Namespace: `theo-devtools-*` (matches Astro's `astro-dev-toolbar-*` pattern from `entrypoint.ts:41-52`). Guard against double-define for HMR.

**Shadow DOM CSS injection invariant:**
- `goober.css.bind({ target: shadowRoot })` — goober's `css\`...\`` tag emits styles into the shadow root, not into `document.head`.
- ALL styled components in `devtools/components/*` MUST go through this factory. Never use raw `<style>` tags or className strings tied to global Tailwind.
- TheoUI primitives (which use Tailwind globals) MUST NOT be imported into devtools — would leak into shadow root with no styling.

**`useInsertionEffect` for early dispatch (deferred to T2.1, but design declared here):**
Overlay.tsx uses `useReducer`, but events from the dispatcher (T2.1) may fire before mount. The reducer hooks into a global queue in Phase 2. For v0 Phase 1, the queue infrastructure is stubbed (no events flowing yet) but the wiring order is ADR-D8.

**Invariants:**
- v0 mounts exactly ONE devtools instance per page (singleton).
- Shadow DOM mode is `'open'` (read-only by user — for E2E test introspection).
- `entry.tsx` runs only when `import.meta.env.DEV === true` is also true (belt-and-suspenders: tree-shake AND Vite dev gate).
- The chip's fixed-position bounding rect MUST fit within a 200×40px footprint (no shifting the page).

**Edge cases:**
- EC-1: User app has `body { display: flex }`. Wrapper script's `position: absolute` removes it from flex flow → no skew.
- EC-12: User's app already defined `<theo-devtools-portal>` (unlikely but possible). `customElements.get(...)` guard prevents re-define throw.
- EC-16: HMR re-runs the module. Singleton flag prevents double-mount.
- SSR: `entry.tsx` runs only in browser (`typeof window !== 'undefined'`). Never imported by SSR build path (Vite plugin guarantees client-only).

#### Tasks
1. Add `goober@^2.1.16` to `packages/theo/package.json` deps. Run `pnpm install`.
2. Write `shared.ts` types (no runtime). Verify `tsc --noEmit`.
3. Write `styles/tokens.ts` with 12 color values + 6 spacing values.
4. Write `styles/styles.ts` goober factory accepting `shadowRoot` argument.
5. Write `shadow-portal.tsx` ShadowPortal component.
6. Write `Overlay.tsx` minimum reducer (open/close action only) + `useReducer` + render `<Indicator />` + `<Panel />`.
7. Write `Indicator.tsx` fixed-position chip with click → dispatch `TOGGLE_PANEL`.
8. Write `Panel.tsx` simple panel that renders text "Devtools (Phase 1 — no data yet)" when `state.open === true`.
9. Write `entry.tsx` with singleton guard + custom element + shadow root mount.
10. Write `index.ts` dual export.
11. Write `tests/unit/devtools-treeshake.test.ts` — grep prod bundle (uses existing `fixtures/template-default` build output).
12. Verify locally: `pnpm --filter @theo/theo build && pnpm --filter fixture-template-default build`; assert grep negatives pass.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_devtools_index_exports_noop_in_production() — EC-17: Given NODE_ENV='production' (use vi.stubEnv), When import { Devtools }, Then Devtools is a function returning null
RED:     test_devtools_index_exports_real_in_test_env() — EC-17: Given NODE_ENV='test' (vitest default), When import { Devtools }, Then Devtools is the lazy real component (NOT the literal noop) — proves positive prod check, not negative dev check
RED:     test_devtools_index_exports_real_in_development() — Given NODE_ENV='development' (use vi.stubEnv), When import { Devtools }, Then Devtools is the real component
RED:     test_DevtoolsInProd_always_real() — Given any NODE_ENV including 'production', When import { DevtoolsInProd }, Then it's the real component (escape hatch contract)
RED:     test_shadow_portal_renders_into_shadow_root() — Given mounted ShadowPortal with children, Then children are inside shadowRoot, NOT document.body directly
RED:     test_entry_singleton_guard_prevents_double_mount() — EC-16: Given entry.tsx imported twice in succession (HMR sim), Then customElements has 'theo-devtools-portal' defined exactly once
RED:     test_entry_custom_element_namespace() — EC-12: Given entry.tsx runs, Then customElements.get('theo-devtools-portal') is defined
RED:     test_entry_wrapper_script_position_absolute() — EC-1: Given parent body has display: flex, When entry mounts, Then wrapper script element has style.position === 'absolute'
RED:     test_indicator_visible_after_mount() — Given <Overlay /> mounted, Then querySelectorDeep('button[aria-label="Open devtools"]') is not null
RED:     test_indicator_click_toggles_panel() — Given chip rendered, When click, Then state.open === true; click again → false
RED:     test_treeshake_prod_bundle_excludes_devtools() — EC-22: Given beforeAll runs `pnpm --filter fixture-template-default build` (fresh artifacts mandatory), Then dist/assets/index-*.js does NOT contain 'theo-devtools' or 'goober' or 'createShadowRoot'
GREEN:   Implement files 1-11 above
REFACTOR: Extract chip color/sizing constants into tokens.ts if duplicated
VERIFY:  npx vitest run tests/unit/devtools-treeshake.test.ts && npx vitest run tests/unit/devtools-overlay.test.ts
```

BDD scenarios:
- **Happy path:** dev mode → chip visible bottom-right → click → empty panel opens.
- **Validation error:** prod mode → noop component → no DOM mutations → no shadow root, no chip.
- **Edge case:** HMR re-runs entry.tsx → singleton guard prevents double-mount (only one chip in DOM).
- **Error scenario:** parent body has `display: flex` → wrapper script `position: absolute` prevents layout skew (no visual shift in user's app).

#### Acceptance Criteria
- [ ] `packages/theo/src/devtools/index.ts` exports `Devtools` (noop in prod) + `DevtoolsInProd` (always real)
- [ ] `<theo-devtools-portal>` custom element defined exactly once (HMR-safe)
- [ ] Shadow root contains all overlay content; `document.body` has no devtools-specific descendants outside the wrapper script
- [ ] Wrapper script element has `position: absolute` (EC-1 mitigation)
- [ ] Chip visible bottom-right in dev fixture page load
- [ ] Click chip → empty panel opens
- [ ] Prod build of `fixtures/template-default` does NOT contain `'theo-devtools'`, `'goober'`, `'createShadowRoot'` (verified by grep test)
- [ ] Bundle budget (`scripts/check-bundle-budget.sh`) unchanged for default template (≤ 350 KB gzipped)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `pnpm lint` (zero warnings)
- [ ] Pass: `npx vitest run tests/unit/devtools-*.test.ts`

#### DoD
- [ ] All 11 files created/modified
- [ ] All 10 RED tests written first, then GREEN passing
- [ ] Treeshake assertion verified locally (run build + grep)
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings
- [ ] Code-audit clean: no `any`, no `// @ts-ignore`, no `eslint-disable`

---

### T1.2 — Vite plugin injects devtools script in dev, NEVER in build

#### Objective
Wire the Vite plugin to (a) register `/@theo/devtools/entry.js` as a virtual module resolving to `packages/theo/src/devtools/entry.tsx`, (b) inject `<script type="module" src="/@theo/devtools/entry.js">` into HTML during dev only, (c) refuse to serve the virtual module + skip injection during `vite build`.

#### Evidence
- `packages/theo/src/vite-plugin/inject-entry-client.ts` already exists with the inject-into-HTML pattern (transforms `<head>` to add the entry-client script). The same shape works for devtools — one more injected tag, gated on `dev`.
- Next.js auto-injects via dev-server runtime, not Vite plugin — but TheoKit's dev server IS Vite, so the equivalent hook is the plugin's `transformIndexHtml`.
- Astro injects via `astro:server:setup` hook (`entrypoint.ts:282` `document.body.append(overlay)`); equivalent is Vite plugin `transformIndexHtml`.

#### Files to edit
```
packages/theo/src/vite-plugin/inject-devtools.ts      — (NEW) inject script tag into HTML; gated on isDev
packages/theo/src/vite-plugin/index.ts                — Register devtools-related Vite plugin hooks (resolveId, load, transformIndexHtml)
tests/integration/devtools-injection.test.ts          — (NEW) integration test: dev HTML contains tag, prod HTML doesn't, virtual module 404s in prod
```

#### Deep file dependency analysis
- **`packages/theo/src/vite-plugin/inject-devtools.ts`** (NEW, ~80 LOC): pure function `injectDevtoolsScript(html: string, options: { isDev: boolean }): string`. If `!isDev`, return html unchanged. If `isDev`, insert `<script type="module" src="/@theo/devtools/entry.js"></script>` just before `</head>` (mirroring the existing inject-entry-client pattern in `inject-entry-client.ts:1-40`).
- **`packages/theo/src/vite-plugin/index.ts`** modifications:
  - Add `resolveId('/@theo/devtools/entry.js', ...)` → returns absolute path to `packages/theo/src/devtools/entry.tsx` (with virtual-id prefix `\0` to ensure Vite treats it correctly).
  - Add `load(id)` for the same — returns the `entry.tsx` source.
  - Add `transformIndexHtml(html, ctx)` → calls `injectDevtoolsScript(html, { isDev: ctx.server !== undefined })`. (`ctx.server` is set only in dev mode.)
  - All three hooks gated by config (no inject if user opts out — covered in T4.3 settings, but the plumbing exists from day one).
- **`tests/integration/devtools-injection.test.ts`** (NEW, ~120 LOC):
  - Test 1: Spin up `createServer(viteConfig)` (Vite's programmatic API), hit `/`, assert HTML contains `<script type="module" src="/@theo/devtools/entry.js">`.
  - Test 2: Hit `/@theo/devtools/entry.js`, assert response 200 + Content-Type `text/javascript` + body contains `customElements.define`.
  - Test 3: Run `build(viteConfig)`, read `dist/index.html`, assert HTML does NOT contain `'theo/devtools'`.
  - Test 4: After build, hit a hypothetical request for `/@theo/devtools/entry.js` — N/A in static build (file simply doesn't exist).

Downstream impact:
- `tests/e2e/devtools.spec.ts` (created in T1.3) loads `fixtures/template-default` via `pnpm dev` (Playwright `webServer` config). Will benefit from T1.2's dev injection.
- Existing `inject-entry-client.ts` does NOT change. Its inject point (`</head>`) is shared but independent.
- Vite's HMR client (`/@vite/client`) is already injected; adding `/@theo/devtools/entry.js` is the same shape. No CSP conflict (both same-origin).

#### Deep Dives

**Virtual module resolution (Vite plugin pattern):**
```ts
const DEVTOOLS_VIRTUAL_ID = '\0/@theo/devtools/entry.js'
// resolveId
if (id === '/@theo/devtools/entry.js') return DEVTOOLS_VIRTUAL_ID
// load
if (id === DEVTOOLS_VIRTUAL_ID) return await readFile(resolve(packageRoot, 'src/devtools/entry.tsx'), 'utf-8')
```
Why `\0` prefix: Vite convention for "this is a virtual module, don't resolve against the filesystem." Without it, Vite tries to find `/@theo/...` as a real path → 404.

**HTML inject point (mirror existing pattern):**
```ts
// inject-devtools.ts
export function injectDevtoolsScript(html: string, opts: { isDev: boolean }): string {
  if (!opts.isDev) return html
  const tag = '<script type="module" src="/@theo/devtools/entry.js"></script>'
  return html.replace('</head>', `  ${tag}\n  </head>`)
}
```
Edge case: if HTML has no `</head>` (unusual but possible for fragments), do NOT inject (fall through). Test covers.

**Build-mode safety:**
- `vite build` runs `transformIndexHtml` but `ctx.server === undefined`. The guard `isDev: ctx.server !== undefined` catches this.
- `resolveId` is also called during build — but if HTML doesn't reference `/@theo/devtools/entry.js`, the resolver is never reached.
- Defensive: even if some build path queries `resolveId`, the `load` handler returns the dev-only module — but the consuming HTML doesn't reference it, so the module is dead code → tree-shaken.

**Invariants:**
- Dev mode: HTML has the script tag. Hitting the virtual URL returns the JS.
- Build mode: HTML has NO script tag. Hitting the virtual URL returns 404 (or N/A — static).
- HMR: the virtual module respects HMR (changing `entry.tsx` triggers reload of the devtools — natural Vite behavior).
- The plugin order matters: `inject-devtools.ts` runs AFTER `inject-entry-client.ts` to ensure the order in `<head>` is entry-client first, devtools second.

**Edge cases:**
- HTML has multiple `</head>` (unusual but possible from user templates) → only replace FIRST occurrence.
- HTML has whitespace variations around `</head>` (`</head >`, `</head\n>`) → regex-tolerant replace (case-insensitive, whitespace-greedy).
- User sets `theo.config.ts.devtools = false` → skip injection (config plumbing in T4.3 but the guard MUST exist from T1.2).
- User runs `vite preview` (preview built site) → no inject (preview is build mode).

#### Tasks
1. Create `inject-devtools.ts` with the pure injectDevtoolsScript function + 4 unit tests inline (cover `</head>` variants, isDev guard, no double-inject).
2. Modify `vite-plugin/index.ts` to register:
   - `resolveId` for the virtual ID
   - `load` for the virtual ID
   - `transformIndexHtml` calling injectDevtoolsScript
3. Create `tests/integration/devtools-injection.test.ts` using Vite's programmatic API (`createServer`, `build`).
4. Run integration tests; verify HTML in dev vs build differs.
5. Manual smoke: `pnpm --filter fixture-template-default dev`, open browser, view source — confirm script tag present. Run `pnpm --filter fixture-template-default build`, inspect `dist/index.html` — confirm absent.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_injectDevtoolsScript_appends_in_dev() — Given { isDev: true } + HTML with </head>, Then return HTML containing the script tag before </head>
RED:     test_injectDevtoolsScript_passthrough_in_build() — Given { isDev: false }, Then return HTML unchanged (no script tag)
RED:     test_injectDevtoolsScript_no_double_inject() — Given HTML already containing the tag (HMR re-run), Then return HTML with exactly ONE occurrence of the tag
RED:     test_injectDevtoolsScript_no_head_close() — Given HTML without </head>, Then return HTML unchanged + log warning (don't break user template)
RED:     test_vite_plugin_resolves_devtools_virtual_id() — Given Vite dev server, When resolveId('/@theo/devtools/entry.js'), Then resolves to virtual ID with \0 prefix
RED:     test_vite_plugin_loads_devtools_virtual_module() — Given Vite dev server, When load(virtualId), Then returns the entry.tsx source as string
RED:     test_dev_server_serves_entry_module() — Integration: spin up Vite dev, fetch GET /@theo/devtools/entry.js, expect 200 + JS body
RED:     test_dev_server_html_contains_script_tag() — Integration: fetch /, expect HTML to contain <script src="/@theo/devtools/entry.js">
RED:     test_build_output_html_excludes_script_tag() — Integration: run vite build, read dist/index.html, expect NO 'theo/devtools' substring
RED:     test_build_output_assets_exclude_devtools() — Integration: read dist/assets/*.js, expect NO 'theo-devtools' or 'goober' substring
RED:     test_user_opt_out_skips_inject() — Given theo.config.ts.devtools = false, When isDev=true, Then no script tag injected (forward-looking; flag exists from T1.2)
GREEN:   Implement inject-devtools.ts + register Vite plugin hooks + run tests
REFACTOR: Extract HTML replace logic if reused with inject-entry-client (probably not — different concerns)
VERIFY:  npx vitest run tests/integration/devtools-injection.test.ts
```

BDD scenarios:
- **Happy path:** dev server serves HTML with script tag; virtual module returns JS.
- **Validation error:** build mode produces HTML without the tag; assets exclude devtools code.
- **Edge case:** HTML lacks `</head>` → injectDevtoolsScript returns unchanged (no crash, warn logged).
- **Error scenario:** user sets `theo.config.ts.devtools = false` → no inject even in dev (opt-out respected).

#### Acceptance Criteria
- [ ] `packages/theo/src/vite-plugin/inject-devtools.ts` exists with pure inject function
- [ ] `packages/theo/src/vite-plugin/index.ts` registers `resolveId`/`load`/`transformIndexHtml` for devtools
- [ ] Dev mode: `curl http://localhost:5173/` → HTML contains script tag
- [ ] Dev mode: `curl http://localhost:5173/@theo/devtools/entry.js` → 200 + JS
- [ ] Build mode: `dist/index.html` does NOT contain `'theo/devtools'`
- [ ] Build mode: `dist/assets/index-*.js` does NOT contain `'theo-devtools'` or `'goober'`
- [ ] `theo.config.ts.devtools = false` opt-out hook present (no-op in v0, full handling in T4.3)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/integration/devtools-injection.test.ts`

#### DoD
- [ ] All 3 files created/modified
- [ ] All 11 RED tests written first, then GREEN passing
- [ ] Manual smoke verified in `fixtures/template-default`
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings

---

### T1.3 — Playwright spec validates chip visibility in real browser

#### Objective
Add `tests/e2e/devtools.spec.ts` with 3 scenarios that prove Phase 1 works end-to-end in a real browser (Chromium, Firefox, WebKit). No data interactions yet — just shell visibility + click toggle + prod absence.

#### Evidence
- Existing `tests/e2e/template-default.spec.ts` already tests `fixtures/template-default` with Playwright; reuse the same fixture + project configuration.
- Playwright `playwright.config.ts` declares `template-default` project; add a `devtools` project that loads the same fixture.
- Real-browser test catches Shadow DOM semantic issues (e.g., `querySelector` doesn't pierce shadow roots — must use `evaluate(() => document.querySelector(...).shadowRoot.querySelector(...))`).

#### Files to edit
```
tests/e2e/devtools.spec.ts                            — (NEW) 3 scenarios: chip visible, click toggle, prod absence
playwright.config.ts                                  — Register new project 'devtools' (port 3460 or reuse 3460)
```

#### Deep file dependency analysis
- **`tests/e2e/devtools.spec.ts`** (NEW, ~120 LOC): Playwright spec file. Scenarios:
  1. **Chip visible after page load** — navigate to `/`, wait for `theo-devtools-portal` custom element to exist, assert chip button has `aria-label="Open devtools"`. Use `page.locator('theo-devtools-portal').evaluateHandle(...)` to pierce shadow root.
  2. **Click chip → panel opens** — locate chip via shadow root traversal; `.click()`; assert panel element visible.
  3. **Build output excludes devtools** — `test.beforeAll(async () => { execSync('pnpm --filter fixture-template-default build') })`, then `fs.readFileSync` of `dist/index.html` + `dist/assets/index-*.js`, assert no devtools strings. This duplicates T1.1's vitest assertion but verifies the FULL build pipeline (not just src grep) in real Playwright context — extra defense.
- **`playwright.config.ts`** modification: add to `projects` array:
  ```ts
  {
    name: 'devtools',
    use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3460' },
    webServer: {
      command: 'pnpm --filter fixture-template-default dev --port 3460',
      port: 3460, reuseExistingServer: !process.env.CI,
    },
  }
  ```
- Run on Chromium only initially; add Firefox/WebKit after dogfood approves (3x runtime cost).

Downstream impact:
- Existing `template-default.spec.ts` (8 scenarios) stays untouched.
- CI workflow `.github/workflows/ci.yml` already runs `npx playwright test` — picks up the new project automatically.
- Bundle budget script unaffected.

#### Deep Dives

**Shadow DOM piercing in Playwright:**
Playwright `locator` does NOT pierce shadow roots by default. Use `page.locator('theo-devtools-portal').evaluate((el) => el.shadowRoot?.querySelector('button[aria-label="Open devtools"]'))` or the Playwright shadow-piercing CSS `>>>` (e.g., `page.locator('theo-devtools-portal >>> button')`).

**Build-output assertion (extra layer beyond T1.1 vitest):**
T1.1's `devtools-treeshake.test.ts` runs in Vitest, reads bundle files synchronously. T1.3's Playwright `beforeAll` block runs the FULL build (`vite build`), then reads bundle files. Difference: T1.1 may run on stale built artifacts; T1.3 always rebuilds. Both kept for defense in depth.

**Invariants:**
- Chip is the FIRST interactable element rendered by devtools — no other devtools elements exist before chip is clickable.
- Panel is hidden by default (no flash of content before click).
- Click handler is on the chip element itself (not on a wrapper) — Playwright reliably clicks aria-labeled elements.

**Edge cases:**
- Page load races: chip may render after page DOM-ready but before page Network idle. Use `waitForSelector('theo-devtools-portal')` with timeout 2000ms.
- HMR mid-test: HMR shouldn't happen in CI; locally, the test runner manages dev-server lifecycle.
- WebKit shadow DOM quirks (historical): Modern Playwright handles correctly; document the test if WebKit fails.

#### Tasks
1. Add `devtools` project entry to `playwright.config.ts`.
2. Create `tests/e2e/devtools.spec.ts` with 3 scenarios.
3. Run `npx playwright test --project=devtools` → expect 3/3 pass.
4. Verify the CI workflow picks up the new project (no config change needed in `.github/workflows/ci.yml`).
5. Document shadow-DOM piercing pattern in `CONTRIBUTING.md` for future contributors.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     playwright_chip_visible_after_load — Given pnpm dev running, When navigate to /, Then within 2s the chip button (inside shadow root) is visible
RED:     playwright_click_chip_opens_panel — Given chip visible, When click chip, Then panel element inside shadow root has aria-expanded='true'
RED:     playwright_build_excludes_devtools — Given vite build of fixture, Then dist/index.html lacks 'theo/devtools' AND dist/assets/index-*.js lacks 'theo-devtools'
RED:     playwright_no_chip_in_build_preview — Given vite build + vite preview, When navigate to /, Then no custom element 'theo-devtools-portal' is registered (verified via `customElements.get(...)`)
GREEN:   Configure project + write spec; ensure all 4 scenarios pass
REFACTOR: Extract shadow-piercing helper if patterns repeat across future specs
VERIFY:  npx playwright test --project=devtools
```

BDD scenarios:
- **Happy path:** dev mode → chip visible → click → panel opens.
- **Validation error:** N/A in shell phase (no input validation yet).
- **Edge case:** page load timing — chip MUST appear within 2 seconds.
- **Error scenario:** prod preview mode → NO chip, NO custom element registered.

#### Acceptance Criteria
- [ ] `tests/e2e/devtools.spec.ts` exists with 4 scenarios
- [ ] `playwright.config.ts` has `devtools` project entry
- [ ] All 4 Playwright scenarios pass in Chromium
- [ ] (Optional, defer to T5) Firefox + WebKit also pass
- [ ] Manual smoke: open `pnpm dev`, see chip; open `vite build && vite preview`, no chip
- [ ] Pass: `npx playwright test --project=devtools` (4/4)

#### DoD
- [ ] Spec file committed
- [ ] CI workflow runs new project (verified by next PR's CI log)
- [ ] No regression in existing 21+ Playwright scenarios

---

## Phase 2: Requests + Errors Tabs — data flows server-to-overlay

**Objective:** Server-side request lifecycle events and `csrf.warn` events reach the overlay via Vite HMR bridge. Two tabs (Requests, Errors) render real data within 100ms of the server emitting it. Privacy redaction at dispatcher level.

### T2.1 — Dispatcher + queue + reducer + HMR bridge

#### Objective
Establish the unified event channel: server emits `theo:devtools:request|error|csrf.warn` events via `import.meta.hot.send`; client consumes via `import.meta.hot.on`; events queue if React isn't mounted yet; reducer applies state updates.

#### Evidence
- Astro `helpers.ts:80-107` proves `import.meta.hot.send/.on` works as a typed bidirectional channel.
- Next.js `dev-overlay.browser.tsx:84-138` proves the `createQueuable` pattern for events-before-mount.
- TheoKit logger already emits structured JSON; it just needs an alternative output sink for the devtools channel.

#### Files to edit
```
packages/theo/src/devtools/dispatcher.ts              — (NEW) singleton dispatcher with queue (Pattern F from .claude/knowledge-base/reference/devtools.md §4)
packages/theo/src/devtools/reducer.ts                  — (NEW) useDevtoolsReducer with actions for requests/errors/route-matched
packages/theo/src/devtools/hmr-bridge.ts               — (NEW) wraps import.meta.hot.send/.on with type safety + dev-only guard
packages/theo/src/devtools/server-side/broadcast.ts    — (NEW) server-side broadcast helper (used by logger.ts, csrf.ts via DI)
packages/theo/src/server/logger.ts                     — Modify: also emit structured logs to devtools broadcast channel (dev only)
packages/theo/src/server/csrf.ts                       — Modify: emit csrf.warn to devtools broadcast channel (dev only)
packages/theo/src/devtools/Overlay.tsx                 — Wire useDevtoolsReducer + useInsertionEffect dispatch flush + hmr-bridge subscription
tests/unit/devtools-dispatcher.test.ts                 — (NEW) queue + replay + dedup behavior
tests/unit/devtools-reducer.test.ts                    — (NEW) actions for request/error/csrf-warn + ring buffer cap
tests/unit/devtools-hmr-bridge.test.ts                 — (NEW) bridge wires send/on; respects dev-only guard
tests/integration/devtools-server-emits.test.ts        — (NEW) integration: send HTTP request → broadcast fires → client receives
```

#### Deep file dependency analysis
- **`packages/theo/src/devtools/dispatcher.ts`** (NEW, ~80 LOC): exports `dispatcher: Dispatcher` singleton with `onRequest`, `onError`, `onRouteMatched`, `onCsrfWarn`. Each method uses `createQueuable` (mirror Next.js `dev-overlay.browser.tsx:124-138`): if no dispatch registered, push to queue. On mount, `replayQueuedEvents` flushes.
- **`packages/theo/src/devtools/reducer.ts`** (NEW, ~120 LOC): `useDevtoolsReducer(initialState)`. Actions:
  - `REQUEST_ADD` → append to `state.requests` (ring buffer cap 50; oldest FIFO-evicted)
  - `ERROR_ADD` → append to `state.errors` (ring buffer cap 50)
  - `ROUTE_MATCHED` → update `state.activeRoutePath`
  - `CSRF_WARN` → synthesize an `ErrorRecord` with `code` + `docsUrl` from payload; append
  - `TOGGLE_PANEL`, `SET_TAB`, `SET_POSITION`, `SET_THEME` (from Phase 4)
- **`packages/theo/src/devtools/hmr-bridge.ts`** (NEW, ~100 LOC):
  - `subscribeToServerEvents(dispatcher)`: in browser, calls `import.meta.hot.on('theo:devtools:request', ...)`, `.on('theo:devtools:csrf.warn', ...)`, etc. Wires to `dispatcher.onRequest(...)`.
  - **EC-25 mitigation**: each subscribed callback is wrapped in a try/catch — a throwing callback logs `console.error('[theo devtools]', err)` but does NOT propagate to Vite's HMR client. Without this, a buggy reducer / type mismatch in a single dispatch would tear down the user's HMR connection, requiring page reload to recover.
  - Channel name constants: `THEO_DEVTOOLS_REQUEST = 'theo:devtools:request'`, etc. Centralized for type safety.
  - Type-safe `Payload<T>` interface per channel.
  - Guards: `if (typeof window === 'undefined' || !import.meta.hot) return` — never runs in SSR or prod.
- **`packages/theo/src/devtools/server-side/broadcast.ts`** (NEW, ~60 LOC):
  - `broadcastToDevtools(event: string, payload: object)`: in dev, calls `globalThis.__theoViteHotServer?.ws.send({ type: 'custom', event, data: payload })`. In prod, no-op.
  - The plumbing: Vite plugin (T2.4) populates `globalThis.__theoViteHotServer` with the dev-server reference so server-side modules can `ws.send` without depending on Vite directly.
- **`packages/theo/src/server/logger.ts`** modification: when emitting a `warn`/`error` (and `event === 'csrf.warn'` matches), additionally call `broadcastToDevtools('theo:devtools:csrf.warn', payload)`. Gate on dev (use `import.meta.env.DEV` or similar).
- **`packages/theo/src/server/csrf.ts`** modification: the existing `enforceCsrf` already emits `csrf.warn` via logger; the additional dispatch happens automatically if logger.ts is updated. Verify: the warn structure matches the broadcast channel contract.
- **`packages/theo/src/devtools/Overlay.tsx`** modification (from T1.1's stub):
  - Wire `useReducer(devtoolsReducer, ...)`
  - `useInsertionEffect(() => { dispatcher.setDispatch(dispatch); subscribeToServerEvents(dispatcher); return () => dispatcher.setDispatch(null) }, [])`

Downstream impact:
- Two new tabs (Requests, Errors — T2.2) consume the reducer state.
- Privacy redaction (T2.3) runs INSIDE `broadcastToDevtools` so secrets never enter the WS payload.
- `executeRoute` in `packages/theo/src/server/execute.ts` does NOT change — the logger receives the request lifecycle from the existing instrumentation.

#### Deep Dives

**Dispatcher singleton with queue (Pattern F from to-reference):**
```ts
// dispatcher.ts
type Dispatch = (action: DevtoolsAction) => void
const MAX_QUEUE_SIZE = 100  // EC-23: bound pre-mount buffer

let _dispatch: Dispatch | null = null
const _queue: Array<(d: Dispatch) => void> = []

function queuable<Args extends any[]>(fn: (d: Dispatch, ...args: Args) => void) {
  return (...args: Args) => {
    if (_dispatch) fn(_dispatch, ...args)
    else {
      // EC-23: FIFO-evict if queue full
      if (_queue.length >= MAX_QUEUE_SIZE) _queue.shift()
      _queue.push((d) => fn(d, ...args))
    }
  }
}

export const dispatcher = {
  onRequest: queuable((d, req: RequestRecord) => d({ type: 'REQUEST_ADD', request: req })),
  onError: queuable((d, err: ErrorRecord) => d({ type: 'ERROR_ADD', error: err })),
  onCsrfWarn: queuable((d, p: CsrfWarnPayload) => d({ type: 'CSRF_WARN', payload: p })),
  // EC-24: setDispatch is idempotent — calling it 2x with non-null only flushes once total
  setDispatch(d: Dispatch | null) {
    const prevDispatch = _dispatch
    _dispatch = d
    if (d && !prevDispatch) flushQueue()  // only flush on NULL → non-null transition
  },
}
function flushQueue() {
  while (_queue.length) _queue.shift()!(_dispatch!)
}
```

**Ring buffer for requests/errors:**
```ts
// reducer.ts
const RING_BUFFER_CAP = 50
function reducer(state: DevtoolsState, action: DevtoolsAction): DevtoolsState {
  switch (action.type) {
    case 'REQUEST_ADD':
      return { ...state, requests: [action.request, ...state.requests].slice(0, RING_BUFFER_CAP) }
    case 'ERROR_ADD':
      return { ...state, errors: [action.error, ...state.errors].slice(0, RING_BUFFER_CAP) }
    // ...
  }
}
```

**Why `useInsertionEffect` (Pattern F from §7.5 of to-reference):**
`useEffect` runs AFTER commit. `useLayoutEffect` runs synchronously after commit but BEFORE paint. `useInsertionEffect` runs DURING commit, before any DOM mutations. We need the earliest hook so queued events flush before any other component reads state. Next.js uses `useInsertionEffect`; we follow.

**Broadcast channel naming:**
- `theo:devtools:request` — fired after a `/api/*` request completes (success or error)
- `theo:devtools:error` — fired on unhandled error / rejection (browser-side)
- `theo:devtools:csrf.warn` — fired when `enforceCsrf` emits warn
- `theo:devtools:route-matched` — fired when router resolves a route (build-time generated routes; runtime emits on navigation)

All four prefixed with `theo:devtools:` to namespace against user-app HMR channels.

**Invariants:**
- Events fired before React mount are queued; no events lost.
- After mount, queue is drained synchronously; no events delayed.
- Ring buffer cap is exact: never more than 50 entries per list.
- `broadcastToDevtools` is a no-op in prod (gated on `import.meta.env.DEV` or equivalent).
- HMR-bridge subscriptions are removed on `Overlay` unmount (cleanup function in `useInsertionEffect`).

**Edge cases:**
- Server emits 1000 requests in 100ms (load test) — ring buffer caps at 50, latest 50 kept. Older silently FIFO-evicted.
- HMR reconnect: `import.meta.hot.on(...)` doesn't re-fire historical events. Fresh subscription only sees new events. Acceptable for v0.
- Privacy: `Authorization: Bearer xyz` MUST be redacted BEFORE entering `broadcastToDevtools` (T2.3 — but the type contract from T2.1 forbids raw headers in payload).
- React.StrictMode double-effect: `useInsertionEffect` runs twice in StrictMode (mount → unmount → mount). The queue MUST handle this gracefully: cleanup nulls `_dispatch`, remount re-flushes the (now-empty) queue. No-op replay is safe.

#### Tasks
1. Create `shared.ts` types for `RequestRecord`, `ErrorRecord`, `CsrfWarnPayload`, `DevtoolsAction` (already partly from T1.1; extend).
2. Implement `dispatcher.ts` with `queuable` helper + 4 dispatcher methods + `setDispatch`/`flushQueue`.
3. Implement `reducer.ts` with all 6+ actions and ring buffer cap.
4. Implement `hmr-bridge.ts` `subscribeToServerEvents`.
5. Implement `server-side/broadcast.ts` `broadcastToDevtools`.
6. Modify `vite-plugin/index.ts` to populate `globalThis.__theoViteHotServer` with the dev server (or pass the WS instance via a different mechanism — implementation choice).
7. Modify `server/logger.ts` to call `broadcastToDevtools` when warn/error level + dev mode.
8. Modify `server/csrf.ts` to ensure the warn structure matches the broadcast contract (likely already matches — verify).
9. Modify `Overlay.tsx` to wire the dispatcher + reducer + subscription.
10. Write 4 test files (dispatcher, reducer, hmr-bridge, integration server→client).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dispatcher_queues_before_setDispatch() — Given no dispatch registered, When dispatcher.onRequest({...}) called 3x, Then queue.length === 3
RED:     test_dispatcher_flushes_on_setDispatch() — Given queue has 3 entries, When setDispatch(d) called, Then d invoked 3x AND queue.length === 0
RED:     test_dispatcher_passthrough_after_setDispatch() — Given dispatch registered, When dispatcher.onError({...}) called, Then dispatch invoked directly (no queue growth)
RED:     test_dispatcher_setDispatch_null_clears() — Given dispatch registered, When setDispatch(null), Then subsequent calls go to queue (not crashed)
RED:     test_dispatcher_queue_capped_at_100() — EC-23: Given no dispatch, When 200 events fired, Then queue.length === 100 (oldest 100 FIFO-evicted)
RED:     test_dispatcher_setDispatch_idempotent_on_double_call() — EC-24: Given queue has 5 entries, When setDispatch(d1) then setDispatch(d2) without null between, Then d1 invoked 5x (one flush) AND d2 never invoked from flush (only from new events) — StrictMode-safe
RED:     test_hmr_bridge_isolates_throwing_callback() — EC-25: Given mock import.meta.hot.on callback throws inside dispatcher.onRequest, When event fires, Then console.error called AND no rethrow to Vite HMR client (assert via global error handler)
RED:     test_reducer_request_add_appends() — Given state.requests=[], When REQUEST_ADD action, Then state.requests.length === 1
RED:     test_reducer_request_add_caps_at_50() — Given state.requests has 50 items, When REQUEST_ADD action, Then state.requests.length === 50 (oldest evicted)
RED:     test_reducer_error_add_caps_at_50() — Same cap for errors
RED:     test_reducer_csrf_warn_synthesizes_error_record() — Given CSRF_WARN action with {code,docsUrl,method,path}, Then state.errors[0].type === 'csrf.warn' AND .docsUrl === payload.docsUrl
RED:     test_hmr_bridge_subscribes_dev_only() — Given import.meta.hot undefined, When subscribeToServerEvents called, Then no-op (no throw, no subscription)
RED:     test_hmr_bridge_routes_request_event_to_dispatcher() — Given mock import.meta.hot.on, When event 'theo:devtools:request' fires, Then dispatcher.onRequest called with payload
RED:     test_broadcast_noop_in_prod() — Given import.meta.env.DEV=false, When broadcastToDevtools called, Then __theoViteHotServer not touched
RED:     test_broadcast_sends_in_dev() — Given dev mode + __theoViteHotServer mock, When broadcastToDevtools('theo:devtools:request', payload), Then ws.send called with correct structure
RED:     test_logger_warn_triggers_broadcast_in_dev() — Given dev mode + logger.warn({event:'csrf.warn',...}), Then broadcastToDevtools called once
RED:     test_logger_warn_no_broadcast_in_prod() — Same setup, but prod → no broadcast
RED:     test_integration_HTTP_POST_emits_request_event() — Integration: spin Vite + fixture, POST /api/test, expect WS to broadcast 'theo:devtools:request' with status+duration
RED:     test_useInsertionEffect_registers_dispatch_before_paint() — Given <Overlay /> mounted, Then dispatcher._dispatch is non-null AFTER useInsertionEffect commits (use React testing-library or document.querySelector check)
RED:     test_overlay_unmount_unregisters_dispatch() — Given <Overlay /> unmounted, Then dispatcher._dispatch === null + subscription cleaned up
GREEN:   Implement all 10 files; tests pass
REFACTOR: Centralize channel name constants if used in 3+ places (likely)
VERIFY:  npx vitest run tests/unit/devtools-*.test.ts && npx vitest run tests/integration/devtools-server-emits.test.ts
```

BDD scenarios:
- **Happy path:** Server POST → broadcast → client receives → reducer adds to state.requests → tab renders.
- **Validation error:** Channel name mismatch (server sends `theo:wrong-name`) → client `import.meta.hot.on` listener for `theo:devtools:request` not triggered → no false data.
- **Edge case:** 100 requests in rapid succession → ring buffer caps at 50, oldest evicted FIFO.
- **Error scenario:** Server in prod mode → broadcast no-ops → no `globalThis.__theoViteHotServer.ws.send` call (no crash).

#### Acceptance Criteria
- [ ] `dispatcher.ts` queue + replay works
- [ ] `reducer.ts` ring buffer cap is exactly 50
- [ ] `hmr-bridge.ts` subscribes only in dev
- [ ] `server-side/broadcast.ts` no-ops in prod
- [ ] `logger.ts` modified — `warn`/`error` levels broadcast in dev
- [ ] `csrf.ts` warn payload reaches broadcast unchanged
- [ ] `Overlay.tsx` wires `useInsertionEffect` dispatcher registration
- [ ] All 17 RED tests written first, then GREEN passing
- [ ] Integration test: real HTTP request → real WS broadcast → real reducer state update
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All 10 files committed
- [ ] Zero TypeScript errors
- [ ] Integration test demonstrates server-to-client flow
- [ ] Bundle budget unchanged (devtools only loaded in dev — prod still ≤ 350 KB)

---

### T2.2 — Requests + Errors tab UI rendering

#### Objective
Render the `state.requests` and `state.errors` arrays in the Panel. Click a row to expand details (method, path, status, duration, traceId, csrf-warn link with `docsUrl`).

#### Evidence
- TanStack `BaseTanStackRouterDevtoolsPanel.tsx:451-651` proves the row-list + detail-expand pattern.
- Per `.claude/knowledge-base/reference/devtools.md` §9.5: each row shows method/path/status/duration/traceId; click expands to show payload.

#### Files to edit
```
packages/theo/src/devtools/components/Tabs/RequestsTab.tsx — (NEW) renders state.requests
packages/theo/src/devtools/components/Tabs/ErrorsTab.tsx   — (NEW) renders state.errors with docsUrl link
packages/theo/src/devtools/components/RequestRow.tsx       — (NEW) row component (method badge, path, status code, duration, traceId)
packages/theo/src/devtools/components/ErrorRow.tsx         — (NEW) row component (icon by type, message, docsUrl link)
packages/theo/src/devtools/components/JSONExplorer.tsx     — (NEW) collapsible JSON view for request payload expansion
packages/theo/src/devtools/components/Panel.tsx            — Modify: import RequestsTab + ErrorsTab; tab-switcher between them
packages/theo/src/devtools/hooks/useDevtoolsContext.ts     — Modify: expose state.requests + state.errors via context (already done in T2.1)
tests/unit/devtools-requests-tab.test.ts                   — (NEW) renders empty state, renders rows, click expand
tests/unit/devtools-errors-tab.test.ts                     — (NEW) renders error rows with docsUrl link
```

#### Deep file dependency analysis
- **`RequestsTab.tsx`** (NEW, ~80 LOC): consumes `state.requests` from context. Maps to `<RequestRow />`. Empty state: "No requests yet — make one in your app to see it here."
- **`RequestRow.tsx`** (NEW, ~100 LOC): displays method badge (color by HTTP verb), path (truncate with title attr), status code (color by 2xx/3xx/4xx/5xx), duration in ms, traceId (truncated to 8 chars + click-to-copy). Click-row toggles expanded state (local useState). Expanded view renders `<JSONExplorer value={request.payload} />`.
- **`ErrorRow.tsx`** (NEW, ~80 LOC): icon by type (`csrf.warn` → red shield, `unhandled` → red bug, `console` → yellow !). Message truncated. If `error.docsUrl`, render `<a href={docsUrl} target="_blank">Open migration guide</a>`. Click expands stack trace.
- **`JSONExplorer.tsx`** (NEW, ~150 LOC): adapt the recursive pattern from `referencias/tanstack-router/packages/router-devtools-core/src/Explorer.tsx:104-339`. Pagination at 100 entries (Pattern §7.2 from to-reference). Click-to-expand per node. Special-case: React-element-shaped values are flattened. Use goober for styles.
- **`Panel.tsx`** modification: add tab-switcher (Requests / Errors / Routes / Settings). Active tab from `state.activeTab` (default `'requests'`). Set via `SET_TAB` action.

Downstream impact:
- Panel layout (T1.1) currently shows placeholder text. Now shows tab navigation + active tab content.
- `JSONExplorer.tsx` becomes reusable across tabs (Routes tab also uses it for route metadata in T3.1).
- TheoUI primitives are NOT used (they assume global Tailwind; we're in shadow DOM). All styling via goober.

#### Deep Dives

**Privacy redaction in row rendering:**
Headers `Authorization`, `Cookie`, `Set-Cookie` arrive already redacted at dispatcher level (T2.3). The Row component does NOT need to do anything extra — but truncates body display past 4KB (per ADR D10):
```ts
const displayPayload = payload.bodyLength > 4096
  ? `${payload.bodyPreview.slice(0, 4096)}... [truncated ${payload.bodyLength - 4096} bytes]`
  : payload.body
```

**Color coding (HTTP method + status):**
```ts
const methodColors = {
  GET: 'green', POST: 'blue', PUT: 'yellow', PATCH: 'yellow', DELETE: 'red', HEAD: 'gray', OPTIONS: 'gray',
}
function statusColor(s: number): string {
  if (s >= 200 && s < 300) return 'green'
  if (s >= 300 && s < 400) return 'blue'
  if (s >= 400 && s < 500) return 'yellow'
  return 'red'
}
```

**Empty states:**
- Requests tab empty: "No requests yet. Make a fetch call in your app to see it here."
- Errors tab empty: "No errors yet. The framework will surface unhandled errors, console.error, and `csrf.warn` here."

**Invariants:**
- Each row shows AT LEAST: method, path, status, duration, traceId.
- Errors with `docsUrl` MUST render a clickable link with `target="_blank" rel="noopener noreferrer"`.
- Expanded JSON view caps at 4KB display.
- Tab navigation is keyboard-accessible (arrow keys + Tab).
- **EC-20: NEVER use `dangerouslySetInnerHTML` in any devtools component.** All rendering goes through React's auto-escaping. Enforced by ESLint rule scoped to `packages/theo/src/devtools/**`: `'react/no-danger': 'error'`. Rationale: devtools renders user-controlled paths, error messages, JSON keys; even though dev-only, an XSS payload could phish dev-env credentials.
- **EC-27: Error stack traces display capped at 4KB** (same rule as body truncation). 1MB+ stacks (unbounded recursion crash dumps) would freeze the main thread on render.

**Edge cases:**
- Path very long (>200 chars) → truncate with `text-overflow: ellipsis`; full path in `title` attr.
- TraceId missing → show `'(no trace)'` placeholder.
- Status code 0 (network failure) → display `'failed'`.
- Duration 0 (cached / instant) → display `'<1ms'`.

#### Tasks
1. Implement `JSONExplorer.tsx` (port of TanStack Explorer; adapted for our types).
2. Implement `RequestRow.tsx` + `ErrorRow.tsx` — stack trace truncated to 4KB display (EC-27).
3. Implement `RequestsTab.tsx` + `ErrorsTab.tsx` (consume context, map to rows, empty state).
4. Modify `Panel.tsx` to add tab navigation.
5. Modify `reducer.ts` if not already done (T2.1) to support `SET_TAB` action.
6. **EC-20: Add ESLint rule** `'react/no-danger': 'error'` scoped to `packages/theo/src/devtools/**` in `eslint.config.js`. Add a guarded comment at the top of each devtools component: `// NEVER use dangerouslySetInnerHTML — see plan EC-20`.
7. Write 2 test files (including the 2 new EC tests).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_requests_tab_empty_state() — Given state.requests=[], When render <RequestsTab/>, Then DOM contains 'No requests yet'
RED:     test_requests_tab_renders_rows() — Given state.requests has 3 items, Then 3 row elements rendered
RED:     test_request_row_displays_method_color() — Given method='POST', Then badge color is 'blue'
RED:     test_request_row_displays_status_color() — Given status=500, Then status text color is 'red'
RED:     test_request_row_click_toggles_expand() — Given row rendered, When click, Then `data-expanded='true'` set
RED:     test_request_row_truncates_path() — Given path with 250 chars, Then visible text ends with '...' and title attr has full path
RED:     test_request_row_redacted_auth_header() — Given request payload has Authorization header, Then display shows '[REDACTED]' (redaction confirmed at row level even if upstream redaction failed)
RED:     test_errors_tab_empty_state() — Given state.errors=[], When render <ErrorsTab/>, Then DOM contains 'No errors yet'
RED:     test_errors_tab_renders_csrf_warn() — Given state.errors has 1 csrf.warn record, Then row icon is 'red shield' AND docsUrl link is clickable
RED:     test_errors_tab_docsUrl_link_attrs() — Given docsUrl set, Then <a> has target='_blank' AND rel='noopener noreferrer'
RED:     test_json_explorer_renders_primitive() — Given value={x:1}, Then renders 'x: 1'
RED:     test_json_explorer_paginates_large_objects() — Given value with 250 keys, Then renders 100/page pagination control
RED:     test_panel_tab_switcher_renders() — Given <Panel/>, Then 4 tab buttons (Requests/Routes/Errors/Settings) present
RED:     test_panel_set_tab_changes_active() — Given activeTab='requests', When click Errors tab, Then state.activeTab='errors'
RED:     test_error_row_truncates_long_stack() — EC-27: Given error.stack with 100k chars, When ErrorRow renders, Then DOM contains first 4KB + '[truncated N chars]' suffix AND render time < 50ms (no main-thread freeze)
RED:     test_eslint_rule_blocks_dangerouslySetInnerHTML() — EC-20: Given a devtools component using dangerouslySetInnerHTML, When npx eslint --rulesdir devtools, Then ERROR reported (verify via eslint programmatic API or by-fixture file)
RED:     test_no_devtools_component_uses_dangerouslySetInnerHTML() — EC-20: Given all files in packages/theo/src/devtools/, When grep 'dangerouslySetInnerHTML', Then ZERO matches (regression guard)
GREEN:   Implement components; all RED tests pass
REFACTOR: Extract common row hover/click handling into BaseRow component if duplicated 3+ times
VERIFY:  npx vitest run tests/unit/devtools-requests-tab.test.ts && npx vitest run tests/unit/devtools-errors-tab.test.ts
```

BDD scenarios:
- **Happy path:** State has 5 requests → Requests tab shows 5 rows in correct color; click one → expands JSON view.
- **Validation error:** State has 1 error with malformed docsUrl (empty string) → link is NOT rendered (don't show broken link).
- **Edge case:** Path is 1000 chars → truncates with title attr; ring buffer caps at 50 even if 100 added.
- **Error scenario:** `csrf.warn` payload missing `docsUrl` → row renders without link (gracefully degraded; no crash).

#### Acceptance Criteria
- [ ] All 5 new files committed
- [ ] All 14 RED tests pass
- [ ] Panel renders 4 tab buttons (Routes/Settings placeholders OK in this phase)
- [ ] Requests tab renders state.requests with color coding
- [ ] Errors tab renders state.errors with docsUrl link (when present)
- [ ] Click row → expands JSON detail (capped at 4KB)
- [ ] Empty states friendly + actionable
- [ ] Privacy: Auth/Cookie/Set-Cookie redacted (verified by row test)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All 14 tests passing
- [ ] Zero TypeScript errors
- [ ] Manual smoke: hit `/api/...` in fixture → see request in tab within 100ms
- [ ] Manual smoke: trigger CSRF warn (raw fetch without `X-Theo-Action`) → see entry in Errors tab with clickable docsUrl

---

### T2.3 — Privacy redaction at dispatcher level

#### Objective
Before any request payload reaches `broadcastToDevtools`, scrub `Authorization`, `Cookie`, `Set-Cookie` header values and truncate body to 4KB display. Per ADR D10.

#### Evidence
- Devtools commonly leaks auth tokens via screen-share or pasted bug reports. Industry standard for dev tooling: redact at source.
- `referencias/next.js/packages/next/src/server/lib/server-ipc/utils.ts` (`filterInternalHeaders`) — Next.js's pattern of filtering at server boundary.
- ADR D10 commits to this for v0.

#### Files to edit
```
packages/theo/src/devtools/server-side/redact.ts          — (NEW) pure redaction helpers (headers + query string + binary body + BigInt)
packages/theo/src/devtools/server-side/broadcast.ts       — Modify: call redact() before sending; pre-walk payload to replace BigInt with string
tests/unit/devtools-redact.test.ts                        — (NEW) 14 tests covering 3 headers + body truncation + query string + binary body + BigInt + edge cases
```

#### Deep file dependency analysis
- **`redact.ts`** (NEW, ~140 LOC): pure functions:
  - `redactHeaders(headers): Record<string,string>` — strips Authorization/Cookie/Set-Cookie values.
  - `truncateBody(body: unknown, max=4096): { preview, length, truncated }` — **EC-19**: accepts `unknown`, NOT `string`. Type-checks at entry; if `typeof body !== 'string'`, returns `{ preview: '[binary body]', length: 0, truncated: true }`. Without this, a multipart file upload (Buffer/FormData) would crash `.slice()`.
  - `redactQueryString(path: string): string` — **EC-18**: matches keys `token`, `api_key`, `password`, `secret`, `auth`, `access_token` (case-insensitive) in query string; replaces value with `[REDACTED]`. Signed URLs commonly leak tokens via path.
  - `serializeSafely(value: unknown): unknown` — **EC-26**: walks payload tree, converts BigInt to `String(bigint) + 'n'`, returns Vite-ws-safe value. Without this, BigInt fields (DB IDs) cause `TypeError: Do not know how to serialize a BigInt` and broadcast silently drops events.
- **`broadcast.ts`** modification: import + call `redactHeaders(payload.headers)`, `truncateBody(payload.body)`, `payload.path = redactQueryString(payload.path)`, and `serializeSafely(payload)` before constructing the WS message.
- Constants: `REDACTED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token', 'proxy-authorization'])` — case-insensitive matching.
- Constants: `REDACTED_QUERY_KEYS = new Set(['token', 'api_key', 'password', 'secret', 'auth', 'access_token'])` — case-insensitive matching.

Downstream impact:
- Request rows (T2.2) never see raw secrets.
- v1+ config `theo.config.ts.devtools.redact: string[]` would extend the Set.

#### Deep Dives

**Redaction algorithms:**
```ts
const REDACTED_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token', 'proxy-authorization'
])
const REDACTED_QUERY_KEYS = new Set([
  'token', 'api_key', 'password', 'secret', 'auth', 'access_token'
])

export function redactHeaders(h: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    if (REDACTED_HEADERS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]'
    } else {
      out[k] = Array.isArray(v) ? v.join(', ') : v
    }
  }
  return out
}

// EC-19: accepts unknown (binary safe)
export function truncateBody(body: unknown, max = 4096): {
  preview: string
  length: number
  truncated: boolean
} {
  if (body == null) return { preview: '', length: 0, truncated: false }
  if (typeof body !== 'string') {
    return { preview: '[binary body]', length: 0, truncated: true }
  }
  const length = body.length
  if (length <= max) return { preview: body, length, truncated: false }
  return { preview: body.slice(0, max), length, truncated: true }
}

// EC-18: redact ?token=, ?api_key=, ?password= etc from URL path
export function redactQueryString(path: string): string {
  const qIndex = path.indexOf('?')
  if (qIndex === -1) return path
  const base = path.slice(0, qIndex)
  const query = path.slice(qIndex + 1)
  const redacted = query.split('&').map((pair) => {
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) return pair
    const key = pair.slice(0, eqIndex)
    if (REDACTED_QUERY_KEYS.has(decodeURIComponent(key).toLowerCase())) {
      return `${key}=%5BREDACTED%5D`
    }
    return pair
  }).join('&')
  return `${base}?${redacted}`
}

// EC-26: walk payload, convert BigInt to safe string
export function serializeSafely(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (Array.isArray(value)) return value.map(serializeSafely)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = serializeSafely(v)
    return out
  }
  return value
}
```

**Invariants:**
- Headers `Authorization`, `Cookie`, `Set-Cookie` ALWAYS replaced with `'[REDACTED]'` regardless of case.
- Query-string keys `token`, `api_key`, `password`, `secret`, `auth`, `access_token` ALWAYS replaced with `'[REDACTED]'` (EC-18).
- Body type checked at entry; non-string returns `'[binary body]'` placeholder (EC-19).
- BigInt values in payload converted to `String(n) + 'n'` before serialization (EC-26).
- Bodies > 4096 chars truncated; metadata preserves original length.
- Pure functions — no side effects, no logging.
- Even if the redact fails (throws), broadcast MUST NOT include the raw payload (broadcast wrapped in try/catch with default-deny behavior).

**Edge cases:**
- Header `Authorization` (capital A) → matched case-insensitively.
- Multi-value `Set-Cookie` array → all values redacted.
- Body containing JSON with credit card numbers → NOT detected by name match; user MUST use future config (v1) to add `body.creditCard` patterns. v0 documents this limitation.
- Header value is empty string → still `[REDACTED]` (don't reveal "empty token").
- **EC-18 corner cases**: query keys can be URL-encoded (`%74%6F%6B%65%6E` for "token"); `decodeURIComponent(key)` before set-lookup handles it.
- **EC-19**: FormData / Buffer / Blob → all caught by `typeof !== 'string'` check.
- **EC-26**: nested BigInt in arrays / objects → recursive walk handles all depths.
- **EC-33 (DOCUMENT)**: JWT in non-standard header (`X-Access-Token`) NOT caught by v0; user MUST use v1 config to extend.

#### Tasks
1. Implement `redact.ts` with 4 pure helpers: `redactHeaders`, `truncateBody` (binary-safe), `redactQueryString`, `serializeSafely` (BigInt walker).
2. Modify `broadcast.ts` to call all 4 helpers in order (query → headers → body → serialize) before WS send.
3. Add try/catch wrapper in broadcast: if any redact helper throws, broadcast does NOT fire (default deny).
4. Write `tests/unit/devtools-redact.test.ts` with 14 tests (3 headers + 3 body + 4 query + 3 BigInt + 1 integration "broadcast applies all four").

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_redact_authorization_header() — Given headers={Authorization:'Bearer xyz'}, Then result.Authorization='[REDACTED]'
RED:     test_redact_case_insensitive() — Given headers={authorization:'Bearer xyz'}, Then result.authorization='[REDACTED]'
RED:     test_redact_cookie_set_cookie() — Given Cookie + Set-Cookie headers, Then both redacted
RED:     test_redact_array_value() — Given Set-Cookie as ['a=1','b=2'], Then result['Set-Cookie']='[REDACTED]'
RED:     test_redact_preserves_other_headers() — Given Content-Type + Authorization, Then Content-Type unchanged, Authorization redacted
RED:     test_truncate_body_within_limit() — Given body='small', Then preview='small', truncated=false
RED:     test_truncate_body_over_limit() — Given body of 5000 chars, Then preview.length=4096, truncated=true, length=5000
RED:     test_truncate_body_undefined() — Given body=undefined, Then preview='', truncated=false
RED:     test_truncate_body_binary_buffer() — EC-19: Given body=Buffer.from([1,2,3]), Then preview='[binary body]', truncated=true, length=0
RED:     test_truncate_body_formdata() — EC-19: Given body=new FormData(), Then preview='[binary body]' (no crash on .slice)
RED:     test_redact_query_string_token() — EC-18: Given path='/api/file?token=eyJhbGc', Then result='/api/file?token=%5BREDACTED%5D'
RED:     test_redact_query_string_multiple_keys() — EC-18: Given path with token + api_key + benign foo, Then both sensitive replaced, foo preserved
RED:     test_redact_query_string_url_encoded_key() — EC-18: Given path='/api?%74%6F%6B%65%6E=xyz' (encoded "token"), Then redacted
RED:     test_redact_query_string_no_query() — EC-18: Given path='/api/users', Then result='/api/users' (unchanged)
RED:     test_serializeSafely_converts_bigint() — EC-26: Given {id: 123n}, Then {id: '123n'}
RED:     test_serializeSafely_walks_nested() — EC-26: Given [{x: 5n, y: [{z: 10n}]}], Then nested BigInts all converted
RED:     test_serializeSafely_preserves_non_bigint() — EC-26: Given {a: 1, b: 'str', c: true, d: null}, Then identical output
RED:     test_broadcast_wraps_redact_in_try_catch() — Given redact throws (hostile payload), Then broadcast does NOT fire AND no crash
RED:     test_broadcast_passes_redacted_to_ws() — Given payload with Authorization + ?token in path + BigInt id, When broadcast called, Then ws.send receives '[REDACTED]' header AND '?token=%5BREDACTED%5D' path AND '123n' id
GREEN:   Implement redact.ts + modify broadcast.ts
REFACTOR: None
VERIFY:  npx vitest run tests/unit/devtools-redact.test.ts
```

BDD scenarios:
- **Happy path:** Authorization header → `[REDACTED]` in WS payload.
- **Validation error:** N/A (pure function, no validation).
- **Edge case:** Case-insensitive header match (`AUTHORIZATION` and `authorization` both caught).
- **Error scenario:** Hostile payload that crashes JSON.stringify → broadcast does NOT fire (default deny).

#### Acceptance Criteria
- [ ] `redact.ts` exists with 4 pure functions (redactHeaders, truncateBody, redactQueryString, serializeSafely)
- [ ] All 19 RED tests pass (3 original + 13 new EC-coverage + 3 integration)
- [ ] `broadcast.ts` calls all 4 helpers before WS send
- [ ] Broadcast wrapped in try/catch (no crashes)
- [ ] No raw `Authorization`/`Cookie`/`Set-Cookie` reaches WS payload (integration test verifies)
- [ ] No raw `?token=`/`?api_key=`/`?password=` in path field reaches WS payload (EC-18)
- [ ] Binary bodies surface as `'[binary body]'` placeholder (EC-19)
- [ ] BigInt values serialized as `'<n>n'` strings (EC-26)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All 3 files committed
- [ ] Privacy invariant proven by integration test (T2.4 if extended) or unit test
- [ ] Zero TypeScript errors

---

### T2.4 — Vite plugin exposes server WS to broadcast helper

#### Objective
Make `globalThis.__theoViteHotServer` available to `server-side/broadcast.ts` so it can send WS messages without a hard dependency on Vite. The Vite plugin populates this on dev-server start.

#### Evidence
- `packages/theo/src/vite-plugin/index.ts` already accesses Vite's `ViteDevServer` instance via the `configureServer(server)` hook. We attach the server reference to globalThis there.
- Astro's `import.meta.hot.send` from app code is the inverse — client sends to server. We need server-to-client, which is `server.ws.send({...})`.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts                — Modify: in configureServer hook, populate globalThis.__theoViteHotServer = server
packages/theo/src/devtools/server-side/broadcast.ts   — Modify (already in T2.1 plan): consume globalThis.__theoViteHotServer
tests/integration/devtools-broadcast.test.ts          — (NEW) integration: start Vite dev → emit broadcast → assert WS message received on client side
```

#### Deep file dependency analysis
- **`vite-plugin/index.ts`** modification: add to existing `configureServer(server)` hook:
  ```ts
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__theoViteHotServer = server
  }
  ```
  Cleanup: on server close, set to null.
- **`broadcast.ts`** (already covered in T2.1 file list): no further changes here — already references globalThis.
- **`tests/integration/devtools-broadcast.test.ts`** (NEW, ~100 LOC): integration test using Vite programmatic API + WebSocket client.

#### Deep Dives

**Why globalThis instead of explicit import:**
- `server-side/broadcast.ts` is consumed by `server/logger.ts` (a TheoKit module). If broadcast.ts hard-imports `vite-plugin/index.ts`, we create a cycle: logger → broadcast → vite-plugin → logger (since vite-plugin uses logger for its own warnings).
- `globalThis` is the standard "out-of-band" channel for this exact case. The Vite plugin owns the lifecycle (set/null); broadcast.ts is a passive reader.

**Type safety:**
```ts
declare global {
  var __theoViteHotServer: ViteDevServer | undefined
}
```
Hide behind a typed accessor:
```ts
function getViteServer(): ViteDevServer | undefined {
  return (globalThis as any).__theoViteHotServer
}
```

**Invariants:**
- `globalThis.__theoViteHotServer` set during Vite dev, null otherwise.
- broadcast.ts reads the var on each call (does NOT cache).
- broadcast.ts always wrapped in try/catch.

**Edge cases:**
- Vite restart: configureServer runs again → globalThis updated to new server reference. Old broadcasts using stale reference fail silently (try/catch).
- Production / `vite build` / `vite preview`: configureServer NOT called → globalThis remains undefined → broadcast no-ops.
- Multiple Vite instances (test harness, monorepo) → last-write-wins. Document. v1 may use a Symbol-keyed registry.

#### Tasks
1. Modify `vite-plugin/index.ts` to populate globalThis in configureServer.
2. Add cleanup on server.close (set to undefined).
3. Write integration test that spins Vite, broadcasts, asserts WS message received via a WebSocket client.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_vite_plugin_populates_globalThis_in_dev() — Given Vite dev started, Then globalThis.__theoViteHotServer is defined
RED:     test_vite_plugin_clears_globalThis_on_close() — Given dev server closed, Then globalThis.__theoViteHotServer === undefined
RED:     test_broadcast_uses_globalThis_reference() — Given globalThis populated, When broadcast called, Then server.ws.send invoked
RED:     test_broadcast_noop_when_globalThis_undefined() — Given globalThis empty, When broadcast called, Then no throw, no side effect
RED:     test_integration_emit_then_receive() — Given Vite dev + WS client connected, When broadcast('theo:devtools:test', {x:1}), Then WS client receives a message {type:'custom', event:'theo:devtools:test', data:{x:1}}
GREEN:   Implement plugin modification + integration test
REFACTOR: None
VERIFY:  npx vitest run tests/integration/devtools-broadcast.test.ts
```

BDD scenarios:
- **Happy path:** Vite dev → broadcast → WS message arrives.
- **Validation error:** N/A.
- **Edge case:** Vite restart → globalThis updated → next broadcast uses new reference.
- **Error scenario:** Prod / no Vite → broadcast silently no-ops (no crash).

#### Acceptance Criteria
- [ ] vite-plugin/index.ts populates globalThis in configureServer
- [ ] Cleanup on server.close
- [ ] All 5 RED tests pass
- [ ] Integration test demonstrates real WS message
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/integration/devtools-broadcast.test.ts`

#### DoD
- [ ] All 3 files committed (1 modified + 1 modified-from-T2.1 + 1 new integration test)
- [ ] Server-to-client broadcast pipeline working end-to-end
- [ ] Zero TypeScript errors

---

## Phase 3: Routes Tab — file tree, active highlight, open-in-editor

**Objective:** Render the file tree of `app/**` routes (from the build-time route manifest), highlight the currently matched leaf + layout chain, click any route to open the file in the editor via Vite's `/__open-in-editor`.

### T3.1 — Route manifest exposure + RoutesTab UI + open-in-editor

#### Objective
Expose the existing route manifest (`packages/theo/src/router/generate.ts` already builds one at dev time) to the devtools dispatcher. Build the Routes tab to render it as a tree. Highlight the active route. Wire click → fetch `/__open-in-editor?file=<absolute>`.

#### Evidence
- `packages/theo/src/router/generate.ts` already produces `__theoRouteManifest` at build time. Exposing it via the dispatcher is a 5-line plumbing.
- Astro xray (`xray.ts:166-176`) shows the `/__open-in-editor?file=<encoded>` pattern. Vite's launch-editor middleware accepts this URL out of the box.
- TanStack `BaseTanStackRouterDevtoolsPanel.tsx:107-251` (RouteComp recursive tree) is the reference shape; we adapt to TheoKit's file-based routes.

#### Files to edit
```
packages/theo/src/devtools/components/Tabs/RoutesTab.tsx  — (NEW) renders route tree with active highlight
packages/theo/src/devtools/components/RouteNode.tsx        — (NEW) recursive tree node component
packages/theo/src/devtools/server-side/route-manifest.ts   — (NEW) reads router manifest + broadcasts on update
packages/theo/src/devtools/hooks/useActiveRoute.ts          — (NEW) tracks current pathname; emits ROUTE_MATCHED action
packages/theo/src/router/generate.ts                       — Modify: also call broadcastToDevtools('theo:devtools:manifest', manifest) on regeneration
packages/theo/src/devtools/reducer.ts                      — Modify: add MANIFEST_UPDATED + ROUTE_MATCHED actions
tests/unit/devtools-routes-tab.test.ts                     — (NEW) renders tree, highlights active, click triggers fetch
tests/unit/devtools-route-manifest.test.ts                 — (NEW) reads manifest + emits broadcast
```

#### Deep file dependency analysis
- **`RoutesTab.tsx`** (NEW, ~80 LOC): consumes `state.routeManifest` + `state.activeRoutePath`. Maps to a tree of `<RouteNode>` components. Empty state if manifest not yet received.
- **`RouteNode.tsx`** (NEW, ~120 LOC): recursive. Props: `node`, `activeChain: string[]`, `depth: number`. Renders node label + children. If node path matches one of `activeChain`, highlight (bold + background color). Click → fetch `/__open-in-editor?file=${encodeURIComponent(node.absoluteFilePath)}`.
- **`route-manifest.ts`** (NEW, ~50 LOC): server-side helper. On dev-server start AND on `generate.ts` regeneration, calls `broadcastToDevtools('theo:devtools:manifest', { routes, layouts, errors, loadings })`.
- **`useActiveRoute.ts`** (NEW, ~60 LOC): browser-side hook. Subscribes to `window.location` changes (via `popstate` and `pushState` monkey-patch — or via the existing TheoKit router events). On change, computes the matched chain by comparing pathname against `state.routeManifest`, dispatches `ROUTE_MATCHED`.
- **`generate.ts`** modification: add `broadcastToDevtools('theo:devtools:manifest', manifest)` after writing the manifest. Gated on dev.
- **`reducer.ts`** modification: add `MANIFEST_UPDATED` (replace state.routeManifest) and `ROUTE_MATCHED` (set state.activeRoutePath + activeChain) actions.

Downstream impact:
- Routes tab is now functional (the 3rd of 4 tabs).
- `/__open-in-editor` middleware is already in Vite — no extra wiring.
- `generate.ts` regenerates on file changes (existing behavior); each regeneration now also broadcasts.

#### Deep Dives

**Route manifest structure (matches existing TheoKit shape):**
```ts
type RouteManifest = {
  routes: Array<{
    path: string                  // '/blog/[slug]'
    absoluteFilePath: string      // '/abs/path/to/app/blog/[slug]/page.tsx'
    layoutChain: string[]         // ['/blog/layout.tsx', '/layout.tsx']
    hasLoading: boolean
    hasError: boolean
    hasNotFound: boolean
  }>
}
```

**Active route matching (client-side):**
```ts
function matchActiveChain(pathname: string, manifest: RouteManifest): string[] {
  // Find the route whose path pattern matches pathname; return layoutChain + leaf path
  for (const route of manifest.routes) {
    if (matchesPattern(route.path, pathname)) {
      return [...route.layoutChain, route.absoluteFilePath]
    }
  }
  return []
}
```

**Open in editor URL (matches Astro xray pattern):**
```ts
const url = `/__open-in-editor?file=${encodeURIComponent(absoluteFilePath)}`
await fetch(url)
```
Vite's launch-editor middleware handles the rest (opens VSCode, WebStorm, etc., based on `VITE_EDITOR` env var or auto-detect).

**Invariants:**
- RoutesTab renders empty until manifest received.
- Active route highlight updates on every navigation.
- Click on file path → fetch fires once (no double-click bouncing).
- Path patterns (`[slug]`, `[[...optional]]`) are matched correctly (delegate to TheoKit's existing matcher).

**Edge cases:**
- Pathname does NOT match any route (404) → activeChain is empty; tree renders without highlight.
- Manifest broadcast race: manifest arrives BEFORE Overlay mounts → queued via dispatcher (Pattern F from T2.1).
- File path contains characters that need URL encoding (spaces, parens, unicode) → `encodeURIComponent` handles.
- VITE_EDITOR not set → Vite's middleware tries to auto-detect; if it fails, returns 4xx; the click handler catches and shows a toast "Editor not configured. Set VITE_EDITOR=code in your env."

#### Tasks
1. Modify `generate.ts` to broadcast manifest after regeneration.
2. Implement `server-side/route-manifest.ts`.
3. Modify `reducer.ts` to handle MANIFEST_UPDATED + ROUTE_MATCHED.
4. Implement `useActiveRoute.ts` hook (browser-side).
5. Implement `RouteNode.tsx` recursive component.
6. Implement `RoutesTab.tsx` consumes manifest + active chain.
7. Write 2 test files.
8. Manual smoke: navigate fixture → see active leaf highlighted; click another → editor opens.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_routes_tab_empty_state() — Given state.routeManifest=null, Then 'Manifest not loaded yet' rendered
RED:     test_routes_tab_renders_tree() — Given manifest with 3 routes, Then 3 RouteNode elements rendered (or appropriate tree depth)
RED:     test_route_node_highlights_active() — Given node.path matches activeChain, Then data-active='true'
RED:     test_route_node_click_fetches_editor() — Given node rendered, When click, Then fetch called with '/__open-in-editor?file=<encoded>'
RED:     test_route_node_handles_unicode_paths() — Given file path with unicode chars, Then encodeURIComponent applied correctly
RED:     test_route_manifest_broadcast_on_generate() — Given generate.ts called, Then broadcastToDevtools called with manifest
RED:     test_reducer_manifest_updated() — Given state.routeManifest=null, When MANIFEST_UPDATED, Then state.routeManifest is the new manifest
RED:     test_reducer_route_matched_updates_chain() — Given ROUTE_MATCHED with chain=['a','b','c'], Then state.activeChain=['a','b','c']
RED:     test_useActiveRoute_listens_to_pathname() — Given <Overlay/> mounted, When pushState, Then dispatch(ROUTE_MATCHED) called with new chain
RED:     test_active_route_no_match() — Given pathname='/nonexistent', When matched, Then activeChain=[] (no crash)
RED:     test_editor_fetch_error_shows_toast() — Given /__open-in-editor returns 4xx, When click, Then visible message 'Editor not configured' rendered briefly
RED:     test_integration_navigate_updates_active() — Integration: navigate to /about → manifest broadcast received → ROUTE_MATCHED dispatched → RouteNode '/about/page.tsx' highlighted within 200ms
GREEN:   Implement all files; tests pass
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/devtools-routes-tab.test.ts && npx vitest run tests/unit/devtools-route-manifest.test.ts
```

BDD scenarios:
- **Happy path:** Navigate to `/about` → RoutesTab highlights `app/about/page.tsx` + `app/layout.tsx`.
- **Validation error:** N/A.
- **Edge case:** Path `/blog/hello world` (with space) → file path properly URL-encoded.
- **Error scenario:** VITE_EDITOR not set → fetch returns 4xx → user sees toast, no crash.

#### Acceptance Criteria
- [ ] 6 new files committed + 2 modifications
- [ ] All 12 RED tests pass
- [ ] Manifest broadcasts on generate
- [ ] Routes tab renders tree with active highlight
- [ ] Click route → editor opens (or graceful error toast)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All files committed
- [ ] Manual smoke confirms navigation → highlight + click → editor
- [ ] Zero TypeScript errors

---

## Phase 4: Drag, Persistence, Polish, Keyboard

**Objective:** The chip is draggable to 4 corners with spring-snap; position + tab + open-state persist to localStorage; Escape closes the panel; Cmd+Shift+D toggles. UX-grade polish.

### T4.1 — Draggable chip with corner snap

#### Objective
Port the Next.js drag state machine (`referencias/next.js/.../draggable.tsx:168-396`) adapted for TheoKit. State machine: `idle → press → drag → drag-end → idle`. Spring snap to nearest of 4 corners using velocity projection. Cover EC-8 (click-after-drag), EC-9 (right-click ignore), EC-10 (listener self-removal).

#### Evidence
- `referencias/next.js/.../draggable.tsx:1-396` — full proven implementation.
- EC-8/9/10 are documented in `.claude/knowledge-base/reference/devtools.md` §8.

#### Files to edit
```
packages/theo/src/devtools/components/Draggable.tsx       — (NEW) drag state machine + spring snap
packages/theo/src/devtools/hooks/useDrag.ts                — (NEW) the hook isolated (testable)
packages/theo/src/devtools/components/Indicator.tsx        — Modify: wrap chip in <Draggable>
packages/theo/src/devtools/reducer.ts                     — Modify: SET_POSITION action
tests/unit/devtools-draggable.test.ts                     — (NEW) state machine + EC tests
```

#### Deep file dependency analysis
- **`Draggable.tsx`** (NEW, ~250 LOC): wraps children in a `<div>` with pointer event handlers; computes corner positions; applies CSS `translate` on drag; on release, projects velocity → nearest corner → spring-snap via CSS transition.
- **`useDrag.ts`** (NEW, ~200 LOC): the hook isolated. State machine via `useRef<{ state: 'idle'|'press'|'drag'|'drag-end' }>`. Velocity history (last 5 samples ≥ 10ms apart).
- **`Indicator.tsx`** modification (from T1.1): wrap the chip button in `<Draggable position={state.position} setPosition={(p) => dispatch({ type: 'SET_POSITION', position: p })} />`.

Downstream impact:
- Indicator goes from fixed-corner to user-positionable.
- Position state synced with reducer + localStorage (T4.2).

#### Deep Dives

**State machine:**
```
idle → (pointerdown, left button only) → press
press → (move > 5px) → drag
press → (pointerup) → idle (just a click)
drag → (pointerup) → drag-end
drag-end → (click handler swallows; setTimeout 0) → idle
```

**Spring projection (from Next.js):**
```ts
function project(velocity: number, deceleration = 0.999): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration)
}
const projectedPos = { x: translation.x + project(velocity.x), y: translation.y + project(velocity.y) }
const nearest = getNearestCorner(projectedPos)
animate(nearest)  // CSS transition: translate 491.22ms var(--timing-bounce)
```

**EC-8 click swallow:**
After drag, the immediate `click` event must not fire (would toggle the panel unintentionally). The state machine intercepts: on `pointerup` from drag state → enter `drag-end` → register one-time `click` listener that calls `preventDefault + stopPropagation` then removes itself + transitions to idle.

**EC-9 right-click guard:**
`if (e.button !== 0) return  // ignore right click and middle click`

**EC-10 listener self-removal:**
The `transitionend` listener for the spring animation removes itself inside its own body to prevent leak across many drags.

**Invariants:**
- Right-click NEVER starts drag.
- After drag, the immediate click is swallowed (chip doesn't toggle panel).
- All event listeners removed on cleanup (no leaks).
- Drag works in all 4 corners; snap-to-corner always works.
- `data-dragging='true'` set on body during drag (to prevent text selection).
- **EC-28: Corner positions recomputed on every `pointermove`** (NOT cached at drag start). Reason: window resize during drag (DevTools open, responsive testing, mobile rotate) invalidates pre-computed corners. The recomputation is cheap (4× `getBoundingClientRect` reads on the chip + viewport math).

**Edge cases:**
- User drags below viewport (off-screen) → clamps to nearest in-viewport corner.
- User has zoom enabled → CSS scaling doesn't affect drag (pointer events use page coords).
- Touchscreen / pen → pointer events handle all (no separate touch handlers).
- Panel open during drag → `disableDrag` prop set (chip not draggable while panel open).

#### Tasks
1. Port `useDrag.ts` hook from Next.js draggable.tsx (adapt types).
2. Implement `Draggable.tsx` component.
3. Modify `Indicator.tsx` to wrap chip in Draggable.
4. Add `SET_POSITION` action to reducer.
5. Write `tests/unit/devtools-draggable.test.ts` with state machine + EC tests.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_useDrag_starts_in_idle() — Given initial state, Then machine.state === 'idle'
RED:     test_useDrag_transitions_to_press_on_pointerdown() — Given pointerdown with button=0, Then state='press'
RED:     test_useDrag_ignores_right_click() — EC-9: Given pointerdown with button=2, Then state remains 'idle'
RED:     test_useDrag_transitions_to_drag_on_threshold_move() — Given press + move >5px, Then state='drag'
RED:     test_useDrag_press_to_idle_on_pointerup_without_drag() — Given press without crossing threshold, When pointerup, Then state='idle' (was a click)
RED:     test_useDrag_drag_to_drag_end_on_pointerup() — Given drag state, When pointerup, Then state='drag-end'
RED:     test_useDrag_click_swallowed_after_drag() — EC-8: Given drag-end, When click fires, Then preventDefault + state→'idle' (no panel toggle)
RED:     test_useDrag_velocity_calculated_from_history() — Given 5 samples 50ms apart, Then velocity calc yields px/s value
RED:     test_useDrag_listener_self_removes() — EC-10: Given transitionend fires, Then removeEventListener called within listener
RED:     test_draggable_snaps_to_nearest_corner() — Given projected position at (300, 500), Then nearest corner selected by min Euclidean distance
RED:     test_draggable_disabled_when_panel_open() — Given panel open, When pointerdown on chip, Then no drag initiated (disabled prop)
RED:     test_draggable_persists_position_after_snap() — Given drag completes to top-right, Then dispatch(SET_POSITION, 'top-right') called
RED:     test_draggable_clamps_out_of_viewport() — Given projected position off-screen, Then snap to nearest in-viewport corner
RED:     test_indicator_uses_state_position() — Given state.position='top-right', Then chip rendered at top: 20px, right: 20px
RED:     test_draggable_recomputes_corners_on_resize() — EC-28: Given drag in progress (state=drag) at viewport 1024x768, When viewport resizes to 768x500 (window.dispatchEvent(new Event('resize'))) + pointermove, Then snap target uses new viewport corners (NOT pre-resize corners)
GREEN:   Implement Draggable + useDrag + Indicator modification + reducer action
REFACTOR: Extract velocity calc into utility if reused
VERIFY:  npx vitest run tests/unit/devtools-draggable.test.ts
```

BDD scenarios:
- **Happy path:** Drag chip from bottom-right to top-left → snaps to top-left → reload → still top-left.
- **Validation error:** Drag below viewport → snaps to nearest visible corner.
- **Edge case:** Right-click → no drag (context menu allowed).
- **Error scenario:** Pointer leaves window mid-drag → state machine resets to idle gracefully.

#### Acceptance Criteria
- [ ] 5 files committed/modified
- [ ] All 14 RED tests pass
- [ ] EC-8, EC-9, EC-10 explicitly tested
- [ ] Manual smoke: drag chip; click swallow works; right-click respected
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All tests passing
- [ ] No event-listener leaks (verified by repeated drag test)
- [ ] Zero TypeScript errors

---

### T4.2 — Persistence to localStorage + restore on load

#### Objective
Position, theme, open-state, active-tab persist to localStorage. On mount, restore from localStorage. Per ADR D3.

#### Evidence
- TanStack `useLocalStorage.ts:1-53` proves the pattern; we adapt minimally.

#### Files to edit
```
packages/theo/src/devtools/hooks/useLocalStorage.ts       — (NEW) JSON round-trip with try/catch
packages/theo/src/devtools/persistence.ts                  — (NEW) bidirectional sync: state ↔ localStorage
packages/theo/src/devtools/Overlay.tsx                     — Modify: load initial state from localStorage
packages/theo/src/devtools/reducer.ts                      — Modify: dispatch fires localStorage write side-effect (or via persistence.ts middleware)
tests/unit/devtools-persistence.test.ts                    — (NEW) round-trip + corrupt-storage handling
```

#### Deep file dependency analysis
- **`useLocalStorage.ts`** (NEW, ~50 LOC): React hook. `useState` with lazy initializer reading localStorage. Setter writes to localStorage.
- **`persistence.ts`** (NEW, ~80 LOC): defines persisted-key schema (`theo-devtools-position`, `theo-devtools-theme`, `theo-devtools-open`, `theo-devtools-active-tab`). `loadFromStorage()` and `writeToStorage(state)`.
- **`Overlay.tsx`** modification: lazy initializer for `useReducer` reads from localStorage. Effect listens for state changes and writes.
- **`reducer.ts`** modification: optional — could use a "side-effect middleware" pattern but simpler is to write from useEffect in Overlay.tsx.

#### Deep Dives

**Lazy initializer pattern:**
```ts
const [state, dispatch] = useReducer(
  reducer,
  initialState,
  (initial) => ({ ...initial, ...loadFromStorage() })
)

useEffect(() => { writeToStorage(state) }, [state.position, state.theme, state.open, state.activeTab])
```

**Corrupt storage handling (EC-29 per-key isolation):**
```ts
const STORAGE_VERSION = 1  // EC-21: bumped when schema shape changes

function readKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback  // EC-29: per-key try/catch — corrupt key doesn't lose all state
  }
}

export function loadFromStorage(): Partial<DevtoolsState> {
  // EC-21: if version mismatch, return empty (defaults used) — protects against shape drift across versions
  const storedVersion = readKey<number>('theo-devtools-storage-version', 0)
  if (storedVersion !== STORAGE_VERSION) return {}

  return {
    position: readKey<DevtoolsPosition>('theo-devtools-position', 'bottom-right'),
    theme: readKey<DevtoolsTheme>('theo-devtools-theme', 'system'),
    open: readKey<boolean>('theo-devtools-open', false),
    activeTab: readKey<DevtoolsTab>('theo-devtools-active-tab', 'requests'),
  }
}

export function writeToStorage(state: DevtoolsState) {
  try {
    localStorage.setItem('theo-devtools-storage-version', String(STORAGE_VERSION))
    localStorage.setItem('theo-devtools-position', JSON.stringify(state.position))
    // ... per-key writes ...
  } catch { /* quota exceeded or storage disabled — no-op */ }
}
```

**Invariants:**
- Position restored on reload (4 corners only — schema-validated).
- Theme restored.
- Open-state restored.
- Active tab restored.
- Corrupted JSON in **one** localStorage key → that field falls back to default; **other fields stay restored** (EC-29: per-key try/catch).
- **EC-21: `theo-devtools-storage-version=1` always written from v0**. If a future version (v1) reads a different version number → returns empty `{}` → defaults used. Protects against silent corruption when shape evolves.

**Edge cases:**
- localStorage quota exceeded → write throws; caught silently; in-memory state continues.
- localStorage disabled (private browsing, certain Safari modes) → reads return null; defaults used.
- User clears localStorage mid-session → next write recovers; reload starts fresh.
- **EC-21**: future v1 changes `position` shape from `string` to `{ corner, offset }` → bumps `STORAGE_VERSION` to `2` → reading v1's storage returns `{}` → defaults used. No silent corruption.
- **EC-29**: position key is `null` JSON, theme key is valid → theme restored, position uses default. Without per-key try/catch, the whole load would have failed and everything would reset.

#### Tasks
1. Implement `useLocalStorage.ts` hook.
2. Implement `persistence.ts` with load/write helpers.
3. Modify `Overlay.tsx` to lazy-init from storage + useEffect write.
4. Write `tests/unit/devtools-persistence.test.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_useLocalStorage_reads_existing_value() — Given localStorage has 'foo'={x:1}, Then hook returns {x:1}
RED:     test_useLocalStorage_returns_default_on_empty() — Given key not in storage, Then returns default
RED:     test_useLocalStorage_writes_on_update() — Given setter called with new value, Then localStorage.getItem(key) returns serialized new value
RED:     test_useLocalStorage_handles_corrupt_json() — Given storage has invalid JSON, Then returns default + no throw
RED:     test_useLocalStorage_handles_quota_exceeded() — Given storage.setItem throws QuotaExceededError, Then setter no-ops + no crash
RED:     test_persistence_loadFromStorage_returns_partial_state() — Given storage has position+theme + storage-version=1, Then returns {position, theme} (other fields undefined)
RED:     test_persistence_writeToStorage_writes_all_persisted_keys() — Given state, When writeToStorage called, Then 5 localStorage.setItem calls (4 fields + version key)
RED:     test_overlay_lazy_init_from_storage() — Given storage has position='top-left' + version=1, When Overlay mounts, Then initial state.position === 'top-left'
RED:     test_overlay_persists_on_position_change() — Given state.position changes via dispatch, Then localStorage.getItem('theo-devtools-position') === 'top-left' after effect
RED:     test_persistence_version_mismatch_returns_empty() — EC-21: Given storage has 'theo-devtools-storage-version'=0 (or absent), When loadFromStorage called, Then returns {} (no field read — version gate active)
RED:     test_persistence_version_match_proceeds() — EC-21: Given version=1 + valid position, Then position restored
RED:     test_persistence_per_key_isolation_corrupt_position() — EC-29: Given position key contains invalid JSON '{not valid' AND theme key contains '"dark"' AND version=1, When loadFromStorage called, Then result has theme='dark' AND position=undefined (fallback to default at Overlay level)
RED:     test_persistence_per_key_isolation_all_keys_corrupt() — EC-29: Given all keys corrupt (but version valid), Then loadFromStorage returns {} (each per-key catch fires) AND no throw bubbles up
RED:     test_persistence_writes_version_key() — EC-21: Given any writeToStorage call, Then localStorage.getItem('theo-devtools-storage-version') === '1'
GREEN:   Implement persistence files + Overlay modification
REFACTOR: None
VERIFY:  npx vitest run tests/unit/devtools-persistence.test.ts
```

BDD scenarios:
- **Happy path:** Set position to top-left → reload → position is top-left.
- **Validation error:** Corrupt JSON in localStorage → defaults used; no crash.
- **Edge case:** localStorage quota exceeded → silent no-op; in-memory state intact.
- **Error scenario:** localStorage disabled (private browsing) → defaults used; no errors logged.

#### Acceptance Criteria
- [ ] 5 files committed/modified
- [ ] All 14 RED tests pass (9 original + 5 EC-21/EC-29 tests)
- [ ] Manual: change position → reload → position restored
- [ ] **EC-21**: `localStorage.getItem('theo-devtools-storage-version')` returns `'1'` after first write
- [ ] **EC-29**: corrupt single key does NOT reset other valid keys (verified by isolation test)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All tests passing
- [ ] Manual smoke confirms reload restores state
- [ ] Zero TypeScript errors

---

### T4.3 — Keyboard shortcuts + Settings tab + opt-out config

#### Objective
Escape closes panel. Cmd+Shift+D (Ctrl+Shift+D on Linux/Windows) toggles devtools. Settings tab exposes position (radio) + theme (radio). `theo.config.ts.devtools = false` disables the whole module.

#### Evidence
- Astro Escape pattern (`toolbar.ts:373-382`) and TanStack close button (`BaseTanStackRouterDevtoolsPanel.tsx:424-449`).
- ADR D7 commits to opt-out config.

#### Files to edit
```
packages/theo/src/devtools/hooks/useShortcuts.ts          — (NEW) keyboard handlers
packages/theo/src/devtools/components/Tabs/SettingsTab.tsx — (NEW) position + theme controls
packages/theo/src/devtools/Overlay.tsx                     — Modify: wire useShortcuts
packages/theo/src/config/schema.ts                          — Modify: add `devtools?: boolean | { position?, theme? }` to TheoConfig schema
packages/theo/src/vite-plugin/inject-devtools.ts            — Modify: honor config.devtools === false (already plumbed in T1.2)
tests/unit/devtools-shortcuts.test.ts                       — (NEW) keyboard tests
tests/unit/devtools-settings-tab.test.ts                    — (NEW) Settings UI tests
tests/integration/devtools-config-opt-out.test.ts           — (NEW) verify opt-out
```

#### Deep file dependency analysis
- **`useShortcuts.ts`** (NEW, ~60 LOC): subscribes to document `keyup`. Handles Escape (close panel if open) and Cmd/Ctrl+Shift+D (toggle visibility).
- **`SettingsTab.tsx`** (NEW, ~80 LOC): two radio groups (position, theme). Dispatch SET_POSITION / SET_THEME on change.
- **`Overlay.tsx`** modification: `useShortcuts(dispatch, state)` at top of component.
- **`config/schema.ts`** modification: add `devtools` field to TheoConfig zod schema.
- **`inject-devtools.ts`** modification (continuation of T1.2): read config.devtools; if `false`, skip inject.
- Tests verify each piece + opt-out integration.

#### Deep Dives

**Keyboard event matching:**
```ts
function isToggleShortcut(e: KeyboardEvent): boolean {
  const cmdOrCtrl = navigator.platform.startsWith('Mac') ? e.metaKey : e.ctrlKey
  return cmdOrCtrl && e.shiftKey && e.key === 'D'
}
```

**Escape handling (Astro pattern):**
```ts
function onKeyup(e: KeyboardEvent) {
  if (e.key === 'Escape' && state.open) dispatch({ type: 'TOGGLE_PANEL' })
}
```

**Config schema:**
```ts
// schema.ts (excerpt)
const TheoConfigSchema = z.object({
  // ...
  devtools: z.union([z.boolean(), z.object({
    position: z.enum(['top-left','top-right','bottom-left','bottom-right']).optional(),
    theme: z.enum(['light','dark','system']).optional(),
  })]).optional(),
})
```

**Invariants:**
- Escape closes panel only if open (no-op when closed).
- Cmd/Ctrl+Shift+D toggles visibility regardless of focus.
- Listeners removed on Overlay unmount.
- `devtools: false` → zero overlay code reaches the browser (Vite plugin guard).
- `devtools: { position: 'top-left' }` → initial state has that position (unless localStorage has another).

**Edge cases:**
- User typing in a text input + presses Escape → if input is inside our shadow root, Escape closes panel; outside, no interference (event propagation respects shadow boundary).
- Cmd+Shift+D conflicts with browser shortcut (rare) → user can override via config or v1 lets users remap.
- Theme `'system'` follows `prefers-color-scheme` media query; listen and react.

#### Tasks
1. Implement `useShortcuts.ts`.
2. Modify `Overlay.tsx` to wire shortcuts.
3. Implement `SettingsTab.tsx`.
4. Modify config `schema.ts` to add devtools field.
5. Modify `inject-devtools.ts` to honor opt-out.
6. Write 3 test files.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_escape_closes_open_panel() — Given panel open, When keyup 'Escape', Then dispatch(TOGGLE_PANEL) called
RED:     test_escape_noop_when_closed() — Given panel closed, When keyup 'Escape', Then no dispatch
RED:     test_cmd_shift_d_toggles_on_mac() — Given platform=Mac, When keyup with metaKey + shiftKey + D, Then dispatch(TOGGLE_VISIBLE)
RED:     test_ctrl_shift_d_toggles_on_linux() — Given platform=Linux, When keyup with ctrlKey + shiftKey + D, Then dispatch(TOGGLE_VISIBLE)
RED:     test_shortcuts_cleaned_up_on_unmount() — Given Overlay unmounted, Then document has no devtools keyup listener
RED:     test_settings_tab_radio_groups() — Given SettingsTab rendered, Then 4 position radios + 3 theme radios visible
RED:     test_settings_position_change_dispatches() — Given position radio clicked, Then dispatch(SET_POSITION, 'top-left') called
RED:     test_settings_theme_change_dispatches() — Given theme radio clicked, Then dispatch(SET_THEME, 'dark') called
RED:     test_config_schema_accepts_devtools_false() — Given { devtools: false }, Then schema.parse succeeds
RED:     test_config_schema_accepts_devtools_object() — Given { devtools: { position: 'top-left' } }, Then schema.parse succeeds
RED:     test_config_schema_rejects_invalid_position() — Given { devtools: { position: 'middle' } }, Then schema.parse throws
RED:     test_inject_devtools_skipped_when_config_false() — Given config.devtools=false, isDev=true, Then HTML lacks script tag
RED:     test_integration_devtools_false_no_chip() — Integration: set config.devtools=false, run dev server, navigate to /, Then no theo-devtools-portal element registered
GREEN:   Implement all files; tests pass
REFACTOR: None
VERIFY:  npx vitest run tests/unit/devtools-shortcuts.test.ts && npx vitest run tests/unit/devtools-settings-tab.test.ts && npx vitest run tests/integration/devtools-config-opt-out.test.ts
```

BDD scenarios:
- **Happy path:** Press Cmd+Shift+D → chip visible/hidden toggle. Press Escape with panel open → closes.
- **Validation error:** Set `devtools: 'invalid'` in config → zod schema parse throws clear error.
- **Edge case:** Mac vs Linux modifier key (Cmd vs Ctrl).
- **Error scenario:** User sets `devtools: false` → entire module not loaded; no chip; no shadow root.

#### Acceptance Criteria
- [ ] 8 files committed/modified
- [ ] All 13 RED tests pass
- [ ] Escape closes panel
- [ ] Cmd/Ctrl+Shift+D toggles
- [ ] Settings tab radios work
- [ ] `devtools: false` opt-out verified
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All tests passing
- [ ] Manual smoke: keyboard shortcuts work; settings persist; opt-out works
- [ ] Zero TypeScript errors

---

### T4.4 — Full Playwright e2e spec covering all phases

#### Objective
Extend `tests/e2e/devtools.spec.ts` (created in T1.3) to cover Phase 2-4 end-to-end in a real browser. 8+ scenarios.

#### Evidence
- Existing `template-default.spec.ts` is the model. We extend devtools.spec.ts with the same shape.

#### Files to edit
```
tests/e2e/devtools.spec.ts                              — Extend with Phase 2/3/4 scenarios
```

#### Deep file dependency analysis
- Scenarios cover: chat send → Requests tab shows it; trigger CSRF warn → Errors tab shows with docsUrl link; navigate → Routes tab highlights leaf; drag chip → position persists across reload; Escape closes panel; settings tab radio works.

#### Tasks
1. Add 8+ scenarios to `devtools.spec.ts`.
2. Run `npx playwright test --project=devtools` → all green in Chromium.
3. (Optional) extend to Firefox + WebKit.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     playwright_chat_send_appears_in_requests_tab — Given Phase 1+2 wired, When user submits chat in template-default, Then within 200ms RequestsTab has a row with method=POST, path=/api/chat, status=200
RED:     playwright_csrf_warn_appears_in_errors_tab — When raw fetch to /api/test without X-Theo-Action, Then ErrorsTab has a row with code='CSRF_STRICT_CUTOVER' and docsUrl link clickable
RED:     playwright_route_match_highlights_in_routes_tab — When navigate to /, Then RoutesTab has app/page.tsx highlighted
RED:     playwright_route_navigate_to_about_updates_highlight — When push state to /about (if route exists in fixture, else add one), Then RoutesTab now highlights app/about/page.tsx
RED:     playwright_drag_chip_persists_position — When drag chip from bottom-right to top-left, Then localStorage has 'theo-devtools-position'='top-left'; reload → chip in top-left
RED:     playwright_escape_closes_panel — When panel open + press Escape, Then panel closes (state.open=false)
RED:     playwright_cmd_shift_d_toggles — When press Cmd+Shift+D (or Ctrl on Linux), Then chip visibility toggles
RED:     playwright_settings_tab_changes_theme — When click Settings tab + select 'dark', Then panel data-theme='dark' AND reload preserves
RED:     playwright_config_opt_out_no_chip — Edit fixture's theo.config.ts to devtools:false; pnpm dev; verify no chip rendered
GREEN:   All 9 scenarios pass in Chromium
REFACTOR: Extract shadow-piercing helper into tests/e2e/helpers/devtools.ts
VERIFY:  npx playwright test --project=devtools
```

BDD scenarios:
- **Happy path:** End-to-end user flow: chat → see request → warn → see error → click docsUrl → external link.
- **Validation error:** Set theme to invalid → UI doesn't accept (radio only has 3 options).
- **Edge case:** Drag + reload + position restored.
- **Error scenario:** Opt-out config → entire devtools absent.

#### Acceptance Criteria
- [ ] 9 scenarios added
- [ ] All passing in Chromium
- [ ] (Optional, defer to dogfood) Firefox + WebKit also passing
- [ ] Pass: `npx playwright test --project=devtools` (9/9)

#### DoD
- [ ] All e2e tests passing
- [ ] Dogfood-smoke updated to include devtools health check

---

## Phase 5: Final Dogfood QA (MANDATORY)

**Objective:** Validate end-to-end that the devtools surface works as a real user would experience it. Health score ≥ 70, zero CRITICAL issues, zero HIGH issues in features modified by this plan.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

Manual additional steps:
1. `npm create theokit@latest my-test-devtools` (uses 0.4.0)
2. `cd my-test-devtools && pnpm dev`
3. **Visual check:** chip visible bottom-right within 1 second of page load
4. **Click chip:** panel expands with 4 tabs
5. **Chat send:** Requests tab shows POST `/api/chat` with status 200 and traceId
6. **Raw fetch without `X-Theo-Action`:** Errors tab shows `CSRF_STRICT_CUTOVER` with clickable docsUrl
7. **Navigate to a different route (if fixture has one):** Routes tab highlights the new leaf
8. **Click a route in Routes tab:** editor opens (or graceful "Editor not configured" toast)
9. **Drag chip to top-left:** position changes; reload → still top-left
10. **Press Escape with panel open:** panel closes
11. **Cmd+Shift+D:** chip visibility toggles
12. **Build the project:** `pnpm build`; inspect `dist/index.html` — no `theo-devtools` substring; inspect `dist/assets/index-*.js` — no `goober` or `theo-devtools` substring
13. **Run the built preview:** `pnpm preview`; navigate to `/`; verify no chip, no shadow root, no customElement
14. **Set `theo.config.ts.devtools = false`:** restart dev; verify no chip
15. **Privacy check:** make a request with `Authorization: Bearer xyz` header; in Requests tab row detail, verify `[REDACTED]` is shown (not `Bearer xyz`)

### Acceptance Criteria

- [ ] Health score >= 70/100 (target: 50/50 dogfood checks)
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] All 15 manual steps pass
- [ ] Bundle budget green (≤ 350 KB gzipped for default template)
- [ ] All ~ 21+ Playwright scenarios green (existing 21+ + devtools 9)
- [ ] Privacy redaction verified (no secrets leak to overlay)
- [ ] Treeshake verified: prod bundle excludes all devtools code

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing.
2. Fix plan-caused CRITICAL + HIGH issues before declaring the plan complete.
3. Re-run `/dogfood full`.
4. Pre-existing issues are logged but do NOT block plan completion.

---

## Edge Case Review Incorporated

This plan was passed through `/edge-case-plan` review (2026-05-19) — see the chat log session for the full report.

13 edge cases identified beyond the original `.claude/knowledge-base/reference/devtools.md` EC-1..EC-16 (6 MUST FIX, 7 SHOULD TEST, 4 DOCUMENT) — **all 6 MUST FIX items and 7 SHOULD TEST items incorporated into the plan above**:

| EC | Severity | Task | Fix incorporated |
|---|---|---|---|
| EC-17 | MUST FIX | T1.1 | Inverted `NODE_ENV !== 'development'` → `NODE_ENV === 'production'` (positive prod check makes test env get the real component) + new RED test |
| EC-18 | MUST FIX | T2.3 | New `redactQueryString()` helper redacts `?token=`/`?api_key=`/etc. in path field + 4 new RED tests |
| EC-19 | MUST FIX | T2.3 | `truncateBody` type-checks input; binary → `'[binary body]'` placeholder + 2 new RED tests |
| EC-20 | MUST FIX | T2.2 | ESLint `'react/no-danger': 'error'` scoped to devtools + invariant + 2 new RED tests (grep + lint rule) |
| EC-21 | MUST FIX | T4.2 | `theo-devtools-storage-version=1` key shipped from v0 + 3 new RED tests |
| EC-22 | MUST FIX | T1.1 | Treeshake test `beforeAll` runs fresh build via execSync + updated RED test note |
| EC-23 | SHOULD TEST | T2.1 | `MAX_QUEUE_SIZE = 100` FIFO cap on pre-mount queue + 1 new RED test |
| EC-24 | SHOULD TEST | T2.1 | `setDispatch` flushes only on NULL→non-null transition + 1 new RED test |
| EC-25 | SHOULD TEST | T2.1 | HMR bridge wraps each callback in try/catch + 1 new RED test |
| EC-26 | SHOULD TEST | T2.3 | `serializeSafely()` walks payload converting BigInt → string + 3 new RED tests |
| EC-27 | SHOULD TEST | T2.2 | Stack truncated to 4KB display + 1 new RED test |
| EC-28 | SHOULD TEST | T4.1 | Corners recomputed on every pointermove + 1 new RED test |
| EC-29 | SHOULD TEST | T4.2 | Per-key try/catch in `readKey` helper + 2 new RED tests |

4 DOCUMENT items (EC-30 through EC-33) recorded as known limitations to be added to `CHANGELOG.md` 0.4.0 entry under "Known limitations" section + in-code JSDoc comments at the relevant call sites.

## Coverage Matrix

Table mapping original gaps/requirements (from §1 Context + ADRs) to tasks:

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | No in-page UI to surface framework signals | T1.1 + T1.2 + T1.3 | Vite plugin auto-injects devtools script in dev; chip + panel render inside shadow root |
| 2 | No way for server warns to surface in browser | T2.1 + T2.4 | Vite HMR bridge: `import.meta.hot.send`/`.on` carries server events to overlay |
| 3 | No matched-route visibility | T3.1 | Routes tab renders manifest, highlights active leaf + layout chain |
| 4 | No persistent context across reloads | T4.2 | localStorage round-trip for position, theme, open state, active tab |
| 5 | CLAUDE.md 0.4.0 roadmap item "Minimum devtools overlay" | All phases | 4 tabs (Requests/Routes/Errors/Settings) + auto-inject + persistence |
| 6 | 0.5.0+ "Production debugging story" foundation | T2.1 (dispatcher design) | Dispatcher abstraction lets exporter sink swap UI↔OTel in v1 |
| ADR D1 | React portal into Shadow DOM | T1.1 | `<theo-devtools-portal>` + `attachShadow({mode:'open'})` + `createPortal` |
| ADR D2 | Auto-inject via Vite plugin | T1.2 | resolveId/load/transformIndexHtml hooks |
| ADR D3 | localStorage persistence v0 | T4.2 | useLocalStorage hook + persistence module |
| ADR D4 | Vite HMR for bridge | T2.1 + T2.4 | `import.meta.hot.send/.on` namespaced as `theo:devtools:*` |
| ADR D5 | goober for shadow-DOM CSS | T1.1 (deps) + T1.1 (styles.ts) | `goober.css.bind({target: shadowRoot})` |
| ADR D6 | Tree-shake to noop in prod | T1.1 (index.ts) + T1.2 (Vite gate) | Dual export pattern + grep test verifies |
| ADR D7 | Monolith v0, plugin v1 | All phases | 4 hard-coded tabs; no extension API |
| ADR D8 | React useReducer + queue | T2.1 | dispatcher.ts createQueuable + useInsertionEffect flush |
| ADR D9 | 4 tabs MVP | T2.2 + T3.1 + T4.3 | Requests, Routes, Errors, Settings — no error overlay |
| ADR D10 | Privacy redaction at dispatcher | T2.3 | redact.ts strips Authorization/Cookie/Set-Cookie before WS send |
| EC-1 | body display:flex skew | T1.1 | Wrapper script `position: absolute` |
| EC-2 | React 18 Pages Router wipe | T1.1 | N/A — TheoKit is React 19; `<script>` wrap suffices |
| EC-3 | Events before React mounts | T2.1 | createQueuable pattern |
| EC-4 | Sourcemap mis-resolution | T1.2 | Use absolute virtual ID path |
| EC-7 | Drag-below-threshold close | T4.1 | State machine drag handler |
| EC-8 | Click after drag fires | T4.1 | `drag-end` state swallows click |
| EC-9 | Right-click starts drag | T4.1 | `e.button !== 0` guard |
| EC-10 | Transitionend listener leak | T4.1 | Listener self-removal |
| EC-11 | requestIdleCallback missing | (deferred — not used in v0) | If adopted later, fallback to setTimeout |
| EC-12 | Custom element namespace | T1.1 | `theo-devtools-*` prefix |
| EC-13 | a11y form labels | T4.3 (Settings) | Radios with `<label>` |
| EC-14 | Scrollbar in corner positioning | T4.1 | scrollbarWidth offset |
| EC-15 | View transition destroys overlay | (deferred — TheoKit has no view transitions v0) | If adopted later, mirror Astro |
| EC-16 | Singleton guard | T1.1 | `window.__theoDevtoolsMounted` flag |
| EC-17 | NODE_ENV='test' breaks dev-only check | T1.1 | Inverted to positive `=== 'production'` check |
| EC-18 | Auth tokens in query string path | T2.3 | `redactQueryString` scrubs `?token=`, `?api_key=`, etc. |
| EC-19 | Binary/multipart body crashes truncate | T2.3 | Type-check at entry; binary → `'[binary body]'` placeholder |
| EC-20 | `dangerouslySetInnerHTML` XSS risk | T2.2 | ESLint rule + invariant + grep test |
| EC-21 | localStorage schema migration | T4.2 | `theo-devtools-storage-version` key from v0 |
| EC-22 | Treeshake test against stale build | T1.1 | `beforeAll` runs fresh build |
| EC-23 | Pre-mount queue unbounded growth | T2.1 | `MAX_QUEUE_SIZE = 100` FIFO cap |
| EC-24 | `setDispatch` idempotency (StrictMode) | T2.1 | Flush only on NULL → non-null transition |
| EC-25 | HMR callback throws kills connection | T2.1 | Each callback wrapped in try/catch |
| EC-26 | BigInt in payload crashes serialize | T2.3 | `serializeSafely` walks + converts to string |
| EC-27 | Large stack traces freeze browser | T2.2 | Stack truncated to 4KB display |
| EC-28 | Window resize invalidates drag corners | T4.1 | Corners recomputed on every `pointermove` |
| EC-29 | Single corrupt key resets all state | T4.2 | Per-key try/catch in `readKey` helper |

**Coverage: 41/41 gaps + ADRs + ECs covered (100%)**

## Global Definition of Done

- [ ] All 5 phases completed
- [ ] All tests passing (Vitest + Playwright)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (no breaking change to TheoConfig schema — `devtools` field is optional)
- [ ] Code-audit checks passing across all modified packages
- [ ] **Plan-specific criteria:**
  - [ ] `Devtools` (noop in prod) + `DevtoolsInProd` (real) exported from `packages/theo/src/devtools/index.ts`
  - [ ] Vite plugin auto-injects in dev, never in build
  - [ ] Custom element `<theo-devtools-portal>` defined exactly once
  - [ ] Shadow DOM contains all overlay UI
  - [ ] Goober CSS scoped to shadow root
  - [ ] Dispatcher with queue + replay for pre-mount events
  - [ ] HMR bridge subscribes only in dev
  - [ ] Privacy redaction (Authorization, Cookie, Set-Cookie) at dispatcher level
  - [ ] Requests tab renders state.requests with ring buffer cap 50
  - [ ] Errors tab renders state.errors with docsUrl link
  - [ ] Routes tab renders manifest tree with active highlight + click-to-open-editor
  - [ ] Settings tab radios for position + theme
  - [ ] Drag chip with corner snap + EC-8/9/10 mitigations
  - [ ] Escape closes panel, Cmd/Ctrl+Shift+D toggles
  - [ ] localStorage persistence + restore
  - [ ] `theo.config.ts.devtools = false` opt-out
  - [ ] Tree-shake verified: prod bundle excludes all devtools code (grep test)
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70 (target: 50/50)
- [ ] **Fixture proof** — `fixtures/template-default` (already exists) used as primary devtools fixture; `tests/e2e/devtools.spec.ts` is the reproducible canonical test
- [ ] Bundle budget green (≤ 350 KB gzipped for default template)
- [ ] CHANGELOG entry under `[Unreleased]` for `0.4.0` minor
- [ ] Migration guide: NONE NEEDED (additive feature; no breaking change)

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them, not just as unit tests assert.

### Execution

Already specified in **Phase 5** above. Run `/dogfood full`. Always full. No shortcuts. Plus the 15 manual steps.

### Acceptance Criteria

(see Phase 5)

### If Dogfood Fails

(see Phase 5)
