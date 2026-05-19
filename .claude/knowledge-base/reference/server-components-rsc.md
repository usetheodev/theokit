# Reference: Server Components (RSC)

**Date:** 2026-05-19
**Depth:** exhaustive (default)
**Frameworks analyzed:**
- Next.js — `referencias/next.js/` (shallow clone, commit `8f132ea9`)
- Astro — `referencias/astro/` (server-islands track)
- TanStack Start — `referencias/tanstack-router/` (RSC opt-in via `@vitejs/plugin-rsc`)
- SvelteKit — `referencias/sveltekit/` (mention only — no RSC equivalent in their model)
- Remix — `referencias/remix/` (RSC work happens on a branch not present in this snapshot)

**TheoKit package affected (if adopted):** `packages/theo/src/router/`, `packages/theo/src/vite-plugin/`, `packages/theo/src/server/`

**Related references:** none yet — this is the first document in `.claude/knowledge-base/reference/`.

---

## 1. Problem statement

- **What:** Decide whether TheoKit should implement React Server Components (RSC), what the implementation would look like, and what the cost-vs-benefit profile is for an agent-first framework. The output is either (a) a concrete implementation plan or (b) a documented decision NOT to adopt RSC with the analysis that supports the decision.
- **Current state:** TheoKit has zero RSC support. Every component is interactive (CSR + SSR). `grep -rln rsc packages/` returns zero matches.
- **Why now:** RSC is the headline differentiator Next.js claims vs every other React framework. Without a position on RSC, TheoKit's comparison story is incomplete. The honesty contract in the roadmap (`CLAUDE.md` 0.5.0+) flags "RSC compatibility decision" as needing a strategic call before 1.0. This document is the analysis that informs that call.

---

## 2. Inventário completo de arquivos (mandatório)

Inventário gerado pelas 3 passadas (filename / content / docs). Filtros aplicados: excluído `*/node_modules/*`, `*/.git/*`, `src/compiled/*` (vendored copies de `react-server-dom-webpack` e outras libs que Next bundla), `examples/*`, `apps/*`, `evals/*` (user-facing demos). Os arquivos `test`, `spec`, `__tests__`, `fixture` aparecem na seção de descartados.

### Next.js — inventário (`referencias/next.js/packages/next/src/`)

Total bruto após filtros: **195 arquivos**. Detalhamento abaixo. Esta seção lista todos os arquivos `core`/`support`/`doc` deep-read; os outros aparecem com motivo de descarte.

