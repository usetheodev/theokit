# Plan: Onda 6 — Build + Production Runtime

> **Version 1.0** — Este plano implementa `theo build` (Vite client build) e `theo start` (Node.js production server). O server serve static files de `.theo/client/` e executa API routes/actions via `import()` direto (sem Vite). CSR only, sem SSR. Resultado: 5 testes obrigatórios passando, app deployável em Node.js.

## Context

Onda 0-5+7 completas. `theo dev` funciona via Vite dev server. Não existe: build pipeline, production server, `theo build`, `theo start`. 229 unit/integration + 13 E2E + 21 type tests passando.

Evidência: `theo build` e `theo start` não existem no CLI. App só funciona em dev mode.

## Objective

**Done =** `theo build` gera `.theo/`, `theo start` serve o app em produção, 5 testes obrigatórios GREEN.

## ADRs

### D1 — Build output em `.theo/client/`
**Decision:** `theo build` roda `vite build` com `outDir: '.theo/client'`. Vite gera HTML + JS + CSS + assets com hashing.
**Rationale:** Vite é o build tool. `.theo/` é o output dir (já no `.gitignore`).
**Consequences:** `public/` copiado automaticamente pelo Vite para `.theo/client/`.

### D2 — Production server via Node.js `http.createServer`
**Decision:** `theo start` cria HTTP server que: (1) serve static files de `.theo/client/`, (2) executa API routes/actions, (3) SPA fallback para `index.html`.
**Rationale:** Sem deps extras (Express, Fastify). Node.js nativo é suficiente para MVP.
**Consequences:** MIME types manuais, static file serving simples.

### D3 — Module loader abstraction para dev/prod
**Decision:** Criar interface `ModuleLoader` com `loadModule(path)` que em dev usa `vite.ssrLoadModule()` e em prod usa `import()` via `tsx`.
**Rationale:** `executeRoute` e `executeAction` dependem de `ssrLoadModule` que só existe em dev. Abstração permite reutilizar toda a infra.
**Consequences:** Minor refactor nos executors para aceitar `ModuleLoader` em vez de `ViteDevServer`.

### D4 — Server code executado via tsx em prod (sem bundling)
**Decision:** Em produção, server routes/actions são carregados via `import()` com `tsx` loader (TypeScript transpilation em runtime).
**Rationale:** Bundling server code (via esbuild) é complexidade desnecessária para MVP. `tsx` já é devDependency e funciona.
**Consequences:** `tsx` é dependency de produção (ou user instala). Production startup um pouco mais lento que bundled.

### D5 — CSR only, SPA fallback
**Decision:** Rotas frontend servem `index.html` como SPA fallback. Sem SSR.
**Rationale:** Consistência com dev mode (Onda 1-5). SSR é feature futura.
**Consequences:** SEO ruim (aceitável para MVP de framework).

## Dependency Graph

```
Phase 0 (Module loader abstraction)
    |
Phase 1 (Build command)     Phase 2 (Production server)
    |                           |
    +---------------------------+
                |
            Phase 3 (CLI wiring)
                |
            Phase 4 (Fixture + Tests)
```

- Phase 0 bloqueia tudo (refactor nos executors)
- Phase 1 e Phase 2 podem parallelizar após Phase 0
- Phase 3 depende de 1+2
- Phase 4 depende de 3

---

## Phase 0: Module Loader Abstraction

**Objective:** Extrair dependência de `ViteDevServer` dos executors para interface `ModuleLoader`.

### T0.1 — ModuleLoader interface + refactor executors

#### Objective
Criar interface que abstrai module loading. Refatorar `executeRoute` e `executeAction` para aceitar `loadModule` function em vez de `ViteDevServer`.

#### Evidence
`executeRoute` linha 68: `vite.ssrLoadModule(route.filePath)`. Em produção, não há Vite. Precisa de abstração.

#### Files to edit
```
packages/theo/src/server/module-loader.ts (NEW) — ModuleLoader type + createViteLoader + createProductionLoader
packages/theo/src/server/execute.ts (EDIT) — Replace ViteDevServer param with loadModule function
packages/theo/src/server/action-execute.ts (EDIT) — Same
packages/theo/src/server/middleware-runner.ts (EDIT) — Same
packages/theo/src/vite-plugin/api-middleware.ts (EDIT) — Create Vite loader and pass to executor
packages/theo/src/vite-plugin/action-middleware.ts (EDIT) — Same
```

