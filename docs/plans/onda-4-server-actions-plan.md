# Plan: Onda 4 — Server Actions

> **Version 1.0** — Este plano transforma `defineAction()` em runtime handler executável. Actions viram endpoints REST `POST /api/__actions/{file}/{export}` com CSRF protection (origin + custom header), Zod input validation obrigatória, e reutilização de 80% da infra da Onda 3. Resultado: 5 testes obrigatórios passando (input válido, inválido→400, CSRF→403, 404, 405).

## Context

Onda 0+1+2+3 completas. `defineAction` é identity function. Server routes funcionam (`/api/*` via Onda 3). Infra reutilizável: `parseBody`, `sendJson`, `sendError`, `ssrLoadModule`. 182 unit/integration + 13 E2E tests passando.

## Objective

**Done =** `POST /api/__actions/create-user/createUser` com input válido retorna resultado, input inválido retorna 400, sem CSRF header retorna 403. 5 testes obrigatórios GREEN.

## ADRs

### D1 — Actions como REST endpoints `/api/__actions/{file}/{export}`
**Decision:** Cada export de action vira endpoint POST. URL inclui file path + export name.
**Rationale:** Reutiliza infra de routes. Debuggável com curl. Sem compiler magic.
**Consequences:** URL longa mas explícita. Typed client (futuro) encapsula.

### D2 — CSRF: origin checking + custom header `X-Theo-Action: 1`
**Decision:** Double defense. Custom header previne simple request. Origin matching previne cross-site.
**Rationale:** OWASP recomenda custom headers como defense. Next.js usa origin matching. Theo combina os dois.
**Consequences:** Frontend precisa enviar header. `fetch()` com custom header = non-simple request = CORS preflight.

### D3 — Action middleware antes de API middleware
**Decision:** Registrar action middleware (`/api/__actions/`) antes do API middleware (`/api/`).
**Rationale:** Connect processa em ordem. Action middleware é mais específico. Sem conflito.
**Consequences:** Ordem de `server.middlewares.use()` no plugin importa.

### D4 — CSRF check no executor, não no middleware
**Decision:** Middleware faz routing (URL parsing). Executor faz segurança (CSRF) + execução.
**Rationale:** Separation of concerns. Segurança perto do handler.
**Consequences:** Middleware é thin (~25 linhas).

## Dependency Graph

```
Phase 0 (Scanner + CSRF validator)
    |
Phase 1 (Action Executor)
    |
Phase 2 (Action Middleware + Vite Plugin)
    |
Phase 3 (Fixture)
    |
Phase 4 (Integration Tests)
```

Tudo sequencial — cada fase depende da anterior.

---

## Phase 0: Action Scanner + CSRF Validator

**Objective:** Pure functions para scan de `server/actions/` e validação CSRF.

### T0.1 — Action Scanner + CSRF Validator

#### Objective
Scan `server/actions/` → `ActionNode[]`. Validate CSRF via origin + custom header.

#### Evidence
Server route scanner (`scan.ts`) já existe. Action scanner é simplificação — sem URL pattern.

#### Files to edit
```
packages/theo/src/server/action-scan.ts (NEW) — scanServerActions, ActionNode
packages/theo/src/server/csrf.ts (NEW) — validateCsrf
tests/unit/server-action-scan.test.ts (NEW) — 4+ tests
tests/unit/csrf.test.ts (NEW) — 4+ tests
```

#### Deep file dependency analysis
- `action-scan.ts`: Importa `node:fs`, `node:path`. Pattern idêntico a `scan.ts` mas sem `compilePattern`.
- `csrf.ts`: Importa `node:http` types. Pure function sem deps externas.
- Downstream: `action-execute.ts` usa `validateCsrf`. `action-middleware.ts` usa `scanServerActions`.

#### Deep Dives
```typescript
interface ActionNode {
  filePath: string    // absolute path
  actionPath: string  // 'create-user' ou 'users/invite'
}

function validateCsrf(req: IncomingMessage): { valid: true } | { valid: false; reason: string }
```

- Origin absent = same-origin (browsers omit for same-origin)
- `X-Theo-Action: 1` obrigatório — custom header previne simple request

