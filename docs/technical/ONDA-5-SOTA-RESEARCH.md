# Onda 5 — SOTA Research Consolidado

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Middleware + Context — request lifecycle unificado para routes e actions

---

## 1. Sumário Executivo

Onda 5 adiciona middleware e request context ao Theo. Decisão-chave: **middleware como arquivo `server/middleware.ts`** com `await next()` pattern (Hono/Koa), e **context via `server/context.ts`** com factory function `createContext()`. O middleware executa ANTES de routes e actions (mesmo pipeline). Context é criado APÓS middleware e passado para handlers via `ctx` param. Não precisa de `AsyncLocalStorage` — context é passado explicitamente.

---

## 2. Decisões Arquiteturais

### D1: Middleware como `server/middleware.ts` (single file)

**Decisão:** Um arquivo `server/middleware.ts` que exporta default middleware handler. Sem stack de arquivos — um middleware compõe tudo.

**Justificativa:** Convention over configuration. Rails tem 20+ middleware, mas na Onda 5 Theo precisa de UM global middleware. Stack complexo vem na Onda futura.

```typescript
// server/middleware.ts
import { defineMiddleware } from 'theo/server'

export default defineMiddleware(async (request, next) => {
  const start = Date.now()
  const response = await next(request)
  response.headers.set('X-Response-Time', `${Date.now() - start}ms`)
  return response
})
```

### D2: Context via `server/context.ts` com `createContext()`

**Decisão:** `server/context.ts` exporta `createContext({ request })` que retorna um objeto de contexto. Esse objeto é passado para handlers como `ctx`.

```typescript
// server/context.ts
export async function createContext({ request }: { request: Request }) {
  return {
    requestId: crypto.randomUUID(),
    user: null,
  }
}
```

**Justificativa:** Explícito, tipado, testável. Sem `AsyncLocalStorage` magic — context é argumento do handler.

### D3: Pipeline unificado: middleware → context → handler

**Decisão:** Tanto routes quanto actions passam pelo mesmo pipeline:
```
request → middleware (optional) → createContext (optional) → handler({ ..., ctx })
```

**Justificativa:** Critério de aceite: "Não pode haver runtimes separados para routes e actions."

### D4: Middleware com Node.js raw (IncomingMessage/ServerResponse), não Web API

**Decisão:** O middleware executa no Connect middleware level — recebe `IncomingMessage`/`ServerResponse`, não `Request`/`Response`.

**Justificativa:** O middleware precisa modificar headers de response ANTES e DEPOIS do handler. No Connect model, isso é natural. A API Onda 0 (`defineMiddleware(handler: MiddlewareHandler)`) definiu `Request`/`Response` Web API, mas na prática o middleware roda no Vite dev server que usa Connect. Para a Onda 5, vamos adaptar: o middleware wrapper converte IncomingMessage → Request para o user.

**Decisão simplificadora:** Na Onda 5, middleware NÃO usa a assinatura `defineMiddleware` da Onda 0. Em vez disso, `server/middleware.ts` exporta um handler Connect-compatible que o framework chama internamente. O `defineMiddleware` da Onda 0 fica para uso futuro (quando Web Standards middleware fizer sentido).

**Approach real para Onda 5:**
```typescript
// server/middleware.ts
import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function middleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => Promise<void>,
) {
  // Before handler
  const start = Date.now()
  await next()
  // After handler
  res.setHeader('X-Response-Time', `${Date.now() - start}ms`)
}
```

Wait — isso é muito diferente da API `defineMiddleware`. Vou simplificar mais:

**Decisão FINAL:** O middleware na Onda 5 é implementado no nível do Vite Connect middleware, wrapping tanto routes quanto actions. O `server/middleware.ts` exporta uma função que recebe `req`/`res`/`next`. O context é um objeto criado POR REQUEST e passado via closures para os executors.

### D5: Context passado para handlers via `ctx` param existente

**Decisão:** `RouteConfig.handler` já aceita `{ query, body, params, request, ctx }` onde `ctx` era `any` (placeholder da Onda 0). Agora `ctx` é o resultado de `createContext()`.

**Justificativa:** Zero breaking change — handlers que não usam ctx continuam funcionando.

---

## 3. Arquitetura

### Pipeline

```
Request chega no Vite dev server
    ↓
Connect middleware stack:
    1. Action middleware (/api/__actions/)
    2. API middleware (/api/)
    ↓
Dentro de cada middleware:
    a. Load server/middleware.ts (if exists) via ssrLoadModule
    b. Call middleware(req, res, next)
       - middleware pode short-circuit (respond diretamente)
       - middleware chama next() para continuar
    c. Load server/context.ts (if exists) via ssrLoadModule
    d. Call createContext({ request: req })
    e. Pass ctx to route/action handler
```

### Implementação

O approach mais simples: adicionar uma `runMiddlewareAndContext()` function que é chamada por AMBOS `executeRoute` e `executeAction` ANTES de executar o handler.

