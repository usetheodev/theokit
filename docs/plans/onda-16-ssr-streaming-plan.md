# Plan: Onda 16 — SSR/Streaming HTML

> **Version 1.0** — Adiciona Server-Side Rendering opt-in ao Theo via `ssr: true` no config. O build gera dois outputs (client + server), o production server renderiza React com `renderToPipeableStream` em vez de servir index.html vazio, e o dev server usa `vite.ssrLoadModule`. Entry client muda de `createRoot` para `hydrateRoot`. Usa React Router v7 static APIs (`createStaticHandler`, `StaticRouterProvider`). CSR fallback se SSR falha. Zero breaking change — `ssr: false` (default) mantém comportamento atual.

## Context

O Theo tem 15 ondas com 432 testes. Atualmente é CSR-only: o production server serve `index.html` com `<div id="root"></div>` vazio, e React renderiza no browser após carregar JS. Consequências: SEO vê página vazia, First Contentful Paint depende de download+parse de JS, crawlers não indexam conteúdo.

Evidence: `cli/commands/start.ts:127-128` serve `indexHtml` diretamente. `router/entry.ts:5` usa `createRoot` (CSR). Nenhum `renderToPipeableStream` no codebase.

## Objective

**Done =** `ssr: true` no config → build gera `.theo/client/` + `.theo/server/`, production server renderiza HTML com React, browser faz hydration. Testes provam HTML contém conteúdo renderizado, hydration funciona, CSR fallback em erro.

Metas:
1. Config `ssr: boolean` (default false)
2. Entry server virtual module com `renderToPipeableStream`
3. Entry client com `hydrateRoot` quando SSR=true
4. Build command gera 2 outputs
5. Production server renderiza via SSR
6. Dev server SSR via `vite.ssrLoadModule`
7. Fallback CSR se SSR falha
8. Fixture SSR + testes
9. Zero breaking change (backward compat quando ssr=false)

## ADRs

### D1 — SSR opt-in via config (default false)
**Decision:** Campo `ssr: boolean` no `theoConfigSchema` com default `false`.
**Rationale:** Zero breaking change. Apps existentes continuam CSR. User opta por SSR quando precisa de SEO/performance.
**Consequences:** Dois code paths (CSR e SSR) para manter. Aceitável — a divergência é localizada no entry e server.

### D2 — renderToPipeableStream (streaming)
**Decision:** Usar `renderToPipeableStream` do React 19, não `renderToString`.
**Rationale:** Streaming envia HTML progressivamente → melhor TTFB. `renderToString` bufferiza tudo. API moderna e recomendada pelo React team.
**Consequences:** HTML é enviado em chunks. Suspense boundaries determinam quando cada parte é enviada.

### D3 — React Router v7 static APIs para SSR
**Decision:** Usar `createStaticHandler`, `createStaticRouter`, `StaticRouterProvider` de `react-router` para SSR.
**Rationale:** O Theo já usa React Router v7 para CSR. As static APIs são o modo oficial de fazer SSR com React Router — matching, data loading, e render server-side.
**Consequences:** Mesmas routes funcionam em CSR e SSR. Zero duplicação de route config.

### D4 — Entry server como virtual module
**Decision:** O framework gera `entry-server` como virtual module (`/@theo/entry-server`), mesmo pattern do entry-client.
**Rationale:** User não precisa criar arquivo manualmente. O framework já gera `entry-client` assim. Consistência.
**Consequences:** O build SSR usa o virtual module como input.

### D5 — Fallback CSR quando SSR falha
**Decision:** Se `renderToPipeableStream` falha (ex: componente usa `window`), serve index.html como CSR fallback.
**Rationale:** Graceful degradation. Melhor servir CSR que retornar 500. O user pode debugar SSR errors via logs.
**Consequences:** SSR errors são logados mas não crasham o server.

