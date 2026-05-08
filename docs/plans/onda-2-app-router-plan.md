# Plan: Onda 2 — App Router Frontend

> **Version 1.0** — Este plano implementa file-based routing CSR para o Theo: scan `app/` → route manifest → React Router v7. O Vite plugin evolui de "hardcoded page.tsx" para scanner dinâmico com 2 virtual modules. Suporta nested layouts via `<Outlet />`, error boundaries via `errorElement`, not-found via wildcard route, e loading via Suspense. Resultado: 6 testes obrigatórios passando com 4 fixtures.

## Context

Onda 0+1 estão completas. O Vite plugin (`packages/theo/src/vite-plugin/index.ts`) tem 1 virtual module que hardcoda `app/page.tsx`. Não existe: routing, layouts, error boundaries, 404. A pesquisa SOTA (`docs/technical/ONDA-2-SOTA-RESEARCH.md`) definiu: React Router v7, scan recursivo, virtual module manifest, pathless error wrapper.

Evidência: `pnpm test` (96 tests) e `pnpm test:e2e` (4 tests) passam. Mas navegar para `/about` ou `/dashboard` não funciona — tudo serve a mesma page.tsx root.

## Objective

**Done =** File-based routing funciona: 6 testes obrigatórios GREEN, 4 fixtures validadas, Playwright prova layouts, errors, e 404.

Metas:
1. `app/page.tsx` → `/`, `app/about/page.tsx` → `/about`, `app/dashboard/page.tsx` → `/dashboard`
2. `app/layout.tsx` wraps ALL pages, `app/dashboard/layout.tsx` wraps only `/dashboard/*`
3. `app/not-found.tsx` renderiza em rotas desconhecidas
4. `app/error.tsx` captura erros de rendering
5. `scanRoutes()` como pure function testável
6. 2 virtual modules: `/@theo/route-manifest` + `/@theo/entry-client`

## ADRs

### D1 — React Router v7 (`createBrowserRouter` API)
**Decision:** Usar `react-router` v7 com `createBrowserRouter` + `RouterProvider`.
**Rationale:** Maturo (100M+ downloads/mês), ~8KB, `<Outlet />` resolve layouts, `errorElement` resolve error boundaries. v7 unifica react-router-dom em react-router.
**Consequences:** `react-router` vira peerDependency. Layout components usam `<Outlet />`, não `children` prop.

### D2 — Dois virtual modules separados
**Decision:** `/@theo/route-manifest` (dados de rota) e `/@theo/entry-client` (bootstrap React Router). Separados.
**Rationale:** Manifest pode ser invalidado independentemente no HMR quando routes mudam. Entry é estático — não muda.
**Consequences:** Plugin gerencia 2 IDs virtuais.

### D3 — Error boundaries via pathless route wrapper
**Decision:** `error.tsx` vira `errorElement` numa route sem `path`, wrapping as children routes.
**Rationale:** Pattern documentado pelo React Router: erros renderizam DENTRO do layout, não substituindo. Next.js usa pattern similar com `OuterLayoutRouter`.
**Consequences:** Geração de código mais complexa mas DX correta.

### D4 — Router code dentro de `packages/theo/src/router/`, não pacote separado
**Decision:** Manter no pacote `theo` existente, não criar `@theo/router`.
**Rationale:** Zero inter-package imports hoje. Extrair adiciona overhead de build/publish sem valor. Split quando a complexidade justificar.
**Consequences:** Refactor futuro é 1-line change por import.

### D5 — CSR routing: todas as rotas retornam 200 do servidor
**Decision:** Em CSR mode, Vite serve `index.html` para QUALQUER request non-asset. O routing acontece no browser via React Router.
**Rationale:** Sem SSR, o server não sabe quais rotas existem.
**Consequences:** Integration tests verificam HTTP 200. Content verification (layouts, errors, 404) precisa de Playwright E2E.

## Dependency Graph

```
Phase 0 (add react-router)
    |
    +----------+-----------+
    |                      |
Phase 1                 Phase 2
(Route Scanner)         (Route Manifest Generator)
    |                      |
    +----------+-----------+
               |
           Phase 3
    (Enhanced Vite Plugin)
               |
           Phase 4
    (4 Fixtures)
               |
           Phase 5
    (Integration + E2E)
```

