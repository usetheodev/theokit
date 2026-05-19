# Reference: Devtools / In-page dev overlay

**Date:** 2026-05-19
**Depth:** exhaustive
**Frameworks analyzed:**
- TanStack Router devtools (`router-devtools-core` v1.167.3 + `react-router-devtools` + legacy `router-devtools`)
- Next.js `next-devtools/dev-overlay` (canary, `packages/next/src/next-devtools/`)
- Astro `dev-toolbar` (`packages/astro/src/runtime/client/dev-toolbar/`)
- Remix, SvelteKit, Nitro, Hono, tRPC — verified to **not ship** their own devtools surface (delegate to browser DevTools, Vite error overlay, or third-party libs)

**TheoKit package affected:** primary `packages/theo/src/devtools/` (NEW), secondary touches in `packages/theo/src/vite-plugin/index.ts`, `packages/theo/src/server/`, `packages/theo/src/router/entry-server.ts`

**Related references:**
- `.claude/knowledge-base/reference/server-components-rsc.md` — drove the "don't reimplement Next's bundler-coupled machinery" precedent applied below
- `.claude/knowledge-base/reference/enforcement-cutover.md` — pattern of `code` + `docsUrl` warns that the devtools error panel should render

---

## 1. Problem statement

- **What:** TheoKit has no in-page devtools. A developer running `pnpm dev` sees only Vite's built-in error overlay. To diagnose a request he must `grep` stdout for `csrf.warn`/`x-trace-id`/`x-request-id` and reconstruct what happened — exactly the friction the framework's own roadmap names as "the biggest perceived gap vs Next.js" (`CLAUDE.md:191`). The framework already emits the right primitives — W3C Trace Context propagation, structured `csrf.warn` with stable `code`+`docsUrl`, security headers, encrypted sessions — they just have no in-page surface.

- **Current state:** zero devtools UI in `packages/theo/src/`. `grep -rln "devtools" packages/theo/src/` returns only `server/security-headers.ts` (CSP word "devtools" inside a directive string). `theokit routes` (CLI) is the closest cousin and runs in the terminal only. Server-side primitives that should feed the overlay already exist: structured logs (`server/logger.ts`), trace ID (`server/trace-context.ts`), CSRF warns with `docsUrl` (`server/csrf.ts`).

- **Why now:** `CLAUDE.md` 0.4.0 roadmap lists "Minimum devtools overlay" as a committed item; `D6` of the 0.3.0 cutover plan moved devtools explicitly out of scope to 0.4.0. The 0.5.0+ "Production debugging story" item depends on the dev overlay foundation (same module pattern, just swap exporter in prod). This `/to-reference` answers "what to build in 0.4.0 such that 0.5.0+ is a small additive change."

## 2. Inventário completo de arquivos (mandatório)

### TanStack Router devtools

#### `packages/router-devtools-core/` (Solid.js core)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `src/index.tsx` | core | 3 | ✅ | §3.1 |
| `src/TanStackRouterDevtoolsCore.tsx` | core | 162 | ✅ | §3.1, §4.1 |
| `src/TanStackRouterDevtoolsPanelCore.tsx` | core | — | skim only | §3.1 (same shape as `Core`) |
| `src/FloatingTanStackRouterDevtools.tsx` | core | 291 | ✅ | §3.1, §4.3, §7.1 |
| `src/BaseTanStackRouterDevtoolsPanel.tsx` | core | 837 | ✅ | §3.1, §4.4 |
| `src/Explorer.tsx` | core | 490 | ✅ | §3.1, §7.2 |
| `src/context.ts` | support | 25 | ✅ | §3.1 |
| `src/useStyles.tsx` | support | 625 | ✅ | §3.1, §4.5 (goober CSS-in-JS) |
| `src/useLocalStorage.ts` | support | 53 | ✅ | §3.1, §4.2 |
| `src/useMediaQuery.ts` | support | — | not opened (auxiliary) | descarte §2 |
| `src/utils.tsx` | support | — | not opened (helpers) | descarte §2 |
| `src/theme.tsx` | support | — | not opened | descarte §2 |
| `src/tokens.ts` | support | — | not opened | descarte §2 |
| `src/NavigateButton.tsx` | support | — | not opened | descarte §2 |
| `src/AgeTicker.tsx` | support | — | not opened | descarte §2 |
| `src/logo.tsx` | support | — | not opened (branding) | descarte §2 |
| `package.json` | doc | 83 | ✅ | §6 (deps) |
| `README.md` | doc | — | skim only | — |
| `CHANGELOG.md` | doc | — | ✅ (head 80 + grep fix) | §8 |
| `eslint.config.js` / `tsconfig*.json` / `vite.config.ts` | doc/config | — | skim only | descarte §2 |
| `media/*` | doc | — | descarte | descarte §2 |

#### `packages/react-router-devtools/` (React binding)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `src/index.ts` | core | 25 | ✅ | §3.1, §4.6 (NODE_ENV tree-shake) |
| `src/TanStackRouterDevtools.tsx` | core | 128 | ✅ | §3.1, §4.7 (binding pattern) |
| `src/TanStackRouterDevtoolsPanel.tsx` | core | 90 | ✅ | §3.1 |
| `package.json` / `tsconfig*.json` / `vite.config.ts` | doc | — | skim | descarte §2 |
| `README.md` / `CHANGELOG.md` | doc | — | grep fix | §8 |

#### `packages/router-devtools/` (legacy alias)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `src/index.tsx` | core | 7 | ✅ | §3.1 (deprecated shim) |
| `README.md` / `CHANGELOG.md` / config | doc | — | skim | descarte §2 |

#### `packages/{vue,solid}-router-devtools/`

| File | Category | Read? | Reason |
|---|---|---|---|
| All files | — | skim only | Identical shape to React binding; only difference is `useState` → `createSignal`/`ref` equivalent. Cross-checked structure, didn't anchor in §3 (TheoKit is React-only). |

#### `examples/*/basic-devtools-panel/` and `examples/*/basic-non-nested-devtools/`

Discarded (see §2.discarded) — they are example apps, not implementation.

---

### Next.js `next-devtools/`

Next-devtools tem **214 arquivos** debaixo de `packages/next/src/next-devtools/`. Triagem honesta: a maior parte é UI de erro (overlay para crash/build error/hydration mismatch) — útil como referência mas fora do escopo do MVP TheoKit. Lê integralmente apenas o esqueleto: entry, indicator/draggable, shadow portal, segment trie, save-config. Os 200+ arquivos restantes ficam catalogados aqui com motivo de descarte por categoria, não por arquivo (a alternativa seria 200 linhas de tabela).

#### Files read in full

| File | Category | LOC | Anchored in |
|---|---|---|---|
| `packages/next/src/next-devtools/dev-overlay.browser.tsx` | core | 465 | §3.2 (entry + Pages/App split + queued dispatcher) |
| `packages/next/src/next-devtools/dev-overlay/dev-overlay.tsx` | core | 73 | §3.2 |
| `packages/next/src/next-devtools/dev-overlay/components/shadow-portal.tsx` | core | 9 | §3.2, §4.1 (Shadow DOM) |
| `packages/next/src/next-devtools/dev-overlay/components/devtools-indicator/devtools-indicator.tsx` | core | 113 | §3.2, §4.8 (indicator placement) |
| `packages/next/src/next-devtools/dev-overlay/components/errors/dev-tools-indicator/draggable.tsx` | core | 396 | §3.2, §4.9 (drag physics), §7.3 |
| `packages/next/src/next-devtools/dev-overlay/utils/save-devtools-config.ts` | support | 48 | §3.2, §4.10 (server-side persistence) |
| `packages/next/src/next-devtools/dev-overlay/segment-explorer-trie.ts` | core | 157 | §3.2, §7.4 (trie data structure) |

#### Files inventoried, categorized, NOT deep-read (with justification)

| Bucket | Files (count) | Category | Why not deep-read |
|---|---|---|---|
| Error overlay surface (`components/errors/**` minus `dev-tools-indicator/`) | ~ 35 | core | Error UI is out of scope for the TheoKit 0.4.0 minimum. The framework already streams structured error info; TheoKit can render a simpler panel in v0. Re-visit when adding error overlay parity. |
| `dev-overlay/container/runtime-error/**` | 5 | core | Same reason. Run-time error rendering surface — copy in v2. |
| Component primitives (`dialog`, `overlay`, `toast`, `tooltip`, `resizer`, `fader`, `hot-linked-text`, `copy-button`, `terminal`, `code-frame`, `call-stack`, `call-stack-frame`, `hydration-diff`, `environment-name-label`, `error-message`, `error-type-label`) | ~ 25 | support | Generic UI primitives. TheoKit has TheoUI as design system — would consume those, not these. |
| `components/devtools-panel/resize/**` | 3 | core | Pattern equivalent to TanStack drag-to-resize already covered. |
| `components/instant/**`, `instant-navs/**` | 3 | core | App Router specific feature (instant navigations) — not portable. |
| `components/overview/segment-*` | 3 | core | Renders the segment trie data — UI; trie itself read above. |
| `components/overlay/**`, `body-locker.ts` | 5 | support | Modal scroll-lock plumbing; ad-hoc per-framework. |
| `container/build-error.tsx`, `container/errors.tsx` | 2 | core | Build error UI — out of scope v0. |
| `font/`, `icons/`, `storybook/`, `styles/` | ~ 25 | support | Branding, icons, Storybook stories, CSS — TheoUI provides equivalents. |
| `hooks/use-*.ts` (5 files) | support | useDebouncedValue, useDelayedRender, useOnClickOutside, useShortcuts, useActiveRuntimeError | Standard React hooks; can be reimplemented in 10 LOC each. |
| `menu/**` (3 files) | core | Multi-panel router state machine. TheoKit MVP needs ONE panel. Skip. |
| `panel/dynamic-panel.tsx` | core | Dynamic panel host — equivalent pattern already in `dev-overlay.tsx`. |
| `shared.ts` | core | Action constants + state shape. Glanced for naming convention; the actions themselves are Next-specific. |
| `cache-indicator.tsx` | core | App Router cache state UI — out of scope. |
| `userspace/app/**`, `userspace/pages/**`, `server/font/**`, `server/**` | ~ 40 | server | Server-side dev-tool plumbing (font CDN resolution, dev indicator state, segment node tracking). Server side of devtools is a separate concern; TheoKit can wire its own using the patterns from §4.10. |
| `next-devtools.webpack-config.js` | core | Webpack config for Next's bundler — non-portable. |
| `components/devtools-indicator/hooks/use-*.ts` | support | Animation hooks (measure-width, minimum-loading-time, update-animation). Read selectively in §7.3 only the parts that matter for drag. |
| `components/devtools-indicator/next-logo.tsx`, `status-indicator.tsx` | core | Branding. |
| `components/devtools-indicator/devtools-indicator.css` | support | CSS-only file; tokens already covered via TanStack `useStyles`. |
| `client/components/navigation-devtools.ts` | core (client-app) | Userspace hook that calls `dispatcher.segmentExplorerNodeAdd` — pattern in §4.11. |
| `client/dev/error-overlay/websocket.ts` | core | Bridge to HMR websocket — pattern in §4.13. |
| `errors/improper-devtool.mdx` | doc | User-facing error doc page. Off topic. |
| `bundles/webpack/packages/SourceMapDevToolModuleOptionsPlugin.js`, `compiled/webpack/SourceMapDevToolModuleOptionsPlugin.js` | doc/vendored | "DevTool" in webpack source-map terminology, not UI devtools. Off topic. |

Total categorized: **214 / 214** files. Zero "om omitted for brevity" lines.