#### Deep file dependency analysis
- `module-loader.ts`: NEW. Defines `type LoadModule = (path: string) => Promise<Record<string, unknown>>`. Exports `createViteLoader(vite)` for dev and `createProductionLoader()` for prod.
- `execute.ts`: Change `vite: ViteDevServer` param to `loadModule: LoadModule`. Replace `vite.ssrLoadModule(x)` with `loadModule(x)`.
- `action-execute.ts`: Same change.
- `middleware-runner.ts`: Same change.
- Vite middlewares: Create loader from Vite instance and pass to executors.

#### Deep Dives
```typescript
// module-loader.ts
export type LoadModule = (path: string) => Promise<Record<string, unknown>>

export function createViteLoader(vite: ViteDevServer): LoadModule {
  return (path) => vite.ssrLoadModule(path)
}

export function createProductionLoader(): LoadModule {
  return async (path) => {
    const url = pathToFileURL(path).href
    return import(url)
  }
}
```

**Backward compat:** All existing callers (Vite middlewares) create a Vite loader and pass it. Same behavior, different interface.

#### Tasks
1. Create `module-loader.ts`
2. Refactor `execute.ts` — replace `vite: ViteDevServer` with `loadModule: LoadModule`
3. Refactor `action-execute.ts` — same
4. Refactor `middleware-runner.ts` — same
5. Update `api-middleware.ts` — create Vite loader
6. Update `action-middleware.ts` — create Vite loader
7. Verify all existing tests pass

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_vite_loader_calls_ssrLoadModule() — Given ViteDevServer mock, When createViteLoader, Then calls ssrLoadModule
RED:     test_production_loader_uses_import() — Given file path, When createProductionLoader, Then imports via dynamic import
RED:     test_existing_route_tests_pass() — Given refactored executors, When pnpm test, Then all 229 tests pass
RED:     test_execute_route_with_loader() — Given loadModule function, When executeRoute, Then handler executes
RED:     test_production_loader_no_stale_cache() — Given production loader, When loading same module twice, Then uses fresh import (EC-2)
GREEN:   Implement ModuleLoader + refactor executors with cache-bust
REFACTOR: Remove ViteDevServer import from execute.ts
VERIFY:  pnpm test
```

BDD scenarios:
- **Happy path**: Vite loader loads module, executor works as before
- **Validation error**: N/A (interface change, no validation logic)
- **Edge case**: Production loader imports TypeScript files (via tsx)
- **Error scenario**: Module not found → error propagates

#### Acceptance Criteria
- [ ] `LoadModule` type exported
- [ ] `executeRoute` accepts `LoadModule` instead of `ViteDevServer`
- [ ] `executeAction` accepts `LoadModule` instead of `ViteDevServer`
- [ ] `middleware-runner` accepts `LoadModule` instead of `ViteDevServer`
- [ ] All 229 existing tests GREEN (zero regression)
- [ ] `pnpm typecheck` passes

#### DoD
- [ ] Refactor complete
- [ ] Zero regression
- [ ] `pnpm test` all green

---

## Phase 1: Build Command

**Objective:** `theo build` gera `.theo/client/` via Vite.

### T1.1 — Build command

#### Objective
CLI command que roda Vite build e gera output em `.theo/client/`.

#### Evidence
Teste obrigatório 1: `theo build` deve gerar `.theo/`.

#### Files to edit
```
packages/theo/src/cli/commands/build.ts (NEW) — buildCommand
```

#### Deep file dependency analysis
- `build.ts`: Importa `vite.build`, `react()`, `theoPlugin()`, `loadConfig`, `validateProjectStructure`. Outputs to `.theo/client/`.

#### Deep Dives
```typescript
import { build as viteBuild } from 'vite'

export async function buildCommand(): Promise<void> {
  const cwd = process.cwd()
  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  await viteBuild({
    root: cwd,
    plugins: [react(), theoPlugin(cwd)],
    build: {
      outDir: '.theo/client',
      emptyOutDir: true,
    },
  })

  console.log('\n  ✓ Build complete → .theo/client/\n')
}
```

#### Tasks
1. Create `build.ts`
2. Test: `theo build` generates `.theo/client/index.html`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_generates_output() — Given valid fixture, When buildCommand runs, Then .theo/client/index.html exists
RED:     test_build_generates_assets() — Given fixture, When build, Then .theo/client/assets/ has JS files
RED:     test_build_copies_public() — Given fixture with public/logo.png, When build, Then .theo/client/logo.png exists
RED:     test_build_fails_invalid_project() — Given invalid project (no app/), When build, Then error
GREEN:   Implement buildCommand
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/build.test.ts
```