- Phase 0 bloqueia tudo
- Phases 1 e 2 paralelos
- Phase 3 depende de 1+2
- Phase 4 depende de 3
- Phase 5 depende de 4

---

## Phase 0: Dependencies

**Objective:** Adicionar `react-router` v7 ao workspace.

### T0.1 — Add react-router

#### Objective
Instalar react-router como peerDependency do `theo` e devDependency do root.

#### Evidence
Sem react-router, o código gerado pelo plugin não resolve imports em runtime.

#### Files to edit
```
packages/theo/package.json (EDIT) — Add react-router to peerDependencies
package.json (EDIT) — Add react-router to devDependencies
```

#### Deep file dependency analysis
- `packages/theo/package.json`: peerDeps usados pelo código gerado nos virtual modules. O user instala react-router no projeto.
- Root `package.json`: devDeps para que testes e fixtures resolvam react-router no workspace.

#### Deep Dives
- react-router v7 exporta `createBrowserRouter`, `RouterProvider`, `Outlet` — tudo de `'react-router'` (não `react-router-dom`)
- Peer dependency de react-router: `react >= 18` — satisfeito pelo react ^19 existente.

#### Tasks
1. Adicionar `"react-router": "^7.0.0"` ao peerDependencies de `packages/theo/package.json`
2. Adicionar `"react-router": "^7.0.0"` ao devDependencies de `package.json` root
3. `pnpm install`
4. Verificar que `pnpm test` ainda passa (sem regressão)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_react_router_resolves() — Given updated deps, When pnpm install, Then react-router resolves
RED:     verify_no_regression() — Given updated deps, When pnpm test, Then 96 tests still pass
RED:     verify_react_router_exports() — Given installed react-router, When checking exports, Then createBrowserRouter exists
RED:     verify_outlet_export() — Given installed react-router, When checking exports, Then Outlet exists
GREEN:   Add dependencies and install
REFACTOR: None expected
VERIFY:  pnpm install && pnpm test
```

BDD scenarios:
- **Happy path**: `pnpm install` resolve react-router, tests passam
- **Validation error**: Version range incompatível falha no install
- **Edge case**: react-router peer dep (react >= 18) satisfeito por react ^19
- **Error scenario**: Se react-router não instala, virtual modules falham em runtime

#### Acceptance Criteria
- [ ] `pnpm install` exit code 0
- [ ] `pnpm test` — 96 tests still green
- [ ] `pnpm test:e2e` — 4 tests still green
- [ ] react-router resolves no workspace

#### DoD
- [ ] Dependency instalada
- [ ] Zero regressão

---

## Phase 1: Route Scanner

**Objective:** `scanRoutes(appDir)` — pure function que scan `app/` e retorna `RouteNode` tree.

### T1.1 — RouteNode types + isRouteFile

#### Objective
Definir `RouteNode` interface, `ROUTE_FILE_NAMES`, `ROUTE_FILE_EXTENSIONS`, `isRouteFile()`.

#### Evidence
Todas as fases downstream dependem deste tipo. Sem ele, scan e generate não compilam.

#### Files to edit
```
packages/theo/src/router/types.ts (NEW) — RouteNode, constants, isRouteFile
tests/unit/router-types.test.ts (NEW) — isRouteFile tests
```

#### Deep file dependency analysis
- `types.ts`: Zero imports. Base de toda a infra de routing. Importado por scan.ts, generate.ts, index.ts.

#### Deep Dives
```typescript
export interface RouteNode {
  segment: string          // 'dashboard', '' (root), 'about'
  path: string             // '/dashboard', '/', '/about'
  page?: string            // absolute path to page.tsx if exists
  layout?: string          // absolute path to layout.tsx
  error?: string           // absolute path to error.tsx
  loading?: string         // absolute path to loading.tsx
  notFound?: string        // absolute path to not-found.tsx
  children: RouteNode[]
}

export const ROUTE_FILE_NAMES = ['page', 'layout', 'error', 'loading', 'not-found'] as const
export const ROUTE_FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

