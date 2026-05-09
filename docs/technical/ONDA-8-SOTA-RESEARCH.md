# Onda 8 — SOTA Research Consolidado

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Observability + Error Model — request ID, structured logs, error format, trace hooks

---

## 1. Sumário Executivo

Onda 8 adiciona observability mínima: (1) `requestId` auto-gerado e adicionado a TODA resposta HTTP via header `x-request-id`, (2) structured JSON logging por request (method, url, status, duration, requestId), (3) `requestId` incluído em error responses, (4) hook para tracing customizado, (5) stack traces suprimidos em produção. Impacto: modificar `executeRoute`, `executeAction`, e ambos middlewares.

---

## 2. Decisões Arquiteturais

### D1: requestId gerado pelo framework, não pelo user

**Decisão:** O framework gera `requestId = crypto.randomUUID()` automaticamente para TODA request API. O user não precisa criar `context.ts` para ter requestId.

**Justificativa:** Request ID é infra do framework, não responsabilidade do user. Rails faz assim (ActionDispatch::RequestId middleware).

**Implementação:** Gerar requestId nos API/Action middlewares ANTES de chamar executors. Passar via param, não via context.

### D2: Header `x-request-id` em TODA resposta API

**Decisão:** Todo response de API route/action inclui `x-request-id: <uuid>`.

**Implementação:** Setar header na response ANTES de chamar executor. Assim, mesmo em erro, o header está presente.

### D3: Error response inclui requestId

**Decisão:** Evoluir error format:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "requestId": "req_abc123",
    "issues": [...]
  }
}
```

**Implementação:** `sendError` aceita `requestId` opcional.

### D4: Structured logging via console.log JSON

**Decisão:** Cada request API/action emite um log JSON via `console.log` com: method, url, status, duration, requestId.

**Justificativa:** Sem dependency de logging library. `console.log` com JSON é capturado por qualquer log aggregator (Docker, Cloud Run, etc).

**Formato:**
```json
{"level":"info","method":"GET","url":"/api/health","status":200,"duration":5,"requestId":"abc-123","timestamp":"2026-05-09T10:00:00Z"}
```

### D5: Trace hook via callback (não OpenTelemetry)

**Decisão:** Hook simples: `onRequest(info)` callback configurável. Não exige OTel como dependency.

```typescript
// theo.config.ts (futuro)
export default defineConfig({
  onRequest: (info) => {
    // info: { method, url, status, duration, requestId }
    // User pode enviar para OTel, Datadog, etc
  },
})
```

**Para Onda 8 MVP:** O framework emite evento internamente. O hook é futuro. Na Onda 8, apenas o log JSON é emitido.

### D6: Stack trace suprimido em produção

**Decisão:** Em `sendError` com code `INTERNAL_ERROR`, a mensagem em produção é genérica: `"Internal server error"`. Stack trace é logado no server (console.error) mas NÃO enviado na response.

**Detecção de produção:** `process.env.NODE_ENV === 'production'`.

---

## 3. Componentes a Modificar

| Componente | Arquivo | Mudança |
|-----------|---------|---------|
| sendError | `execute.ts` | Adicionar `requestId` param, suprimir stack em prod |
| API middleware | `api-middleware.ts` | Gerar requestId, setar header, log request |
| Action middleware | `action-middleware.ts` | Gerar requestId, setar header, log request |
| Logger | `server/logger.ts` (NEW) | `logRequest()` helper — JSON structured log |
| Error model | `server/execute.ts` | requestId no error body |

### Novo arquivo: `server/logger.ts`

```typescript
export interface RequestLog {
  level: string
  method: string
  url: string
  status: number
  duration: number
  requestId: string
  timestamp: string
}

export function logRequest(log: RequestLog): void {
  console.log(JSON.stringify(log))
}
```

---

## 4. Testes Obrigatórios

### Teste 1 — Erro de validação
```typescript
it('validation error has predictable structure', async () => {
  const res = await fetch('/api/users', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
  const data = await res.json()
  expect(data.error.code).toBe('VALIDATION_ERROR')
  expect(data.error.requestId).toBeDefined()
  expect(data.error.issues).toBeDefined()
})
```

### Teste 2 — Erro inesperado não vaza stack
```typescript
it('500 error does not leak stack trace in production', async () => {
  // Route handler throws Error('secret info')
  // Response should say "Internal server error", not the actual message
})
```

### Teste 3 — Request ID em toda resposta
```typescript
it('every API response has x-request-id header', async () => {
  const res = await fetch('/api/health')
  expect(res.headers.get('x-request-id')).toBeDefined()
  expect(res.headers.get('x-request-id')!.length).toBeGreaterThan(0)
})
```

### Teste 4 — Log estruturado
```typescript
// Capture console.log output, verify JSON with method/url/status/requestId
```

### Teste 5 — Trace (requestId matches)
```typescript
it('requestId in header matches requestId in error body', async () => {
  const res = await fetch('/api/users', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
  const headerId = res.headers.get('x-request-id')
  const data = await res.json()
  expect(data.error.requestId).toBe(headerId)
})
```

---

## 5. Fora de Escopo

- ❌ OpenTelemetry SDK dependency
- ❌ Distributed tracing (spans)
- ❌ Custom logging library (pino, winston)
- ❌ Metrics collection (counters, histograms)
- ❌ Error reporting service (Sentry, etc)
- ❌ Log levels configuráveis

---

## 6. Fixtures

```
fixtures/observability/
├── server/
│   ├── routes/
│   │   ├── health.ts         # Simple GET
│   │   └── crash.ts          # Handler that throws
│   ├── middleware.ts          # Optional
│   └── context.ts            # Optional
├── app/page.tsx
├── index.html
├── theo.config.ts
└── package.json
```