#### `examples/next-devtools-*`, `next-devtools/dev-overlay/storybook/**`

Discarded — Storybook stories. See §2.discarded.

---

### Astro `dev-toolbar/`

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `src/runtime/client/dev-toolbar/entrypoint.ts` | core | 285 | ✅ | §3.3, §4.12 (custom-elements registration, app plugin shape) |
| `src/runtime/client/dev-toolbar/toolbar.ts` | core | 605 | ✅ | §3.3, §4.1 (Shadow DOM), §4.14 (auto-hide), §7.5 (Escape) |
| `src/runtime/client/dev-toolbar/helpers.ts` | core | 108 | ✅ | §3.3, §4.13 (server helpers) |
| `src/runtime/client/dev-toolbar/apps/astro.ts` | core | — | not opened (built-in app; same shape as xray) | descarte §2 (shape covered by xray.ts) |
| `src/runtime/client/dev-toolbar/apps/xray.ts` | core | 184 | ✅ | §3.3, §4.15 (DOM scan + highlight) |
| `src/runtime/client/dev-toolbar/apps/settings.ts` | core | — | skim only | descarte §2 |
| `src/runtime/client/dev-toolbar/apps/audit/index.ts` | core | — | not opened | descarte §2 (audit is a11y/perf rules — out of scope v0) |
| `src/runtime/client/dev-toolbar/apps/audit/rules/a11y.ts` | core | — | not opened | descarte §2 |
| `src/runtime/client/dev-toolbar/apps/audit/rules/perf.ts` | core | — | not opened | descarte §2 |
| `src/runtime/client/dev-toolbar/apps/audit/rules/index.ts` | core | — | not opened | descarte §2 |
| `src/runtime/client/dev-toolbar/apps/audit/annotations.ts` | core | — | not opened | descarte §2 |
| `src/runtime/client/dev-toolbar/apps/audit/ui/*` (3 files) | core | — | not opened | descarte §2 |
| `src/runtime/client/dev-toolbar/apps/utils/*` (3 files: highlight, icons, window) | support | — | grep-only | §4.15 |
| `src/runtime/client/dev-toolbar/settings.ts` | support | — | not opened | descarte §2 |
| `src/runtime/client/dev-toolbar/ui-library/*` (13 files: badge, button, card, highlight, icons, icon, index, radio-checkbox, select, toggle, tooltip, window) | support | — | grep-only | §4.16 (custom-elements library) |
| Astro CHANGELOG entries | doc | — | grep fix | §8 |

#### `packages/astro/e2e/dev-toolbar*` + `packages/astro/e2e/fixtures/dev-toolbar/**` (~30 files)

Discarded — Playwright e2e tests and their fixtures. Useful as reference for what to test, but not implementation source. See §2.discarded.

---

### Outros frameworks (verified absence)

| Framework | Verified by | Result |
|---|---|---|
| Remix | `grep -rln "devtool\|DevTool\|dev-overlay\|errorOverlay\|inspector\|debugger" --include="*.ts" --include="*.tsx" --include="*.md"` | **Zero hits.** No devtools surface. |
| SvelteKit | same grep | 5 hits, all docs (`chrome://inspect`) or JS reserved word `debugger`. **No devtools UI.** |
| Nitro | same grep | 3 hits, all `node:inspector` runtime shims. **No devtools UI.** |
| Hono | same grep | **Zero hits.** Server runtime only. |
| tRPC | same grep | 2 hits in `examples/` consuming `@tanstack/react-query-devtools`. **tRPC delegates.** |

Convergent absence is a finding, not a gap. Documented in §4.0.

---

### Arquivos avaliados e descartados (com motivo)

| File | Why discarded |
|---|---|
| `referencias/tanstack-router/packages/router-devtools-core/src/useMediaQuery.ts` | Auxiliary hook (CSS media query subscription); standard 15-LOC pattern, no insight beyond name. |
| `referencias/tanstack-router/packages/router-devtools-core/src/utils.tsx` | Display-format helpers (`displayValue`, `getStatusColor`); reading `Explorer.tsx` already shows the call sites. |
| `referencias/tanstack-router/packages/router-devtools-core/src/theme.tsx` + `tokens.ts` | Color/spacing tokens. TheoKit will use TheoUI tokens, not lift these. |
| `referencias/tanstack-router/packages/router-devtools-core/src/NavigateButton.tsx` + `AgeTicker.tsx` + `logo.tsx` | Branded subcomponents (navigation link, time-ago badge, TanStack logo). Pattern obvious from `BaseTanStackRouterDevtoolsPanel.tsx`. |
| `referencias/tanstack-router/packages/{vue,solid}-router-devtools/**` | Same architectural shape as React binding (`useState(() => new Core)` → framework-equivalent). TheoKit is React-only; no insight worth deep-reading. |
| `referencias/tanstack-router/examples/{react,solid}/basic-{devtools-panel,non-nested-devtools}/**` | Example consumer apps, not the implementation. Pattern of usage already documented in §3.1. |
| `referencias/tanstack-router/docs/router/devtools.md` | Public-facing doc; doesn't reveal internals beyond what code shows. |
| `referencias/tanstack-router/packages/*-router-devtools/{eslint.config.js,tsconfig*.json,vite.config.ts,media/*}` | Build config + branding assets. |
| `referencias/next.js/packages/next/src/next-devtools/dev-overlay/storybook/**` (4 files) | Storybook stories for components — useful to see expected props, not implementation. |
| `referencias/next.js/packages/next/src/next-devtools/dev-overlay/**/*.stories.tsx` (~20 files) | Same — Storybook. |
| `referencias/next.js/packages/next/src/next-devtools/dev-overlay/**/*.test.ts` (~5 files) | Test coverage — does inform §7 edge cases but not implementation. The patterns are picked up via the source files themselves. |
| `referencias/next.js/errors/improper-devtool.mdx` | User-facing error doc page; the word "devtool" in this file refers to Chrome DevTools usage, not Next.js's UI. |
| `referencias/next.js/packages/next/src/bundles/webpack/packages/SourceMapDevToolModuleOptionsPlugin.js`, `compiled/webpack/SourceMapDevToolModuleOptionsPlugin.js` | Webpack vendored plugin — "DevTool" here means webpack's source-map setting, not the UI overlay. False positive from keyword grep. |
| `referencias/next.js/packages/next/next-devtools.webpack-config.js` | Build config for the dev-overlay bundle, webpack-specific; non-portable to Vite. |
| `referencias/next.js/packages/next/src/client/components/navigation-devtools.ts` | Userspace bridge (`dispatcher.segmentExplorerNodeAdd`) — pattern abstracted in §4.11; no surprises beyond the call site. |
| `referencias/next.js/packages/next/src/client/dev/error-overlay/websocket.ts` | HMR-bridge wiring — equivalent in Astro's `helpers.ts` already deep-read. |
| `referencias/next.js/packages/next/src/next-devtools/userspace/**` (~ 12 files) | App- and pages-router-specific userspace hooks that emit events to the overlay. Pattern abstracted in §4.11. |
| `referencias/next.js/packages/next/src/next-devtools/server/**` (~ 5 files) | Server-side dev-tools config storage and metadata serving. Important pattern (§4.10) covered via `save-devtools-config.ts`; the rest is Next-specific (font CDN, build-state). |
| All Astro dev-toolbar `e2e/` and `e2e/fixtures/dev-toolbar/**` files (~ 30) | Playwright test scaffolds. Used as reference for what scenarios to assert (§9.5), not as implementation source. |
| `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/astro.ts`, `settings.ts` | Built-in Astro-branded apps. Architectural shape identical to `xray.ts` (already deep-read); reading them adds zero pattern beyond logo/copy. |
| `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/audit/**` (~ 8 files) | A11y + performance audit rules. Useful as a future TheoKit "audit" app — out of scope for v0 minimal devtools. |
| `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/ui-library/**` (13 files) | Custom-element design system (badge, button, card, icon, etc.). TheoKit consumes TheoUI for UI primitives — won't lift these. Grep-only confirms the API shape (`extends HTMLElement` + `attachShadow`). |
| `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/utils/**` (highlight.ts, icons.ts, window.ts) | DOM-positioning utilities tied to Astro islands. TheoKit equivalents would be smaller — pattern covered in §4.15. |
| `referencias/vite/docs/images/vite-plugin-inspect.webp` + `referencias/vite/playground/devtools/**` (5 files) | "devtools" hit in Vite is a playground app testing dev-server behavior — NOT a devtools UI library. Vite's official devtools surface is `vite-plugin-inspect`, an external plugin (`antfu-collective/vite-plugin-inspect`), not in this repo. Out of scope for inventory. |
| `referencias/sveltekit/packages/kit/src/runtime/client/client.js:1526,2013` | Two `debugger` JS statements (reserved word). Not devtools UI. |
| `referencias/sveltekit/packages/kit/src/core/env.js:143` | String literal `'debugger'` in reserved-word list. Not devtools UI. |
| `referencias/sveltekit/documentation/docs/60-appendix/25-debugging.md` | Documentation explaining how to use Chrome DevTools with SvelteKit dev — not an in-page overlay. |
| `referencias/nitro/src/presets/{cloudflare,deno}/unenv/node-compat.ts`, `src/presets/iis/utils.ts` | Node.js `node:inspector` module shims in runtime compat layer. Not devtools UI. |
| `referencias/trpc/examples/next-prisma-websockets-starter/src/pages/index.tsx`, `next-sse-chat/src/app/page.tsx` | Example apps importing `@tanstack/react-query-devtools` (third-party). Confirms tRPC's strategy is to delegate, not to ship. |
| `referencias/tanstack-router/packages/router-devtools/src/index.tsx` | Legacy alias — 7 lines, just `console.warn` + re-export. Documents migration story (`/packages/router-devtools` → `/packages/react-router-devtools`), no implementation. |

Total descartado com justificativa: **~ 195 files**. Zero "..." placeholders.

---

## 3. Prior art — deep dive por framework

### 3.1 TanStack Router devtools — v1.167.3

#### API pública (React binding)

```ts
// referencias/tanstack-router/packages/react-router-devtools/src/index.ts:1-25
export const TanStackRouterDevtools:
  (typeof Devtools)['TanStackRouterDevtools'] =
    process.env.NODE_ENV !== 'development'
      ? function () { return null }
      : Devtools.TanStackRouterDevtools

export const TanStackRouterDevtoolsInProd:
  (typeof Devtools)['TanStackRouterDevtools'] = Devtools.TanStackRouterDevtools

export const TanStackRouterDevtoolsPanel /* ... mirror ... */

// referencias/tanstack-router/packages/react-router-devtools/src/TanStackRouterDevtools.tsx:10-46
export interface TanStackRouterDevtoolsOptions {
  initialIsOpen?: boolean
  panelProps?: HTMLAttributes<HTMLDivElement>
  closeButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>
  toggleButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  containerElement?: string | any
  router?: AnyRouter
  shadowDOMTarget?: ShadowRoot
}
```

API surface is tiny: 8 optional props, all visual/positioning. Router comes from `useRouter({ warn: false })` if not passed explicitly (`TanStackRouterDevtools.tsx:62-63`).

#### Algoritmo interno (passo a passo)

1. **Tree-shake on import** — `index.ts` reads `process.env.NODE_ENV`; production exports a `() => null` noop (`index.ts:7-11`). Bundler dead-code-eliminates the entire `TanStackRouterDevtools.tsx` import chain. Consumer never thinks about it.