export function isRouteFile(filename: string): boolean {
  return /^(page|layout|error|loading|not-found)\.(tsx|ts|jsx|js)$/.test(filename)
}
```

#### Tasks
1. Escrever testes RED para `isRouteFile`
2. Criar `packages/theo/src/router/types.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_page_tsx() — Given 'page.tsx', When isRouteFile, Then true
RED:     test_layout_ts() — Given 'layout.ts', When isRouteFile, Then true
RED:     test_error_jsx() — Given 'error.jsx', When isRouteFile, Then true
RED:     test_not_found_tsx() — Given 'not-found.tsx', When isRouteFile, Then true
RED:     test_utils_ts_rejected() — Given 'utils.ts', When isRouteFile, Then false
RED:     test_page_css_rejected() — Given 'page.css', When isRouteFile, Then false
RED:     test_empty_string() — Given '', When isRouteFile, Then false
RED:     test_similar_names() — Given 'pages.tsx', When isRouteFile, Then false
GREEN:   Implement isRouteFile with regex
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/router-types.test.ts
```

BDD scenarios:
- **Happy path**: All 5 names x 4 extensions (20 combos) accepted
- **Validation error**: Non-route files rejected
- **Edge case**: Similar names (pages.tsx, lay-out.tsx) rejected
- **Error scenario**: Empty string, dotfiles return false

#### Acceptance Criteria
- [ ] `isRouteFile` identifica 20 combos válidas
- [ ] Rejeita non-route files
- [ ] `RouteNode` interface exportada

#### DoD
- [ ] Testes GREEN
- [ ] `pnpm typecheck` passa

---

### T1.2 — scanRoutes() implementation

#### Objective
Scan recursivo de `app/` que retorna `RouteNode` tree.

#### Evidence
O Vite plugin precisa de uma route tree para gerar o manifest. Scan é pure function, altamente testável.

#### Files to edit
```
packages/theo/src/router/scan.ts (NEW) — scanRoutes function
tests/unit/router-scan.test.ts (NEW) — 13+ testes com temp dirs
```

#### Deep file dependency analysis
- `scan.ts`: Importa `RouteNode`, `ROUTE_FILE_NAMES`, `ROUTE_FILE_EXTENSIONS` de `types.ts`. Usa `node:fs` e `node:path`. Zero Vite dependency.
- Downstream: `vite-plugin/index.ts` chama `scanRoutes(appDir)` no `load` hook.

#### Deep Dives
- **Algorithm**: `readdirSync` recursivo. Para cada entry: se file → check route file names; se dir (não `_`/`.`) → recurse.
- **Extension priority**: `.tsx > .ts > .jsx > .js` — se `page.tsx` e `page.js` existem, `page.tsx` ganha.
- **Path computation**: root = `/`, child = `/${segment}`, nested = `/parent/child`.
- **Pruning**: Node sem page/layout/error/loading/notFound E sem children é removido da tree.
- **appDir inexistente**: throw erro claro.

#### Tasks
1. Escrever testes RED com temp dirs
2. Criar `packages/theo/src/router/scan.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_single_root_page() — Given app/page.tsx, When scanRoutes, Then root node has page set
RED:     test_multiple_pages() — Given app/page.tsx + app/about/page.tsx, When scanRoutes, Then root has 1 child with path '/about'
RED:     test_root_layout() — Given app/layout.tsx, When scanRoutes, Then root node has layout set
RED:     test_nested_layout() — Given app/dashboard/layout.tsx, When scanRoutes, Then dashboard child has layout
RED:     test_error_file() — Given app/error.tsx, When scanRoutes, Then root has error set
RED:     test_loading_file() — Given app/loading.tsx, When scanRoutes, Then root has loading set
RED:     test_not_found_file() — Given app/not-found.tsx, When scanRoutes, Then root has notFound set
RED:     test_ignores_private_dirs() — Given app/_components/, When scanRoutes, Then no child for _components
RED:     test_ignores_hidden_dirs() — Given app/.git/, When scanRoutes, Then no child
RED:     test_ignores_non_route_files() — Given app/utils.ts, When scanRoutes, Then root has no page/layout
RED:     test_empty_dir() — Given empty app/, When scanRoutes, Then root with no page/children
RED:     test_deep_nesting() — Given app/a/b/page.tsx, When scanRoutes, Then path is '/a/b'
RED:     test_nonexistent_dir_throws() — Given non-existent dir, When scanRoutes, Then throws
RED:     test_extension_priority() — Given app/page.tsx AND app/page.ts, When scanRoutes, Then root.page ends with 'page.tsx' (EC-2)
RED:     test_layout_only_dir() — Given app/admin/layout.tsx (no page), When scanRoutes, Then admin child has layout set and page undefined (EC-5)
GREEN:   Implement scanRoutes with extension priority
REFACTOR: Extract scanDir helper
VERIFY:  npx vitest run tests/unit/router-scan.test.ts
```

BDD scenarios:
- **Happy path**: 3 pages + 2 layouts → correct tree with paths
- **Validation error**: Non-existent appDir throws clear error
- **Edge case**: Empty dir, deep nesting, non-route files ignored
- **Error scenario**: Directory permissions (N/A for MVP)

#### Acceptance Criteria
- [ ] Correct `RouteNode` tree for standard structures
- [ ] Absolute file paths in page/layout/error/loading/notFound
- [ ] URL paths correct (`/`, `/about`, `/dashboard`)
- [ ] 13+ tests GREEN

#### DoD
- [ ] `scan.ts` criado
- [ ] Testes GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 2: Route Manifest Generator

**Objective:** `generateRouteManifest(tree)` e `generateEntryClient()` — pure functions que geram JavaScript code strings.

### T2.1 — generateRouteManifest()

#### Objective
Converter `RouteNode` tree em código JavaScript que exporta config do `createBrowserRouter`.

#### Evidence
SOTA research D3: pathless error wrapper, layout com Outlet, not-found como wildcard. O plugin precisa deste código como virtual module.

#### Files to edit
```
packages/theo/src/router/generate.ts (NEW) — generateRouteManifest function
tests/unit/router-generate.test.ts (NEW) — 12+ tests
```

#### Deep file dependency analysis
- `generate.ts`: Importa `RouteNode` de `types.ts`. Retorna `string`. ZERO Vite/React dependency — gera código como texto.
- Downstream: `vite-plugin/index.ts` chama no `load` hook do `/@theo/route-manifest`.

#### Deep Dives
- **Layout + Outlet**: `element: React.createElement(Layout, null, React.createElement(Outlet))`. Layout recebe Outlet como child.
- **Error boundary**: `errorElement: React.createElement(ErrorComponent)` na route do layout (ou pathless wrapper).
- **Not-found**: `{ path: '*', element: React.createElement(NotFoundComponent) }` como último child.
- **Loading/Suspense**: Wraps page element: `React.createElement(Suspense, { fallback: React.createElement(Loading) }, React.createElement(Page))`.
- **Variable naming**: `Page_root`, `Layout_dashboard` — segment-based, safe identifiers (hyphens → underscores).
- **Import paths**: Absolute, forward slashes via `normalizePath()`.
- **All React.createElement**: No JSX — virtual modules don't get JSX transform.

#### Tasks
1. Escrever testes RED (build RouteNode manually, assert on output string)
2. Criar `packages/theo/src/router/generate.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_single_page_root() — Given root with page only, When generate, Then code has route with index:true
RED:     test_page_plus_layout() — Given root with page+layout, When generate, Then code has Layout with Outlet
RED:     test_nested_children() — Given root with about+dashboard children, When generate, Then code has children array
RED:     test_error_element() — Given root with error, When generate, Then code has errorElement
RED:     test_not_found_wildcard() — Given root with notFound, When generate, Then code has path:'*'
RED:     test_loading_suspense() — Given root with loading+page, When generate, Then code has Suspense wrapper
RED:     test_nested_layouts() — Given root layout + dashboard layout, When generate, Then nested layout structure
RED:     test_no_jsx() — Given any tree, When generate, Then code contains React.createElement, not JSX
RED:     test_forward_slashes() — Given any tree, When generate, Then import paths use forward slashes
RED:     test_safe_variable_names() — Given segment 'not-found', When generate, Then var name has no hyphens
RED:     test_empty_tree() — Given root with no page/layout/children, When generate, Then exports empty routes
RED:     test_layout_without_page() — Given root with layout only, When generate, Then layout wraps Outlet with no index route
RED:     test_layout_generates_outlet_import() — Given tree with layout, When generate, Then code contains "import { Outlet } from 'react-router'" (EC-1)
RED:     test_hyphenated_segment_safe_name() — Given segment 'my-dashboard', When generate, Then variable name uses underscores not hyphens (EC-3)
GREEN:   Implement generateRouteManifest with Outlet import and safe naming
REFACTOR: Extract code generation helpers
VERIFY:  npx vitest run tests/unit/router-generate.test.ts
```

BDD scenarios:
- **Happy path**: Full tree → complete valid JS with layouts, errors, not-found
- **Validation error**: N/A (pure function, handles all inputs gracefully)
- **Edge case**: Empty tree, layout-only node, node with only not-found
- **Error scenario**: N/A (no throw, graceful defaults)

#### Acceptance Criteria
- [ ] Generated code is syntactically valid JavaScript
- [ ] Uses React.createElement only (zero JSX)
- [ ] Layout routes use Outlet
- [ ] Error routes use errorElement
- [ ] Not-found uses `path: '*'`
- [ ] 12+ tests GREEN

#### DoD
- [ ] `generate.ts` criado
- [ ] Testes GREEN
- [ ] `pnpm typecheck` passa

---

### T2.2 — generateEntryClient()

#### Objective
Gerar o entry-client code que importa route manifest e renderiza com React Router.

#### Evidence
Entry-client é estático — não depende da route tree. Importa de `/@theo/route-manifest`.

#### Files to edit
```
packages/theo/src/router/entry.ts (NEW) — generateEntryClient function
tests/unit/router-entry.test.ts (NEW) — 5 tests
```

#### Deep file dependency analysis
- `entry.ts`: Zero imports de outros router modules. Retorna string estática.
- Downstream: `vite-plugin/index.ts` chama no `load` hook de `/@theo/entry-client`.

#### Deep Dives
- **Suspense safety net**: Entry wraps `RouterProvider` em `<Suspense fallback={null}>` para que `React.lazy` não crashe se nenhum loading.tsx existe.
- Output:
```javascript
import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from '/@theo/route-manifest'