```typescript
async function runMiddlewareAndContext(
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  serverDir: string,
): Promise<{ ctx: unknown; aborted: boolean }> {
  // 1. Load and run middleware (if exists)
  const middlewarePath = join(serverDir, 'middleware.ts')
  if (existsSync(middlewarePath)) {
    const mod = await vite.ssrLoadModule(middlewarePath)
    const mw = mod.default
    if (typeof mw === 'function') {
      let nextCalled = false
      await mw(req, res, async () => { nextCalled = true })
      if (!nextCalled) return { ctx: {}, aborted: true } // middleware short-circuited
    }
  }
  
  // 2. Load and run createContext (if exists)
  let ctx: unknown = {}
  const contextPath = join(serverDir, 'context.ts')
  if (existsSync(contextPath)) {
    const mod = await vite.ssrLoadModule(contextPath)
    if (typeof mod.createContext === 'function') {
      ctx = await mod.createContext({ request: req })
    }
  }
  
  return { ctx, aborted: false }
}
```

---

## 4. Componentes a Construir

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Middleware+Context Runner | `packages/theo/src/server/middleware-runner.ts` (NEW) | Load middleware, run, load context, create ctx |
| Execute Route (evolve) | `packages/theo/src/server/execute.ts` (EDIT) | Add ctx param, call middlewareRunner before handler |
| Execute Action (evolve) | `packages/theo/src/server/action-execute.ts` (EDIT) | Add ctx param, call middlewareRunner before handler |
| API Middleware (evolve) | `packages/theo/src/vite-plugin/api-middleware.ts` (EDIT) | Pass serverDir to executeRoute |
| Action Middleware (evolve) | `packages/theo/src/vite-plugin/action-middleware.ts` (EDIT) | Pass serverDir to executeAction |

---

## 5. Testes da Onda 5

### Teste 1 — Context disponível em route
```typescript
it('ctx.requestId exists in route handler', async () => {
  const res = await fetch('/api/ctx-test')
  const data = await res.json()
  expect(data.requestId).toBeDefined()
  expect(data.requestId).toMatch(/^[a-f0-9-]+$/)
})
```

### Teste 2 — Context disponível em action
```typescript
it('ctx.requestId exists in action handler', async () => {
  const res = await fetch('/api/__actions/ctx-test/testAction', {
    method: 'POST', headers: { 'X-Theo-Action': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'test' }),
  })
  const data = await res.json()
  expect(data.requestId).toBeDefined()
})
```

### Teste 3 — Middleware bloqueando
```typescript
it('middleware returns 401 before handler', async () => {
  // Fixture with middleware that checks auth header
  const res = await fetch('/api/protected')
  expect(res.status).toBe(401)
})
```

### Teste 4 — Middleware alterando response
```typescript
it('middleware adds X-Response-Time header', async () => {
  const res = await fetch('/api/health')
  expect(res.headers.get('x-custom-header')).toBe('theo')
})
```

### Teste 5 — Ordem de execução
```typescript
it('order: middleware → context → handler', async () => {
  // Route handler returns { order: [...] } tracking execution
  const res = await fetch('/api/order-test')
  const data = await res.json()
  expect(data.order).toEqual(['middleware', 'context', 'handler'])
})
```

---

## 6. Fixtures

```
fixtures/middleware-context/
├── server/
│   ├── middleware.ts     # Adds X-Custom-Header + tracks order
│   ├── context.ts        # createContext with requestId + tracks order
│   ├── routes/
│   │   ├── health.ts     # Simple GET
│   │   ├── ctx-test.ts   # Returns ctx.requestId
│   │   └── order-test.ts # Returns execution order
│   └── actions/
│       └── ctx-test.ts   # Returns ctx.requestId from action
├── app/page.tsx
├── index.html
├── theo.config.ts
└── package.json
```

---

## 7. Fora de Escopo

- ❌ Per-route middleware (apenas global)
- ❌ Middleware stack (apenas 1 middleware file)
- ❌ AsyncLocalStorage (context é explícito)
- ❌ TypedContext via generics (ctx é `unknown`, user faz type assertion)
- ❌ Rate limiting built-in
- ❌ CORS middleware built-in

---

## 8. Competitive Position

| Dimensão | Theo (target) | Hono | Rails | Next.js | Best |
|----------|---------------|------|-------|---------|------|
| Middleware pattern | 4/5 | 5/5 | 5/5 | 3/5 | Hono |
| Context creation | 4/5 | 5/5 | 4/5 | 2/5 | Hono |
| Unified pipeline | 5/5 | 5/5 | 5/5 | 3/5 | All except Next |
| Type safety | 3/5 | 4/5 | 2/5 | 3/5 | Hono |
| Simplicity | 5/5 | 4/5 | 3/5 | 4/5 | Theo |

---

## Sources

- [Hono Middleware](https://hono.dev/docs/guides/middleware) — await next() pattern
- [Hono Context](https://hono.dev/docs/api/context) — c.set/c.get, request-scoped state
- [Hono Context Storage](https://hono.dev/docs/middleware/builtin/context-storage) — AsyncLocalStorage-based
- Rails `default_middleware_stack.rb` — stack order, RequestId early
- Rails `request_id.rb` — UUID generation, env hash propagation