#### Tasks
1. Escrever testes RED para scanner e CSRF
2. Criar `action-scan.ts` e `csrf.ts`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_scan_action() — Given server/actions/create-user.ts, When scan, Then actionPath='create-user'
RED:     test_scan_nested() — Given server/actions/users/invite.ts, When scan, Then actionPath='users/invite'
RED:     test_scan_empty() — Given empty dir, When scan, Then []
RED:     test_scan_nonexistent() — Given nonexistent dir, When scan, Then []
RED:     test_csrf_no_header() — Given req without X-Theo-Action, When validateCsrf, Then { valid: false }
RED:     test_csrf_valid() — Given req with X-Theo-Action + matching origin, When validate, Then { valid: true }
RED:     test_csrf_bad_origin() — Given req with X-Theo-Action + foreign origin, When validate, Then { valid: false }
RED:     test_csrf_no_origin() — Given req with X-Theo-Action but no Origin (same-origin), When validate, Then { valid: true }
GREEN:   Implement scanServerActions and validateCsrf
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/server-action-scan.test.ts tests/unit/csrf.test.ts
```

BDD scenarios:
- **Happy path**: Scan finds action, CSRF passes with correct headers
- **Validation error**: Missing CSRF header → invalid
- **Edge case**: No Origin header (same-origin) → valid
- **Error scenario**: Foreign origin → invalid

#### Acceptance Criteria
- [ ] `scanServerActions` returns correct `ActionNode[]`
- [ ] `validateCsrf` validates origin + custom header
- [ ] Missing Origin treated as same-origin
- [ ] 8+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 1: Action Executor

**Objective:** Pipeline: CSRF check → load module → find export → validate input → call handler → serialize.

### T1.1 — executeAction

#### Objective
Reutiliza `parseBody`, `sendJson`, `sendError` da Onda 3. Adiciona CSRF check e Zod input validation.

#### Evidence
`executeRoute` já demonstra o pattern. Action executor é similar mas mais simples (sem query/params, sempre POST).

#### Files to edit
```
packages/theo/src/server/action-execute.ts (NEW) — executeAction
tests/unit/server-action-execute.test.ts (NEW) — 6+ tests
```

#### Deep file dependency analysis
- `action-execute.ts`: Importa `validateCsrf` de `csrf.ts`, `parseBody`/`sendJson`/`sendError` de `execute.ts`. Usa `ViteDevServer.ssrLoadModule`.
- Downstream: `action-middleware.ts` chama `executeAction`.

#### Deep Dives
Pipeline:
1. Check method POST → else 405
2. `validateCsrf(req)` → else 403
3. `vite.ssrLoadModule(filePath)` → module
4. `mod[exportName]` → ActionConfig (has `.input` + `.handler`) → else 404
5. `parseBody(req)` → JSON input
6. `actionConfig.input.safeParse(body)` → else 400
7. `actionConfig.handler({ input })` → result
8. `sendJson(res, result, 200)`
9. Catch → 500

#### Tasks
1. Escrever testes RED
2. Criar `action-execute.ts`
3. Verificar GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_valid_action() — Given valid POST + CSRF + input, When executeAction, Then 200 with handler result
RED:     test_get_rejected() — Given GET, When executeAction, Then 405
RED:     test_csrf_rejected() — Given POST without X-Theo-Action, When executeAction, Then 403
RED:     test_invalid_input() — Given POST with bad input, When executeAction, Then 400 VALIDATION_ERROR
RED:     test_nonexistent_export() — Given wrong exportName, When executeAction, Then 404
RED:     test_handler_throws() — Given handler that throws, When executeAction, Then 500
RED:     test_non_action_export() — Given export without .input/.handler, When executeAction, Then 404 (EC-2)
RED:     test_empty_body() — Given POST with no body AND input schema, When executeAction, Then 400 VALIDATION_ERROR (EC-4)
GREEN:   Implement executeAction with non-ActionConfig check
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/server-action-execute.test.ts
```

BDD scenarios:
- **Happy path**: Valid POST → 200 with result
- **Validation error**: Bad input → 400 with Zod issues
- **Edge case**: GET → 405
- **Error scenario**: No CSRF → 403, handler throws → 500

#### Acceptance Criteria
- [ ] CSRF validated before execution
- [ ] Zod input validation with structured errors
- [ ] Only POST accepted
- [ ] 6+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 2: Action Middleware + Vite Plugin

**Objective:** Wire action executor into Vite dev server.

### T2.1 — Action middleware + Vite plugin enhancement

#### Objective
Connect middleware para `/api/__actions/`. Register before API middleware.

#### Evidence
API middleware (`api-middleware.ts`) já funciona. Action middleware é o mesmo pattern.

#### Files to edit
```
packages/theo/src/vite-plugin/action-middleware.ts (NEW) — createActionMiddleware
packages/theo/src/vite-plugin/index.ts (EDIT) — add action middleware before API middleware
tests/unit/action-middleware.test.ts (NEW) — 4+ tests
```

#### Deep file dependency analysis
- `action-middleware.ts`: Importa `scanServerActions`, `executeAction`, `sendError`.
- `index.ts`: Add import + `server.middlewares.use()` BEFORE existing API middleware.

#### Deep Dives
URL parsing: `/api/__actions/create-user/createUser` → actionPath=`create-user`, exportName=`createUser`
- Strip prefix `/api/__actions/`
- Last segment = exportName
- Rest = actionPath
- Lookup in scanned actions