const router = createBrowserRouter(routes)
const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    React.createElement(Suspense, { fallback: null },
      React.createElement(RouterProvider, { router })
    )
  )
}
```

#### Tasks
1. Escrever testes RED
2. Criar `packages/theo/src/router/entry.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_contains_createBrowserRouter() — Given call, When generateEntryClient, Then contains createBrowserRouter
RED:     test_imports_route_manifest() — Given call, When result, Then contains '/@theo/route-manifest'
RED:     test_imports_react_router() — Given call, When result, Then contains 'react-router'
RED:     test_uses_createElement() — Given call, When result, Then contains React.createElement (no JSX)
RED:     test_has_suspense_wrapper() — Given call, When result, Then contains Suspense
GREEN:   Implement generateEntryClient
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/router-entry.test.ts
```

BDD scenarios:
- **Happy path**: Returns complete valid JS entry code
- **Validation error**: N/A (static)
- **Edge case**: Deterministic — calling twice returns identical output
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] Code imports from `react-router` and `/@theo/route-manifest`
- [ ] Uses `React.createElement`, no JSX
- [ ] Has `Suspense` wrapper for safety

#### DoD
- [ ] `entry.ts` criado
- [ ] Testes GREEN

---

## Phase 3: Enhanced Vite Plugin

**Objective:** Reescrever plugin para 2 virtual modules + HMR watcher.

### T3.1 — Plugin rewrite + router exports

#### Objective
Substituir hardcoded entry por scanner pipeline. Adicionar `/@theo/route-manifest` virtual module. Adicionar `configureServer` para HMR.

#### Evidence
Plugin atual (39 linhas) hardcoda `app/page.tsx`. Precisa evoluir para scan dinâmico. Testes existentes de Onda 1 verificam entry-client — precisam ser adaptados.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts (EDIT) — Major rewrite
packages/theo/src/router/index.ts (NEW) — Barrel export
packages/theo/src/index.ts (EDIT) — Add RouteNode export
tests/unit/vite-plugin.test.ts (EDIT) — Adapt + add tests
```