#### Core / Support / Doc (130 files — lista por subdiretório)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| **build/webpack/loaders (14 files)** | | | | |
| `build/webpack/loaders/next-flight-client-entry-loader.ts` | core | 76 | ✅ | §3.1.1 |
| `build/webpack/loaders/next-flight-client-module-loader.ts` | core | 48 | ✅ | §3.1.1 |
| `build/webpack/loaders/next-flight-server-reference-proxy-loader.ts` | core | 27 | ✅ | §3.1.1, §3.1.2 |
| `build/webpack/loaders/next-flight-action-entry-loader.ts` | core | 36 | ✅ | §3.1.2 |
| `build/webpack/loaders/next-flight-css-loader.ts` | support | 60 | ✅ | §3.1.1 (HMR for CSS in server layer) |
| `build/webpack/loaders/next-flight-loader/action-client-wrapper.ts` | support | — | seletivo | §3.1.2 |
| `build/webpack/loaders/next-flight-loader/action-validate.ts` | support | — | seletivo | §3.1.2 |
| `build/webpack/loaders/next-flight-loader/index.ts` | support | — | seletivo | §3.1.2 |
| `build/webpack/loaders/next-flight-loader/module-proxy.ts` | support | — | seletivo | §3.1.2 |
| `build/webpack/loaders/next-flight-loader/server-reference.ts` | support | — | seletivo | §3.1.2 |
| `build/webpack/loaders/get-module-build-info.ts` | support | — | seletivo | §3.1.1 (RSC metadata on webpack module) |
| `build/webpack/loaders/next-barrel-loader.ts` | support | — | descartado parcial | §2 discarded (barrel optimization tangencial) |
| `build/webpack/loaders/next-swc-loader.ts` | support | — | descartado | §2 discarded (general transform; RSC role is via `next-flight-loader` chain) |
| `build/webpack/loaders/utils.ts` | support | — | seletivo | §3.1.1 (`isClientComponentEntryModule`, `regexCSS`) |
| **build/webpack/plugins (6 files)** | | | | |
| `build/webpack/plugins/flight-client-entry-plugin.ts` | core | 1263 | ✅ (skim + targeted reads §200–650) | §3.1.1, §4.1, §5.1, §7.1 |
| `build/webpack/plugins/flight-manifest-plugin.ts` | core | 615 | seletivo (skim) | §3.1.1, §4.2 |
| `build/webpack/plugins/rspack-flight-client-entry-plugin.ts` | support | — | descartado parcial | §2 discarded (Rspack port of same plugin) |
| `build/webpack/plugins/middleware-plugin.ts` | support | — | seletivo | §3.1.5 |
| `build/webpack/plugins/wellknown-errors-plugin/getModuleTrace.ts` | support | — | descartado | §2 discarded (general error plugin, RSC mention is incidental) |
| `build/webpack/plugins/wellknown-errors-plugin/parseNotFoundError.ts` | support | — | descartado | §2 discarded (idem) |
| **server/app-render (28 files)** | | | | |
| `server/app-render/app-render.tsx` | core | 8790 | seletivo (skim grep — too large for full read) | §3.1.4, §4.1 |
| `server/app-render/action-handler.ts` | core | 1477 | seletivo | §3.1.4, §4.3 |
| `server/app-render/use-flight-response.tsx` | core | 274 | ✅ | §3.1.4, §4.4, §5.2 |
| `server/app-render/encryption.ts` | core | 336 | ✅ (offsets 1–130) | §3.1.4, §4.3, §8 |
| `server/app-render/create-component-tree.tsx` | core | — | seletivo | §3.1.4 |
| `server/app-render/manifests-singleton.ts` | core | — | seletivo | §3.1.4 (consumes manifest from §3.1.1 plugin) |
| `server/app-render/entry-base.ts` | core | — | seletivo | §3.1.4 (entry point wired into route-modules) |
| `server/app-render/collect-segment-data.tsx` | support | — | seletivo | §3.1.4 |
| `server/app-render/dynamic-rendering.ts` | support | — | seletivo | §3.1.4 |
| `server/app-render/flight-render-result.ts` | support | — | seletivo | §3.1.4 |
| `server/app-render/get-css-inlined-link-tags.tsx` | support | — | seletivo | §3.1.4 |
| `server/app-render/react-server.node.ts` | support | — | seletivo | §3.1.4 (Node-side react-server entry) |
| `server/app-render/use-cache-async-storage.external.ts` | support | — | descartado | §2 discarded (use-cache subsystem, tangencial) |
| `server/app-render/use-cache-cache-store.ts` | support | — | descartado | idem |
| `server/app-render/work-async-storage.external.ts` | support | — | seletivo | §3.1.4 (AsyncLocalStorage) |
| `server/app-render/work-unit-async-storage.external.ts` | support | — | seletivo | §3.1.4, §4.5 (per-request work-unit storage) |
| `server/app-render/cache-signal.ts` | support | — | descartado | §2 (use-cache) |
| `server/app-render/app-render-prerender-utils.ts` | support | — | descartado | §2 (PPR — Partial Prerendering — adjacent feature) |
| `server/app-render/create-flight-router-state-from-loader-tree.ts` | support | — | seletivo | §3.1.4 |
| `server/app-render/instant-validation/boundary-impl.tsx` | support | — | descartado | §2 (instant-validation experimental feature) |
| `server/app-render/instant-validation/instant-validation.tsx` | support | — | descartado | idem |
| `server/app-render/rsc/postpone.ts` | support | — | descartado | §2 (postpone() = PPR-specific) |
| `server/app-render/rsc/preloads.ts` | support | — | seletivo | §3.1.4 |
| `server/app-render/rsc/taint.ts` | support | — | seletivo | §3.1.4, §8 (security: taint API) |
| `server/app-render/use-flight-response.tsx` | core (dup) | — | already listed | §3.1.4 |
| **server/typescript/rules (3 files)** | | | | |
| `server/typescript/rules/client-boundary.ts` | core | 122 | ✅ | §3.1.3, §4.6, §8 |
| `server/typescript/rules/server-boundary.ts` | core | 159 | ✅ | §3.1.3, §4.6 |
| `server/typescript/rules/error.ts` | support | — | seletivo | §3.1.3 |
| **server/lib + server/normalizers (9 files)** | | | | |
| `server/lib/is-rsc-request.ts` | core | 9 | ✅ | §3.1.4 |
| `server/normalizers/request/rsc.ts` | core | 13 | ✅ | §3.1.4 |
| `server/normalizers/request/segment-prefix-rsc.ts` | support | — | seletivo | §3.1.4 |
| **server (other — 23 files, descarted majority, see §2 discarded)** | | | | |
| `server/base-server.ts` | support | — | seletivo | §3.1.4 (RSC request routing) |
| `server/route-modules/app-page/module.ts` | support | — | seletivo | §3.1.4 |
| **client/components (33 files)** | | | | |
| `client/components/app-router.tsx` | core | 655 | seletivo (skim) | §3.1.5, §4.7 |
| `client/components/router-reducer/fetch-server-response.ts` | core | 673 | seletivo | §3.1.5 |
| `client/components/router-reducer/reducers/server-action-reducer.ts` | core | — | seletivo | §3.1.5 |
| `client/components/router-reducer/ppr-navigations.ts` | support | — | descartado | §2 (PPR-specific) |
| `client/components/segment-cache/cache.ts` | support | — | seletivo | §3.1.5 |
| `client/components/segment-cache/bfcache.ts` | support | — | descartado | §2 (bfcache subsystem) |
| `client/components/error-boundary.tsx` | support | — | seletivo | §3.1.5 |
| `client/components/redirect-boundary.tsx` | support | — | seletivo | §3.1.5 |
| `client/components/layout-router.tsx` | support | — | seletivo | §3.1.5 |
| `client/components/navigation.ts` | support | — | seletivo | §3.1.5 |
| `client/components/use-offline.tsx` | support | — | descartado | §2 (offline/PWA tangencial) |
| `client/components/render-from-template-context.tsx` | support | — | seletivo | §3.1.5 |
| (outros 22 client/components — todos seletivos/descartados, ver §2 discarded) | | | | |
| **shared/lib (14 files)** | | | | |
| `shared/lib/app-router-context.shared-runtime.ts` | core | — | seletivo | §3.1.5 |
| `shared/lib/app-router-types.ts` | support | — | seletivo | §3.1.5 |
| `shared/lib/constants.ts` (`RSC_HEADER`, `NEXT_RSC_UNION_QUERY`, …) | core | — | seletivo | §3.1.4 |
| (outros 11 shared/* — todos seletivos/descartados) | | | | |
| **vendored react-server-dom (13 files)** | | | | |
| `server/route-modules/app-page/vendored/rsc/entrypoints.ts` | core | — | ✅ | §3.1.4, §6 |
| `server/route-modules/app-page/vendored/rsc/react-server-dom-webpack-server.ts` | core | — | seletivo | §3.1.4 |
| `server/route-modules/app-page/vendored/rsc/react-server-dom-webpack-static.ts` | support | — | seletivo | §3.1.4 |
| `server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.ts` | support | — | descartado | §2 (Turbopack alternative path) |
| `server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-static.ts` | support | — | descartado | idem |
| `server/route-modules/app-page/vendored/ssr/react-server-dom-webpack-client.ts` | core | — | seletivo | §3.1.5 |
| `server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client.ts` | support | — | descartado | idem |
| `server/route-modules/app-page/vendored/ssr/entrypoints.ts` | support | — | seletivo | §3.1.5 |
| (outros 5 vendored — react, react-dom, jsx-runtime — descartados como infraestrutura de React vendoring) | | | | |

### Astro — inventário (`referencias/astro/packages/astro/`)

Total: **21 arquivos** (bruto). Astro tem "Server Islands", não RSC — uma abordagem diferente para o mesmo problema (rendering server-side com hidratação seletiva). Filename grep + content grep:

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `src/runtime/server/render/server-islands.ts` | core | 255 | ✅ | §3.2, §4.4, §5 (encryption pattern) |
| `src/core/encryption.ts` | support | — | seletivo (referenced from §3.2) | §3.2 |
| `src/core/errors/errors-data.ts` | doc | — | seletivo (error messages para edge cases) | §8 |
| `CHANGELOG.md` | doc | — | seletivo (grep RSC/island) | §8 |
| (outros 17 — testes + fixtures + 1 vite plugin entry) | | | | §2 discarded |

### TanStack Start — inventário (`referencias/tanstack-router/`)

Total: **326 arquivos** matching keyword. Filtrados para core/support:

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/start-plugin-core/src/rsbuild/swc-rsc.ts` | core | 166 | ✅ | §3.3, §4.1 |
| `packages/start-plugin-core/src/rsbuild/plugin.ts` | core | 779 | seletivo | §3.3, §4.1 |
| `packages/start-plugin-core/src/rsbuild/planning.ts` | core | — | seletivo | §3.3 |
| `packages/start-plugin-core/src/rsbuild/swc-rsc.ts` (dup) | | | | |
| `packages/start-plugin-core/src/rsbuild/virtual-modules.ts` | support | — | seletivo | §3.3 |
| `packages/start-plugin-core/src/rsbuild/normalized-client-build.ts` | support | — | seletivo | §3.3 |
| `packages/start-plugin-core/src/rsbuild/types.ts` | support | — | seletivo | §3.3 |
| `packages/start-plugin-core/src/vite/plugin.ts` | support | — | seletivo | §3.3 |
| `packages/start-client-core/skills/start-core/SKILL.md` | doc | 214 | ✅ | §3.3, §4 (philosophy: "RSC is opt-in") |
| `docs/start/framework/react/guide/server-components.md` | doc | — | seletivo (head) | §3.3, §4 |
| `docs/start/framework/react/start-vs-nextjs.md` | doc | — | seletivo | §4 (TheoKit positioning) |
| `docs/start/eslint/no-async-client-component.md` | doc | — | seletivo | §8 |
| `docs/start/eslint/no-client-code-in-server-component.md` | doc | — | seletivo | §8 |
| (outros 313 — e2e samples sob `e2e/react-start/rsc*`, fixtures, generated routeTree) | | | | §2 discarded |

### SvelteKit — inventário (`referencias/sveltekit/`)

Total: **10 arquivos** matching. SvelteKit não implementa RSC (Svelte tem um modelo diferente — Svelte compila-se para vanilla JS sem hierarquia client/server fundamental). Os matches são em CHANGELOGs comparativos e docs que mencionam RSC para distinguir o modelo Svelte.

| File | Category | Tratamento |
|---|---|---|
| `packages/kit/CHANGELOG.md` | doc | descartado — menção tangencial em release notes |
| `documentation/blog/*.md` (vários) | doc | descartado — posicionamento de marketing |
| (8 outros) | | descartado |

### Remix — inventário

**Zero arquivos** matching no snapshot atual. Remix está desenvolvendo RSC em uma branch (`react-router/dev`) que não foi clonada. Documentado em §10 (Open Questions).

### Arquivos avaliados e descartados (com motivo)

Esta seção lista TODOS os arquivos do grep que NÃO foram lidos, com justificativa. Sem cherry-picking — quem ler o doc depois consegue auditar.

| File pattern | Count | Why discarded |
|---|---|---|
| `src/compiled/**` (Next.js) | ≈ 1834 | Vendored copies of `react-server-dom-webpack`, `webpack`, `babel`, `acorn`, etc. — snapshots of upstream libraries Next bundles. Not Next.js authored code. |
| `examples/**` (Next.js) | ≈ 12 user-app files | User-facing demo apps. Each is a reproduction of a customer scenario, not framework internals. |
| `apps/bundle-analyzer/**` | 16 | Bundle analyzer dashboard app, not RSC machinery. |
| `evals/**` | 13 | Internal evaluation harness, not framework code. |
| `__tests__/**` + `*.test.ts` + `*.spec.ts` (Next.js) | 14 | Test files — used selectively for edge case enumeration in §8, not deep-read in full. |
| `**/__fixtures__/**` | — | Test fixtures — trivial-by-design content, no invariant beyond what the test asserts. |
| `packages/third-parties/**` | 3 | Third-party script integrations (gtag, etc.), unrelated to RSC. |
| `src/server/app-render/instant-validation/**` | 2 | Experimental "instant validation" boundary, adjacent feature in flux. Marked for re-evaluation when stable. |
| `src/server/app-render/rsc/postpone.ts` | 1 | Partial Prerendering (PPR) — separate feature that piggybacks on RSC but is a distinct decision (TheoKit would adopt PPR independently). |
| `src/server/app-render/app-render-prerender-utils.ts` | 1 | PPR utilities — same reason as above. |
| `src/server/app-render/use-cache-async-storage.external.ts` + `cache-signal.ts` + `use-cache-cache-store.ts` | 3 | `use cache` directive subsystem — separate React experimental feature. |
| `src/server/dev/use-cache-probe-worker.ts` | 1 | Dev tooling for `use cache`. |
| `src/server/use-cache/use-cache-wrapper.ts` | 1 | Same `use cache` subsystem. |
| `src/client/components/segment-cache/bfcache.ts` | 1 | Back-forward cache subsystem, not core RSC. |
| `src/client/components/router-reducer/ppr-navigations.ts` | 1 | PPR navigation logic. |
| `src/client/components/use-offline.tsx` | 1 | PWA offline support, tangencial. |
| `src/build/webpack/plugins/wellknown-errors-plugin/**` | 2 | General error plugin; the RSC mention is incidental. |
| `src/build/webpack/loaders/next-barrel-loader.ts` | 1 | Barrel-import optimization; tangencial to RSC. |
| `src/build/webpack/loaders/next-swc-loader.ts` | 1 | Generic SWC transform loader; RSC role is via the `next-flight-loader` chain that I deep-read. |
| `src/build/webpack/plugins/rspack-flight-client-entry-plugin.ts` | 1 | Rspack port of `flight-client-entry-plugin.ts`. Same algorithm, different bundler. |
| `src/server/lib/is-rsc-request.test.ts` | 1 | Test for the 9-line helper I already read. |
| `src/server/normalizers/request/segment-prefix-rsc.test.ts` | 1 | Test file. |
| `astro/test/**` | ≈ 12 | Astro test fixtures + spec files. |
| `tanstack-router/e2e/react-start/rsc*/**` | ≈ 290 | TanStack e2e sample apps demonstrating RSC patterns; not framework internals. |
| `tanstack-router/docs/start/framework/solid/**` | — | Solid version of TanStack Start docs; React version was deep-read. |
| `sveltekit/**` (all 10 matches) | 10 | Marketing/positioning mentions only — SvelteKit does not implement RSC. |

**Total descartado com justificativa:** ≈ 2200 arquivos. **Total deep-read em full ou selective:** 60+ arquivos.

---

## 3. Prior art — deep dive por framework

### 3.1 Next.js — version 15+ (commit `8f132ea9`)

Next.js is the canonical RSC implementation. Its architecture has 5 distinct layers that work together. I describe each below with file:line anchors.

#### 3.1.1 Build layer — boundary detection (`'use client'`)

**Plugin:** `flight-client-entry-plugin.ts:206-310`. Apply hooks at `finishMake` (creates client entries) and `afterCompile` (records module ids into `pluginState`).

**The boundary detection algorithm** (`collectComponentInfoFromServerEntryDependency`, lines 729-849):

1. Traverse the webpack module graph starting from a server entry (a page/layout component) via `getModuleReferencesInOrder()` (line 820).
2. For each module visited, check `getModuleBuildInfo(mod).rsc?.actionIds` — if present, it's a server action source (line 773). Push to `actionImports`.
3. Check `isCSSMod(mod)` (line 792) — CSS modules get added to `CSSImports` set.
4. Check `isClientComponentEntryModule(mod)` (line 805) — if true (the module declares `'use client'`), STOP the traversal at this node and record the boundary in `clientComponentImports[modResource]` (lines 806-815). Do NOT recurse into the client module's deps.
5. Else, recurse into all `connection.resolvedModule` (lines 820-834).

This is the **boundary corruption-prevention contract**: traversal stops at a client boundary. If anywhere in the graph a server component re-exports a client component through a barrel file, the `actionIds` and `clientComponentImports` accounting can leak. The known bug pattern.

**Loader chain that consumes the boundary info:**

- `next-flight-client-entry-loader.ts:1-76` — generates a virtual module that does `import(/* webpackMode: "eager", webpackExports: [...] */ "<client-component-path>")` for each detected client module. The `eager` mode forces inlining into the entry chunk so React.lazy isn't needed.
- `next-flight-client-module-loader.ts:1-48` — applied to modules in the client layer. Reads `getRSCModuleInformation(source, false)` to populate `buildInfo.rsc` (RSC type, action ids). In production with action ids, **re-exports each action through a virtual proxy** (line 39): `export { name } from 'next-flight-server-reference-proxy-loader?id=...&name=...!'`. This enables tree-shaking of server actions.
- `next-flight-server-reference-proxy-loader.ts:1-27` — emits ~3 lines: `import { createServerReference, callServer, findSourceMapURL } from 'private-next-rsc-action-client-wrapper'` and `export const X = createServerReference(<id>, callServer, ...)`. Marked side-effect free so webpack concatenates and inlines.
- `next-flight-action-entry-loader.ts:1-36` — given action ids per module, emits re-exports: `export { exportedName as "actionId" } from "/path"`.
- `next-flight-css-loader.ts:1-60` — wraps CSS imports in the server layer. Adds `module.hot.accept()` for HMR (line 49) and a sha1-12 checksum (line 33) to trigger reload diffs.

**Manifest emission:** `flight-manifest-plugin.ts` (615 lines, seletivo). Writes a manifest with client module ids, module loading config, edge mappings — consumed at runtime by `manifests-singleton.ts:1` (`getClientReferenceManifest()`).

**State (per-build):** `pluginState` in `flight-client-entry-plugin.ts:106-132` is a proxied object holding:
- `serverActions` / `edgeServerActions` — action id → bundle mapping
- `ssrModules` / `edgeSsrModules` / `rscModules` / `edgeRscModules` — module id → `{ moduleId, async }` per webpack layer
- `injectedClientEntries` — entry name → bundlePath

The `serverActions` Map is keyed by **action id** which is the hash that goes into the encrypted payload (see §3.1.4 encryption).

#### 3.1.2 Build layer — Server Actions

Server actions get their own entry. The action handler chain:

- `next-flight-action-entry-loader.ts:26-32` — produces a virtual module that re-exports each action under its hash id as the exported name (so webpack chunk graph can find them).
- `next-flight-loader/server-reference.ts` (selective) — runtime stub returned from server actions in the **client layer**: a thin proxy that knows the action id and dispatches via fetch on the client.
- `next-flight-loader/action-client-wrapper.ts` (selective) — the `private-next-rsc-action-client-wrapper` virtual module imported by `next-flight-server-reference-proxy-loader.ts:21`. Provides `createServerReference`, `callServer`, `findSourceMapURL`.

The action id is **content-derived** (hashed) so the same action across rebuilds stays addressable. Encrypted bound args are tied to this id (§4.3).

#### 3.1.3 TypeScript validation layer

Next.js ships a TS language-service plugin that flags `'use client'` and `'use server'` violations in the editor BEFORE build.

**`server/typescript/rules/client-boundary.ts:33-119` — for `'use client'`:**

- Walks exported function declarations.
- For each prop, gets the TS Type, checks if it's a function or class/constructor type.
- If function type AND prop name doesn't match `/^action$/` or `/.+Action$/` (line 75-77) AND not the special `reset` prop on `error.tsx`/`global-error.tsx` (line 81-82), emits warning: `Props must be serializable for components in the "use client" entry file. "<name>" is a function that's not a Server Action. Rename "<name>" either to "action" or have its name end with "Action"`.
- For class/constructor types, always emits warning: `Props must be serializable`.