#### Tasks
1. Escrever testes RED
2. Criar `action-middleware.ts`
3. Editar `index.ts` — add middleware BEFORE api middleware
4. Verificar GREEN + zero regressão

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_passthrough_non_action() — Given '/api/health', When middleware, Then next() called
RED:     test_parse_url() — Given '/api/__actions/create-user/createUser', When middleware, Then correct actionPath+exportName
RED:     test_404_unknown() — Given '/api/__actions/nonexistent/foo', When middleware, Then 404
RED:     test_delegates_to_executor() — Given valid action URL, When middleware, Then executeAction called
RED:     test_malformed_url() — Given '/api/__actions/create-user' (no export name), When middleware, Then 400 BAD_REQUEST (EC-1)
GREEN:   Implement createActionMiddleware with URL validation + wire in plugin
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/action-middleware.test.ts && pnpm test
```

BDD scenarios:
- **Happy path**: Action URL routed to executor
- **Validation error**: Non-action URL passes through
- **Edge case**: Nested action path parsed correctly
- **Error scenario**: Unknown action → 404

#### Acceptance Criteria
- [ ] Non-action URLs pass through to next()
- [ ] Action URLs parsed and delegated
- [ ] Action middleware before API middleware
- [ ] Existing tests unaffected
- [ ] 4+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm test` all existing tests pass

---

## Phase 3: Fixture

**Objective:** `fixtures/server-actions-basic/` com action file.

### T3.1 — server-actions-basic fixture

#### Objective
Fixture com `create-user.ts` action usando defineAction + Zod.

#### Files to edit
```
fixtures/server-actions-basic/package.json (NEW)
fixtures/server-actions-basic/index.html (NEW)
fixtures/server-actions-basic/theo.config.ts (NEW)
fixtures/server-actions-basic/app/page.tsx (NEW)
fixtures/server-actions-basic/server/actions/create-user.ts (NEW)
```

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_validates() — Given fixture dir, When validateProjectStructure, Then no throw
RED:     test_fixture_scans() — Given fixture, When scanServerActions, Then 1 action found
GREEN:   Create all fixture files
REFACTOR: None expected
VERIFY:  Validate fixture exists
```

BDD scenarios:
- **Happy path**: Fixture passes validation, scan finds action
- **Validation error**: N/A
- **Edge case**: Action uses Zod schema
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] 5 files criados
- [ ] `validateProjectStructure` passa
- [ ] `scanServerActions` encontra 1 action

#### DoD
- [ ] Fixture completa

---

## Phase 4: Integration Tests

**Objective:** 5 testes obrigatórios da Onda 4.

### T4.1 — onda4-mandatory.test.ts

#### Objective
HTTP tests end-to-end com dev server real.

#### Files to edit
```
tests/integration/onda4-mandatory.test.ts (NEW) — 5+ tests
```

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_valid_action() — Given valid POST + CSRF + input, When call action, Then 200 with data
RED:     test_invalid_input() — Given bad input, When call action, Then 400 VALIDATION_ERROR
RED:     test_no_csrf() — Given POST without X-Theo-Action, When call, Then 403
RED:     test_nonexistent() — Given unknown action, When call, Then 404
RED:     test_get_rejected() — Given GET on action, When call, Then 405
GREEN:   All tests pass after Phases 0-3 complete
VERIFY:  npx vitest run tests/integration/onda4-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: Valid action call → 200
- **Validation error**: Bad input → 400
- **Edge case**: Missing CSRF → 403
- **Error scenario**: Nonexistent → 404, GET → 405

#### Acceptance Criteria
- [ ] 5/5 testes GREEN
- [ ] Existing 182+ tests GREEN
- [ ] Existing 13 E2E GREEN

#### DoD
- [ ] `pnpm test` all green
- [ ] `pnpm test:e2e` all green
- [ ] `pnpm typecheck` passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: Action válida → output | T4.1 | Integration test |
| 2 | Teste 2: Input inválido → 400 | T4.1 | Integration test |
| 3 | Teste 3: CSRF → 403 | T4.1 | Integration test |
| 4 | Teste 4: Action inexistente → 404 | T4.1 | Integration test |
| 5 | Teste 5: GET → 405 | T4.1 | Integration test |
| 6 | Action scanner | T0.1 | scanServerActions |
| 7 | CSRF validator | T0.1 | validateCsrf |
| 8 | Action executor | T1.1 | executeAction pipeline |
| 9 | Action middleware | T2.1 | Connect middleware |
| 10 | Fixture | T3.1 | server-actions-basic |

**Coverage: 10/10 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-4)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] 5 testes obrigatórios Onda 4 GREEN
- [ ] CSRF protection funciona
- [ ] Onda 0+1+2+3 tests still green

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
# Backend dogfood
curl -X POST http://localhost:3000/api/__actions/create-user/createUser \
  -H 'Content-Type: application/json' \
  -H 'X-Theo-Action: 1' \
  -d '{"name":"Paulo","email":"paulo@test.com"}'

# CSRF test
curl -X POST http://localhost:3000/api/__actions/create-user/createUser \
  -H 'Content-Type: application/json' \
  -d '{"name":"Paulo","email":"paulo@test.com"}'

# Plus /dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Actions respond correctly with CSRF headers
- [ ] Validation errors structured
- [ ] 403/404/405 handled
- [ ] Zero CRITICAL issues