#### Deep file dependency analysis
- `vite-plugin/index.ts`: Importa `scanRoutes`, `generateRouteManifest`, `generateEntryClient` dos router modules. Exporta `theoPlugin()`.
- `router/index.ts`: Barrel re-export de todos os router modules.
- `index.ts`: Re-exporta `RouteNode` type para uso público.
- `vite-plugin.test.ts`: Existem 5 tests. Test 2 (`code.toContain('app/page.tsx')`) precisa mudar para `code.toContain('/@theo/route-manifest')`.

#### Deep Dives
- **HMR**: `configureServer` → `server.watcher.on('add'/'unlink')` → filter route files → `moduleGraph.invalidateModule` → `ws.send('full-reload')`.
- **Backward compat**: `onda1-hello-theo` fixture (single page.tsx) continua funcionando porque scanner produz manifest de 1 rota.
- **Import do `path` module**: Precisa importar `path` de `node:path` para `path.basename` no watcher.

#### Tasks
1. Criar `packages/theo/src/router/index.ts` (barrel)
2. Reescrever `vite-plugin/index.ts`
3. Adaptar `tests/unit/vite-plugin.test.ts`
4. Adicionar export de `RouteNode` em `packages/theo/src/index.ts`
5. Rodar `pnpm test` — verificar 0 regressão

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_resolves_route_manifest() — Given theoPlugin(), When resolveId('/@theo/route-manifest'), Then returns '\0@theo/route-manifest'
RED:     test_loads_route_manifest() — Given theoPlugin(fixtureDir), When load('\0@theo/route-manifest'), Then code contains 'routes' export
RED:     test_entry_imports_manifest() — Given theoPlugin(), When load('\0@theo/entry-client'), Then code contains '/@theo/route-manifest'
RED:     test_entry_has_router() — Given theoPlugin(), When load('\0@theo/entry-client'), Then code contains 'createBrowserRouter'
RED:     test_passthrough_non_virtual() — Given theoPlugin(), When resolveId/load unknown ID, Then returns undefined
RED:     test_manifest_contains_page() — Given fixture with app/page.tsx, When load manifest, Then code imports page.tsx path
GREEN:   Implement enhanced plugin
REFACTOR: Remove old hardcoded entry-client code
VERIFY:  npx vitest run tests/unit/vite-plugin.test.ts
```

BDD scenarios:
- **Happy path**: Both virtual modules resolve and load correctly
- **Validation error**: Empty app/ → empty routes array (no crash)
- **Edge case**: Fixture with only page.tsx (no layout) → single route manifest
- **Error scenario**: Non-virtual IDs return undefined

#### Acceptance Criteria
- [ ] `/@theo/entry-client` e `/@theo/route-manifest` resolvem
- [ ] Entry imports from manifest
- [ ] Manifest contains scanned routes
- [ ] Non-virtual IDs passthrough
- [ ] Onda 1 tests adapted (not broken)
- [ ] `pnpm test` all green

#### DoD
- [ ] Plugin reescrito
- [ ] Testes adapted + novos GREEN
- [ ] `pnpm typecheck` passa
- [ ] Onda 1 integration tests pass

---

## Phase 4: Fixtures

**Objective:** 4 fixture projects para testar routing features.

### T4.1 — 4 fixture projects

#### Objective
Criar `app-router-basic`, `app-router-nested-layouts`, `app-router-errors`, `app-router-not-found`.

#### Evidence
ONDAS.md exige 4 fixtures. Cada fixture testa um aspecto diferente do routing.

#### Files to edit
```
fixtures/app-router-basic/ (NEW) — 6 files: 3 pages + index.html + config + pkg
fixtures/app-router-nested-layouts/ (NEW) — 8 files: 2 pages + 2 layouts + about + index.html + config + pkg
fixtures/app-router-errors/ (NEW) — 7 files: page + layout + error + broken + index.html + config + pkg
fixtures/app-router-not-found/ (NEW) — 6 files: page + layout + not-found + index.html + config + pkg
```

#### Deep file dependency analysis
- Fixtures são test data. Usados por integration tests (Vitest) e E2E tests (Playwright).
- `layout.tsx` nos fixtures importa `{ Outlet }` de `'react-router'` — precisa que react-router esteja disponível.
- `index.html` é idêntico em todas: referencia `/@theo/entry-client`.

#### Deep Dives
- **Layout pattern**: `export default function Layout() { return <div data-testid="root-layout"><Outlet /></div> }`
- **Error page**: `export default function ErrorPage() { return <h1>Something went wrong</h1> }`
- **Broken page**: `export default function BrokenPage() { throw new Error('Broken!') }`
- **Not-found**: `export default function NotFound() { return <h1>Page not found</h1> }`

#### Tasks
1. Criar todos os dirs e files (27 files total)
2. Verificar que `scanRoutes` retorna trees corretas para cada fixture

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_basic_fixture_scans() — Given app-router-basic, When scanRoutes, Then 3 routes found
RED:     test_layouts_fixture_scans() — Given app-router-nested-layouts, When scanRoutes, Then root has layout + dashboard has layout
RED:     test_errors_fixture_scans() — Given app-router-errors, When scanRoutes, Then root has error + broken child
RED:     test_not_found_fixture_scans() — Given app-router-not-found, When scanRoutes, Then root has notFound
GREEN:   Create all fixture files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/router-scan.test.ts (add fixture-specific tests)
```

