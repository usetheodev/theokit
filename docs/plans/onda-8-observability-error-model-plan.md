# Plan: Onda 8 — Observability + Error Model

> **Version 1.0** — Última onda do MVP. Adiciona: requestId auto-gerado em TODA response API (`x-request-id` header), requestId incluído no error body, structured JSON logging por request, stack trace suprimido em produção. Impacto: modificar `sendError`, ambos middlewares, criar `logger.ts`. Zero deps novas. Resultado: 5 testes obrigatórios passando, dev sabe qual request falhou, onde, e porquê.

## Context

Onda 0-7 completas. Error format é `{ error: { code, message, issues } }` — sem requestId. Nenhum logging estruturado. Stack traces vazam em 500 errors. Header `x-request-id` não existe nas respostas. 234 unit/integration + 13 E2E + 21 type tests passando.

## Objective

**Done =** Toda response API tem `x-request-id`, errors incluem requestId, logs JSON por request, stack suprimido em prod. 5 testes obrigatórios GREEN.

## ADRs

### D1 — requestId gerado pelo framework nos middlewares
**Decision:** API middleware e Action middleware geram `requestId = crypto.randomUUID()` e setam header `x-request-id` na response ANTES de chamar executor.
**Rationale:** Request ID é infra, não responsabilidade do user. Header setado antes = presente mesmo em erro.
**Consequences:** requestId passado como param extra para executors.

### D2 — Error body inclui requestId
**Decision:** `sendError` aceita `requestId` opcional. Se fornecido, incluído no body: `{ error: { code, message, requestId, issues } }`.
**Rationale:** Dev precisa correlacionar error response com server logs.
**Consequences:** Backward compat — requestId é opcional.

### D3 — Structured logging via console.log JSON
**Decision:** Cada request API/action emite `console.log(JSON.stringify({ level, method, url, status, duration, requestId, timestamp }))`.
**Rationale:** Sem dependency. JSON logs capturados por qualquer aggregator (Docker, CloudWatch, etc).
**Consequences:** Logs verbosos em dev (aceitável — pode filtrar).

### D4 — Stack trace suprimido em produção
**Decision:** `sendError` com `INTERNAL_ERROR` em produção retorna `"Internal server error"`. Stack logado via `console.error` no server.
**Rationale:** OWASP: nunca vazar stack traces para o client.
**Consequences:** `process.env.NODE_ENV === 'production'` como check.

## Dependency Graph

```
Phase 0 (Logger + sendError evolution)
    |
Phase 1 (Middleware requestId injection)
    |
Phase 2 (Fixture + Tests)
```

Tudo sequencial.

---

## Phase 0: Logger + sendError Evolution

**Objective:** Criar logger e evoluir sendError com requestId + stack suppression.

### T0.1 — Logger + sendError changes

#### Objective
Criar `logRequest()` helper e adicionar `requestId` param a `sendError`.

#### Evidence
Nenhum logging existe. Errors não têm requestId. Stack traces vazam em 500.

#### Files to edit
```
packages/theo/src/server/logger.ts (NEW) — logRequest helper
packages/theo/src/server/execute.ts (EDIT) — sendError accepts requestId, suppress stack in prod
```

#### Deep file dependency analysis
- `logger.ts`: NEW. Zero deps. Exporta `logRequest(info)` que faz `console.log(JSON.stringify(info))`.
- `execute.ts`: `sendError` ganha param `requestId?: string`. Se fornecido, incluído no error body. Em INTERNAL_ERROR + prod, message é genérica.
- Downstream: api-middleware.ts e action-middleware.ts chamam sendError com requestId (Phase 1).

#### Deep Dives
```typescript
// logger.ts
export function logRequest(info: {
  method: string; url: string; status: number;
  duration: number; requestId: string;
}): void {
  console.log(JSON.stringify({
    level: 'info', ...info, timestamp: new Date().toISOString(),
  }))
}
```

sendError evolution:
```typescript
export function sendError(
  res: ServerResponse, code: string, message: string,
  status: number, issues?: unknown[], requestId?: string,
): void {
  const errorMessage = code === 'INTERNAL_ERROR' && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : message
  sendJson(res, {
    error: { code, message: errorMessage, ...(requestId ? { requestId } : {}), ...(issues ? { issues } : {}) }
  }, status)
}
```

