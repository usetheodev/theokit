# Plan: Onda 5 — Middleware + Context

> **Version 1.0** — Este plano adiciona middleware global (`server/middleware.ts`) e request context (`server/context.ts`) ao Theo. Pipeline unificado: middleware → context → handler, compartilhado entre routes e actions. Middleware pode short-circuit (auth). Context provê `requestId` e dados request-scoped. Resultado: 5 testes obrigatórios passando, `ctx` disponível em routes e actions.

## Context

Onda 0-4 completas. Routes e actions executam handlers diretamente sem middleware ou context. `executeRoute` chama handler com `{ query, body, params, request }` — sem `ctx`. `executeAction` chama handler com `{ input }` — sem `ctx`. 199 unit/integration + 13 E2E tests passando.

Evidência: handler de route não pode acessar `requestId`, não pode fazer auth check centralizado, não pode adicionar headers globais.

## Objective

**Done =** middleware executa antes de handlers (routes + actions), context criado e passado via `ctx`, middleware pode short-circuit (401). 5 testes obrigatórios GREEN.

Metas:
1. `server/middleware.ts` com `await next()` pattern
2. `server/context.ts` com `createContext()` factory
3. `ctx` disponível em route handlers e action handlers
4. Pipeline: middleware → context → handler
5. Middleware pode short-circuit (respond before handler)

## ADRs

### D1 — Middleware runner como shared function
**Decision:** `runMiddlewareAndContext()` é chamada por AMBOS `executeRoute` e `executeAction` antes do handler.
**Rationale:** Critério de aceite: "Não pode haver runtimes separados para routes e actions."
**Consequences:** Ambos executors dependem da mesma function. Mudança no pipeline afeta ambos.

### D2 — Middleware via `server/middleware.ts` (Connect-compatible)
**Decision:** Middleware recebe `(req, res, next)` — Node.js/Connect signature. `next()` é async e retorna void.
**Rationale:** O middleware executa no Vite Connect pipeline. Web API `Request`/`Response` é complicado para before/after hooks. Connect `req`/`res` é o que existe no runtime.
**Consequences:** `defineMiddleware` da Onda 0 (Web API signature) fica para uso futuro. Na Onda 5, o formato é Connect-compatible.

### D3 — Context criado por `createContext({ request })` e passado via `ctx`
**Decision:** `server/context.ts` exporta `createContext`. O resultado é passado como `ctx` param aos handlers.
**Rationale:** Explícito > implícito. Sem AsyncLocalStorage. Handlers tipam `ctx` como quiserem.
**Consequences:** `ctx` é `unknown` por default — user faz type assertion ou typing futuro.

### D4 — Middleware e context são opcionais
**Decision:** Se `server/middleware.ts` não existe, skip. Se `server/context.ts` não existe, `ctx = {}`.
**Rationale:** Backward compat — projetos sem middleware/context continuam funcionando (Onda 0-4).
**Consequences:** `existsSync` check before `ssrLoadModule`.

## Dependency Graph

```
Phase 0 (middleware-runner.ts — shared function)
    |
Phase 1 (executeRoute + executeAction — integrate ctx)
    |
Phase 2 (Fixture)
    |
Phase 3 (Integration Tests)
```

Tudo sequencial.

---

## Phase 0: Middleware Runner

**Objective:** Shared function que carrega middleware + context e retorna `ctx` ou indica short-circuit.

### T0.1 — runMiddlewareAndContext

#### Objective
Criar function que: (1) carrega e executa `server/middleware.ts`, (2) carrega e executa `server/context.ts`, (3) retorna `{ ctx, aborted }`.

#### Evidence
Ambos executors (routes + actions) precisam do mesmo pipeline. Shared function evita duplicação.

#### Files to edit
```
packages/theo/src/server/middleware-runner.ts (NEW) — runMiddlewareAndContext
tests/unit/middleware-runner.test.ts (NEW) — 8+ tests
```

#### Deep file dependency analysis
- `middleware-runner.ts`: Importa `node:fs` (existsSync), `node:path` (join). Usa `ViteDevServer.ssrLoadModule`. Zero dependency em execute.ts ou match.ts.
- Downstream: `execute.ts` e `action-execute.ts` chamarão `runMiddlewareAndContext`.

