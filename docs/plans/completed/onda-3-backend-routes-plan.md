# Plan: Onda 3 — Backend Routes

> **Version 1.0** — Este plano transforma `defineRoute()` de identity function em runtime handler executável. O Vite plugin ganha API middleware via `configureServer` que intercepta `/api/*`, escaneia `server/routes/`, valida com Zod, e executa handlers. Resultado: 5 testes obrigatórios passando (GET simples, POST válido, POST inválido→400, params, query), backend funciona sem depender de frontend.

## Context

Onda 0+1+2 completas. `defineRoute` é identity function (type inference only). O Vite plugin tem `configureServer` para HMR watcher + frontend virtual modules. Não existe: API middleware, body parsing, Zod validation runtime, route matching com params. 154 unit/integration + 13 E2E tests passando.

Evidência: `curl http://localhost:3000/api/health` retorna HTML (Vite serve index.html como catch-all). Deveria retornar `{ "ok": true }`.

## Objective

**Done =** `curl /api/health` retorna JSON, POST com body inválido retorna 400 com Zod issues, `[id]` params funcionam, query strings parsed. 5 testes obrigatórios GREEN. Backend funciona sem frontend.

Metas:
1. Server route scanner (`server/routes/` → `ServerRouteNode[]`)
2. Pattern matching com dynamic params (`[id]` → `:id`)
3. Body parsing + Zod validation automática
4. Route executor com 200/201/400/404/405 handling
5. API middleware no Vite dev server

## ADRs

### D1 — Connect middleware via `configureServer`
**Decision:** Adicionar middleware ao `configureServer` existente. Zero deps extras.
**Rationale:** Vite usa Connect. `server.middlewares.use(fn)` é o pattern oficial. Sem Express.
**Consequences:** Body parsing manual (~10 linhas). Middleware roda antes do catch-all HTML do Vite.

### D2 — Named exports per HTTP method
**Decision:** `export const GET = defineRoute({...})`, `export const POST = defineRoute({...})`.
**Rationale:** Pattern Next.js. Explícito, sem magic. Já usado nas fixtures existentes.
**Consequences:** Scanner detecta methods em runtime via `ssrLoadModule`, não em scan time.

### D3 — Auto `/api/` prefix
**Decision:** `server/routes/health.ts` → `/api/health`. Hardcoded para MVP.
**Rationale:** Convention over configuration. Separação clara frontend/backend.
**Consequences:** Todas server routes vivem sob `/api/`.

### D4 — Zod validation automática
**Decision:** Se schema definido no `defineRoute`, validation roda via `safeParse` antes do handler.
**Rationale:** Zero-effort validation. Schema é single source of truth.
**Consequences:** Sem schema = sem validation (pass-through).

### D5 — `status` config field
**Decision:** `defineRoute({ status: 201, handler })` para default status code.
**Rationale:** POST handlers retornam 201 comumente. Evita forçar `new Response()`.
**Consequences:** Backward compat — sem `status` = 200.

### D6 — Error response format
**Decision:** `{ error: { code, message, issues? } }`. Codes: `VALIDATION_ERROR`, `METHOD_NOT_ALLOWED`, `NOT_FOUND`, `INTERNAL_ERROR`.
**Rationale:** Structured errors para typed client futuro.
**Consequences:** Helper function `sendError()`.

### D7 — Route loading via `vite.ssrLoadModule`
**Decision:** Carregar route modules via Vite SSR module loading.
**Rationale:** HMR automático — editar route.ts atualiza sem restart. Zero build step.
**Consequences:** Funciona apenas no dev server. Prod server (Onda 6) precisa de approach diferente.

## Dependency Graph

```
Phase 0 (Scanner+Matcher)     Phase 3 (defineRoute evolution)
    |                               |
Phase 1 (Executor)                  |
    |                               |
    +-------------------------------+
    |
Phase 2 (API Middleware + Vite Plugin)
    |
Phase 4 (Fixture)
    |
Phase 5 (Integration Tests)
```