### D6 — HTML template split
**Decision:** O `index.html` é splitado em head e tail. O HTML renderizado pelo React é injetado entre eles.
**Rationale:** O head contém `<head>`, meta tags, CSS. O tail contém `<script>` para hydration. O React HTML vai no `<div id="root">...</div>`.
**Consequences:** O build precisa processar `index.html` para extrair head/tail.

## Dependency Graph

```
Phase 0 (config + entry generators) ──▶ Phase 1 (build SSR) ──▶ Phase 2 (server SSR) ──▶ Phase 3 (dev SSR) ──▶ Phase 4 (regression)
```

- Cada fase depende da anterior
- Não há paralelismo — SSR é um pipeline sequencial

---

## Phase 0: Config + Entry Generators

**Objective:** Adicionar `ssr` ao config e criar geradores de entry-server e entry-client com hydrateRoot.

### T0.1 — Config `ssr` field

#### Objective
Adicionar `ssr: boolean` ao `theoConfigSchema` com default `false`.

#### Evidence
Sem config flag, não há como o user optar por SSR.

#### Files to edit
```
packages/theo/src/config/schema.ts (EDIT) — Adicionar ssr field
tests/unit/config-schema.test.ts (EDIT) — Testar novo field
```

#### Deep file dependency analysis
- `schema.ts`: Adiciona `ssr: z.boolean().default(false)`. Downstream: build, dev, start commands usam `config.ssr`.

#### Deep Dives
- Default `false` garante backward compat. `TheoConfig.ssr` é `boolean`.

#### Tasks
1. Adicionar `ssr: z.boolean().default(false)` ao schema
2. Adicionar teste

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_config_accepts_ssr_true() — Given { ssr: true }, When parse, Then success with ssr=true
RED:     test_config_ssr_defaults_false() — Given {}, When parse, Then ssr is false
RED:     test_config_rejects_ssr_string() — Given { ssr: 'yes' }, When safeParse, Then fails
RED:     test_existing_config_unaffected() — Given config without ssr, When parse, Then other fields unchanged
GREEN:   Add ssr field to schema
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-schema.test.ts
```

BDD scenarios:
- **Happy path**: ssr=true accepted
- **Validation error**: ssr='yes' rejected
- **Edge case**: ssr omitted → false
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `ssr: boolean` in schema with default false
- [ ] Tests pass

#### DoD
- [ ] Config updated, tests GREEN

---

### T0.2 — Entry server generator

#### Objective
Criar `generateEntryServer()` que gera código para SSR com `renderToPipeableStream` e React Router static APIs.

#### Evidence
SSR precisa de entry point server-side que renderiza React. O pattern de virtual module já existe para entry-client.

#### Files to edit
```
packages/theo/src/router/entry-server.ts (NEW) — generateEntryServer function
tests/unit/entry-server.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `entry-server.ts`: Novo módulo. Gera código JavaScript string (como `entry.ts` faz para client). O código gerado importa `renderToPipeableStream`, `createStaticHandler`, `StaticRouterProvider`, e o route manifest.
- Downstream: `theoPlugin` resolve virtual module `/@theo/entry-server`. Build command usa como SSR entry.

#### Deep Dives
- **Código gerado** exporta `render(url: string, res: ServerResponse)` que:
  1. Cria static handler com routes
  2. Faz `handler.query(request)`
  3. Cria static router
  4. Renderiza com `renderToPipeableStream`
  5. Retorna `{ pipe }` no `onShellReady`

- **Template HTML**: A função também recebe `htmlHead` e `htmlTail` para wrapping.