This rule encodes a CONVENTION: a function prop named `someAction` is assumed to be a Server Action; anything else is assumed to be a passing-functions-to-client bug. **The fundamental ambiguity**: TS does not expose function directives in the type system, so the framework cannot distinguish server actions from regular functions structurally. Next.js falls back to name-based heuristic.

**`server/typescript/rules/server-boundary.ts:55-156` — for `'use server'`:**

- For each named export, checks if the function returns `Promise<T>` via `isFunctionReturningPromise` (line 22).
- If not, emits ERROR: `The "use server" file can only export async functions.`
- Covers `export const X = () => ...`, `export function X()`, `export { X } from "..."`, and re-export forms.

#### 3.1.4 Server runtime — Flight rendering

The server-side flow when a request comes in:

**Request classification:** `server/lib/is-rsc-request.ts:1-9` — a single function checking the literal header value `'1'`. The `Next-Router-State-Tree`/`RSC` headers tell the server "this is an RSC payload request, not a full HTML render."

**Path normalization:** `server/normalizers/request/rsc.ts:1-13` — strips the `.rsc` suffix that the client appends when fetching incremental segments.

**Main render entry:** `server/app-render/app-render.tsx` (8790 lines — too large for full read, navigated via grep). Key functions: `renderToHTMLOrFlight()`, `renderToHTMLImpl()`. Pipeline:
1. Parse incoming headers (RSC marker, segment hints).
2. Build component tree via `create-component-tree.tsx`.
3. Render through React-Server (vendored at `route-modules/app-page/vendored/rsc/entrypoints.ts`) which provides `renderToReadableStream`.
4. Either pipe Flight chunks directly back (RSC request) or use `createInlinedDataReadableStream` to embed them in HTML (initial load).