- Phase 0 e Phase 3: paralelos
- Phase 1 depende de Phase 0
- Phase 2 depende de Phase 0+1+3
- Phase 4 depende de Phase 2
- Phase 5 depende de Phase 4

---

## Phase 0: Server Route Scanner + Matcher

**Objective:** Pure functions para scan de `server/routes/` e matching de URLs com params.

### T0.1 — compilePattern + matchRoute

#### Objective
Compilar route paths em RegExp e match URLs extraindo params.

#### Evidence
SOTA research definiu: `[id]` → `:id` → `([^/]+)` RegExp. Rails usa este pattern.

#### Files to edit
```
packages/theo/src/server/match.ts (NEW) — compilePattern, matchRoute, ServerRouteNode interface
tests/unit/server-route-match.test.ts (NEW) — 8+ tests
```

#### Deep file dependency analysis
- `match.ts`: Zero imports externos. Define `ServerRouteNode`, `compilePattern`, `matchRoute`. Pure functions.
- Downstream: `scan.ts` importa `compilePattern`. `api-middleware.ts` importa `matchRoute`.

#### Deep Dives
```typescript
interface ServerRouteNode {
  filePath: string
  routePath: string
  paramNames: string[]
  pattern: RegExp
}
```
- `compilePattern('/api/users/:id')` → `{ pattern: /^\/api\/users\/([^/]+)$/, paramNames: ['id'] }`
- `matchRoute` itera routes, testa regex, extrai params via capture groups
- Query string strippada antes do match (`url.split('?')[0]`)
- Static routes testados antes de dynamic (sort by specificity)

#### Tasks
1. Escrever testes RED
2. Criar `match.ts`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_compile_static() — Given '/api/health', When compilePattern, Then matches '/api/health', paramNames=[]
RED:     test_compile_dynamic() — Given '/api/users/:id', When compilePattern, Then matches '/api/users/123', paramNames=['id']
RED:     test_compile_rejects_extra() — Given '/api/users/:id', When test '/api/users/123/extra', Then no match
RED:     test_compile_multiple_params() — Given '/api/users/:uid/posts/:pid', When compile, Then paramNames=['uid','pid']
RED:     test_match_static() — Given routes, When matchRoute('/api/health'), Then returns health route with empty params
RED:     test_match_dynamic() — Given routes, When matchRoute('/api/users/abc'), Then params.id='abc'
RED:     test_match_none() — Given routes, When matchRoute('/api/nonexistent'), Then returns null
RED:     test_match_strips_query() — Given routes, When matchRoute('/api/health?v=1'), Then matches
RED:     test_match_trailing_slash() — Given routes, When matchRoute('/api/health/'), Then matches after stripping slash (EC-3)
GREEN:   Implement compilePattern and matchRoute with trailing slash handling
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/server-route-match.test.ts
```

BDD scenarios:
- **Happy path**: Match dynamic route, extract params correctly
- **Validation error**: No match returns null
- **Edge case**: URL with query string still matches
- **Error scenario**: Multiple params extracted correctly

#### Acceptance Criteria
- [ ] `compilePattern` converts to RegExp with captures
- [ ] `matchRoute` returns first match with params
- [ ] Query strings stripped before matching
- [ ] 8+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa
- [ ] Zero `any`

---

### T0.2 — scanServerRoutes

#### Objective
Scan `server/routes/` recursivamente e produzir `ServerRouteNode[]`.

#### Evidence
Frontend `scanRoutes` já existe em `router/scan.ts`. Server scan é similar mas com regras diferentes.

#### Files to edit
```
packages/theo/src/server/scan.ts (NEW) — scanServerRoutes
tests/unit/server-route-scan.test.ts (NEW) — 8+ tests com temp dirs
```

#### Deep file dependency analysis
- `scan.ts`: Importa `compilePattern` de `match.ts`. Usa `node:fs`, `node:path`. Zero Vite dep.
- Downstream: `api-middleware.ts` chama `scanServerRoutes`.

#### Deep Dives
- `server/routes/health.ts` → routePath `/api/health`
- `server/routes/users/[id].ts` → routePath `/api/users/:id`
- `server/routes/users/index.ts` → routePath `/api/users` (index file)
- Strip `.ts`/`.js` extension
- Replace `[param]` → `:param`
- Prefix `/api/`
- Dir inexistente → `[]` (server routes são opcionais)
- Sort: static antes de dynamic

#### Tasks
1. Escrever testes RED com temp dirs
2. Criar `scan.ts`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_scan_health() — Given server/routes/health.ts, When scan, Then routePath='/api/health'
RED:     test_scan_users() — Given server/routes/users.ts, When scan, Then routePath='/api/users'
RED:     test_scan_dynamic() — Given server/routes/users/[id].ts, When scan, Then routePath='/api/users/:id', paramNames=['id']
RED:     test_scan_empty() — Given empty dir, When scan, Then []
RED:     test_scan_nonexistent() — Given nonexistent dir, When scan, Then []
RED:     test_scan_nested() — Given nested dirs, When scan, Then correct paths
RED:     test_scan_sorts() — Given mix, When scan, Then static before dynamic
RED:     test_scan_index() — Given index.ts, When scan, Then maps to parent path
RED:     test_scan_hyphenated_param() — Given server/routes/[user-id].ts, When scan, Then paramNames=['user-id'] (EC-4)
GREEN:   Implement scanServerRoutes
REFACTOR: Extract fileToRoute helper
VERIFY:  npx vitest run tests/unit/server-route-scan.test.ts
```