#### Tasks
1. Criar `packages/theo/src/router/entry-server.ts`
2. Implementar `generateEntryServer()`
3. Criar testes que verificam o código gerado

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_generates_valid_code() — Given generateEntryServer, When called, Then returns non-empty string
RED:     test_imports_renderToPipeableStream() — Given generated code, When checking content, Then imports renderToPipeableStream
RED:     test_imports_static_handler() — Given generated code, When checking, Then imports createStaticHandler from react-router
RED:     test_imports_route_manifest() — Given generated code, When checking, Then imports routes from /@theo/route-manifest
RED:     test_exports_render_function() — Given generated code, When checking, Then exports render function
RED:     test_includes_onShellError() — Given generated code, When checking, Then includes onShellError handler that rejects promise (EC-1 MUST FIX)
GREEN:   Implement generateEntryServer
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/entry-server.test.ts
```

BDD scenarios:
- **Happy path**: Generates valid SSR entry code
- **Validation error**: N/A (generator, not input validation)
- **Edge case**: Code includes StaticRouterProvider
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `generateEntryServer()` returns valid JavaScript string
- [ ] Imports `renderToPipeableStream`, `createStaticHandler`, `StaticRouterProvider`
- [ ] Exports `render` function

#### DoD
- [ ] Generator works
- [ ] Tests GREEN

---

### T0.3 — Entry client with hydrateRoot

#### Objective
Atualizar `generateEntryClient()` para usar `hydrateRoot` em vez de `createRoot` quando SSR=true.

#### Evidence
`entry.ts:5` usa `createRoot` (CSR). Com SSR, o HTML já existe — `hydrateRoot` attach event listeners sem re-render.

#### Files to edit
```
packages/theo/src/router/entry.ts (EDIT) — Accept ssr param, use hydrateRoot
tests/unit/router-entry.test.ts (EDIT) — Test both modes
```

#### Deep file dependency analysis
- `entry.ts`: `generateEntryClient()` → add optional `ssr: boolean` param. Se true, usar `hydrateRoot` de `react-dom/client`. Se false, `createRoot` (atual).
- Downstream: `theoPlugin` chama `generateEntryClient()` e precisa passar `ssr` flag.

#### Deep Dives
- `hydrateRoot(el, <RouterProvider router={router} />)` — sem `render()` call, React hydrates diretamente.
- O import muda: `createRoot` → `hydrateRoot` de `react-dom/client`.

#### Tasks
1. Adicionar param `ssr?: boolean` ao `generateEntryClient()`
2. Se ssr=true, usar `hydrateRoot` em vez de `createRoot`
3. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_csr_uses_createRoot() — Given ssr=false, When generateEntryClient, Then contains createRoot
RED:     test_ssr_uses_hydrateRoot() — Given ssr=true, When generateEntryClient, Then contains hydrateRoot
RED:     test_csr_default_unchanged() — Given no param, When generateEntryClient, Then contains createRoot (backward compat)
RED:     test_both_import_router() — Given any mode, When generateEntryClient, Then imports RouterProvider
GREEN:   Update generateEntryClient with ssr param
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/router-entry.test.ts
```

BDD scenarios:
- **Happy path**: SSR mode uses hydrateRoot
- **Validation error**: N/A
- **Edge case**: No param → CSR (backward compat)
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `generateEntryClient()` → `createRoot` (unchanged)
- [ ] `generateEntryClient(true)` → `hydrateRoot`
- [ ] Both modes import RouterProvider
- [ ] Tests pass

#### DoD
- [ ] Entry client supports both modes
- [ ] Tests GREEN

---

## Phase 1: Build SSR

**Objective:** Build command gera 2 outputs quando ssr=true.

### T1.1 — Dual build (client + server)

#### Objective
Quando `config.ssr === true`, o build command gera `.theo/client/` (client build) E `.theo/server/` (SSR build).

#### Evidence
SSR precisa de server-side bundle para `renderToPipeableStream`. O Vite suporta SSR build nativamente com `build.ssr: true`.

#### Files to edit
```
packages/theo/src/cli/commands/build.ts (EDIT) — Adicionar SSR build
packages/theo/src/vite-plugin/index.ts (EDIT) — Adicionar virtual module entry-server, passar ssr flag para entryClient
tests/integration/ssr-build.test.ts (NEW) — Test SSR build outputs
```