**Per-request state:** `work-unit-async-storage.external.ts` exposes a Node `AsyncLocalStorage<WorkUnit>` (selective). Every render allocates a WorkUnit type-distinguished by `'request' | 'prerender' | 'cache' | …`. The async storage propagates across React render boundaries because React's RSC machinery uses `async_hooks` internally.

**Flight payload format** (read from `use-flight-response.tsx:14-17`):
```ts
const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
const INLINE_FLIGHT_PAYLOAD_DATA = 1
const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
const INLINE_FLIGHT_PAYLOAD_BINARY = 3
```

Flight chunks are pushed into a global JS array `self.__next_f` (line 227). The runtime client (vendored react-server-dom-webpack) tails this array and feeds chunks to React's `createFromReadableStream`. **Binary chunks** (e.g., serialized typed arrays from RSC) are base64-encoded and pushed as `[3, "..."]` (line 256-266). Credits to Devon Govett (line 254) — Next did not invent this trick.

**Inline script wrapping:** `createInlinedDataReadableStream` (line 165) emits one `<script>` per Flight chunk. If a CSP nonce is configured, every script tag gets `nonce="..."`. This is how Next.js solves "CSP + inline scripts": nonce-based.

**Action handler:** `server/app-render/action-handler.ts` (1477 lines, seletivo). Decodes encrypted bound args via `decodeActionBoundArg` (encryption.ts:49-71), resolves the action handler from the server reference manifest, invokes it, returns either redirect or Flight payload of the new tree.

**Encryption for action args** (`encryption.ts:46-97`):
- Key: derived via `getActionEncryptionKey()` — a runtime singleton, fed by the `encryptionKey` build option (`flight-client-entry-plugin.ts:62`).
- IV: 16 random bytes per encryption, `crypto.getRandomValues()`.
- Algorithm: AES-GCM (via `encrypt`/`decrypt` from `encryption-utils.ts`).
- Layout: `btoa(iv_16bytes || ciphertext)`.
- Integrity check: payload starts with the actionId — decrypt fails if mismatch (line 66-68). This is a **bind-to-action checksum** so a payload encrypted for action A can't be replayed against action B.

#### 3.1.5 Client runtime — App Router + segment cache

**App Router:** `client/components/app-router.tsx` (655 lines). Wraps `RouterReducer` that drives navigation. The reducer pattern (`router-reducer/reducers/`) handles: navigation, prefetch, server actions, refresh, refreshes from server.

**Server action dispatch:** `router-reducer/reducers/server-action-reducer.ts` — given an action call from a client component, fetches the action endpoint, receives a Flight payload that includes the new tree, swaps the rendered tree.

**Flight payload fetch:** `router-reducer/fetch-server-response.ts` (673 lines). Constructs the request, sets headers (`RSC: 1`, `Next-Router-State-Tree`, `Next-Url`), receives Flight stream, hands to `createFromReadableStream` (vendored).

**Segment cache:** `client/components/segment-cache/cache.ts` — keyed by route path + state tree hash. Caches incremental Flight payloads so revisiting a segment doesn't re-fetch. Distinct from React's render cache.

### 3.2 Astro — Server Islands (the inverse approach)

Astro went a different direction: rather than fine-grained RSC boundaries, the unit of server-side rendering is the **whole island**.

**Algorithm** (`src/runtime/server/render/server-islands.ts:122-228`):

1. At build time, server-island components are registered in a `serverIslandNameMap` (componentPath → componentId) — `line 129`.
2. At render, the parent page generates a `<script type="module" data-island-id="<hostId>">…</script>` placeholder (line 87) where the island will be loaded.
3. Props + slots + the export name are **encrypted** with a per-build key (lines 167-182): `await encryptString(key, componentExport, 'export:${componentId}')`. Three salts: `export:`, `props:`, `slots:`.
4. The script either does GET (if URL+params under 2048 chars — `isWithinURLLimit` line 33-38) or POST with the encrypted blobs as JSON body (lines 209-224).
5. The server endpoint `/_server-islands/<componentId>` decrypts and renders the island as HTML.
6. The client-side `replaceServerIsland(hostId, response)` (lines 236-255) replaces the placeholder script's previous siblings with the response HTML and removes the script.

**Why this design works:** islands are bigger units (Astro components, not React subtrees). There's no `'use client'` boundary — the whole .astro file is either client-rendered (default) or server-rendered (via `server:defer` directive). Encryption is the only protection mechanism, no manifest, no module graph traversal.

**Trade-off:** Astro can't have a Server Component nested inside a Client Component in the same render. The "boundary problem" is sidestepped by making the boundary coarser.

### 3.3 TanStack Start — RSC as opt-in

TanStack Start's design philosophy is **the inverse of Next.js**: everything is interactive (CSR + SSR) by default, RSC is something you opt into per route.

**From their own internal skill** (`packages/start-client-core/skills/start-core/SKILL.md:21-22`):

> **CRITICAL**: All code in TanStack Start is ISOMORPHIC by default — it runs in BOTH server and client environments. Loaders run on both server AND client. To run code exclusively on the server, use `createServerFn`. This is the #1 AI agent mistake.
> **CRITICAL**: TanStack Start is NOT Next.js. Do not generate `getServerSideProps`, `"use server"` directives, `app/layout.tsx`, or any Next.js/Remix patterns. Use `createServerFn` for server-only code.

**Their RSC plugin** (`docs/start/framework/react/guide/server-components.md`) is marked **experimental** and explicitly opt-in:

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import rsc from '@vitejs/plugin-rsc'