BDD scenarios:
- **Happy path**: Each fixture produces correct tree
- **Validation error**: N/A
- **Edge case**: Fixtures with optional files (some have loading, some don't)
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] 4 fixture dirs with correct file structure
- [ ] `scanRoutes` returns correct tree for each

#### DoD
- [ ] All fixtures created
- [ ] Scanner tests pass with fixtures

---

## Phase 5: Integration + E2E Tests

**Objective:** 6 testes obrigatórios da Onda 2 passando.

### T5.1 — Integration tests

#### Objective
Boot dev server contra fixtures, verificar HTTP 200 em rotas.

#### Evidence
CSR mode: todas as rotas retornam 200 do Vite. Integration tests verificam que o server sobe e serve.

#### Files to edit
```
tests/integration/onda2-app-router.test.ts (NEW) — HTTP tests
```

#### Deep file dependency analysis
- Importa `startDevServer` de `packages/theo/src/cli/commands/dev.ts`.
- Pattern: `beforeAll` start server, `afterAll` close, `it` faz fetch.

#### Tasks
1. Escrever testes
2. Verificar

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_root_returns_200() — Given app-router-basic fixture, When GET /, Then 200
RED:     test_dashboard_returns_200() — Given app-router-basic fixture, When GET /dashboard, Then 200
RED:     test_about_returns_200() — Given app-router-basic fixture, When GET /about, Then 200
RED:     test_route_manifest_serves_js() — Given fixture, When GET /@theo/route-manifest, Then JavaScript
GREEN:   Tests pass when server boots with enhanced plugin
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/onda2-app-router.test.ts
```

BDD scenarios:
- **Happy path**: All routes return 200
- **Validation error**: N/A
- **Edge case**: Virtual module endpoints serve JavaScript
- **Error scenario**: Unknown route still returns 200 (CSR)

#### Acceptance Criteria
- [ ] Testes 1 e 2 (root + dashboard 200) GREEN
- [ ] Route manifest serves JS

#### DoD
- [ ] Integration tests GREEN

---

### T5.2 — Playwright E2E tests

#### Objective
Browser tests para layouts, errors, not-found (precisa de React rendering).

#### Evidence
CSR: layout/error/404 verification requer browser real (conteúdo renderizado por JS).

#### Files to edit
```
tests/e2e/app-router-layouts.spec.ts (NEW) — Testes 3+4
tests/e2e/app-router-errors.spec.ts (NEW) — Teste 6
tests/e2e/app-router-not-found.spec.ts (NEW) — Teste 5
playwright.config.ts (EDIT) — Add projects for Onda 2 fixtures
```

#### Deep file dependency analysis
- `playwright.config.ts`: Precisa de 3 novos `webServer` entries (1 por fixture que usa E2E).
- Cada spec usa `page.goto()` + `page.locator()` assertions.

#### Deep Dives
- **Multiple webServers**: Playwright suporta array de `webServer`. Cada um numa porta diferente (3457, 3458, 3459).
- **Projects**: Cada fixture vira um Playwright project com `testMatch` e `baseURL` próprios.
- **data-testid**: Layouts usam `data-testid="root-layout"` e `data-testid="dashboard-layout"` para assertions confiáveis.

#### Tasks
1. Atualizar `playwright.config.ts` com projects e webServers
2. Criar 3 spec files
3. Verificar

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_root_layout_wraps_all() — Given nested-layouts fixture, When goto /, Then [data-testid=root-layout] exists
RED:     test_root_layout_on_about() — Given fixture, When goto /about, Then [data-testid=root-layout] exists
RED:     test_dashboard_layout_on_dashboard() — Given fixture, When goto /dashboard, Then both root-layout AND dashboard-layout exist
RED:     test_no_dashboard_layout_on_about() — Given fixture, When goto /about, Then dashboard-layout NOT attached
RED:     test_broken_page_shows_error() — Given errors fixture, When goto /broken, Then h1 = 'Something went wrong'
RED:     test_unknown_route_shows_not_found() — Given not-found fixture, When goto /xyz, Then h1 = 'Page not found'
GREEN:   All tests pass with fixtures + enhanced plugin
REFACTOR: None expected
VERIFY:  pnpm test:e2e
```