#### Deep file dependency analysis
- `build.ts`: Hoje faz 1 `viteBuild`. Com SSR, faz 2: client build (mesmo de antes) + SSR build (`build.ssr: true` com entry `/@theo/entry-server`).
- `theoPlugin`: Precisa: (a) resolver `/@theo/entry-server` como virtual module, (b) passar `ssr` flag para `generateEntryClient()`, (c) aceitar `ssr` na config.
- SSR build output: `.theo/server/entry-server.js` — importável pelo production server.

#### Deep Dives
- **SSR build config**:
  ```typescript
  await viteBuild({
    root: cwd,
    plugins: [react(), theoPlugin({ root: cwd, ssr: true })],
    build: { ssr: true, outDir: '.theo/server', rollupOptions: { input: '/@theo/entry-server' } },
  })
  ```
- **Client build muda pouco**: Quando SSR=true, o entry-client usa `hydrateRoot`. O output client build é o mesmo (assets + index.html).
- **HTML template processing**: O build lê `index.html`, split em head/tail no marcador `<!--ssr-outlet-->` ou no `<div id="root">`, e salva como parte do server bundle.

#### Tasks
1. Adicionar `ssr?: boolean` ao `TheoPluginOptions`
2. Registrar virtual module `/@theo/entry-server` no theoPlugin
3. Passar `ssr` flag para `generateEntryClient()`
4. Adicionar SSR build no `buildCommand()` quando config.ssr=true
5. Criar teste de integração

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_ssr_generates_server_output() — Given ssr:true fixture, When build, Then .theo/server/entry-server.js exists
RED:     test_build_ssr_generates_client_output() — Given ssr:true fixture, When build, Then .theo/client/ exists with assets
RED:     test_build_csr_unchanged() — Given ssr:false (default), When build, Then no .theo/server/ (backward compat)
RED:     test_plugin_resolves_entry_server() — Given theoPlugin with ssr, When resolveId('/@theo/entry-server'), Then resolves
GREEN:   Implement dual build and plugin updates
REFACTOR: Extract buildClient/buildServer helpers if needed
VERIFY:  npx vitest run tests/integration/ssr-build.test.ts
```

BDD scenarios:
- **Happy path**: SSR build produces both outputs
- **Validation error**: N/A
- **Edge case**: ssr=false → no server output (backward compat)
- **Error scenario**: SSR build fails → clear error message

#### Acceptance Criteria
- [ ] `ssr: true` → `.theo/server/entry-server.js` exists
- [ ] `ssr: true` → `.theo/client/` still has assets
- [ ] `ssr: false` → no `.theo/server/` (backward compat)
- [ ] Plugin resolves `/@theo/entry-server`

#### DoD
- [ ] Dual build works
- [ ] Tests GREEN

---

## Phase 2: Production Server SSR

**Objective:** Production server renderiza React via SSR em vez de servir index.html vazio.

### T2.1 — SSR rendering in start.ts

#### Objective
Quando SSR=true, o production server importa `entry-server.js` e renderiza React, pipando HTML para a response.

#### Evidence
`start.ts:127-128` serve `indexHtml` diretamente (SPA fallback). Com SSR, precisa renderizar React.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts (EDIT) — SSR render path
fixtures/ssr-basic/ (NEW) — Fixture para SSR tests
```

#### Deep file dependency analysis
- `start.ts`: O SPA fallback path (linhas 120-128) muda. Se SSR=true E `.theo/server/entry-server.js` existe, importa e chama `render(url)`. O `render` retorna um `pipe` function que pipa HTML para `res`.
- **HTML template**: Lê index.html, split no `<div id="root">`, envia head antes do render, tail depois.
- **Fallback**: Se SSR render falha (ex: `window is not defined`), log erro e serve index.html como CSR fallback.

#### Deep Dives