export default defineConfig({
  plugins: [
    tanstackStart({ rsc: { enabled: true } }),
    rsc(),
    viteReact(),
  ],
})
```

**The plugin** (`packages/start-plugin-core/src/rsbuild/swc-rsc.ts:17-166`) walks the rspack config and **injects `rspackExperiments.reactServerComponents: true`** into SWC loaders. The walk recurses into `oneOf` arrays because rsbuild nests the main SWC loader inside a `oneOf` rule (lines 88-92). Without recursion, only the mimetype-based fallback SWC rule would get the flag, leaving most `.js/.ts` files without RSC directive detection. **This is the entire RSC enablement on the build side — opt-in via a config flag.**

The actual RSC machinery is delegated to `@vitejs/plugin-rsc` (community plugin, not vendored into TanStack). They bet on Vite's plugin ecosystem rather than re-implementing the manifest/loader chain.

**Their positioning vs Next.js** (`docs/start/framework/react/start-vs-nextjs.md`):

> "Next.js defaults to Server Components. Every component is a Server Component unless you add `"use client"`. Server Components can't use state, effects, or event handlers — so the path to interactivity requires understanding the framework's implicit boundaries, caching layers, and serialization rules."
>
> "TanStack Start defaults to interactive components (traditional React). Your components SSR and hydrate, ready for state and event handlers out of the box. You opt into Server Components where they provide value — for heavy static content, keeping secrets server-side, or reducing bundle size."

This is a directly applicable architectural choice for TheoKit. We can choose either default.

### 3.4 SvelteKit / Remix — no in-snapshot RSC equivalent

SvelteKit: Svelte's compilation model (compile-to-vanilla-JS, no v-dom, no `client/server` hierarchy at the React level) makes RSC non-applicable. Their server-only code lives in `+page.server.ts` files (file-name convention, not directive).

Remix: the snapshot in `referencias/remix/` is an older version. The RSC work happens on a separate branch (their public roadmap mentions RSC integration via React Router 7 — out of scope for this doc until a deeper clone is available).

---

## 4. Convergent patterns (todos concordam)

1. **Per-build encryption key for server-emitted payloads** — Next.js (`encryption.ts:78` via `getActionEncryptionKey()`) AND Astro (`server-islands.ts:164` via `this.result.key`) both encrypt action args / island payloads with a key generated at build time. Salt is action-id-derived in Next, salt is `${kind}:${componentId}` in Astro. **Why:** prevents replay of payloads across different actions and prevents tampering. **TheoKit should adopt** if implementing either RSC or server islands.

2. **Boundary detection by directive** (`'use client'` / `'use server'`) — Next.js (`flight-client-entry-plugin.ts:805` checks `isClientComponentEntryModule(mod)`) and TanStack Start (`swc-rsc.ts:121` enables the SWC `reactServerComponents` experiment) both rely on string-prefix directives parsed at build time. **No framework uses a comment-based or import-based marker.** The directive convention is now the standard.

3. **Inline payload via `<script>` chunks** — Next.js (`use-flight-response.tsx:227-237` writes `self.__next_f.push([...])` chunks). Astro server islands (`server-islands.ts:87`) writes `<script type="module">` placeholders. Both push render data INLINE in HTML rather than as a separate fetch — this saves a roundtrip on initial load. **TheoKit's hydration script `__staticRouterHydrationData` is exactly this pattern, just for router state instead of RSC payload.**

4. **Per-request AsyncLocalStorage for context** — Next.js (`work-unit-async-storage.external.ts`) uses Node `AsyncLocalStorage` to propagate per-request state (cache, prerender mode, etc) across React's async render boundaries. **TheoKit's `defineMiddleware` context can use the same pattern when we add async-aware features.** This is already a TheoKit primitive though not exposed yet via `AsyncLocalStorage`.

5. **Action id is content-derived (hashed)** — Next.js hashes the action source to a stable id (`flight-action-entry-loader.ts:8` references the `id` field as opaque). Astro hashes (componentPath → componentId via `serverIslandNameMap`). Allows refactors that don't change the action body to keep the same wire identity.

6. **Convention-over-config for serialization** — Next.js TS rule `client-boundary.ts:75-77` decides "is this prop a Server Action?" by checking if the prop name matches `^action$` or `^.*Action$`. This is a **convention** the framework imposes, not a structural type check (TS can't see directives). Astro avoids the problem by not having mixed boundaries. **TheoKit should pick one stance and stick with it.**

---

## 5. Divergent patterns (trade-off real)

1. **Default rendering model**
   - **Next.js:** Server-by-default. Components are Server Components unless `'use client'` is added. Trade-off: developer must reason about boundaries; bigger learning curve; smaller default bundle.
   - **TanStack Start:** Client-by-default. Components are interactive unless explicitly server (via `createServerFn`). Trade-off: bigger default bundle; lower learning curve; explicit opt-in to server-only.
   - **Astro:** Hybrid with `client:*` directives on a per-component basis from a server-rendered page. Different unit of granularity.
   - **TheoKit choice:** **Client-by-default (TanStack-style)**, with explicit `createServerFn` for server-only code. Rationale: TheoKit's "app the agent lives in" framing assumes a chat-shaped, highly interactive UI. RSC's benefit (smaller bundle for static content) does not apply to a streaming chat UI where everything is interactive. RSC adoption would be a 0.5.0+ opt-in flag, not a default. See §9.1 for the decision in detail.

2. **Wire format for server-rendered payload**
   - **Next.js:** Flight protocol (binary-ish chunks pushed into `self.__next_f` array). Pro: streamed, supports React-specific types (Server References, Suspense boundaries) natively. Con: format is React-internal; requires `react-server-dom-webpack` runtime on the client.
   - **Astro:** HTML string of the rendered island, returned over fetch. Pro: standard HTML; no client runtime; supports any island language. Con: no streaming; coarser unit; can't compose with React Suspense.
   - **TanStack Start:** Flight protocol (via `@vitejs/plugin-rsc`) when RSC opt-in is set. Otherwise: TanStack's own server-function payload (JSON RPC).
   - **TheoKit choice:** Stay with the current `defineAgentEndpoint` SSE for streaming + standard JSON for non-streaming. If RSC is later added (0.5.0+), use `@vitejs/plugin-rsc` for the Flight layer rather than re-implementing it.

3. **Build tool dependency**
   - **Next.js:** Webpack or Turbopack — both proprietary RSC implementations from Vercel. Custom plugins on each (`flight-client-entry-plugin.ts` for webpack, separate Rust code for Turbopack). High maintenance burden.
   - **TanStack Start:** Rspack (via rsbuild) — config injection only. Delegates RSC to `@vitejs/plugin-rsc`.
   - **Astro:** Vite-only. No dedicated RSC plugin (because Astro doesn't do RSC, only server islands).
   - **TheoKit choice:** Vite-only stays. If RSC is added later, integrate `@vitejs/plugin-rsc` exactly as TanStack does — outsource the heavy lifting.

4. **Action serialization layer**
   - **Next.js:** AES-GCM encrypted bound args, IV-prefixed, action-id-salted (`encryption.ts:77-97`). Server validates `decoded.startsWith(actionId)` as integrity check.
   - **Astro:** Same AES pattern, kind-salted (`export:`, `props:`, `slots:`). 2048-char URL limit threshold to decide GET vs POST.
   - **TanStack Start (server functions, not RSC actions):** Plain JSON over fetch. Type-safe via TypeScript inference. Auth via standard cookies + CSRF (whatever the user wires).
   - **TheoKit choice:** Same as TanStack — plain JSON, type inferred via Zod. The framework's CSRF (Phase 5) covers the replay/CSRF angle that Next.js solves with encryption.

---

## 6. Dependency inventory — bibliotecas comuns

Libs that appear in 2+ frameworks (convergent — typically the highest-ROI to consider for TheoKit):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `react-server-dom-webpack` (or `-turbopack`) | Next.js (vendored at `vendored/rsc/entrypoints.ts`) + TanStack Start (via `@vitejs/plugin-rsc`) | Generates the Flight binary payload; provides `createServerReference`, `renderToReadableStream`, `createFromReadableStream` | **Adopt only if RSC opt-in is implemented (0.5.0+).** This is the load-bearing lib. |
| `@vitejs/plugin-rsc` | TanStack Start (community plugin) | Vite plugin that orchestrates RSC build in a vite-native way | **Adopt if RSC opt-in implemented.** Avoid re-implementing webpack-style flight plugins. |
| AES-GCM via Web Crypto / `node:crypto` | Next.js (`encryption.ts` via `encryption-utils.ts`) + Astro (`core/encryption.ts`) | Encrypts action args / island payloads with build-time key | **Already used elsewhere in TheoKit** (sessions). No new dep needed. |
| `acorn` | Used transitively by webpack + vite for AST parsing of `'use client'` / `'use server'` directives | Detect directive at the top of source files | **Available via Vite transitive.** If TheoKit ever needs custom directive scanning, use the SWC directive plugin (TanStack approach) rather than parsing with acorn directly. |

Libs that are framework-specific (NOT convergent):

| Lib | Framework | Función | TheoKit decision |
|---|---|---|---|
| `react-server-dom-turbopack` | Next.js Turbopack path | Turbopack-flavored fork of `react-server-dom-webpack` | **Skip** — TheoKit is Vite-only. |
| `swc-core` with `experimentalReactServerComponents` flag | TanStack Start (`swc-rsc.ts:121`) | SWC compiler experimental flag to recognize RSC directives | **Adopt only if RSC opt-in is implemented and using SWC.** Vite + esbuild may have its own path via `@vitejs/plugin-rsc`. |

---

## 7. Algorithms / data structures não-óbvios

1. **Webpack module graph traversal with boundary stop** (`flight-client-entry-plugin.ts:729-849`) — depth-first traversal that records visited modules in a `Set` (line 743) and STOPS recursion when a `'use client'` module is encountered (lines 805-817). The classic graph-traversal pitfall (revisiting nodes) is handled by `visitedOfClientComponentsTraverse.has(modResource)` (line 759) with an additional special case: even if visited, if the module is already a client component, still re-record the import edge (lines 760-768). **Complexity:** O(V+E) over the server module graph. **Why this matters:** TheoKit's lazy() preload (Phase 4) used a similar traversal idea — `matchRoutes` returns matched routes, then preload entries. Same algorithmic shape, different graph.

2. **Inline binary Flight payload via base64 in JSON in `<script>`** (`use-flight-response.tsx:240-274`) — when a Flight chunk contains non-UTF-8 bytes (binary), the framework: (a) detects via `decoder.decode(value, { stream: !done })` throwing inside try/catch (lines 192-205), (b) base64-encodes via `Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('base64')` (lines 256-262), (c) wraps in `JSON.stringify([3, base64])`, (d) `htmlEscapeJsonString()`s the JSON, (e) emits as `self.__next_f.push(<escaped>)`. The runtime client reverses (e→a). **Why this matters:** if TheoKit ever wants to stream non-text data (e.g., a streamed image preview) inline in HTML, this is the canonical pattern. Credits to `rsc-html-stream` (Devon Govett).

3. **`serverIslandNameMap` as content-addressable component registry** (`server-islands.ts:129`) — Astro builds a map `componentPath → componentId` (hash of path or content) at build time. At runtime, when an island request comes in, the server looks up the componentId, validates encryption, and renders. No webpack manifest, no module graph — just a name map. **Why this matters:** simpler than Next.js's manifest. TheoKit's route manifest is already similar (path → module). If TheoKit adopts server-island-style server rendering, this is the data structure.

---

## 8. Edge cases conhecidos (com fonte)

| Edge case | How it manifests | Source | TheoKit prevention |
|---|---|---|---|
| Function props on `'use client'` boundary that aren't Server Actions | Component renders server-side then breaks on first interaction because the function couldn't be serialized | `next.js/packages/next/src/server/typescript/rules/client-boundary.ts:84-95` — fall back to NAME HEURISTIC (`action` or `*Action$`) because TS can't see directives | If TheoKit adopts RSC: replicate the heuristic AND fail loud at build time when violation detected (Next.js only emits TS warning, not build error). |
| Server action with non-async export | Runtime error when client tries to await a sync function | `next.js/packages/next/src/server/typescript/rules/server-boundary.ts:144-152` — TS error: `"use server" file can only export async functions. Add "async" to the function declaration or return a Promise.` | If TheoKit adopts server actions: require Zod schema + runtime async wrapper (similar to current `defineAction`). |
| `'use client'` boundary corruption via re-export through barrel files | Server component leaks into client bundle or vice-versa; `actionIds` accounting drifts | Inferred from `flight-client-entry-plugin.ts:759-770` (visited tracking with re-recording branch) and the multi-edge-case `getRSCModuleInformation` logic in `next-flight-client-module-loader.ts:17` | If TheoKit adopts RSC: forbid re-exports of client modules from server modules via the SWC plugin (TanStack approach) at build time, not runtime. |
| CSP + inline RSC payload scripts | Without nonce, `Content-Security-Policy: script-src 'self'` blocks the `self.__next_f.push(...)` scripts | `next.js/packages/next/src/server/app-render/use-flight-response.tsx:170-172` — emits `<script nonce="${htmlEscapeAttributeString(nonce)}">` when nonce is configured | TheoKit's current CSP (Phase 6) is `report-only` with `'unsafe-inline'`. Strict mode (0.3.0) MUST add per-request nonce to the SSR hydration script. Pattern is documented; not yet implemented. |
| Action arg replay across actions | A payload encrypted for action A is sent to action B; decryption succeeds, integrity is broken | `next.js/packages/next/src/server/app-render/encryption.ts:66-68` — `if (!decrypted.startsWith(actionId)) throw new Error('Invalid Server Action payload: failed to decrypt.')` | If TheoKit adopts server actions in the Next-style: salt every encrypted payload with the action id and validate prefix. Already a TheoKit pattern in session encryption. |
| URL length limit (≈2048 chars) for GET server-island requests | Browser cannot navigate to URL longer than ~2048 chars; large props cause "Request-URI Too Large" | `astro/packages/astro/src/runtime/server/render/server-islands.ts:33-38` — `isWithinURLLimit(pathname, params)` checks `chars < 2048`; falls back to POST | If TheoKit adopts server islands: replicate the threshold (POST fallback). Document as opt-in (some CDNs cache GETs but not POSTs). |
| Binary data in Flight payload | Chunks containing typed arrays from RSC components can't be UTF-8 decoded; need base64 fallback | `next.js/packages/next/src/server/app-render/use-flight-response.tsx:192-205` — `try { decoder.decode(value, { stream: !done }) } catch { /* binary path */ }` with comment "Credits to Devon Govett" | If TheoKit ever inlines binary in script chunks: copy this exact pattern. |
| Server CSS imports must trigger HMR | CSS imported in server layer doesn't have a webpack hot module by default; changes don't reflect | `next.js/packages/next/src/build/webpack/loaders/next-flight-css-loader.ts:49` — explicit `if (module.hot) { module.hot.accept() }` injected by the loader | TheoKit doesn't currently distinguish client/server CSS; vite handles both uniformly. No action unless we add an RSC layer. |
| RSC compiler invariants during prerender | Async storage may not have a workUnitStore in cache contexts; throws InvariantError | `next.js/packages/next/src/server/app-render/use-flight-response.tsx:122-148` — switch over `workUnitStore.type` with `default: workUnitStore satisfies never` (exhaustiveness check) | TheoKit pattern: use TypeScript exhaustive `never` in discriminated unions. Already applied in our SSR work. |

---

## 9. Implementation Guide

> **Lead recommendation: DO NOT implement RSC in TheoKit 0.5.0 or earlier.** Documented rationale below. The "implementation guide" sections (9.2–9.8) are therefore framed as "what we would do IF we decided to ship RSC after 0.5.0." Treat them as a backup plan to keep on file, not a roadmap commitment.

### 9.1 Architectural decision — DON'T BUILD RSC YET

TheoKit's positioning is "the app the agent lives in" — a chat-shaped interactive surface that streams agent responses, accepts user input, and is highly stateful. RSC's value proposition is:

1. **Smaller initial bundle** by keeping server-only logic out of client JS.
2. **Server-side data fetching** colocated with component.
3. **Streaming Suspense boundaries.**

For TheoKit's agent surface:
1. The default scaffold's initial bundle (193.90 KB gzipped after Phase 4) is **already 45% under** the 350 KB target. Bundle size is not the binding constraint.
2. Data fetching already has a clean primitive (`defineRoute` + `theoFetch`), which is both server and client typed. RSC's colocation benefit is duplicative.
3. Streaming Suspense is **already supported** (Phase 3 — `renderToPipeableStream` + `onShellReady`).

The RSC adoption COST is high:
- Massive build-time machinery (1263 lines in `flight-client-entry-plugin.ts` alone).
- Tight coupling to `react-server-dom-webpack` (or `-turbopack`) — a moving target maintained by Vercel/the React team.
- New mental model for users: `'use client'` boundary semantics, prop-must-be-serializable, action id encryption.
- TypeScript can't structurally distinguish server actions from regular functions — falls back to name conventions (`'use client'`'s prop heuristic `^.*Action$`).
- Bundles two layers of React (`react-server` + `react`) → bigger framework footprint, not smaller.
- The community's "RSC is opt-in" view (TanStack) is increasingly the prevailing one; betting on "default-on" replicates Next.js's lock-in mistakes.

**Decision: TheoKit stays client-by-default, like TanStack Start.** RSC may be adopted as an OPT-IN feature in 0.5.0+ via `@vitejs/plugin-rsc` (community plugin), not re-implemented. This document is the artifact that justifies the decision.

The roadmap entry in `CLAUDE.md` 0.5.0+ already lists "Server Components (RSC) compatibility track — open question whether TheoKit follows React core into RSC or stays on the client-component model. Either is defensible; need a decision before 1.0." This document **resolves that open question to: stay on the client-component model.**

### 9.2 Files to create — IF the decision were reversed

```
packages/theo/src/router/rsc.ts                — public API: defineRsc, RscOptions
packages/theo/src/router/rsc-internal.ts       — boundary registry, payload framing
packages/theo/src/server/rsc-action.ts         — action handler dispatch + encryption
packages/theo/src/vite-plugin/rsc-plugin.ts    — wraps @vitejs/plugin-rsc, wires manifest into our route manifest
tests/unit/rsc.test.ts                          — TDD primary
tests/integration/rsc-pipeline.test.ts          — pipeline real
fixtures/rsc-basic/                              — Playwright fixture with one server component + one client component
```

### 9.3 Public API surface (TypeScript) — IF the decision were reversed

```ts
// theokit/server
export function defineServerAction<Body extends z.ZodTypeAny, Result>(opts: {
  body: Body
  handler: (ctx: { body: z.infer<Body>; request: Request }) => Promise<Result>
}): ServerActionConfig<Body, Result>