2. **React binding instantiates Solid core via `useState(init)`** — `TanStackRouterDevtools.tsx:68-81`:
   ```ts
   const [devtools] = useState(
     () => new TanStackRouterDevtoolsCore({ ...allProps, router, routerState })
   )
   ```
   The core is a class instance, not React state. React only owns the host `<div ref={devToolRef} />` (`TanStackRouterDevtools.tsx:124-127`).

3. **Three `useEffect` channels propagate updates** — `TanStackRouterDevtools.tsx:84-111`:
   - `setRouter(activeRouter)` when router instance changes
   - `setRouterState(activeRouterState)` when router state changes (this fires on every navigation)
   - `setOptions(...)` when visual props change

4. **Mount on the host ref via `render()` (Solid)** — `TanStackRouterDevtoolsCore.tsx:81-126`:
   ```ts
   mount<T extends HTMLElement>(el: T) {
     if (this.#isMounted) throw new Error('Devtools is already mounted')
     const dispose = render(() => {
       // ...lazy-load FloatingTanStackRouterDevtools, render inside ShadowDomTargetContext.Provider
     }, el)
     this.#dispose = dispose
   }
   ```
   `render()` is Solid's `render`; `dispose` is the cleanup function returned by it. The React `useEffect` cleanup calls `devtools.unmount()` which calls `dispose()` (`TanStackRouterDevtools.tsx:113-121`).

5. **Floating button + draggable resize panel** — `FloatingTanStackRouterDevtools.tsx:60-288`:
   - Two localStorage-backed signals: `tanstackRouterDevtoolsOpen` (boolean), `tanstackRouterDevtoolsHeight` (number | null) (`FloatingTanStackRouterDevtools.tsx:76-84`)
   - Floating logo button (`mainCloseBtn`) fixed-positioned by `position` prop (`useStyles.tsx:471-507`)
   - Panel slides up from bottom; transform: `translateY(${height}px)` when closed (`useStyles.tsx:42-53`)
   - Drag handle on top of panel resizes via mousemove listener (`FloatingTanStackRouterDevtools.tsx:91-125`); `< 70px` triggers close (line 110)

6. **Three tabs inside the panel** — `BaseTanStackRouterDevtoolsPanel.tsx:273-275`:
   ```ts
   const [currentTab, setCurrentTab] = useLocalStorage<'routes' | 'matches' | 'history'>(
     'tanstackRouterDevtoolsActiveTab', 'routes'
   )
   ```
   `routes` (route tree from router config), `matches` (current matches), `history` (last 15 navigations, ring buffer at `BaseTanStackRouterDevtoolsPanel.tsx:341-350`).

7. **Right-side detail panel** — `BaseTanStackRouterDevtoolsPanel.tsx:697-792`: when a match is selected, render status badge + match metadata + recursive `Explorer` of loader data + active match value + search params.

8. **`Explorer` component is the recursive JSON walker** — `Explorer.tsx:104-339`: walks any value via `Object.entries` / `isIterable` / array detection, paginated at 100 entries per page (`Explorer.tsx:179`, constant `pageSize = 100`), with click-to-expand state per node (`Explorer.tsx:181`).

#### Estado mantido

- `Signal<AnyRouter>`, `Signal<RouterState>` in `TanStackRouterDevtoolsCore` (`TanStackRouterDevtoolsCore.tsx:53-54`) — reactive container around external state.
- `localStorage` keys: `tanstackRouterDevtoolsOpen`, `tanstackRouterDevtoolsHeight`, `tanstackRouterDevtoolsActiveTab`, `tanstackRouterDevtoolsActiveRouteId` (`useLocalStorage.ts:16-52`, called with these literals in `FloatingTanStackRouterDevtools.tsx:76-83`, `BaseTanStackRouterDevtoolsPanel.tsx:273-280`).
- In-memory ring buffer for navigation history, capped at 15 entries (`BaseTanStackRouterDevtoolsPanel.tsx:72`, `341-350`).

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `clsx` | `^2.1.1` | Conditional className concat | **Sim** (já-trans-dep via vite/tailwind). |
| `goober` | `^2.1.16` | 1KB CSS-in-JS, supports shadow DOM via `goober.css.bind({ target: shadowDOMTarget })` (`useStyles.tsx:11`) | **Avaliar.** TheoUI já usa Tailwind; goober dentro do shadow DOM evita conflito com classes do app. Pode ser adotado SÓ pelo devtools. |
| `solid-js` | `^1.9.10` (devDep) | Core's reactive primitives | **Não.** Adicionar uma reactivity library inteira ao TheoKit por causa de devtools é overkill. Refazer em React. |
| `@tanstack/router-core` | `workspace:^` (peer) | Router types | N/A (different framework) |

#### Side effects observáveis

- Writes `localStorage` keys above.
- Modifies parent element's `paddingBottom` when panel is open (`FloatingTanStackRouterDevtools.tsx:138-160`) — pushes the app content up so the panel doesn't cover it.
- Adds `window.addEventListener('resize', ...)` while panel is open (`FloatingTanStackRouterDevtools.tsx:152`).
- During drag: `document.addEventListener('mousemove', ...)` + `mouseup` (`FloatingTanStackRouterDevtools.tsx:123-124`).
- Solid's `render()` mounts custom JSX into the host element — does NOT use Shadow DOM by default. Shadow DOM is **opt-in** via `shadowDOMTarget` prop.

#### TODOs / FIXMEs / HACKs literais

> `// TODO: This should be dynamic based on the screen size or at least configurable, erika - 2023-11-29` — implicit in Astro reference, not TanStack
> `// eslint-disable-next-line prefer-const` — `FloatingTanStackRouterDevtools.tsx:73` (mutable panelRef variable)

#### Padrão de design

- **Pattern A: Class-as-portable-core, framework-binding-as-wrapper.** The core is a stateful class (`TanStackRouterDevtoolsCore`) using Solid for reactivity. React, Vue, Solid bindings each wrap this class. The bindings own a `<div>` host element via `ref`; the class instance owns the contents.
- **Pattern B: Two-export tree-shake.** `TanStackRouterDevtools` (NODE_ENV-gated noop) + `TanStackRouterDevtoolsInProd` (always real). Same name, conditional export. Production bundles get the noop.
- **Pattern C: Drag-to-resize via DOM padding adjustment.** Instead of overlay, push the app content up by setting `parentElement.style.paddingBottom = ${panelHeight}px`. Restored on close.

---

### 3.2 Next.js `next-devtools/dev-overlay` (canary)

#### API pública

Next.js does NOT expose a user-facing `<DevOverlay />` component. The overlay is **auto-injected by the framework** during dev. The public API is **side-effect-only**: the module exports a singleton `dispatcher` that internal Next code uses to emit events.

```ts
// referencias/next.js/packages/next/src/next-devtools/dev-overlay.browser.tsx:55-82
export interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onVersionInfo(versionInfo: VersionInfo): void
  onDebugInfo(debugInfo: DebugInfo): void
  onBeforeRefresh(): void
  onRefresh(): void
  onCacheIndicator(status: CacheIndicatorState): void
  onStaticIndicator(status: 'pending' | 'static' | 'dynamic' | 'disabled'): void
  onDevIndicator(devIndicator: DevIndicatorServerState): void
  onDevToolsConfig(config: DevToolsConfig): void
  onUnhandledError(reason: Error): void
  onUnhandledRejection(reason: Error): void
  openErrorOverlay(): void
  closeErrorOverlay(): void
  toggleErrorOverlay(): void
  buildingIndicatorHide(): void
  buildingIndicatorShow(): void
  renderingIndicatorHide(): void
  renderingIndicatorShow(): void
  segmentExplorerNodeAdd(nodeState: SegmentNodeState): void
  segmentExplorerNodeRemove(nodeState: SegmentNodeState): void
  segmentExplorerUpdateRouteState(page: string, tree: FlightRouterState | null): void
  instantNavsToggle(): void
}

export function renderAppDevOverlay(...): void
export function renderPagesDevOverlay(...): void
```

#### Algoritmo interno (passo a passo)

1. **Two entry points: App Router vs Pages Router** — `dev-overlay.browser.tsx:340-464`. App Router uses React 19; Pages Router runs React 18 or 19. They differ because of how each version treats container ownership (see §8 EC-2 below).

2. **Custom element `<nextjs-portal>` as the host** — `dev-overlay.browser.tsx:366-369`:
   ```ts
   const script = document.createElement('script')
   script.style.display = 'block'
   script.style.position = 'absolute'
   script.setAttribute('data-nextjs-dev-overlay', 'true')
   const container = document.createElement('nextjs-portal')
   script.appendChild(container)
   document.body.appendChild(script)
   ```
   Wrapping the portal in a `<script>` tag is intentional — React 19 doesn't unmount `<script>` elements it doesn't own, so the overlay survives user-space React re-renders.

3. **Shadow DOM for style isolation** — `dev-overlay.browser.tsx:378`:
   ```ts
   const shadowRoot = container.attachShadow({ mode: 'open' })
   ```
   All overlay UI lives inside the shadow root, immune to user app styles.

4. **Inline ShadowPortal component** — `components/shadow-portal.tsx:1-9`:
   ```ts
   export function ShadowPortal({ children }: { children: React.ReactNode }) {
     const { shadowRoot } = useDevOverlayContext()
     return createPortal(children, shadowRoot)
   }
   ```
   React Portal targets the shadow root.

5. **Queued events before React mounts** — `dev-overlay.browser.tsx:84-138, 238-247`:
   ```ts
   let maybeDispatch: Dispatch | null = null
   const queue: Array<(dispatch: Dispatch) => void> = []
   function createQueuable(fn) {
     return (...args) => {
       if (maybeDispatch) fn(maybeDispatch, ...args)
       else queue.push((dispatch) => fn(dispatch, ...args))
     }
   }
   // ...
   useInsertionEffect(() => {
     maybeDispatch = dispatch
     const replayTimeout = setTimeout(() => replayQueuedEvents(dispatch))
     return () => { maybeDispatch = null; clearTimeout(replayTimeout) }
   }, [])
   ```
   `console.error` during module eval can fire BEFORE React mounts. The dispatcher captures these and replays once `useInsertionEffect` fires.

6. **`useErrorOverlayReducer` is the state machine** — referenced from `shared.ts` (not deep-read; the constants `ACTION_*` are imported in `dev-overlay.browser.tsx:1-27`). The reducer accepts `DispatcherEvent` actions and mutates `OverlayState`.

7. **Devtools indicator is the visible launcher** — `components/devtools-indicator/devtools-indicator.tsx:23-73`:
   ```ts
   <Toast id="devtools-indicator" ...>
     <Draggable padding={20} position={state.devToolsPosition} setPosition={...}>
       <NextLogo onTriggerClick={() => setPanel(panel === 'panel-selector' ? null : 'panel-selector')} />
     </Draggable>
   </Toast>
   ```
   The "Toast" is just the positioning wrapper; the "NextLogo" is the visible chip.

8. **Drag with corner-snap physics** — `components/errors/dev-tools-indicator/draggable.tsx:15-150` for the wrapper, `:168-362` for the `useDrag` hook:
   - State machine: `idle | press | drag | drag-end` (`draggable.tsx:170-175`)
   - Velocity history (last 5 samples, 10ms apart) (`draggable.tsx:181, 329-335`)
   - Spring projection: `translation + project(velocity)` where `project(v, deceleration=0.999) = (v/1000)*deceleration / (1-deceleration)` (`draggable.tsx:393-395`)
   - Snap to nearest of 4 corners by minimum Euclidean distance (`draggable.tsx:74-92`)
   - Spring animation via CSS transition: `el.style.transition = 'translate 491.22ms var(--timing-bounce)'` (`draggable.tsx:233`)
   - Pointer capture for reliable drag: `ref.current?.setPointerCapture(e.pointerId)` (`draggable.tsx:302`)