BDD scenarios:
- **Happy path**: Build generates `.theo/client/` with index.html + assets
- **Validation error**: Invalid project → clear error message
- **Edge case**: Public assets copied to output
- **Error scenario**: Missing app/ → TheoProjectError

#### Acceptance Criteria
- [ ] `.theo/client/index.html` generated
- [ ] `.theo/client/assets/` contains hashed JS/CSS
- [ ] `public/` files copied
- [ ] `pnpm typecheck` passes

#### DoD
- [ ] Build command works
- [ ] Tests GREEN

---

## Phase 2: Production Server

**Objective:** `theo start` serves the built app via Node.js HTTP server.

### T2.1 — Production server

#### Objective
Node.js HTTP server que: serve static files, executa API routes/actions, SPA fallback.

#### Evidence
Teste obrigatório 2: `theo start` deve servir o app.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts (NEW) — startCommand + createProductionServer
packages/theo/src/server/static.ts (NEW) — serveStaticFile helper (MIME types)
```

#### Deep file dependency analysis
- `start.ts`: Creates `http.createServer`, delegates to static file server, API route execution, and SPA fallback.
- `static.ts`: Helper that reads file from disk, sets Content-Type based on extension, sends response.
- Reuses: `scanServerRoutes`, `matchRoute`, `executeRoute` (with production loader), `scanServerActions`, `executeAction`, `runMiddlewareAndContext`.

#### Deep Dives
Request handling order:
1. `/api/__actions/*` → action execution (with production loader)
2. `/api/*` → route execution (with production loader)
3. Static file in `.theo/client/` → serve file with MIME type
4. Fallback → serve `.theo/client/index.html` (SPA)

MIME types:
```typescript
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}
```

#### Tasks
1. Create `static.ts` with MIME types + file serving
2. Create `start.ts` with production server
3. Test: server responds 200 on `/`, serves API routes, serves static files

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_start_serves_index() — Given built app, When GET /, Then 200 with HTML
RED:     test_start_serves_static() — Given built app with assets, When GET /assets/index-abc.js, Then 200 with JavaScript
RED:     test_start_serves_api() — Given built app with server routes, When GET /api/health, Then 200 JSON
RED:     test_start_spa_fallback() — Given GET /dashboard (no static file), When request, Then 200 with index.html
RED:     test_start_no_build() — Given no .theo/ directory, When start, Then error 'Run theo build first'
RED:     test_path_traversal_blocked() — Given GET /../../etc/passwd, When request, Then 403 Forbidden (EC-1)
RED:     test_no_server_routes_404() — Given app without server/routes, When GET /api/anything, Then 404 JSON (EC-4)
GREEN:   Implement production server with path traversal prevention
REFACTOR: Extract static file server to helper
VERIFY:  npx vitest run tests/integration/start.test.ts
```

BDD scenarios:
- **Happy path**: Server serves built HTML + assets + API routes
- **Validation error**: No build output → clear error
- **Edge case**: SPA fallback for frontend routes
- **Error scenario**: Missing `.theo/` → "Run theo build first"

#### Acceptance Criteria
- [ ] Production server serves static files with correct MIME types
- [ ] API routes work in production
- [ ] SPA fallback serves index.html for unknown paths
- [ ] Missing build output → clear error message

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passes

---

## Phase 3: CLI Wiring

**Objective:** Add `build` and `start` commands to CLI.

### T3.1 — CLI commands

#### Objective
Wire `build` and `start` into the cac CLI.

#### Files to edit
```
packages/theo/src/cli/index.ts (EDIT) — Add build + start commands
```

#### Deep file dependency analysis
- `index.ts`: Currently has `dev` command. Add `build` and `start` with same pattern.

#### Tasks
1. Add `build` command
2. Add `start` command with `--port` option
3. Verify `theo build --help` and `theo start --help` work

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cli_has_build() — Given CLI, When parsing 'build', Then buildCommand called
RED:     test_cli_has_start() — Given CLI, When parsing 'start --port 4000', Then startCommand called with port
RED:     test_cli_build_error_handling() — Given invalid project, When build, Then clean error (no stack trace)
RED:     test_cli_start_error_handling() — Given no build, When start, Then clean error
GREEN:   Add commands to CLI
REFACTOR: None expected
VERIFY:  pnpm test
```

BDD scenarios:
- **Happy path**: `theo build` and `theo start` execute
- **Validation error**: Invalid project → clean error
- **Edge case**: `--port` flag works for start
- **Error scenario**: Error handling matches `devCommand` pattern

#### Acceptance Criteria
- [ ] `theo build` wired
- [ ] `theo start --port 4000` wired
- [ ] Error handling consistent with `theo dev`

#### DoD
- [ ] CLI updated
- [ ] `pnpm typecheck` passes

---

## Phase 4: Fixture + Integration Tests

**Objective:** Fixture with build output and 5 mandatory tests.

### T4.1 — Build + Start integration tests

#### Objective
Tests that build a fixture, start production server, and verify responses.

#### Files to edit
```
fixtures/production-build/ (NEW) — Fixture with public/ assets
tests/integration/onda6-mandatory.test.ts (NEW) — 5 mandatory tests
```

#### Deep file dependency analysis
- Fixture: Copy of `app-router-basic` + `server/routes/health.ts` + `public/logo.png`
- Tests: Build the fixture, start production server, make HTTP requests

#### Deep Dives
Test flow:
1. `buildCommand()` on fixture → generates `.theo/client/`
2. Start production server on random port
3. Verify: index.html, API health, dashboard route, static assets
4. Cleanup: close server, delete `.theo/`

#### Tasks
1. Create fixture with `public/logo.png` (1x1 pixel PNG)
2. Create integration tests
3. Verify all 5 mandatory tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_generates_output() — Given fixture, When buildCommand, Then .theo/client/index.html exists
RED:     test_start_serves_app() — Given built fixture, When start + GET /, Then 200 HTML
RED:     test_dev_prod_parity() — Given /dashboard, When GET in prod, Then 200 (SPA fallback)
RED:     test_public_assets() — Given public/logo.png, When GET /logo.png in prod, Then 200 image
RED:     test_api_works_in_prod() — Given server/routes/health.ts, When GET /api/health in prod, Then 200 JSON
GREEN:   All tests pass after Phases 0-3
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/onda6-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: Build + start + serve all works
- **Validation error**: N/A
- **Edge case**: SPA fallback for frontend routes (paridade dev/prod)
- **Error scenario**: Public assets served with correct MIME type

#### Acceptance Criteria
- [ ] 5/5 mandatory tests GREEN
- [ ] Existing 229+ tests GREEN
- [ ] Existing 13 E2E GREEN
- [ ] Build output generated
- [ ] Production server functional

#### DoD
- [ ] `pnpm test` all green
- [ ] `pnpm test:e2e` all green
- [ ] `pnpm typecheck` passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: Build gera .theo/ | T4.1 | Integration test |
| 2 | Teste 2: Start production | T4.1 | Integration test |
| 3 | Teste 3: Paridade dev/prod | T4.1 | SPA fallback test |
| 4 | Teste 4: Build com TypeScript | DEFERRED | tsc check not in MVP |
| 5 | Teste 5: Assets públicos | T4.1 | public/logo.png test |
| 6 | Module loader abstraction | T0.1 | LoadModule type |
| 7 | Build command | T1.1 | Vite build |
| 8 | Production server | T2.1 | Node.js HTTP |
| 9 | CLI wiring | T3.1 | cac commands |
| 10 | Static file MIME types | T2.1 | static.ts helper |
| 11 | SPA fallback | T2.1 | index.html for unknown paths |
| 12 | API in production | T2.1 | Routes + actions via import() |

**Coverage: 11/12 gaps covered (92%)** — Teste 4 (TypeScript check) deferred to future.

## Global Definition of Done

- [ ] All phases completed (0-4)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] 4/5 testes obrigatórios GREEN (Teste 4 deferred)
- [ ] `theo build` generates `.theo/client/`
- [ ] `theo start` serves production app
- [ ] API routes work in production
- [ ] Static assets served with MIME types
- [ ] SPA fallback for frontend routes
- [ ] Onda 0-5+7 tests still green

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
# Build + start dogfood
cd my-test
npx tsx ../packages/theo/src/cli/index.ts build
npx tsx ../packages/theo/src/cli/index.ts start --port 4000 &
sleep 2
curl http://localhost:4000/
curl http://localhost:4000/api/health
kill %1

# Plus /dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Build generates output
- [ ] Production server serves correctly
- [ ] Zero CRITICAL issues