export type ServerActionId = string  // content-derived

// theokit (compile-time helper recognized by the vite plugin, not a runtime export)
// 'use server' directive at top of a file (.ts/.tsx) marks every export as ServerAction.
// 'use client' directive at top of a file marks the file as a client boundary.

// theokit/router
export function defineRsc(opts: {
  enabled: boolean
  encryptionKey?: string  // defaults to derived from SECRET env
}): RscConfig
```

### 9.4 Dependências a adotar — IF the decision were reversed

| Package | Version | Justification |
|---|---|---|
| `@vitejs/plugin-rsc` | `^0.x` (latest at decision date) | Community plugin; outsources Flight implementation. TanStack Start uses it. |
| `react-server-dom-webpack` | aligned with React 19+ | Provides `createServerReference`, `renderToReadableStream`, `createFromReadableStream`. Vendored or peer-dep, not directly imported by user. |

### 9.5 Test strategy — IF the decision were reversed

- **Unit tests** (`tests/unit/rsc.test.ts`): boundary detection from `'use client'` parsing, action id hashing stable across rebuilds, encryption round-trip with action-id salt, TS rule warnings for non-serializable props.
- **Integration tests** (`tests/integration/rsc-pipeline.test.ts`): full vite plugin pipeline emits manifest, runtime client consumes payload, server action dispatch round-trip.
- **Fixture** (`fixtures/rsc-basic/`): 1 server component + 1 client component + 1 server action. Playwright spec asserts: server component renders without client JS in network panel; client component hydrates; server action invocation succeeds and updates UI.
- **Playwright spec** (`tests/e2e/rsc-basic.spec.ts`): "click works after RSC roundtrip" (same shape as our current hydration regression spec).

### 9.6 Phases of rollout — IF the decision were reversed

1. **Phase 1 — `defineServerAction` only** (no RSC components yet). Validates the encryption + dispatch layer in isolation. Backed by Vite plugin transform that recognizes `'use server'` files. ~ 2 weeks.
2. **Phase 2 — `'use client'` boundary detection** via `@vitejs/plugin-rsc`. Manifest emitted. Server-side rendering still uses `defineRoute`. ~ 2 weeks.
3. **Phase 3 — Flight payload serving** for the matched route. Initial load embeds Flight chunks in HTML. ~ 3 weeks.
4. **Phase 4 — Client navigation via Flight** (replace existing fetch + hydrate with Flight-driven). Behind opt-in `config.rsc.enabled = true`. ~ 3 weeks.

**Total estimated effort: 10 weeks** assuming `@vitejs/plugin-rsc` matures and stays maintained. **Risk:** if `@vitejs/plugin-rsc` is abandoned, we own the maintenance.

### 9.7 Acceptance criteria — IF the decision were reversed

- [ ] `defineServerAction` round-trips with type-safe Zod body inference
- [ ] Action id is stable across rebuilds (same source → same id)
- [ ] Encryption integrity check fails when payload is replayed across actions
- [ ] `'use client'` boundary detection emits at build time with file:line of violation
- [ ] TypeScript rule (LSP plugin) warns on non-serializable prop on client boundary
- [ ] Playwright spec passes: server component renders without client JS; client component hydrates
- [ ] tsc --noEmit clean
- [ ] vitest run green
- [ ] Default bundle size DOES NOT regress (still ≤ 350 KB gzipped after RSC enabled — measure)
- [ ] Dogfood check #N: RSC pipeline wired

### 9.8 Risks + mitigations — IF the decision were reversed

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@vitejs/plugin-rsc` is abandoned mid-implementation | medium | Stay opt-in (`config.rsc.enabled`). Fork-and-maintain if community plugin dies. |
| `'use client'` boundary corruption introduces hydration bugs (we just fixed these in Phase 1!) | high | Replicate Next.js's TS rules at build time as ERROR, not warning. Playwright must catch in the spec. |
| Two layers of React (`react-server` + `react`) bloat bundle | medium | Measure before/after every phase. Cancel rollout if regression > 20%. |
| Streaming AsyncLocalStorage interop with our existing `defineMiddleware` ctx | medium | Audit ctx propagation across React render boundaries. Add explicit `request-context` helper similar to Hono Context. |
| Lock-in to React-specific RSC model (can't swap to Solid/Svelte later) | low | We are React-only by mandate anyway. |
| Tooling regression in editor (TS LSP) for users on older TS versions | low | Document min TS version (5.5+). |

---

## 10. Open questions

These are pesquisa-incomplete and would block writing actual code:

1. **Remix's RSC integration via React Router 7** — the snapshot in `referencias/remix/` doesn't have RSC. The Remix team is shipping RSC via React Router 7, which uses a model closer to Astro's (server-functions + selective hydration). Need a fresh clone before deciding whether TheoKit follows React Router's approach or stays divergent. Possible paths: A) Wait for React Router 7 to mature, then adopt their model. B) Skip RSC entirely (current recommendation).