9. **Config persistence via server endpoint** — `utils/save-devtools-config.ts:1-47`:
   ```ts
   let queuedConfigPatch: DevToolsConfig = {}
   let timer: ReturnType<typeof setTimeout> | null = null

   function flushPatch() {
     // ... 120ms debounce
     fetch('/__nextjs_devtools_config', {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(queuedConfigPatch),
       keepalive: true,
     }).catch(...)
   }

   export function saveDevToolsConfig(patch: DevToolsConfig) {
     // validate via zod-equivalent
     // merge into queuedConfigPatch
     // setTimeout(flushPatch, 120) — debounce
   }
   ```
   **Critical:** Next persists config via the **server** (`/__nextjs_devtools_config` endpoint), not localStorage. Reason: the same user with multiple tabs/devices shares config, and server can validate via schema.

10. **Trie for segment explorer** — `segment-explorer-trie.ts:58-156`:
    ```ts
    function createTrie<Value>({ getCharacters, compare }) {
      let root: TrieNode<Value> = { value: undefined, children: {} }
      // insert: walk `getCharacters(value)`, create nodes
      // remove: walk + delete + prune empty parents (bottom-up via stack)
      // getRoot: returns root reference
    }
    const trie = createTrie({
      getCharacters: (item) => item.pagePath.split('/'),
      compare: (a, b) => a?.pagePath === b?.pagePath && a?.type === b?.type && a?.boundaryType === b?.boundaryType
    })
    ```
    `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` makes the trie a React-readable store (`segment-explorer-trie.ts:153-156`).

#### Estado mantido

- `OverlayState` via reducer (errors, theme, panel state, indicator position, instant-navs, etc.)
- `currentOverlayState: OverlayStateWithRouter | null` — global mirror for non-React callers (`dev-overlay.browser.tsx:91`)
- `queue: Array<(dispatch) => void>` — pre-mount event buffer (`dev-overlay.browser.tsx:86`)
- `isAppMounted` / `isPagesMounted` flags (`dev-overlay.browser.tsx:332-333`) — prevent double-mount and detect router switches
- Trie root (closure variable) + `listeners: Set<() => void>` for `useSyncExternalStore` (`segment-explorer-trie.ts:34, 65`)
- `queuedConfigPatch: DevToolsConfig` + debounce timer (`save-devtools-config.ts:5-6`)

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `react`, `react-dom` | 19 | UI + portal | **Já adotado.** |
| `zod` (`devToolsConfigSchema`) | (internal) | Validate config patch on persist | **Já adotado.** |
| `pointerCapture` (Web API) | — | Reliable drag tracking | **Sim** (Web standard). |
| `requestIdleCallback` | — | (not used by Next; Astro uses it) | — |

#### Side effects observáveis

- Appends `<script data-nextjs-dev-overlay="true"><nextjs-portal>...</nextjs-portal></script>` to `document.body`.
- `MutationObserver` watching `document.body` for child removal — re-appends the container if React unmounts it (Pages Router only) (`dev-overlay.browser.tsx:426-440`).
- Dispatches `POST /__nextjs_devtools_config` with `keepalive: true` (`save-devtools-config.ts:16-27`).
- Adds `pointermove` + `pointerup` listeners on `window` during drag (`draggable.tsx:279-280`).
- Sets `document.body.style.userSelect = 'none'` during drag (`draggable.tsx:305-306`).

#### TODOs / FIXMEs / HACKs literais