#### Tasks
1. Create `logger.ts`
2. Add `requestId` param to `sendError`
3. Add stack suppression for INTERNAL_ERROR in prod
4. Verify existing tests pass (requestId is optional = backward compat)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_logRequest_outputs_json() — Given logRequest call, When checking console.log, Then JSON with method/url/status/requestId
RED:     test_sendError_with_requestId() — Given sendError with requestId, When checking body, Then error.requestId present
RED:     test_sendError_without_requestId() — Given sendError without requestId, When checking body, Then no requestId field (backward compat)
RED:     test_sendError_suppresses_stack_prod() — Given NODE_ENV=production + INTERNAL_ERROR, When sendError, Then message is generic
RED:     test_sendError_shows_message_dev() — Given NODE_ENV=development + INTERNAL_ERROR, When sendError, Then real message shown
GREEN:   Implement logger.ts + sendError changes
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/logger.test.ts
```

BDD scenarios:
- **Happy path**: logRequest emits JSON, sendError includes requestId
- **Validation error**: N/A
- **Edge case**: sendError without requestId (backward compat)
- **Error scenario**: Stack suppressed in production

#### Acceptance Criteria
- [ ] `logRequest` emits structured JSON to console.log
- [ ] `sendError` includes requestId when provided
- [ ] `sendError` backward compat (requestId optional)
- [ ] Stack suppressed when NODE_ENV=production
- [ ] 5+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passa
- [ ] Existing 234 tests still GREEN

---

## Phase 1: Middleware requestId Injection

**Objective:** API + Action middlewares generate requestId, set header, log request.

### T1.1 — requestId in middlewares

#### Objective
Both API and Action middlewares: (1) generate requestId, (2) set `x-request-id` header, (3) pass requestId to executors, (4) log request after completion.

#### Evidence
No `x-request-id` header exists today. Teste obrigatório 3 requires it.

#### Files to edit
```
packages/theo/src/vite-plugin/api-middleware.ts (EDIT) — Add requestId + header + logging
packages/theo/src/vite-plugin/action-middleware.ts (EDIT) — Same
packages/theo/src/server/execute.ts (EDIT) — executeRoute accepts requestId for error forwarding
packages/theo/src/server/action-execute.ts (EDIT) — executeAction accepts requestId
packages/theo/src/cli/commands/start.ts (EDIT) — Production server: requestId + header + logging
```

#### Deep file dependency analysis
- `api-middleware.ts`: Generate requestId at top. Set `res.setHeader('x-request-id', requestId)`. Track start time. After executeRoute, call `logRequest`.
- `action-middleware.ts`: Same pattern.
- `execute.ts`: `executeRoute` gains `requestId` param. All `sendError` calls pass requestId.
- `action-execute.ts`: Same.
- `start.ts`: Production server does same requestId + header + log.

#### Deep Dives
In api-middleware.ts:
```typescript
return async (req, res, next) => {
  const url = req.url ?? ''
  if (!url.startsWith('/api/')) return next()
  
  const requestId = crypto.randomUUID()
  const start = Date.now()
  res.setHeader('x-request-id', requestId)
  
  // ... existing route matching + execution (pass requestId) ...
  
  logRequest({ method: req.method ?? 'GET', url, status: res.statusCode, duration: Date.now() - start, requestId })
}
```

#### Tasks
1. Add requestId generation + header + logging to api-middleware
2. Same for action-middleware
3. Add requestId param to executeRoute
4. Add requestId param to executeAction
5. Update production server (start.ts) with same pattern
6. Verify existing tests pass

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_api_has_request_id_header() — Given GET /api/health, When checking headers, Then x-request-id present
RED:     test_action_has_request_id_header() — Given POST action, When checking headers, Then x-request-id present
RED:     test_error_has_request_id_in_body() — Given POST invalid body, When checking error, Then error.requestId matches header
RED:     test_request_id_is_uuid() — Given any API request, When checking x-request-id, Then is valid UUID format
GREEN:   Implement requestId in middlewares
REFACTOR: Extract requestId generation to shared helper if needed
VERIFY:  npx vitest run tests/integration/onda8-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: x-request-id header on all responses
- **Validation error**: Error body includes requestId matching header
- **Edge case**: requestId is unique per request
- **Error scenario**: 500 error still has requestId

#### Acceptance Criteria
- [ ] `x-request-id` header on ALL API responses
- [ ] Error body includes requestId
- [ ] requestId matches between header and body
- [ ] Logging emits JSON per request
- [ ] Production server has same behavior

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm test` all green
- [ ] `pnpm typecheck` passes