BDD scenarios:
- **Happy path**: `health.ts` → `ServerRouteNode` with `/api/health`
- **Validation error**: Nonexistent dir returns `[]`
- **Edge case**: `[id].ts` extracts param, `index.ts` maps to parent
- **Error scenario**: N/A (no throw)

#### Acceptance Criteria
- [ ] Files mapped with `/api/` prefix
- [ ] `[param]` → `:param` extraction
- [ ] Empty/nonexistent → `[]`
- [ ] Static sorted before dynamic
- [ ] 8+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 1: Route Executor

**Objective:** Pipeline: load module → resolve method → parse body → validate → call handler → serialize.

### T1.1 — parseBody + sendJson + sendError + executeRoute

#### Objective
O pipeline completo de execução de server routes.

#### Evidence
SOTA research definiu: manual body parse, Zod safeParse, structured error response.

#### Files to edit
```
packages/theo/src/server/execute.ts (NEW) — parseBody, sendJson, sendError, executeRoute
tests/unit/server-route-execute.test.ts (NEW) — 11+ tests
```

#### Deep file dependency analysis
- `execute.ts`: Importa `ServerRouteNode` de `match.ts`. Usa `node:http` types. Importa `z` de `zod` para safeParse.
- Downstream: `api-middleware.ts` chama `executeRoute`.

#### Deep Dives
- **parseBody**: `req.on('data')` → `Buffer.concat()` → `JSON.parse()`. Undefined para GET/HEAD/DELETE.
- **sendJson**: `res.writeHead(status, { 'Content-Type': 'application/json' })` + `res.end(JSON.stringify(data))`
- **sendError**: `sendJson(res, { error: { code, message, issues } }, status)`
- **executeRoute pipeline**:
  1. `vite.ssrLoadModule(filePath)` → module
  2. `module[method]` → routeConfig (ou undefined → 405)
  3. `config.handler` é a função do user
  4. Parse query via `URL(req.url).searchParams`
  5. Parse body via `parseBody(req)` para POST/PUT/PATCH
  6. Validate query/body/params com `config.query?.safeParse()` etc
  7. Validation fail → 400 com issues
  8. Call `config.handler({ query, body, params, request })`
  9. Result is object → `sendJson(res, result, config.status ?? 200)`
  10. Result is Response → passthrough
  11. Catch errors → 500