2. **`@vitejs/plugin-rsc` stability and maintainership** — this is a community plugin (not first-party from Vite team). What's its current bus factor? Is it tracked by `@vitejs/plugin-react` or independent? Answer affects the §9.8 risk calibration. Need to inspect the GitHub repo before any 0.5.0 commitment.

3. **Server Component vs Server Function ergonomics** — both Next.js (server functions = "use server" file) and TanStack (server functions = `createServerFn`) ship server-callable code. They diverge on whether the function returns a component (RSC) or data (server function). TheoKit's `defineRoute` is closer to TanStack's pattern. Question: is the "server function" the universal primitive, with RSC just being "server function that returns JSX"? If yes, TheoKit's path is to extend `defineRoute` to support returning JSX, not to add RSC machinery. Need deeper read of TanStack's `createServerFn` source to validate.

4. **PPR (Partial Prerendering) interop with our SSR streaming** — Next.js separates "RSC" from "PPR." Our Phase 3 streaming SSR is closer to PPR shape than to RSC. Question: if we add anything from the RSC world, is it actually PPR (cache static shell + stream dynamic holes) that we want, not RSC (server-only components)? Need to read `next.js/packages/next/src/server/app-render/app-render-prerender-utils.ts` (selectively descartado above) before deciding.

5. **TanStack Start RSC plugin maintenance status** — TanStack marks RSC as "experimental" in their docs. Has the API stabilized in any post-1.166.2 release? Need to check before committing TheoKit to follow their model.

---

## 11. Referências citadas (todos os arquivos do inventário)

Every assertion in this document anchors here. The reverse index — go from concept to file:line.

### Next.js (commit `8f132ea9`)