---

## Phase 2: Fixture + Integration Tests

**Objective:** Fixture with crash route + 5 mandatory tests.

### T2.1 — Fixture + tests

#### Objective
Fixture with health route + crash route. 5 integration tests.

#### Files to edit
```
fixtures/observability/ (NEW) — Fixture with crash route
tests/integration/onda8-mandatory.test.ts (NEW) — 5+ tests
```

#### Deep file dependency analysis
- Fixture: `server/routes/health.ts` (GET → { ok: true }), `server/routes/crash.ts` (GET → throws Error).
- Tests: Start dev server, make requests, verify headers/body/logs.

#### Deep Dives
`crash.ts`:
```typescript
export const GET = defineRoute({
  handler: () => { throw new Error('Intentional crash for testing') },
})
```

#### Tasks
1. Create fixture with health + crash routes
2. Create 5+ integration tests
3. Verify all GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_validation_error_structure() — Given POST invalid, When check response, Then { error: { code, message, requestId, issues } }
RED:     test_500_no_stack_leak() — Given crash route + NODE_ENV=production, When GET /api/crash, Then message is generic
RED:     test_request_id_header() — Given GET /api/health, When check headers, Then x-request-id is UUID
RED:     test_request_id_matches_error() — Given error response, When check, Then header requestId === body requestId
RED:     test_crash_still_has_request_id() — Given 500 error, When check, Then x-request-id header present
GREEN:   All tests pass after Phases 0-1
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/onda8-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: Request ID on success response
- **Validation error**: Structured error with requestId
- **Edge case**: 500 error still has requestId header
- **Error scenario**: Stack suppressed in production

#### Acceptance Criteria
- [ ] 5/5 mandatory tests GREEN
- [ ] Existing 234+ tests GREEN
- [ ] Existing 13 E2E GREEN

#### DoD
- [ ] `pnpm test` all green
- [ ] `pnpm test:e2e` all green
- [ ] `pnpm typecheck` passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: Erro validação → estrutura previsível | T2.1 | Integration test |
| 2 | Teste 2: Erro inesperado → sem stack trace | T2.1 | Stack suppression test |
| 3 | Teste 3: x-request-id em toda resposta | T2.1 | Header test |
| 4 | Teste 4: Log estruturado | T0.1 | logRequest JSON test |
| 5 | Teste 5: requestId matches | T2.1 | Header/body correlation |
| 6 | requestId auto-gerado | T1.1 | crypto.randomUUID in middlewares |
| 7 | Error body com requestId | T0.1 | sendError evolution |
| 8 | Stack suppression prod | T0.1 | NODE_ENV check |
| 9 | Logger helper | T0.1 | logRequest function |
| 10 | Production server observability | T1.1 | start.ts update |

**Coverage: 10/10 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-2)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors
- [ ] Zero `any` in production code
- [ ] 5 testes obrigatórios Onda 8 GREEN
- [ ] x-request-id on ALL API responses
- [ ] Error body includes requestId
- [ ] Structured JSON logging per request
- [ ] Stack traces suppressed in production
- [ ] Onda 0-7 tests still green
- [ ] **THIS COMPLETES THE MVP**

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
# Observability dogfood
curl -sI http://localhost:3000/api/health | grep x-request-id
curl -s http://localhost:3000/api/crash  # Should have requestId, no stack

# Plus /dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] x-request-id present on all API responses
- [ ] Error responses include requestId
- [ ] Zero CRITICAL issues
- [ ] **MVP COMPLETE — All 8 ondas delivered**