BDD scenarios:
- **Happy path**: Layouts render, content visible
- **Validation error**: N/A
- **Edge case**: Dashboard layout only on /dashboard, not on /about
- **Error scenario**: Error boundary catches, 404 renders

#### Acceptance Criteria
- [ ] 6 testes obrigatórios GREEN
- [ ] Onda 1 E2E tests still GREEN
- [ ] Zero console errors in happy path pages

#### DoD
- [ ] 3 spec files criados
- [ ] Playwright config updated
- [ ] `pnpm test:e2e` all green
- [ ] `pnpm test` all green

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: GET / returns 200 | T5.1 | Integration test |
| 2 | Teste 2: GET /dashboard returns 200 | T5.1 | Integration test |
| 3 | Teste 3: Root layout wraps all | T5.2 | Playwright E2E |
| 4 | Teste 4: Dashboard layout wraps only dashboard | T5.2 | Playwright E2E |
| 5 | Teste 5: Not found renders | T5.2 | Playwright E2E |
| 6 | Teste 6: Error boundary renders | T5.2 | Playwright E2E |
| 7 | scanRoutes pure function | T1.2 | 13+ unit tests |
| 8 | Route manifest generation | T2.1 | 12+ unit tests |
| 9 | 2 virtual modules | T3.1 | Plugin rewrite |
| 10 | HMR for route changes | T3.1 | configureServer watcher |
| 11 | Fixture app-router-basic | T4.1 | Created |
| 12 | Fixture app-router-nested-layouts | T4.1 | Created |
| 13 | Fixture app-router-errors | T4.1 | Created |
| 14 | Fixture app-router-not-found | T4.1 | Created |
| 15 | Backward compat Onda 1 | T3.1 | Scanner produces 1-route manifest for single page |

**Coverage: 15/15 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-5)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] 6 testes obrigatórios Onda 2 GREEN
- [ ] 4 fixtures existem e funcionam
- [ ] Onda 0 (72) + Onda 1 (24) tests still green (backward compat)
- [ ] `scanRoutes`, `generateRouteManifest`, `generateEntryClient` exportados e testados

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
pnpm try:clean && pnpm try:scaffold && pnpm install
# Adicionar app/about/page.tsx e app/dashboard/page.tsx ao my-test manualmente
# Rodar theo dev e verificar routing no browser
/dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Navegação entre `/`, `/about`, `/dashboard` funciona no browser
- [ ] Layout wrapping visível
- [ ] Zero CRITICAL issues