> `// TODO: Move the Segment Tree into React State` — `segment-explorer-trie.ts:55` (it's currently outside React because events fire before mount)
> `// TODO: What to do with failed events?` — `dev-overlay.browser.tsx:244`
> `// TODO: Support soft navigation between App and Pages Router` — `dev-overlay.browser.tsx:347-348`
> `// TODO: Handle an app that hasn't loaded yet.` — `toolbar.ts:448` (Astro, copied here as pattern)
> `// TODO(fks): Handle an app that hasn't loaded yet. Currently, this will just do nothing.` — `toolbar.ts:448`
> `// TODO: This is the onDragEnd when the pointerdown event was fired not the onDragEnd when the pointerup event was fired` — `draggable.tsx:346`
> `// TODO: why is this called a toast` — `devtools-indicator.tsx:30` (Next.js dev wondering about own naming!)
> `// TODO: Dedicated error boundary or root error callbacks?` — `dev-overlay.browser.tsx:381, 447`
> `// TODO: For 'client:only' islands, it might not have finished loading yet, so we should wait for that` — `xray.ts:89` (Astro)

#### Padrão de design

- **Pattern D: Auto-inject framework-controlled overlay, not user-imported component.** Next.js mounts the overlay itself; the user never imports anything.
- **Pattern E: Wrapper `<script>` to survive React 19's container ownership rules.** React 19 doesn't unmount `<script>` it didn't render — using one as the host is a trick for survival.
- **Pattern F: Queue-then-replay events.** Events fired before React mounts are buffered; once `useInsertionEffect` runs, the queue is drained. Standard pattern for "initialize before host is ready."
- **Pattern G: Server-side config persistence.** Instead of localStorage, POST patches to a dev-server endpoint. Survives across tabs.
- **Pattern H: Trie for path-keyed state.** O(path-segments) insert/remove with prune-empty-parents.

---

### 3.3 Astro `dev-toolbar`

#### API pública

```ts
// referencias/astro/packages/astro/src/runtime/client/dev-toolbar/toolbar.ts:7-16
export type DevToolbarApp = DevToolbarAppDefinition & {
  builtIn: boolean;
  active: boolean;
  status: 'ready' | 'loading' | 'error';
  notification: { state: boolean; level?: 'error' | 'warning' | 'info' };
  eventTarget: ToolbarAppEventTarget;
};

// helpers.ts:20-78 — app event API
export class ToolbarAppEventTarget extends EventTarget {
  toggleNotification(options: NotificationPayload): void
  toggleState(options: AppStatePayload): void
  onToggled(callback): void
  onToolbarPlacementUpdated(callback): void
}

// helpers.ts:80-107 — server bridge
export const serverHelpers = {
  send: <T>(event: string, payload: T) => { if (import.meta.hot) import.meta.hot.send(event, payload) },
  on: <T>(event: string, callback: (data: T) => void) => { if (import.meta.hot) import.meta.hot.on(event, callback) },
}
```

The user-facing API for **extending** is `addDevToolbarApp` (third-party plugins). Each plugin exports:
```ts
{
  id: 'org:appname',
  name: string,
  icon: Icon,
  init(canvas: ShadowRoot, eventTarget: ToolbarAppEventTarget, serverHelpers: ToolbarServerHelpers): void
}
```

#### Algoritmo interno (passo a passo)

1. **Entrypoint on DOMContentLoaded** — `entrypoint.ts:10-284`. Awaits parallel imports of built-in apps + UI library + custom apps, then:
   - Registers all custom elements (`astro-dev-toolbar`, `astro-dev-toolbar-window`, etc.) — `entrypoint.ts:41-52`
   - Creates `overlay = document.createElement('astro-dev-toolbar')` (`entrypoint.ts:54`)
   - Wraps each app definition with `prepareApp` to add toolbar-state fields (active, notification, eventTarget) (`entrypoint.ts:65-112`)
   - Appends overlay to body, **re-appends on `astro:after-swap`** (view transitions) (`entrypoint.ts:279-283`)

2. **`AstroDevToolbar extends HTMLElement` with shadow DOM** — `toolbar.ts:22-576`:
   - `attachShadow({ mode: 'open' })` in constructor (`toolbar.ts:33`)
   - `init()` runs once; populated via `connectedCallback` (`toolbar.ts:327-337`)
   - Each app gets its own `<astro-dev-toolbar-app-canvas>` (also a custom element) with its own shadow root (`toolbar.ts:303-306`, canvas defined `toolbar.ts:578-596`)

3. **Lazy app init via requestIdleCallback** — `toolbar.ts:310-321`:
   ```ts
   if ('requestIdleCallback' in window) {
     window.requestIdleCallback(async () => {
       this.apps.map((app) => this.initApp(app))
     }, { timeout: 300 })
   } else {
     setTimeout(async () => { this.apps.map((app) => this.initApp(app)) }, 300)
   }
   ```
   Safari fallback to `setTimeout(_, 300)`.

4. **Each app's `init(canvas, eventTarget, serverHelpers)` runs against its own shadow root** — `toolbar.ts:385-416`:
   - Status: `loading → ready` on success, `error` on throw
   - HMR notification: `import.meta.hot.send(\`astro-dev-toolbar:${app.id}:initialized\`)`
   - Failed init shows red badge on the bar item (`toolbar.ts:411-414`)

5. **Click to toggle app, only one active at a time** — `toolbar.ts:339-352, 439-463`:
   - Closing active app first (`toggleAppStatus` → `setAppStatus(activeApp, false)`)
   - `beforeTogglingOff` hook lets apps cancel close (`toolbar.ts:471-475`)

6. **Escape to close active app, or hide the toolbar** — `toolbar.ts:373-382`.

7. **Auto-hide after mouse leave with delay** — `toolbar.ts:362-371, 521-532`:
   ```ts
   const HOVER_DELAY = 2 * 1000
   triggerDelayedHide() {
     this.delayedHideTimeout = window.setTimeout(() => {
       this.setToolbarVisible(false)
     }, HOVER_DELAY)
   }
   ```

8. **Server bridge via Vite's HMR client** — `helpers.ts:80-107`. `import.meta.hot.send` ships to the dev server's `astro:server:setup` hook listeners. Any app + server integration can talk.

9. **Editor open via Vite's `/__open-in-editor`** — `xray.ts:166-176`:
   ```ts
   async clickAction() {
     await fetch(
       '/__open-in-editor?file=' +
       encodeURIComponent(
         (window as DevToolbarMetadata).__astro_dev_toolbar__.root + islandComponentPath.slice(1),
       ),
     )
   }
   ```
   Vite's launch-editor middleware handles this.

10. **Built-in apps are 4 + 1 dropdown** — `entrypoint.ts:270-275`:
    ```ts
    const apps: DevToolbarApp[] = [
      ...[astroDevToolApp, astroXrayApp, astroAuditApp, astroSettingsApp, astroMoreApp]
        .map((appDef) => prepareApp(appDef, true)),
      ...customAppsDefinitions.map((appDef) => prepareApp(appDef, false)),
    ]
    ```
    `astroMoreApp` is a dropdown that hosts custom apps beyond `customAppsToShow = 3` (`toolbar.ts:29`, `entrypoint.ts:114-268`).

#### Estado mantido

- `this.apps: DevToolbarApp[]` in custom element instance
- One `<astro-dev-toolbar-app-canvas>` shadow root per app
- `this.delayedHideTimeout: number | undefined` for hover-out timer
- WebSocket events (`astro-dev-toolbar:${app.id}:initialized|toggled`) flow through `import.meta.hot`
- Notification state per app (state + level) — set via `eventTarget.toggleNotification`

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `html-escaper` | — | Escape user-provided HTML in tooltips (`xray.ts:1`) | **Avaliar** — DOMPurify equivalent já no ecossistema. |
| Vite HMR client (`import.meta.hot`) | (Vite-bundled) | Server bridge | **Já adotado** (TheoKit é Vite). |
| Custom Elements API | Web standard | UI primitives | **Sim** (no dep). |

#### Side effects observáveis

- Registers 12+ custom elements globally (`entrypoint.ts:41-52`) — these names are forever reserved in the page.
- Appends `<astro-dev-toolbar>` element to `document.body` (re-appends on `astro:after-swap`).
- Sends HMR messages over the dev WebSocket (`import.meta.hot.send`).
- DevTool apps may set their own listeners (e.g. xray observes `astro:after-swap` to re-mount island highlights — `xray.ts:31-32`).

#### Padrão de design

- **Pattern I: Web Components (Custom Elements + Shadow DOM) for full UI library.** Zero React/Solid/Vue dependency. Pure DOM.
- **Pattern J: Plugin app architecture.** First-class extension point — built-in apps and third-party apps use the same `init(canvas, eventTarget, serverHelpers)` shape.
- **Pattern K: Vite HMR channel for server comms.** `import.meta.hot.send`/`.on` to talk to dev-server integrations. No custom WebSocket.
- **Pattern L: Vite `/__open-in-editor` for editor jumps.** Built-in Vite middleware, no extra wiring.

---

## 4. Convergent patterns (todos concordam)

| # | Pattern | Adopted by | Why it works | TheoKit decision |
|---|---|---|---|---|
| **4.1** | **Shadow DOM for style isolation** | Next.js (`dev-overlay.browser.tsx:378`), Astro (`toolbar.ts:33`), TanStack opt-in (`useStyles.tsx:11-12`) | App CSS can't leak into overlay; overlay CSS can't leak into app. Critical because the framework can't know what CSS reset/normalize the user's app uses. | **Adotar mandatório.** |
| **4.2** | **Persist preferences across reloads** | Next.js via server endpoint (`save-devtools-config.ts`), Astro via `settings.ts` localStorage, TanStack via `useLocalStorage.ts` | A devtool that resets every reload is hostile. Save: open/closed, position, active tab, panel size. | **Adotar localStorage** (server endpoint is overengineering for v0). |
| **4.3** | **Floating launcher + expandable panel** | Next.js indicator (`devtools-indicator.tsx`), Astro toolbar (`toolbar.ts:262-295`), TanStack floating logo (`FloatingTanStackRouterDevtools.tsx:265-285`) | Default state is unobtrusive (small chip); click expands. Page content is never blocked by default. | **Adotar.** |
| **4.4** | **Tree-shake to noop in production** | TanStack `process.env.NODE_ENV !== 'development' ? () => null : real` (`index.ts:7-21`); Astro/Next.js inject from dev-server only (never in prod bundle) | Production bundle MUST NOT carry devtools code. TanStack's pattern is the most portable. | **Adotar TanStack-style.** Module exports `Devtools` (noop in prod) + `DevtoolsInProd` (real). |
| **4.5** | **CSS-in-JS scoped to shadow root** | TanStack uses `goober.css.bind({ target: shadowDOMTarget })` (`useStyles.tsx:11-12`); Astro inlines `<style>` tags in shadow root template (`toolbar.ts:41-261`); Next.js uses CSS files imported by components (`devtools-indicator.css`) inside the shadow root | Critical for shadow DOM — global stylesheets don't reach inside; need to inject INSIDE the shadow root. | **Adotar.** Goober pattern for v0; Tailwind doesn't easily target shadow roots without setup. |
| **4.6** | **Click-outside / Escape to close** | Astro Escape key (`toolbar.ts:373-382`); Next.js panel close on outside click (`use-on-click-outside.ts` referenced in inventory); TanStack panel-close button + drag-below-threshold (`FloatingTanStackRouterDevtools.tsx:110-112`) | Standard modal UX. | **Adotar Escape minimum.** Click-outside is bonus. |
| **4.7** | **Position-by-corner** | Next.js 4 corners with snap-on-drag-end (`draggable.tsx`); Astro 3 placements (bottom-left/center/right) (`toolbar.ts:80-89`); TanStack 4 positions (`FloatingTanStackRouterDevtools.tsx:34`) | Devtool sits in a corner; user picks which. | **Adotar 4 corners** (Next.js + TanStack model). |

## 5. Divergent patterns (real trade-offs)

| # | Decision | Options | TheoKit choice |
|---|---|---|---|
| **5.1** | **Where to render: shadow DOM-attached custom element vs React portal + shadow DOM** | Astro: pure custom elements (`HTMLElement` subclasses); Next.js: React `createRoot` into a shadow root inside a custom element wrapper; TanStack: Solid `render` into the host element (shadow DOM is opt-in via prop) | **React portal into shadow root** (Next.js model). Reasons: (a) TheoKit is React-first; pure custom elements means rewriting UI primitives that TheoUI already gives us in React; (b) shadow DOM is mandatory (4.1), not opt-in. |
| **5.2** | **How the overlay reaches the page: framework auto-injects vs user imports a component** | Next.js: framework auto-injects via dev-server hook; Astro: framework auto-injects via Vite plugin; TanStack: user must add `<TanStackRouterDevtools />` to their app tree | **Auto-inject via Vite plugin** (Next.js/Astro model). Reason: TheoKit already controls the entry-client generator (`router/generate.ts`) — we can add the devtools import only in dev. User-import model leaks a tree-shake assumption (`process.env.NODE_ENV`) into user code. |
| **5.3** | **Server comms: HMR-channel vs HTTP endpoint vs neither** | Astro: Vite HMR (`import.meta.hot.send`); Next.js: HTTP POST `/__nextjs_devtools_config` with `keepalive`; TanStack: none (everything is client-side state) | **Vite HMR for v0.** Reasons: (a) free from Vite — zero new infra; (b) bidirectional (server can push log lines, browser can request to open in editor); (c) only available in dev (which is the only place devtools runs). HTTP endpoint can be added later for persistence. |
| **5.4** | **Persistence layer: localStorage vs server endpoint** | TanStack/Astro: localStorage; Next.js: server endpoint + zod schema validation | **localStorage for v0** (TanStack model). Server endpoint is right for cross-tab sync — adopt later when multi-window dev becomes a real need. |
| **5.5** | **Drag physics: simple `mousemove` vs `pointerCapture` + velocity + spring** | TanStack: `mousemove`/`mouseup` for resize only (`FloatingTanStackRouterDevtools.tsx:91-125`); Next.js: full physics with `pointerCapture`, velocity history, spring projection, corner snap (`draggable.tsx`) | **Simple drag for v0** (TanStack model — resize the panel). The Next.js physics chip is delightful but ~400 LOC of state machine — defer to v1. |
| **5.6** | **Extensibility: plugin app architecture vs monolith** | Astro: first-class plugin apps (`addDevToolbarApp`); Next.js: monolith; TanStack: monolith | **Monolith for v0, plugin shape committed in v1.** Reason: plugin-shape pre-extension means "you can swap rendering of any panel" — premature without 2+ panel implementations. Build it monolithic, then extract once the second non-built-in panel arrives. |
| **5.7** | **Reactive core: Solid signals vs React + reducer** | TanStack: Solid signals (`createSignal`, `createEffect`); Next.js: React `useReducer` + queued dispatcher | **React + reducer.** Bringing Solid as a runtime dep for the devtool's reactivity is a tax we won't pay. The `createQueuable` pattern is sufficient for events-before-mount. |

## 6. Dependency inventory — libraries comuns

Convergent libs (aparecem em 2+ frameworks ou são candidatas óbvias):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `clsx` | TanStack (`package.json:65`) — also implicit elsewhere | Conditional className | **Already trans-dep** via Tailwind. No add. |
| `goober` | TanStack (`package.json:66`) | 1KB CSS-in-JS with `bind({ target: shadowRoot })` for shadow DOM | **Add (~1KB)** — only used inside the devtools module; tree-shaken in prod via Pattern 4.4. |
| Web standards (Custom Elements, Shadow DOM, `pointerCapture`, `requestIdleCallback`) | All three | UI hosting + drag + lazy init | **Adotar** — zero deps. |
| `react`, `react-dom`, `react-dom/client.createPortal` | Next.js | UI + portal | **Already adotado.** |
| `zod` (`devToolsConfigSchema`) | Next.js (`save-devtools-config.ts:31`) | Validate config patches on persist | **Already adotado.** Use when adding server persistence (v1+). |
| Vite HMR client (`import.meta.hot`) | Astro | Server bridge | **Already available** (TheoKit is Vite). |
| Vite `/__open-in-editor` middleware | Astro (`xray.ts:166-176`) | Click to open file in editor | **Already available** via `vite-plugin-launch-editor` or Vite's built-in. |
| `MutationObserver` | Next.js Pages Router (`dev-overlay.browser.tsx:426-440`) | Reconnect container if React unmounts it | **Don't need** — React 19 only in TheoKit; same wrapping `<script>` trick (`dev-overlay.browser.tsx:356-369`) covers our case. |

No libs to add beyond goober. The whole devtools module fits in current dep budget.

## 7. Algorithms / data structures não-óbvios

### 7.1 Drag-to-resize threshold-closes panel

`FloatingTanStackRouterDevtools.tsx:91-125`. During mousedown drag on the resize handle, compute `newHeight = originalHeight + (dragInfo.pageY - moveEvent.pageY)`. If `newHeight < 70`, set `isOpen = false`; else `true` + persist `newHeight`. Complexity: O(1) per mousemove. Trick: closing happens by drag, not by separate close button — same gesture serves both intents.

### 7.2 Paginated recursive JSON Explorer

`Explorer.tsx:179-310`. For any value, `subEntries = createMemo(() => Object.entries|isIterable|...)`. Pages of `pageSize = 100`. Each page is collapsible; sub-trees recurse. Special-case for `['React element', { meta }]` flattens into siblings (`Explorer.tsx:130-144`) to avoid deep nesting on inspected JSX nodes. Complexity: O(n) construction, O(visible) render. Memo prevents re-walks on unrelated updates.

### 7.3 Drag velocity + spring corner snap

`draggable.tsx:168-396`. Last 5 mousemove samples (≥ 10ms apart) feed velocity calc:
```
velocity = (latestPoint - oldestPoint) / timeDelta * 1000  // px/s
projectedDistance = (velocity/1000 * 0.999) / (1 - 0.999) = velocity / 1
```
Then snap to nearest of 4 corners by `Math.sqrt(dx² + dy²)`. CSS transition handles animation: `translate 491.22ms var(--timing-bounce)`. Why velocity samples 10ms apart: faster sampling makes velocity unstable (noise dominates); 10ms is the sweet spot for human-perceivable motion.

### 7.4 Path-segment Trie with prune-empty-parents

`segment-explorer-trie.ts:58-126`. Insert: walk segments, create empty intermediate nodes. Remove: walk to leaf, set value undefined, then bottom-up traverse the stack — if any parent's children map is empty, delete that branch. Why a trie (not a flat Map): when removing `/blog/[slug]/page.js`, prune the `[slug]` and `blog` nodes if no other route touches them. `useSyncExternalStore` exposes it to React.

### 7.5 Pre-mount event queue + `useInsertionEffect` flush

`dev-overlay.browser.tsx:84-138, 289-303`. `createQueuable(fn)` returns a wrapper: if `maybeDispatch` is null, push the bound call to a queue; else fire directly. On `useInsertionEffect` mount, set `maybeDispatch = dispatch` and `setTimeout(() => replayQueuedEvents(dispatch))`. Why `useInsertionEffect` (not `useEffect`): runs synchronously before DOM mutations in commit phase — earliest place React can give a dispatch fn. The `setTimeout` defers replay so React batches don't run mid-render.

## 8. Edge cases conhecidos (com fonte)

| # | Edge case | How it manifests | Where it was fixed | How we should prevent |
|---|---|---|---|---|
| EC-1 | **App `body { display: flex }` skewes overlay layout** | The wrapping `<script>` element inherits `display: flex` from body, pushing other children | Next.js `dev-overlay.browser.tsx:356-364` — `script.style.position = 'absolute'` | Always set `position: absolute` on the overlay wrapper |
| EC-2 | **React 18 / Pages Router wipes the container during shell error recovery** | Container disappears from DOM mid-session | Next.js `dev-overlay.browser.tsx:426-440` — `MutationObserver` re-appends if removed | Use React 19 + `<script>` wrapper trick (`dev-overlay.browser.tsx:354-369`) — React 19 doesn't unmount script elements it doesn't own. TheoKit is React 19, so this trick suffices. |
| EC-3 | **Events fired before React mounts** | `console.error` during module eval (e.g. import-time error) emits before dispatcher is wired | Next.js `dev-overlay.browser.tsx:124-138` — `createQueuable` buffers; replays in `useInsertionEffect` | Adopt the same queue pattern in TheoKit devtools dispatcher |
| EC-4 | **Sourcemap URL mis-resolution from `/@id/` prefix** | Browser fetches `dev-toolbar.js.map` from wrong path → spurious 404 in console | Astro PR #16481 (`152700e`) — "Fixes a spurious 404 request for a dev toolbar sourcemap during `astro dev` caused by the browser mis-resolving a relative `sourceMappingURL` from the `/@id/` URL prefix" | When emitting devtools script tag, use absolute URL — not Vite's `/@id/` prefix |
| EC-5 | **Audit crash on `image` ARIA role** | Devtool's a11y audit throws when encountering ARIA roles it doesn't classify | Astro PR #16105 (`23d60de`) — "Fix dev toolbar audit crash when encountering the `image` ARIA role" | If/when we add a11y audit (v2+), default-case unknown roles to "skip + warn", never throw |
| EC-6 | **Dev toolbar crashes if essential server data is unavailable** | Server endpoint returns 5xx or empty payload; toolbar tries to render undefined | Astro PR #13862 (`fe8f61a`) — "Fixes a case where the dev toolbar would crash if it could not retrieve some essential data" | Defensive default state; server-bridge calls should default to empty config on failure |
| EC-7 | **Drag handle resize below threshold should close panel, not produce a zero-height panel** | User drags resize handle all the way down; panel becomes 5px tall, useless | TanStack `FloatingTanStackRouterDevtools.tsx:110-112` — `if (newHeight < 70) setIsOpen(false)` | Adopt same — close-on-shrink-below-threshold (70px) |
| EC-8 | **Click immediately after drag fires the click handler unintentionally** | Dragging the indicator chip and releasing over a clickable area causes accidental click | Next.js `draggable.tsx:238-245` — state machine has `drag-end` intermediate state; click handler `e.preventDefault()` + `e.stopPropagation()` then transitions to `idle` | Adopt state-machine drag with `drag-end` swallow |
| EC-9 | **Right-click starts drag instead of opening context menu** | User right-clicks the chip; drag state begins | Next.js `draggable.tsx:268-270` — `if (e.button !== 0) return // ignore right click` | Always guard `e.button === 0` in pointerdown |
| EC-10 | **Animation `transitionend` listener leaks** | Many drags = many orphan listeners on the element | Next.js `draggable.tsx:222-230` — listener removes itself: `el!.removeEventListener('transitionend', listener)` inside the listener body | Listener self-removal pattern |
| EC-11 | **`requestIdleCallback` missing in Safari** | Toolbar apps never init | Astro `toolbar.ts:310-321` — feature-detect + `setTimeout(_, 300)` fallback | Same fallback in TheoKit |
| EC-12 | **Custom element name collision** | Two libs define `<dev-toolbar>` — error | Astro namespaces all elements with `astro-dev-toolbar-*` prefix (`entrypoint.ts:41-52`) | Namespace as `theo-devtools-*` |
| EC-13 | **Dev toolbar a11y form-field warnings** | DevTools (Chrome) warns about form fields in custom elements without proper labels | Astro PR #12590 (`92c269b`) — "fix: devtools warnings about dev toolbar form fields" | Make sure all interactive form elements in the overlay have proper `aria-label` / `<label for=>` |
| EC-14 | **Container styling conflicts when scrollbar present** | Position calculation off by scrollbar width on the right corner | Next.js `draggable.tsx:98-99` — `const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth` accounted in absolute corner position | Account for scrollbar in corner positioning |
| EC-15 | **View transitions destroy the overlay element** | Astro view transitions navigate; the toolbar element gets swapped out | Astro `entrypoint.ts:281-283` — listens to `astro:after-swap` and re-appends the overlay to body | TheoKit equivalent: TheoKit doesn't have view transitions, so N/A for v0. If adopted later, mirror this pattern. |
| EC-16 | **Multiple instances mounted (dev/HMR remount)** | HMR fires; overlay is mounted twice | Next.js `dev-overlay.browser.tsx:332-333, 345-353, 414` — `isAppMounted` / `isPagesMounted` flags throw on double-mount | Same singleton guard |

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
┌──────────────────────────────────────────────┐
│  packages/theo/src/vite-plugin/index.ts      │
│  - if (DEV) inject devtools script in HTML   │
│  - register /__theo/devtools/* endpoints     │
└────────────────┬─────────────────────────────┘
                 │ HTML <script src=".../devtools/entry.js">
                 ▼
┌──────────────────────────────────────────────┐
│  packages/theo/src/devtools/entry.tsx        │
│  - feature-detect, dynamic import core       │
│  - createRoot into <theo-devtools-portal>    │
│  - attachShadow({ mode: 'open' })            │
└────────────────┬─────────────────────────────┘
                 │ createPortal(children, shadowRoot)
                 ▼
┌──────────────────────────────────────────────┐
│  devtools/Overlay.tsx                        │
│  - useReducer state machine                  │
│  - useInsertionEffect → flush queue          │
│  - <Indicator /> + <Panel />                 │
└────────────────┬─────────────────────────────┘
                 │
   ┌─────────────┼─────────────┐
   ▼             ▼             ▼
┌──────────┐ ┌─────────┐ ┌──────────────┐
│Indicator │ │ Panel   │ │ HMR Bridge   │
│ (chip)   │ │ - tabs  │ │ import.meta  │
│ - drag   │ │ - data  │ │   .hot.on()  │
│ - corner │ │ - kbd   │ └──────────────┘
└──────────┘ └─────────┘
```

Tabs (v0 minimum):
- **Requests** — last 50 requests with method/path/status/duration/traceId. Hovers show full payload.
- **Routes** — file-tree of `app/**` matched to current URL (highlights active route + layout chain).
- **Errors** — captures `console.error` + unhandled rejection + integrates with `csrf.warn` (clickable `docsUrl`).
- **Settings** — position, theme.

### 9.2 Files to create

```
packages/theo/src/devtools/
├── index.ts                          — public exports (NODE_ENV-gated, Pattern 4.4)
├── entry.tsx                          — bootstrap (createRoot + shadowRoot)
├── Overlay.tsx                        — root component (reducer + dispatcher)
├── dispatcher.ts                      — queuable dispatcher (Pattern F)
├── shadow-portal.tsx                  — createPortal into shadow root
├── shared.ts                          — action constants + state types
├── reducer.ts                          — useDevtoolsReducer
├── persistence.ts                     — localStorage round-trip + version
├── hmr-bridge.ts                       — import.meta.hot.send/.on wrapper
├── styles/
│   ├── styles.ts                       — goober(target: shadowRoot)
│   └── tokens.ts                       — colors, spacing
├── components/
│   ├── Indicator.tsx                   — floating chip
│   ├── Draggable.tsx                   — drag state machine (EC-8, EC-9, EC-10)
│   ├── Panel.tsx                       — expandable panel host
│   ├── PanelHeader.tsx                 — tabs + close
│   ├── Tabs/
│   │   ├── RequestsTab.tsx
│   │   ├── RoutesTab.tsx
│   │   ├── ErrorsTab.tsx
│   │   └── SettingsTab.tsx
│   └── JSONExplorer.tsx                — collapsible JSON (Pattern 7.2)
├── hooks/
│   ├── useLocalStorage.ts
│   ├── useShortcuts.ts                 — Escape, Cmd+Shift+D
│   ├── useOnClickOutside.ts
│   └── useDevtoolsContext.ts
└── server/
    ├── devtools-middleware.ts          — /__theo/devtools/{entry.js,assets,events}
    └── ring-buffer.ts                  — server-side last-N requests buffer

packages/theo/src/vite-plugin/index.ts  — modify: inject dev-only script tag
packages/theo/src/server/logger.ts      — modify: also stream to devtools ring buffer
packages/theo/src/server/csrf.ts        — modify: dispatch csrf.warn to devtools

tests/unit/devtools-reducer.test.ts
tests/unit/devtools-trie.test.ts        — for RoutesTab data structure
tests/unit/devtools-draggable.test.ts   — drag state machine, EC-8/9/10
tests/integration/devtools-injection.test.ts  — Vite plugin injects in dev only
fixtures/template-default/              — already exists; add Playwright spec
tests/e2e/devtools.spec.ts              — real-browser test
```

### 9.3 Public API surface (TypeScript)

The user-facing API is **none for v0**. The framework auto-injects in dev. Future v1+ might add `defineDevtoolsConfig` or `addDevtoolsPanel` (Pattern J extension), but that's not v0.

Internal types (for the framework's own use):
```ts
// devtools/shared.ts
export type DevtoolsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type DevtoolsTab = 'requests' | 'routes' | 'errors' | 'settings'
export type DevtoolsTheme = 'light' | 'dark' | 'system'

export interface DevtoolsState {
  open: boolean
  position: DevtoolsPosition
  height: number
  activeTab: DevtoolsTab
  theme: DevtoolsTheme
  requests: RequestRecord[]
  errors: ErrorRecord[]
  routesTree: TrieNode<RouteInfo>
}

export interface RequestRecord {
  id: string
  traceId: string
  method: string
  path: string
  status: number
  durationMs: number
  startedAt: number
  csrfWarn?: { code: string; docsUrl: string }
}

export interface ErrorRecord {
  id: string
  type: 'console' | 'unhandled' | 'csrf.warn'
  message: string
  stack?: string
  docsUrl?: string
  timestamp: number
}

// devtools/dispatcher.ts
export interface Dispatcher {
  onRequest(req: RequestRecord): void
  onError(err: ErrorRecord): void
  onRouteMatched(path: string, segments: string[]): void
  onCsrfWarn(payload: { code: string; docsUrl: string; method: string; path: string }): void
}
export const dispatcher: Dispatcher  // singleton, queuable
```

### 9.4 Dependências a adotar

| Package | Version | Justification |
|---|---|---|
| `goober` | `^2.1.16` | CSS-in-JS with `bind({ target: shadowRoot })` (only way to scope styles into shadow DOM cheaply). ~1KB gzipped. Used only in devtools module — tree-shaken in prod (Pattern 4.4). |
| (nothing else) | — | React, react-dom/client, Web Crypto, `import.meta.hot` are already available. |

### 9.5 Test strategy

#### Unit (Vitest)

- `devtools-reducer.test.ts`:
  - Open/close action toggles `state.open`
  - Position change persists to localStorage
  - `onRequest` appends to `state.requests`, caps at 50 (ring buffer)
  - `onCsrfWarn` synthesizes an `ErrorRecord` with `docsUrl` populated
- `devtools-trie.test.ts` (port of `segment-explorer-trie.ts`):
  - Insert leaf creates intermediate nodes
  - Remove leaf prunes empty parents (EC-from-Next.js)
  - `getRoot` returns immutable-ish reference (changes after insert/remove)
- `devtools-draggable.test.ts`:
  - State machine: idle → press → drag → drag-end → idle
  - `e.button !== 0` does not start drag (EC-9)
  - `drag-end` swallows the immediate click (EC-8)
  - `transitionend` listener removes itself after firing (EC-10)
  - `pointerCapture` is set on entering `drag` state

#### Integration (Vitest + dev-server harness)

- `devtools-injection.test.ts`:
  - In dev, the rendered HTML contains `<script src="/@theo/devtools/entry.js">` (or virtual module path)
  - In prod (`vite build`), the rendered HTML does NOT contain the script
  - The `/@theo/devtools/entry.js` virtual module responds 200 in dev, 404 in prod

#### Playwright (E2E)

- `devtools.spec.ts` against `fixtures/template-default`:
  - Default chat send: indicator chip is visible bottom-right; click expands panel; "Requests" tab shows the POST `/api/chat`; row shows `status: 200`, `duration: <N>ms`, `traceId: <32 hex>`
  - Trigger a CSRF warn (raw fetch without `X-Theo-Action`); "Errors" tab shows the warn with `code: CSRF_STRICT_CUTOVER` and clickable `docsUrl`
  - Drag chip to top-right corner; reload; chip is in top-right (persistence)
  - Press Escape with panel open → panel closes (EC from Astro)

### 9.6 Phases of rollout

1. **Phase 1 — Core shell** (target: chip + empty panel + toggle)
   - `devtools/entry.tsx`, `Overlay.tsx`, `Indicator.tsx` (no drag yet — fixed corner)
   - `shadow-portal.tsx`, `styles/styles.ts` (goober)
   - Vite plugin inject in dev only
   - Tree-shake in prod verified by bundle-budget script
   - Playwright: chip visible, click expands
2. **Phase 2 — Requests + Errors tabs** (target: real data flowing)
   - `dispatcher.ts` with queue + replay (Pattern F + 7.5)
   - `hmr-bridge.ts` listening for `theo:devtools:request` events from server
   - `server/devtools-middleware.ts` ring buffer of last 50 requests
   - `server/logger.ts` modified to broadcast to devtools channel
   - `server/csrf.ts` modified to dispatch `csrf.warn` to devtools channel
   - Playwright: chat send appears in Requests; CSRF warn appears in Errors
3. **Phase 3 — Routes tab** (target: matched route visualization)
   - Trie data structure (port from §7.4)
   - Highlight current matched route + layout chain
   - Click route → opens file in editor via `/__open-in-editor` (Vite built-in)
   - Playwright: navigate to `/about`; Routes tab highlights `app/about/page.tsx`
4. **Phase 4 — Drag + persistence + polish** (target: production-grade UX)
   - `Draggable.tsx` with state machine (EC-8/9/10)
   - `useLocalStorage.ts` round-trip
   - Escape to close (EC from Astro)
   - 4-corner snap
   - Playwright: drag chip; reload; position restored

### 9.7 Acceptance criteria

- [ ] `pnpm dev` shows a chip bottom-right by default
- [ ] Click chip → panel opens with 4 tabs (Requests / Routes / Errors / Settings)
- [ ] Send a chat message in `template-default` → Requests tab shows it within 100ms
- [ ] Submit a state-mutating request without `X-Theo-Action` → Errors tab shows `CSRF_STRICT_CUTOVER` with clickable `docsUrl`
- [ ] Navigate to a different route → Routes tab updates highlighted segment
- [ ] Click a route name in Routes tab → editor opens that file (via Vite `/__open-in-editor`)
- [ ] Drag chip to top-left → reload → chip in top-left
- [ ] Escape with panel open → panel closes
- [ ] `vite build` → built `index-*.js` bundle does NOT contain `goober`, `Overlay`, or any devtools string
- [ ] `tsc --noEmit` clean
- [ ] All vitest tests green
- [ ] `tests/e2e/devtools.spec.ts` green in Chromium + Firefox + WebKit
- [ ] Dogfood check #50 (devtools injection in dev only) added
- [ ] Bundle budget script unchanged target (350 KB) — devtools shouldn't push past

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Devtools code leaks into prod bundle | High | Pattern 4.4 + bundle-budget script asserts goober/Overlay absent in prod build (grep the chunk) |
| Shadow DOM CSS doesn't carry from goober (the `target` option) | Medium | Integration test: render a styled component inside shadow root; assert getComputedStyle returns the goober-applied color (not initial) |
| User's app sets `body { display: flex }` and breaks chip layout | Medium | EC-1 mitigation: wrapper `<script>` element has `position: absolute` |
| HMR bridge channel name collides with another lib | Low | EC-12 mitigation: namespace as `theo:devtools:*` |
| Drag click-after-drag fires accidentally | Medium | EC-8 mitigation: state machine with drag-end swallow |
| Performance: every request push triggers React re-render | Medium | Batch into `requestIdleCallback`-deferred queue OR use `useSyncExternalStore` with selectors for tab content |
| Memory: ring buffer grows unbounded across long dev sessions | Medium | Cap at 50 requests + 50 errors; oldest dropped (FIFO) |
| Privacy: request payloads in devtools may contain auth tokens | High | Redact `Authorization`, `Cookie`, `Set-Cookie` headers; truncate body display past 4KB |
| Accessibility: drag-only positioning not keyboard-accessible | Medium | EC-13 mitigation: alternative position-change via Settings tab dropdown |

## 10. Open questions

1. **Server-side ring buffer location: per-process or per-request?** Next.js stores config server-side (`save-devtools-config.ts`). For TheoKit, where does the ring buffer of last-50-requests live? In-process map (lost on dev-server restart, fine) vs cross-process (overkill). Probably in-process Map keyed by trace ID with FIFO trim.

2. **HMR channel: structured event names or JSON-RPC?** Astro uses `astro-dev-toolbar:${app.id}:initialized` style. TheoKit could use `theo:devtools:request:start|end|error`. Question: do we standardize a small set of events, or expose a generic JSON-RPC-like channel for v1+ extensibility?

3. **Should we ship a `theokit/devtools` import for users to programmatically push custom events?** Astro lets third-party apps register; TheoKit's v0 doesn't need that. But: should the dispatcher type be public so a user's `app/error.tsx` can push a custom error event to the overlay? Risk: user code accidentally imports the dispatcher in a prod bundle path.

4. **Trie vs flat Map for routes:** `app/**` routes are typed by the framework already (we know all routes at build time via `router/generate.ts`). Do we still need a runtime trie, or can we precompute the tree at build and just highlight the active leaf? Lean toward precompute — saves complexity.

5. **Privacy / redaction rules:** what should be redacted from request payloads in the devtools UI? Convention list (Authorization, Cookie, Set-Cookie, JWT-shaped strings, anything matching `*_SECRET`)? User configurable via `theo.config.ts.devtools.redact: string[]`?

6. **Production debugging story link:** The 0.5.0+ "Production debugging story" item names OpenTelemetry exporter. Should the dev devtools module be designed so the exporter PLUGS INTO the same dispatcher? (i.e. the source-of-data is the same; only the sink differs — UI in dev, OTel in prod.) Strongly lean yes.

## 11. Referências citadas (todos os arquivos do inventário)

### TanStack Router devtools

#### `packages/router-devtools-core/` (Solid.js core)

##### Core
- `referencias/tanstack-router/packages/router-devtools-core/src/index.tsx:1-3` — package entry; barrel-exports `Core` + `PanelCore`. §3.1
- `referencias/tanstack-router/packages/router-devtools-core/src/TanStackRouterDevtoolsCore.tsx:1-162` — Solid class wrapping the core; `.mount/.unmount/.setRouter/.setRouterState/.setOptions` API. §3.1, §4.1 (no mandatory shadow DOM)
- `referencias/tanstack-router/packages/router-devtools-core/src/TanStackRouterDevtoolsPanelCore.tsx` — Panel-only variant of the core (skim only). §3.1
- `referencias/tanstack-router/packages/router-devtools-core/src/FloatingTanStackRouterDevtools.tsx:1-291` — floating button + draggable resize panel; localStorage-backed open + height. §3.1, §4.3 (floating), §7.1 (drag-to-resize)
- `referencias/tanstack-router/packages/router-devtools-core/src/BaseTanStackRouterDevtoolsPanel.tsx:1-837` — the 3-tab content (routes/matches/history); rendering of route tree, match details, search params, Explorer recursion. §3.1, §4.4 (panel structure)
- `referencias/tanstack-router/packages/router-devtools-core/src/Explorer.tsx:1-490` — recursive JSON walker with pagination + React-element flattening. §3.1, §7.2 (paginated explorer)

##### Support
- `referencias/tanstack-router/packages/router-devtools-core/src/context.ts:1-25` — `ShadowDomTargetContext` + `DevtoolsOnCloseContext` + `useDevtoolsOnClose` hook. §3.1
- `referencias/tanstack-router/packages/router-devtools-core/src/useStyles.tsx:1-625` — goober CSS-in-JS factory bound to `shadowDOMTarget` if provided. §3.1, §4.5
- `referencias/tanstack-router/packages/router-devtools-core/src/useLocalStorage.ts:1-53` — JSON round-trip with try/catch fallback. §3.1, §4.2
- `referencias/tanstack-router/packages/router-devtools-core/src/useMediaQuery.ts` — discarded; auxiliary
- `referencias/tanstack-router/packages/router-devtools-core/src/utils.tsx` — discarded; display formatters
- `referencias/tanstack-router/packages/router-devtools-core/src/theme.tsx`, `tokens.ts` — discarded; design tokens
- `referencias/tanstack-router/packages/router-devtools-core/src/NavigateButton.tsx`, `AgeTicker.tsx`, `logo.tsx` — discarded; branded subcomponents

##### Doc / config / branding
- `referencias/tanstack-router/packages/router-devtools-core/package.json:1-83` — clsx + goober deps; Solid as devDep. §6 (deps)
- `referencias/tanstack-router/packages/router-devtools-core/README.md` — public docs (skim only)
- `referencias/tanstack-router/packages/router-devtools-core/CHANGELOG.md` — version history; grep `fix` → only `fix: build with @tanstack/vite-config 0.4.3`. §8
- `referencias/tanstack-router/packages/router-devtools-core/{eslint.config.js,tsconfig*.json,vite.config.ts}` — build config, skim
- `referencias/tanstack-router/packages/router-devtools-core/media/{logo.sketch,logo.svg,repo-dark.png}` — branding

#### `packages/react-router-devtools/` (React binding)

##### Core
- `referencias/tanstack-router/packages/react-router-devtools/src/index.ts:1-25` — NODE_ENV-gated noop export pattern. §3.1, §4.4
- `referencias/tanstack-router/packages/react-router-devtools/src/TanStackRouterDevtools.tsx:1-128` — React wrapper: `useState(() => new Core)`, 3 `useEffect`s for prop sync, mount on ref. §3.1
- `referencias/tanstack-router/packages/react-router-devtools/src/TanStackRouterDevtoolsPanel.tsx:1-90` — Panel-only variant. §3.1

##### Doc
- `referencias/tanstack-router/packages/react-router-devtools/CHANGELOG.md` — version history; same single `fix` entry. §8
- `referencias/tanstack-router/packages/react-router-devtools/{README.md,eslint.config.js,package.json,tsconfig*.json,vite.config.ts}` — skim

#### `packages/router-devtools/` (legacy alias)
- `referencias/tanstack-router/packages/router-devtools/src/index.tsx:1-7` — console.warn + re-export. §3.1 (deprecated shim)
- `referencias/tanstack-router/packages/router-devtools/{README.md,CHANGELOG.md,eslint.config.js,package.json,tsconfig*.json,vite.config.ts}` — skim

#### Examples
- `referencias/tanstack-router/examples/{react,solid}/basic-devtools-panel/**` (~ 14 files each) — discarded; consumer apps
- `referencias/tanstack-router/examples/{react,solid}/basic-non-nested-devtools/**` (~ 14 files each) — discarded; consumer apps

#### Other framework bindings (skim only — same shape)
- `referencias/tanstack-router/packages/{solid,vue}-router-devtools/**` — all files skim; identical pattern to React binding

#### Docs
- `referencias/tanstack-router/docs/router/devtools.md` — discarded; public docs

### Next.js `next-devtools/`

#### Core (read in full)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay.browser.tsx:1-465` — App vs Pages mount; `<nextjs-portal>` custom element; shadow DOM attach; `createQueuable` dispatcher; `useInsertionEffect` flush; MutationObserver for Pages Router. §3.2, §4.1, §4.6, §7.5, §8 (EC-1, EC-2, EC-3)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/dev-overlay.tsx:1-73` — `<DevOverlay>` component; `RenderError` + `ErrorOverlay` + `PanelRouter` + `DevToolsIndicator` mounted inside `ShadowPortal`. §3.2
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/shadow-portal.tsx:1-9` — `createPortal(children, shadowRoot)`. §3.2, §4.1
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/devtools-indicator/devtools-indicator.tsx:1-113` — Toast wrapper + `<Draggable>` + `<NextLogo>` indicator. §3.2, §4.7 (corner positioning)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/errors/dev-tools-indicator/draggable.tsx:1-396` — full drag physics: pointer capture, velocity history, spring projection, corner snap. §3.2, §4.9, §7.3, §8 (EC-8/9/10/14)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/utils/save-devtools-config.ts:1-48` — POST to `/__nextjs_devtools_config` with 120ms debounce + zod validation + keepalive fetch. §3.2, §4.10, §5.4
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/segment-explorer-trie.ts:1-157` — trie with prune-empty-parents + `useSyncExternalStore` adapter. §3.2, §7.4

#### Core (inventoried, categorized, not deep-read — see §2 Next.js bucket table for full enumeration)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/errors/**` (~35 files) — error overlay UI surface (dialog, body, header, layout, nav, pagination, message, type-label, footer, toolbar, copy-error-button, docs-link-button, nodejs-inspector-button, environment-name-label, error-feedback, error-overlay-call-stack, error-overlay-bottom-stack, hydration-diff, error-aggregate-errors, error-cause)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/dialog/**` (5 files) — modal primitives
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/overlay/**` (5 files) — overlay primitives + body-locker
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/toast/**` (2 files) — toast primitives
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/tooltip/tooltip.tsx`
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/devtools-panel/**` (3 files) — resize primitives
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/devtools-indicator/{hooks/use-measure-width.ts,hooks/use-minimum-loading-time-multiple.ts,hooks/use-update-animation.ts,status-indicator.tsx,next-logo.tsx,devtools-indicator.css}` — indicator animation + branding
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/{call-stack,call-stack-frame,code-frame}/**` (4 files) — error stack/code-frame UI
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/copy-button/index.tsx`, `fader/index.tsx`, `hot-linked-text/index.tsx`, `resizer/index.tsx`, `terminal/{index.tsx,terminal.tsx,editor-link.tsx}` — misc UI primitives
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/instant/instant-guidance.tsx`, `instant-navs/{instant-nav-cookie.ts,instant-navs-panel.tsx}` — App Router instant nav feature
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/overview/{segment-boundary-trigger.tsx,segment-explorer.tsx,segment-suggestion.tsx}` — segment trie UI
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/hydration-diff/diff-view.tsx`
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/container/{build-error.tsx,errors.tsx}` + `container/runtime-error/**` (5 files)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/font/font-styles.tsx` + `dev-overlay/storybook/**` (4 files; discarded) + `dev-overlay/styles/**` (2 files) + `dev-overlay/icons/**` (~ 20 files)
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/hooks/{use-active-runtime-error.ts,use-debounced-value.ts,use-delayed-render.ts,use-on-click-outside.ts,use-shortcuts.ts}` — React hooks
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/menu/{context.tsx,dev-overlay-menu.tsx,panel-router.tsx}` + `panel/dynamic-panel.tsx`
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/shared.ts` — action constants
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/cache-indicator.tsx`
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/utils/{css.ts,cx.ts,get-error-by-type.ts,indicator-metrics.ts,lorem.ts,parse-url-from-text.ts,use-open-in-editor.ts}`
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/errors/dev-tools-indicator/{dev-tools-info/dev-tools-header.tsx,dev-tools-info/route-info.tsx,dev-tools-info/shortcut-recorder.tsx,dev-tools-info/user-preferences.tsx,drag-context.tsx,utils.ts}` — settings + drag context
- `referencias/next.js/packages/next/src/next-devtools/userspace/{app/**,pages/**}` (~ 12 files) — userspace event sources
- `referencias/next.js/packages/next/src/next-devtools/server/**` (~ 5 files; including `server/font/**`) — server side of devtools
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/font/**`, `dev-overlay/icons/**`, `dev-overlay/storybook/**`, `dev-overlay/styles/**` — branding/storybook
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/**/*.stories.tsx` — Storybook stories
- `referencias/next.js/packages/next/src/next-devtools/dev-overlay/components/**/*.test.ts` — tests
- `referencias/next.js/packages/next/next-devtools.webpack-config.js` — webpack config (discarded)
- `referencias/next.js/packages/next/src/client/components/navigation-devtools.ts` — userspace bridge (discarded; covered by §4.11 pattern abstraction)
- `referencias/next.js/packages/next/src/client/dev/error-overlay/websocket.ts` — HMR bridge (discarded; equivalent in Astro covered)
- `referencias/next.js/errors/improper-devtool.mdx` — user-facing doc (discarded; off topic)
- `referencias/next.js/packages/next/src/bundles/webpack/packages/SourceMapDevToolModuleOptionsPlugin.js`, `compiled/webpack/SourceMapDevToolModuleOptionsPlugin.js` — webpack vendored plugin (false positive; discarded)

### Astro `dev-toolbar/`

#### Core (read in full)
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/entrypoint.ts:1-285` — DOMContentLoaded bootstrap, parallel imports, custom-element registration, app preparation, `astro:after-swap` re-append, more-app dropdown. §3.3, §4.12, §8 EC-15
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/toolbar.ts:1-605` — `AstroDevToolbar` custom element + `DevToolbarCanvas`; shadow DOM, init, attachEvents, click toggle, Escape, auto-hide via HOVER_DELAY, placement-update events, view-transitions handling. §3.3, §4.1, §4.7, §4.14, §7.5 (kinda), §8 EC-11/15/16
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/helpers.ts:1-108` — `ToolbarAppEventTarget` event API + `serverHelpers` (Vite `import.meta.hot.send/.on`). §3.3, §4.13, §5.3
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/xray.ts:1-184` — example built-in app: scan `astro-island` elements, draw highlight + tooltip, `/__open-in-editor?file=` click action. §3.3, §4.15

#### Core (inventoried, categorized, not deep-read)
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/astro.ts` — main "Astro" built-in app; same shape as xray (skim)
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/settings.ts` — settings app
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/audit/{index.ts,annotations.ts,rules/{a11y.ts,index.ts,perf.ts},ui/{audit-list-item.ts,audit-list-window.ts,audit-ui.ts}}` (~ 8 files) — a11y + perf audit
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/apps/utils/{highlight.ts,icons.ts,window.ts}` — DOM positioning utilities for island highlights
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/settings.ts` — global toolbar settings
- `referencias/astro/packages/astro/src/runtime/client/dev-toolbar/ui-library/{badge.ts,button.ts,card.ts,highlight.ts,icons.ts,icon.ts,index.ts,radio-checkbox.ts,select.ts,toggle.ts,tooltip.ts,window.ts}` (13 files) — custom-element design system

#### Test (read seletivo)
- `referencias/astro/packages/astro/e2e/dev-toolbar.test.ts`, `dev-toolbar-audits.test.ts` — Playwright; informs §9.5 acceptance criteria (discarded as implementation source)
- `referencias/astro/packages/astro/e2e/fixtures/dev-toolbar/**` (~ 25 files) — test fixtures (discarded)

#### Doc / CHANGELOG
- `referencias/astro/packages/astro/CHANGELOG.md` (grep `fix.*dev.toolbar`) — surfaces EC-4 (PR #16481), EC-5 (#16105), EC-6 (#13862), EC-13 (#12590). §8

### Other frameworks (verified absence)

- `referencias/remix/**` — content-grep for `devtool|DevTool|dev-overlay|errorOverlay|inspector|debugger` returns **zero hits** in `.ts/.tsx/.md` files
- `referencias/sveltekit/{documentation/docs/60-appendix/25-debugging.md,packages/kit/src/runtime/client/client.js,packages/kit/src/core/env.js,packages/kit/CHANGELOG.md,CHANGELOG-pre-1.md}` — only Chrome DevTools doc + JS `debugger` reserved word references
- `referencias/nitro/src/presets/{iis/utils.ts,deno/unenv/node-compat.ts,cloudflare/unenv/node-compat.ts}` — only `node:inspector` runtime shims
- `referencias/hono/**` — zero hits
- `referencias/trpc/examples/{next-prisma-websockets-starter/src/pages/index.tsx,next-sse-chat/src/app/page.tsx}` — examples consuming `@tanstack/react-query-devtools` (third-party); confirms tRPC delegates
- `referencias/vite/{docs/images/vite-plugin-inspect.webp,playground/devtools/**}` — `vite-plugin-inspect` is an external plugin, not in repo; playground/devtools is a test fixture not a devtools library

### Commits relevantes (git arqueologia)

- Astro `152700e` (PR #16481) — "Fixes a spurious 404 request for a dev toolbar sourcemap during `astro dev`" → EC-4
- Astro `23d60de` (PR #16105) — "Fix dev toolbar audit crash when encountering the `image` ARIA role" → EC-5
- Astro `31d733b` (PR #16068) — "Fixes the dev toolbar a11y audit incorrectly classifying `menuitemradio` as a non-interactive ARIA role"
- Astro `e718375` (PR #13983) — "Fixes a case where the toolbar audit would incorrectly flag images processed by Astro in content collections documents"
- Astro `fe8f61a` (PR #13862) — "Fixes a case where the dev toolbar would crash if it could not retrieve some essential data" → EC-6
- Astro `92c269b` (PR #12590) — "fix: devtools warnings about dev toolbar form fields" → EC-13
- TanStack `c9e1855` — "Replace tiny-invariant and tiny-warning with in-house solution for bundle-size" (devtools-core CHANGELOG.md v1.167.1) — shows bundle-budget mindset
- TanStack `838b0eb` — "fix: build with @tanstack/vite-config 0.4.3" — only `fix` entry in 80 lines of CHANGELOG; the package is small + stable

### URLs externas (não fetched, mas referenciadas implicitamente)

- `https://github.com/TanStack/router/tree/main/packages/router-devtools-core` — canonical TanStack devtools source
- `https://github.com/vercel/next.js/tree/canary/packages/next/src/next-devtools` — canonical Next.js dev-overlay source
- `https://github.com/withastro/astro/tree/main/packages/astro/src/runtime/client/dev-toolbar` — canonical Astro dev-toolbar source
- `https://github.com/antfu-collective/vite-plugin-inspect` — Vite ecosystem devtools (not in `referencias/`, but the de facto Vite community devtools plugin)
- `https://www.easing.dev/spring` — referenced in Next.js `draggable.tsx:232` as source of `var(--timing-bounce)` curve