**HTML split pattern** (EC-2 MUST FIX — use regex for robustness):
```typescript
// Regex handles attributes and quote styles on root div
const rootDivMatch = indexHtml.match(/<div id=["']root["'][^>]*>/)
const splitPoint = rootDivMatch ? indexHtml.indexOf(rootDivMatch[0]) + rootDivMatch[0].length : -1
const htmlHead = splitPoint > 0 ? indexHtml.slice(0, splitPoint) : ''
const htmlTail = splitPoint > 0 ? indexHtml.slice(splitPoint) : indexHtml
```

**SSR render flow**:
```typescript
const { render } = await import(resolve(distDir, 'server/entry-server.js'))
res.writeHead(200, { 'Content-Type': 'text/html' })
res.write(htmlHead + '<div id="root">')
const pipe = await render(url)
pipe(res) // streams React HTML into response
// After stream ends, res.end() is called by the pipe
```

**Fallback**:
```typescript
try {
  // SSR render
} catch (err) {
  console.error('[SSR Error]', err)
  // Fallback to CSR
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(indexHtml)
}
```

#### Tasks
1. Criar fixture `fixtures/ssr-basic/` com app + config ssr:true
2. Detectar SSR mode no start command
3. Import entry-server.js dynamically
4. Split HTML template
5. Pipe SSR output to response
6. Add CSR fallback on SSR error
7. Create tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_ssr_renders_html_content() — Given SSR fixture built, When GET /, Then response contains rendered React content (not empty div)
RED:     test_ssr_response_is_html() — Given SSR mode, When GET /, Then Content-Type is text/html
RED:     test_ssr_includes_script_tag() — Given SSR mode, When GET /, Then response includes script tag for hydration
RED:     test_csr_fallback_when_no_server_build() — Given ssr:true but no .theo/server/, When GET /, Then serves index.html (CSR fallback)
RED:     test_api_routes_unchanged_in_ssr() — Given SSR mode, When GET /api/health, Then JSON response (not affected by SSR)
RED:     test_html_split_handles_attributes() — Given index.html with <div id="root" class="app">, When split, Then correctly separates head/tail (EC-2 MUST FIX)
RED:     test_ssr_fallback_on_window_reference() — Given component accessing window, When SSR renders, Then falls back to CSR (EC-3 SHOULD TEST)
GREEN:   Implement SSR in start.ts
REFACTOR: Extract SSR render helper
VERIFY:  npx vitest run tests/integration/ssr-production.test.ts
```

BDD scenarios:
- **Happy path**: SSR renders HTML with content
- **Validation error**: N/A
- **Edge case**: API routes unaffected by SSR
- **Error scenario**: SSR fails → CSR fallback

#### Acceptance Criteria
- [ ] SSR response contains rendered React content
- [ ] Response includes hydration script
- [ ] CSR fallback on SSR error
- [ ] API routes work normally in SSR mode
- [ ] Fixture exists

#### DoD
- [ ] SSR rendering works in production
- [ ] Tests GREEN

---

## Phase 3: Dev Server SSR

**Objective:** Dev server does SSR via `vite.ssrLoadModule`.

### T3.1 — Dev SSR via ssrLoadModule

#### Objective
When SSR=true, dev server renders React server-side using `vite.ssrLoadModule('/@theo/entry-server')`.

#### Evidence
Vite natively supports SSR in dev via `ssrLoadModule`. No separate build needed.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts (EDIT) — Add SSR middleware for dev
packages/theo/src/cli/commands/dev.ts (EDIT) — Pass ssr config
```

#### Deep file dependency analysis
- `theoPlugin.configureServer`: Add middleware that intercepts non-API requests and does SSR render via `vite.ssrLoadModule`.
- `dev.ts`: Needs to pass `config.ssr` to `theoPlugin`.
- The middleware runs AFTER API middleware but BEFORE Vite's default HTML serving.

#### Deep Dives
- **Dev SSR middleware**: Intercepts requests that are not `/api/`, not static files, not HMR. Loads entry-server via `vite.ssrLoadModule`, calls `render(url)`, transforms HTML with `vite.transformIndexHtml`.
- **HTML transform**: Vite's `transformIndexHtml` injects HMR client script. Must be applied to the final HTML.