#### Core (deep read in full)
- `referencias/next.js/packages/next/src/build/webpack/loaders/next-flight-client-entry-loader.ts:1-76` — virtual module emitter for `'use client'` boundaries; §3.1.1, §4.2
- `referencias/next.js/packages/next/src/build/webpack/loaders/next-flight-client-module-loader.ts:1-48` — client-layer module info + action proxy injection; §3.1.1, §3.1.2
- `referencias/next.js/packages/next/src/build/webpack/loaders/next-flight-server-reference-proxy-loader.ts:1-27` — `createServerReference()` wrapper emission; §3.1.1, §3.1.2
- `referencias/next.js/packages/next/src/build/webpack/loaders/next-flight-action-entry-loader.ts:1-36` — action entry virtual module; §3.1.2, §3.1.4
- `referencias/next.js/packages/next/src/build/webpack/loaders/next-flight-css-loader.ts:1-60` — CSS-in-server-layer HMR + checksum; §3.1.1, §8 (HMR edge case)
- `referencias/next.js/packages/next/src/server/lib/is-rsc-request.ts:1-9` — single-function RSC header detection; §3.1.4
- `referencias/next.js/packages/next/src/server/normalizers/request/rsc.ts:1-13` — `.rsc` suffix normalizer; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/use-flight-response.tsx:1-274` — full Flight payload inlining via `__next_f`, binary base64 fallback, CSP nonce wiring; §3.1.4, §4.3, §4.4, §5.2, §7.2, §8 (CSP, binary)
- `referencias/next.js/packages/next/src/server/app-render/encryption.ts:1-130` — AES-GCM action arg encryption, action-id salt, integrity check; §3.1.4, §4.1, §4.3, §5.4, §8 (action replay)
- `referencias/next.js/packages/next/src/server/typescript/rules/client-boundary.ts:1-122` — TS LSP rule for `'use client'` props; §3.1.3, §4.6, §8 (non-serializable props heuristic)
- `referencias/next.js/packages/next/src/server/typescript/rules/server-boundary.ts:1-159` — TS LSP rule for `'use server'` async-only exports; §3.1.3, §8 (non-async export)
- `referencias/next.js/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts:1-310, 729-849` — boundary detection algorithm (depth-first traversal with visited tracking + stop-at-client-boundary); §3.1.1, §4.2, §5.1, §7.1

#### Support (selective read — anchored sections referenced)
- `referencias/next.js/packages/next/src/build/webpack/loaders/next-flight-loader/{action-client-wrapper,action-validate,index,module-proxy,server-reference}.ts` — runtime wrappers for server actions; §3.1.2
- `referencias/next.js/packages/next/src/build/webpack/loaders/get-module-build-info.ts` — webpack module info attachment helper; §3.1.1
- `referencias/next.js/packages/next/src/build/webpack/loaders/utils.ts` — `isClientComponentEntryModule`, `regexCSS`, `isCSSMod`; §3.1.1
- `referencias/next.js/packages/next/src/build/webpack/plugins/flight-manifest-plugin.ts:1-615` — client reference manifest emission; §3.1.1, §4.2
- `referencias/next.js/packages/next/src/server/app-render/app-render.tsx` — main entry (8790 lines; grep-navigated); §3.1.4, §4.1
- `referencias/next.js/packages/next/src/server/app-render/action-handler.ts:1-1477` — action dispatch entrypoint; §3.1.4, §4.3
- `referencias/next.js/packages/next/src/server/app-render/manifests-singleton.ts` — manifest accessor; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/entry-base.ts` — Next.js page-module template; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/work-unit-async-storage.external.ts` — per-request AsyncLocalStorage; §3.1.4, §4.5
- `referencias/next.js/packages/next/src/server/app-render/create-component-tree.tsx` — tree builder for server render; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/dynamic-rendering.ts` — dynamic-vs-static rendering tracking; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/flight-render-result.ts` — Flight wrapper around RenderResult; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/get-css-inlined-link-tags.tsx` — CSS link tag injection; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/react-server.node.ts` — Node-side react-server entrypoint; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/create-flight-router-state-from-loader-tree.ts` — router state derivation; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/rsc/preloads.ts` — preload directives; §3.1.4
- `referencias/next.js/packages/next/src/server/app-render/rsc/taint.ts` — React taint API integration; §3.1.4, §8 (security)
- `referencias/next.js/packages/next/src/server/route-modules/app-page/vendored/rsc/entrypoints.ts` — react-server-dom-webpack entry; §3.1.4, §6
- `referencias/next.js/packages/next/src/server/route-modules/app-page/vendored/rsc/react-server-dom-webpack-server.ts` — server-side Flight server; §3.1.4
- `referencias/next.js/packages/next/src/server/route-modules/app-page/vendored/ssr/react-server-dom-webpack-client.ts` — SSR-time Flight client; §3.1.5
- `referencias/next.js/packages/next/src/client/components/app-router.tsx:1-655` — main client App Router; §3.1.5, §4.7
- `referencias/next.js/packages/next/src/client/components/router-reducer/fetch-server-response.ts:1-673` — RSC payload fetch; §3.1.5
- `referencias/next.js/packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts` — server action dispatch in client; §3.1.5
- `referencias/next.js/packages/next/src/client/components/segment-cache/cache.ts` — client-side segment cache; §3.1.5

#### Test (selective — referenced for edge case enumeration)
- `referencias/next.js/packages/next/src/server/lib/is-rsc-request.test.ts` — header parsing assertions
- `referencias/next.js/packages/next/src/server/normalizers/request/segment-prefix-rsc.test.ts` — path normalization tests
- (other test files in `__tests__/` — descartados, see §2 discarded)

#### Doc / CHANGELOG / RFC
- `referencias/next.js/CLAUDE.md` (1700+ lines) — Next.js internal development guide; §3 background context

#### Commits relevantes (git archaeology — limited)
- HEAD `8f132ea9` "Fix 'type: module' in project dir when using standalone or adapters (#93612)" — shallow clone, no historical commits available (depth=1).

### Astro

#### Core
- `referencias/astro/packages/astro/src/runtime/server/render/server-islands.ts:1-256` — Server Islands implementation; §3.2, §4.1, §4.4, §5, §7.3, §8 (URL limit)

#### Support
- `referencias/astro/packages/astro/src/core/encryption.ts` — encryptString helper used by server-islands; §3.2, §4.1
- `referencias/astro/packages/astro/src/core/errors/errors-data.ts` — error messages for server-island misconfigurations; §8

### TanStack Start (`referencias/tanstack-router/`)

#### Core
- `referencias/tanstack-router/packages/start-plugin-core/src/rsbuild/swc-rsc.ts:1-167` — rspack config injection enabling SWC reactServerComponents experiment; §3.3, §4.2, §6
- `referencias/tanstack-router/packages/start-plugin-core/src/rsbuild/plugin.ts:1-779` — main rsbuild plugin (selective); §3.3
- `referencias/tanstack-router/packages/start-plugin-core/src/rsbuild/planning.ts` — RSC layer planning (selective); §3.3
- `referencias/tanstack-router/packages/start-plugin-core/src/vite/plugin.ts` — vite plugin entrypoint, references vite-rsc forward (selective); §3.3

#### Doc / Skill
- `referencias/tanstack-router/packages/start-client-core/skills/start-core/SKILL.md:1-214` — internal skill for TanStack Start setup with their "client-by-default" philosophy; §3.3, §5.1, §9.1
- `referencias/tanstack-router/docs/start/framework/react/guide/server-components.md` — RSC opt-in setup guide; §3.3, §9
- `referencias/tanstack-router/docs/start/framework/react/start-vs-nextjs.md` — TanStack vs Next positioning re: RSC; §3.3, §5.1
- `referencias/tanstack-router/docs/start/eslint/no-async-client-component.md` — ESLint rule for async client components; §8
- `referencias/tanstack-router/docs/start/eslint/no-client-code-in-server-component.md` — ESLint rule for cross-boundary leakage; §8

### SvelteKit

(All 10 matches descartados — see §2. SvelteKit's compile-to-vanilla-JS model doesn't have an RSC equivalent.)

### Remix

(Zero matches in current snapshot. The RSC track is on a branch not present in `referencias/remix/`.)

### URLs externas

- https://github.com/devongovett/rsc-html-stream — origin of the `__next_f` inline binary payload trick, credited in `use-flight-response.tsx:254`
- https://chromium.googlesource.com/chromium/src/+/master/docs/security/url_display_guidelines/url_display_guidelines.md#url-length — basis for Astro's 2048-char URL limit, cited in `server-islands.ts:36`

---

## Verdict

**TheoKit should NOT implement RSC in 0.5.0 or earlier.** The decision is recorded above in §9.1 with full rationale. RSC may be revisited as an opt-in feature (via `@vitejs/plugin-rsc`) after 1.0 when (a) `@vitejs/plugin-rsc` has stabilized, (b) Remix/React Router 7's RSC model is observable in production, and (c) there is concrete user demand grounded in shipped TheoKit apps where bundle size or server-only data fetching is a measured pain point.

Until then: **client-by-default, like TanStack Start.** The existing `defineRoute` + `theoFetch` + Phase 3 streaming SSR cover the practical use cases without the RSC tax.