#### Tasks
1. Escrever testes RED (mock req/res)
2. Criar `execute.ts`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_parseBody_json() — Given JSON body, When parseBody, Then parsed object
RED:     test_parseBody_empty() — Given empty body, When parseBody, Then undefined
RED:     test_parseBody_malformed() — Given bad JSON, When parseBody, Then rejects
RED:     test_sendJson() — Given data+status, When sendJson, Then correct headers+body
RED:     test_sendError() — Given code+message, When sendError, Then structured error
RED:     test_execute_handler_called() — Given valid route, When executeRoute, Then handler called with query
RED:     test_execute_405() — Given undefined method, When executeRoute, Then 405
RED:     test_execute_zod_400() — Given invalid body vs schema, When executeRoute, Then 400 with issues
RED:     test_execute_200_json() — Given handler returns object, When executeRoute, Then 200 JSON
RED:     test_execute_custom_status() — Given config.status=201, When executeRoute, Then 201
RED:     test_execute_500() — Given handler throws, When executeRoute, Then 500
RED:     test_parseBody_wrong_content_type() — Given Content-Type: text/plain with body, When parseBody, Then error about content-type (EC-1)
RED:     test_execute_handler_returns_undefined() — Given handler returns undefined, When executeRoute, Then 204 No Content (EC-2)
RED:     test_execute_post_empty_body() — Given POST without body AND body schema, When executeRoute, Then 400 VALIDATION_ERROR (EC-5)
GREEN:   Implement all functions with content-type check and undefined handling
REFACTOR: Extract validation helper
VERIFY:  npx vitest run tests/unit/server-route-execute.test.ts
```

BDD scenarios:
- **Happy path**: Handler receives parsed data, returns object, 200 JSON
- **Validation error**: Invalid body → 400 with Zod issues
- **Edge case**: Custom status (201), handler returns Response passthrough
- **Error scenario**: Missing method → 405, handler throws → 500

#### Acceptance Criteria
- [ ] Body parsed for POST/PUT/PATCH
- [ ] Zod validation when schemas defined
- [ ] 400 with structured error on validation failure
- [ ] 405 for missing methods
- [ ] 500 for handler errors
- [ ] Custom status via config
- [ ] 11+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 2: API Middleware + Vite Plugin

**Objective:** Wire scanner + matcher + executor no Vite dev server.

### T2.1 — API middleware + Vite plugin enhancement

#### Objective
Connect middleware que intercepta `/api/*` e executa server routes.

#### Evidence
Vite `configureServer` documenta `server.middlewares.use()`. Frontend routes já não são afetadas.

#### Files to edit
```
packages/theo/src/vite-plugin/api-middleware.ts (NEW) — createApiMiddleware
packages/theo/src/vite-plugin/index.ts (EDIT) — add middleware no configureServer
tests/unit/api-middleware.test.ts (NEW) — 4+ tests
```

#### Deep file dependency analysis
- `api-middleware.ts`: Importa `scanServerRoutes`, `matchRoute`, `executeRoute`, `sendError`. Retorna Connect middleware.
- `index.ts`: Importa `createApiMiddleware`. Adiciona `server.middlewares.use()` no `configureServer` (antes do HMR watcher existente).
- Existing tests: `vite-plugin.test.ts` deve continuar passando.

#### Deep Dives
- **Middleware ordering**: `server.middlewares.use(fn)` dentro de `configureServer` roda ANTES do HTML fallback do Vite.
- **Re-scan on every request**: Aceitável em dev (HMR compat). Prod otimiza depois.
- **Non-API requests**: `next()` immediately se URL não começa com `/api/`.

#### Tasks
1. Escrever testes RED
2. Criar `api-middleware.ts`
3. Editar `vite-plugin/index.ts`
4. Verificar GREEN + zero regressão

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_passthrough_non_api() — Given req to '/', When middleware, Then next() called
RED:     test_intercept_api() — Given req to '/api/health', When middleware, Then handled (not next)
RED:     test_404_unmatched() — Given req to '/api/nonexistent', When middleware, Then 404 JSON
RED:     test_frontend_unaffected() — Given req to '/about', When middleware, Then next() called
GREEN:   Implement createApiMiddleware + wire in plugin
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/api-middleware.test.ts && pnpm test
```

BDD scenarios:
- **Happy path**: `/api/health` intercepted and handled
- **Validation error**: `/not-api` passes through to next()
- **Edge case**: `/api/nonexistent` → 404 JSON
- **Error scenario**: Route file crash → 500

#### Acceptance Criteria
- [ ] Non-API requests pass through
- [ ] API requests matched and executed
- [ ] 404 for unmatched API
- [ ] Existing tests unaffected
- [ ] 4+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm test` all existing tests pass
- [ ] `pnpm typecheck` passa

---

## Phase 3: defineRoute Evolution

**Objective:** Adicionar `status` field. Backward compat.

### T3.1 — Add `status` to RouteConfig

#### Objective
Adicionar `status?: number` ao `RouteConfig`.

#### Evidence
POST handlers comumente retornam 201. Sem `status`, user precisa `new Response()`.

#### Files to edit
```
packages/theo/src/server/define-route.ts (EDIT) — add status field
tests/unit/define-route.test.ts (EDIT) — add status test
```

#### Deep file dependency analysis
- `define-route.ts`: Adicionar campo opcional. Zero breaking change.
- Downstream: `execute.ts` (Phase 1) lê `config.status ?? 200`.

#### Tasks
1. Escrever teste RED
2. Adicionar `status?: number` ao `RouteConfig`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_status_preserved() — Given defineRoute({ status: 201, handler }), When result, Then result.status === 201
RED:     test_status_undefined() — Given defineRoute({ handler }), When result, Then result.status === undefined
RED:     test_existing_tests_pass() — Given all existing tests, When run, Then GREEN
RED:     test_status_backward_compat() — Given defineRoute without status, When calling, Then works (identity)
GREEN:   Add status field to RouteConfig
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/define-route.test.ts
```

BDD scenarios:
- **Happy path**: status: 201 preserved
- **Validation error**: N/A
- **Edge case**: status undefined (backward compat)
- **Error scenario**: Existing tests GREEN

#### Acceptance Criteria
- [ ] `status` aceito em RouteConfig
- [ ] Backward compat — existing tests GREEN
- [ ] `pnpm typecheck` passa

#### DoD
- [ ] Tests GREEN
- [ ] Zero breaking changes

---

## Phase 4: Fixture

**Objective:** `fixtures/server-routes-basic/` com 3 route files.

### T4.1 — server-routes-basic fixture

#### Objective
Criar fixture com health.ts, users.ts, users/[id].ts.

#### Evidence
5 testes obrigatórios dependem desta fixture.

#### Files to edit
```
fixtures/server-routes-basic/package.json (NEW)
fixtures/server-routes-basic/index.html (NEW)
fixtures/server-routes-basic/theo.config.ts (NEW)
fixtures/server-routes-basic/app/page.tsx (NEW)
fixtures/server-routes-basic/server/routes/health.ts (NEW)
fixtures/server-routes-basic/server/routes/users.ts (NEW)
fixtures/server-routes-basic/server/routes/users/[id].ts (NEW)
```

#### Deep file dependency analysis
- Route files importam `defineRoute` de `theo/server` e `z` de `zod`.
- `ssrLoadModule` precisa resolver estes imports — funciona via workspace.

#### Tasks
1. Criar todos os 7 files
2. Verificar `validateProjectStructure` passa

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_validates() — Given fixture dir, When validateProjectStructure, Then no throw
RED:     test_fixture_scans() — Given fixture, When scanServerRoutes, Then 3 routes found
RED:     test_health_route() — Given fixture scan, When check health, Then routePath='/api/health'
RED:     test_users_dynamic() — Given fixture scan, When check users/[id], Then paramNames=['id']
GREEN:   Create all fixture files
REFACTOR: None expected
VERIFY:  Run scan test on fixture
```

BDD scenarios:
- **Happy path**: 3 routes discovered correctly
- **Validation error**: N/A
- **Edge case**: Dynamic `[id]` param extracted
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] 7 files criados
- [ ] `validateProjectStructure` passa
- [ ] `scanServerRoutes` encontra 3 routes

#### DoD
- [ ] Fixture completa
- [ ] Scanner tests pass com fixture

---

## Phase 5: Integration Tests

**Objective:** 5 testes obrigatórios da Onda 3.

### T5.1 — onda3-mandatory.test.ts

#### Objective
HTTP tests que provam o pipeline end-to-end.

#### Evidence
ONDAS.md define 5 testes obrigatórios.

#### Files to edit
```
tests/integration/onda3-mandatory.test.ts (NEW) — 5 tests
```

#### Deep file dependency analysis
- Importa `startDevServer`. Pattern idêntico a onda1/onda2-mandatory.

#### Tasks
1. Escrever 5 testes
2. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_get_health() — Given fixture, When GET /api/health, Then 200 { ok: true }
RED:     test_post_valid() — Given fixture, When POST /api/users valid body, Then 201
RED:     test_post_invalid() — Given fixture, When POST /api/users invalid body, Then 400 VALIDATION_ERROR
RED:     test_params() — Given fixture, When GET /api/users/123, Then { id: '123' }
RED:     test_query() — Given fixture, When GET /api/users?search=paulo, Then { search: 'paulo' }
GREEN:   All tests pass after Phases 0-4 complete
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/onda3-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: GET health returns JSON 200
- **Validation error**: POST invalid → 400 with issues
- **Edge case**: Query string parsed
- **Error scenario**: Params extracted from URL

#### Acceptance Criteria
- [ ] 5/5 testes GREEN
- [ ] Existing 154+ unit tests GREEN
- [ ] Existing 13 E2E tests GREEN
- [ ] Backend funciona sem frontend

#### DoD
- [ ] `pnpm test` all green
- [ ] `pnpm test:e2e` all green
- [ ] `pnpm typecheck` passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: GET /api/health → { ok: true } | T5.1 | Integration test |
| 2 | Teste 2: POST valid → 201 | T5.1 | Integration test |
| 3 | Teste 3: POST invalid → 400 | T5.1 | Integration test |
| 4 | Teste 4: params.id from [id] | T5.1 | Integration test |
| 5 | Teste 5: query.search from ?search= | T5.1 | Integration test |
| 6 | Server route scanner | T0.2 | scanServerRoutes |
| 7 | Route matcher with params | T0.1 | compilePattern + matchRoute |
| 8 | Body parsing | T1.1 | parseBody |
| 9 | Zod validation runtime | T1.1 | executeRoute pipeline |
| 10 | Error response format | T1.1 | sendError |
| 11 | Status code control | T3.1 | defineRoute status field |
| 12 | API middleware | T2.1 | configureServer Connect middleware |
| 13 | Fixture server-routes-basic | T4.1 | 7 files |
| 14 | 405 Method Not Allowed | T1.1 | executeRoute |
| 15 | 404 for unmatched API | T2.1 | API middleware |

**Coverage: 15/15 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-5)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] 5 testes obrigatórios Onda 3 GREEN
- [ ] Backend funciona sem frontend (curl tests)
- [ ] Onda 0+1+2 tests still green
- [ ] Error responses follow `{ error: { code, message, issues } }` format

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
# Backend dogfood (sem browser)
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' -d '{"name":"Paulo","email":"paulo@test.com"}'
curl -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' -d '{"email":"bad"}'
curl http://localhost:3000/api/users/42
curl http://localhost:3000/api/users?search=theo
curl http://localhost:3000/api/nonexistent
curl -X DELETE http://localhost:3000/api/health

# Plus /dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] All 5 API routes respond correctly
- [ ] Validation errors structured
- [ ] 404/405 handled gracefully
- [ ] Frontend routing still works
- [ ] Zero CRITICAL issues