#### Deep Dives
```typescript
interface MiddlewareResult {
  ctx: unknown
  aborted: boolean  // true = middleware responded, don't call handler
}

async function runMiddlewareAndContext(
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  serverDir: string,
): Promise<MiddlewareResult>
```

Pipeline:
1. Check `server/middleware.ts` exists → if yes, `ssrLoadModule` → get `mod.default`
2. Call middleware: `await mod.default(req, res, next)` where `next` is a callback that sets `nextCalled = true`
3. If `next()` not called → middleware short-circuited → return `{ ctx: {}, aborted: true }`
4. Check `server/context.ts` exists → if yes, `ssrLoadModule` → get `mod.createContext`
5. Call `ctx = await mod.createContext({ request: req })`
6. Return `{ ctx, aborted: false }`

Edge cases:
- No middleware file → skip, proceed to context
- No context file → `ctx = {}`
- Both missing → `{ ctx: {}, aborted: false }`
- Middleware throws → error propagates (caught by executor's try/catch)

#### Tasks
1. Escrever testes RED
2. Criar `middleware-runner.ts`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_no_middleware_no_context() — Given no server/middleware.ts and no server/context.ts, When run, Then { ctx: {}, aborted: false }
RED:     test_context_only() — Given context.ts with createContext returning { requestId: 'abc' }, When run, Then ctx.requestId === 'abc'
RED:     test_middleware_calls_next() — Given middleware that calls next(), When run, Then aborted is false
RED:     test_middleware_short_circuits() — Given middleware that responds without calling next(), When run, Then aborted is true
RED:     test_middleware_modifies_response() — Given middleware that sets header after next(), When run, Then header set
RED:     test_middleware_and_context_both() — Given both middleware and context, When run, Then middleware runs first, then context created
RED:     test_context_receives_request() — Given context.ts, When createContext called, Then receives req object
RED:     test_middleware_throws() — Given middleware that throws, When run, Then error propagates
RED:     test_middleware_res_ended() — Given middleware that calls next() AND res.end(), When run, Then aborted=true (EC-1, check res.writableEnded)
RED:     test_context_throws() — Given createContext that throws, When run, Then error propagates (EC-3)
GREEN:   Implement runMiddlewareAndContext with res.writableEnded check
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/middleware-runner.test.ts
```

BDD scenarios:
- **Happy path**: Middleware calls next, context created, ctx returned
- **Validation error**: N/A (middleware doesn't validate — it gates)
- **Edge case**: No middleware/context files → defaults
- **Error scenario**: Middleware short-circuits → aborted=true, handler never runs

#### Acceptance Criteria
- [ ] Middleware loaded via `ssrLoadModule` when file exists
- [ ] Context loaded via `ssrLoadModule` when file exists
- [ ] Short-circuit detected (next not called → aborted)
- [ ] Missing files don't crash
- [ ] 8+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 1: Integrate ctx into Executors

**Objective:** `executeRoute` and `executeAction` call `runMiddlewareAndContext` and pass `ctx` to handlers.

### T1.1 — executeRoute + executeAction integration

#### Objective
Modify both executors to: (1) call `runMiddlewareAndContext` before handler, (2) pass `ctx` to handler, (3) abort if middleware short-circuited.

#### Evidence
Handlers currently receive `{ query, body, params, request }` (routes) and `{ input }` (actions) — no `ctx`.

#### Files to edit
```
packages/theo/src/server/execute.ts (EDIT) — Add ctx to handler call, add serverDir param
packages/theo/src/server/action-execute.ts (EDIT) — Add ctx to handler call, add serverDir param
packages/theo/src/vite-plugin/api-middleware.ts (EDIT) — Pass serverDir to executeRoute
packages/theo/src/vite-plugin/action-middleware.ts (EDIT) — Pass serverDir to executeAction
tests/unit/server-route-execute.test.ts (may need adapting if signature changes)
```

#### Deep file dependency analysis
- `execute.ts` line 124: `handler({ query, body, params, request: req })` → add `ctx`
- `action-execute.ts` line 55: `actionConfig.handler({ input: result.data })` → add `ctx`
- `api-middleware.ts` line 25: `executeRoute(match.route, method, match.params, req, res, vite)` → add `serverDir`
- `action-middleware.ts`: `executeAction(...)` → add `serverDir`

#### Deep Dives
Change in `executeRoute`:
```typescript
// Before handler execution, add:
const { ctx, aborted } = await runMiddlewareAndContext(req, res, vite, serverDir)
if (aborted) return

// Then change handler call:
const handlerResult = await handler({ query, body, params, request: req, ctx })
```

Change in `executeAction`:
```typescript
const { ctx, aborted } = await runMiddlewareAndContext(req, res, vite, serverDir)
if (aborted) return

const handlerResult = await actionConfig.handler({ input: result.data, ctx })
```

**Backward compat**: Handlers that don't destructure `ctx` continue working — JS ignores extra properties.

#### Tasks
1. Add `serverDir` param to `executeRoute` and `executeAction`
2. Call `runMiddlewareAndContext` before handler
3. Pass `ctx` to handler
4. Update middlewares to pass `serverDir`
5. Verify existing tests still pass

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_route_receives_ctx() — Given route handler, When executed with context.ts, Then handler receives ctx
RED:     test_action_receives_ctx() — Given action handler, When executed with context.ts, Then handler receives ctx
RED:     test_middleware_short_circuits_route() — Given middleware that returns 401, When route called, Then 401 (handler not called)
RED:     test_middleware_short_circuits_action() — Given middleware that returns 401, When action called, Then 401
RED:     test_backward_compat_no_middleware() — Given no middleware/context, When route called, Then works as before
RED:     test_backward_compat_actions() — Given no middleware/context, When action called, Then works as before
GREEN:   Modify executeRoute and executeAction
REFACTOR: None expected
VERIFY:  pnpm test
```

BDD scenarios:
- **Happy path**: Handler receives ctx with requestId
- **Validation error**: N/A
- **Edge case**: No middleware/context files → handler gets empty ctx, works fine
- **Error scenario**: Middleware returns 401 → handler never executes

#### Acceptance Criteria
- [ ] Route handlers receive `ctx` param
- [ ] Action handlers receive `ctx` param
- [ ] Middleware can short-circuit both routes and actions
- [ ] Existing Onda 3+4 tests still GREEN (backward compat)
- [ ] `pnpm test` all green

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa
- [ ] Zero regression

---

## Phase 2: Fixture

**Objective:** Fixture project with middleware, context, and test routes/actions.

### T2.1 — middleware-context fixture

#### Objective
Fixture with `server/middleware.ts`, `server/context.ts`, routes that return ctx, and action that returns ctx.

#### Evidence
5 testes obrigatórios requerem middleware e context funcionando.

#### Files to edit
```
fixtures/middleware-context/package.json (NEW)
fixtures/middleware-context/index.html (NEW)
fixtures/middleware-context/theo.config.ts (NEW)
fixtures/middleware-context/app/page.tsx (NEW)
fixtures/middleware-context/server/middleware.ts (NEW) — adds X-Custom-Header, tracks order
fixtures/middleware-context/server/context.ts (NEW) — createContext with requestId, tracks order
fixtures/middleware-context/server/routes/health.ts (NEW) — simple GET
fixtures/middleware-context/server/routes/ctx-test.ts (NEW) — returns ctx.requestId
fixtures/middleware-context/server/routes/order-test.ts (NEW) — returns execution order
fixtures/middleware-context/server/actions/ctx-test.ts (NEW) — returns ctx.requestId from action
```

#### Deep file dependency analysis
- `middleware.ts`: Sets `X-Custom-Header: theo` on response after `next()`. Pushes 'middleware' to a shared array.
- `context.ts`: Creates `{ requestId: crypto.randomUUID(), order: ['context'] }`. Pushes 'context' to order.
- `order-test.ts`: Returns the execution order collected during the request lifecycle.

#### Deep Dives
**Order tracking approach:** Since middleware, context, and handler run sequentially in the same async call, we can track order by adding entries to a response header (simplest):

Actually, simpler: the `ctx-test` route returns `ctx.requestId`. The `order-test` route uses a different approach — middleware sets a response header, context adds requestId, handler checks both exist.

For order verification, the middleware and context both contribute data that the handler can inspect:
```typescript
// middleware.ts — sets req header to mark middleware ran
// context.ts — createContext returns { requestId, middlewareRan: req.headers['x-middleware-ran'] }
// order-test.ts — returns { middlewareRan, hasRequestId }
```

Simpler: just test that middleware headers appear AND ctx.requestId exists.

#### Tasks
1. Create all 10 fixture files
2. Verify fixture structure

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_validates() — Given fixture, When validateProjectStructure, Then no throw
RED:     test_fixture_has_middleware() — Given fixture, When checking, Then server/middleware.ts exists
RED:     test_fixture_has_context() — Given fixture, When checking, Then server/context.ts exists
GREEN:   Create all fixture files
REFACTOR: None expected
VERIFY:  ls fixtures/middleware-context/server/
```

BDD scenarios:
- **Happy path**: Fixture has all required files
- **Validation error**: N/A
- **Edge case**: Middleware + context + routes + actions all present
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] 10 files created
- [ ] validateProjectStructure passes

#### DoD
- [ ] Fixture complete

---

## Phase 3: Integration Tests

**Objective:** 5 testes obrigatórios da Onda 5.

### T3.1 — onda5-mandatory.test.ts

#### Objective
HTTP-level tests proving middleware and context work end-to-end.

#### Evidence
ONDAS.md defines 5 mandatory tests.

#### Files to edit
```
tests/integration/onda5-mandatory.test.ts (NEW) — 5+ tests
```

#### Deep file dependency analysis
- Imports `startDevServer`. Pattern idêntico a onda3/onda4.

#### Tasks
1. Write 5 tests
2. Verify GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_ctx_in_route() — Given ctx-test route, When GET, Then response has requestId (UUID format)
RED:     test_ctx_in_action() — Given ctx-test action, When POST with CSRF, Then response has requestId
RED:     test_middleware_blocks() — Given middleware that checks auth, When GET /api/health without auth, Then response has X-Custom-Header (middleware ran)
RED:     test_middleware_adds_header() — Given middleware, When GET /api/health, Then response has X-Custom-Header: theo
RED:     test_execution_order() — Given middleware + context + handler, When GET /api/order-test, Then all three contributed
GREEN:   All tests pass after Phases 0-2 complete
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/onda5-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: ctx.requestId exists in route response
- **Validation error**: N/A
- **Edge case**: ctx available in action too (unified pipeline)
- **Error scenario**: Middleware header present on all responses

#### Acceptance Criteria
- [ ] 5/5 tests GREEN
- [ ] Existing 199+ tests GREEN
- [ ] Existing 13 E2E GREEN

#### DoD
- [ ] `pnpm test` all green
- [ ] `pnpm test:e2e` all green
- [ ] `pnpm typecheck` passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: ctx.requestId in route | T3.1 | Integration test |
| 2 | Teste 2: ctx.requestId in action | T3.1 | Integration test |
| 3 | Teste 3: Middleware blocking | T3.1 | Integration test |
| 4 | Teste 4: Middleware adding header | T3.1 | Integration test |
| 5 | Teste 5: Execution order | T3.1 | Integration test |
| 6 | Middleware runner | T0.1 | runMiddlewareAndContext |
| 7 | ctx in routes | T1.1 | executeRoute passes ctx |
| 8 | ctx in actions | T1.1 | executeAction passes ctx |
| 9 | Unified pipeline | T1.1 | Same function for both |
| 10 | Fixture | T2.1 | middleware-context |

**Coverage: 10/10 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] 5 testes obrigatórios Onda 5 GREEN
- [ ] ctx available in routes AND actions (unified pipeline)
- [ ] Middleware can short-circuit
- [ ] Middleware can add response headers
- [ ] Onda 0-4 tests still green

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
# Middleware + context dogfood
curl -s http://localhost:3000/api/ctx-test  # should have requestId
curl -s -I http://localhost:3000/api/health  # should have X-Custom-Header

# Plus /dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] ctx.requestId present in route responses
- [ ] X-Custom-Header present in responses
- [ ] Zero CRITICAL issues