#### Tasks
1. Add SSR dev middleware in `configureServer`
2. Use `vite.ssrLoadModule('/@theo/entry-server')` to render
3. Transform HTML with `vite.transformIndexHtml`
4. Pass ssr config from dev command

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dev_ssr_renders_content() — Given SSR fixture with dev server, When GET /, Then response contains rendered content
RED:     test_dev_ssr_has_hmr() — Given SSR dev server, When GET /, Then response includes Vite HMR client
RED:     test_dev_csr_unchanged() — Given ssr:false, When GET /, Then response is standard Vite HTML (backward compat)
RED:     test_dev_api_unaffected() — Given SSR dev server, When GET /api/health, Then JSON (not SSR)
GREEN:   Implement dev SSR middleware
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/ssr-dev.test.ts
```

BDD scenarios:
- **Happy path**: Dev SSR renders content
- **Validation error**: N/A
- **Edge case**: CSR mode unchanged
- **Error scenario**: SSR error in dev → Vite error overlay

#### Acceptance Criteria
- [ ] Dev server renders SSR when config.ssr=true
- [ ] HMR still works
- [ ] API routes unaffected
- [ ] CSR mode backward compat

#### DoD
- [ ] Dev SSR works
- [ ] Tests GREEN

---

## Phase 4: Regression

**Objective:** Zero regressão.

### T4.1 — Full regression

#### Objective
All existing tests pass. SSR is additive, CSR unchanged.

#### Files to edit
```
Nenhum — apenas execução
```

#### Deep file dependency analysis
N/A.

#### Deep Dives
N/A.

#### Tasks
1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:types`
4. `pnpm build`
5. Zero `any` audit
6. E2E tests (CSR fixtures unchanged)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (432+)
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass (34+)
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: New tests increase count
- **Error scenario**: Entry changes break existing tests → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 432+ tests green
- [ ] `pnpm test:types` — 34+ type tests green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`
- [ ] E2E tests pass

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Config ssr field | T0.1 | `ssr: boolean` default false |
| 2 | Entry server generator | T0.2 | `generateEntryServer()` with renderToPipeableStream |
| 3 | Entry client hydrateRoot | T0.3 | `generateEntryClient(true)` uses hydrateRoot |
| 4 | Dual build (client+server) | T1.1 | Two viteBuild calls when ssr=true |
| 5 | Production SSR rendering | T2.1 | start.ts imports entry-server, pipes HTML |
| 6 | CSR fallback on SSR error | T2.1 | try/catch with indexHtml fallback |
| 7 | Dev SSR | T3.1 | vite.ssrLoadModule in configureServer |
| 8 | API routes unaffected | T2.1, T3.1 | SSR only for non-API, non-static requests |
| 9 | Backward compat (ssr=false) | T0.1, T1.1, T4.1 | Default false, no behavior change |
| 10 | SSR fixture | T2.1 | fixtures/ssr-basic/ |
| 11 | HTML template split | T2.1 | Split on `<div id="root">` |

**Coverage: 11/11 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-4)
- [ ] All tests passing (`pnpm test` — 432+)
- [ ] All type tests passing (`pnpm test:types` — 34+)
- [ ] Zero TypeScript errors
- [ ] Zero `any`
- [ ] `pnpm build` exit code 0
- [ ] `ssr: true` → build generates client + server
- [ ] Production server renders HTML with content
- [ ] `hydrateRoot` used when ssr=true
- [ ] CSR fallback when SSR fails
- [ ] API routes unaffected
- [ ] Dev server SSR works
- [ ] `ssr: false` → zero behavior change
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70

## Final Phase: Dogfood QA (MANDATORY)

**Objective:** Validate SSR works end-to-end as real user experience.

### Execution
Run `/dogfood full`.

### Acceptance Criteria
- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues
- [ ] CSR fixtures still work (backward compat)
- [ ] SSR fixture renders content
