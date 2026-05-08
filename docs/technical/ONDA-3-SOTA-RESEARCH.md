# Onda 3 — SOTA Research Consolidado

**Data:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Backend Routes — defineRoute runtime, file-based API discovery, Zod validation, HTTP handling

---

## 1. Sumário Executivo

Onda 3 transforma `defineRoute()` de identity function em **runtime handler executável**. O Vite plugin precisa interceptar requests `GET /api/*` via `configureServer` middleware, escanear `server/routes/`, e executar o handler com params/query/body parsed e Zod-validated. Decisão-chave: **Vite `configureServer` com Connect middleware** (sem Express) — parse body manualmente, match route, validate, execute handler, serialize response como JSON.

---

## 2. Decisões Arquiteturais

### D1: API routes via Vite `configureServer` middleware

**Abordagem:** Plugin Vite adiciona middleware no `configureServer` que intercepta requests com prefix `/api/`.

```typescript
configureServer(server) {
  server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    // Match route, parse body, validate, execute handler, send JSON
  })
}
```

**Por que não Express:** Vite já usa Connect. Adicionar Express é dependency desnecessária. Body parsing manual é ~10 linhas.

**Por que não middleware mode:** Theo já usa Vite dev server nativo (Onda 1). Middleware mode requer Express separado. Overkill.

### D2: File-based API route discovery

```
server/routes/health.ts      → GET /api/health
server/routes/users.ts        → GET|POST /api/users
server/routes/users/[id].ts   → GET|PUT|DELETE /api/users/:id
```

**Regras:**
- Prefix `/api/` automático (convention, configurável futuro)
- HTTP methods via named exports: `export const GET = defineRoute({...})`
- Dynamic params via `[param]` no filename → extraído para `params`
- Extension priority: `.ts > .tsx > .js > .jsx`

### D3: defineRoute evolui — agora faz validation runtime

`defineRoute` continua aceitando a mesma config (backward compat), mas o runtime agora:
1. Parse query string via `URLSearchParams`
2. Parse body via `req.on('data')` + `JSON.parse`
3. Validate query/body/params com Zod `safeParse`
4. Se validation falha → 400 com error estruturado
5. Se ok → chama handler com dados tipados
6. Serializa return value como JSON response

### D4: Response pattern — return object = JSON, return Response = passthrough

```typescript
export const GET = defineRoute({
  handler: async ({ query }) => {
    return { users: [] }  // → 200 JSON
  },
})

export const POST = defineRoute({
  body: z.object({ name: z.string() }),
  handler: async ({ body }) => {
    return { id: '1', ...body }  // → 200 JSON (ou 201 via status option)
  },
})
```

**Status codes:** Default 200. Para 201/204/etc, o handler pode:
- Opção A: `defineRoute({ status: 201, ... })` — status na config
- Opção B: Retornar `new Response(JSON.stringify(data), { status: 201 })` — Web Standard
- **Decisão:** Suportar ambos. Se handler retorna plain object → 200 JSON. Se retorna Response → passthrough.

### D5: Error response format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "issues": [
      { "path": ["email"], "message": "Invalid email" }
    ]
  }
}
```

### D6: Route scanner para server/routes/

Reutiliza o pattern do app router (scan recursivo), mas com regras diferentes:
- Aceita qualquer nome de arquivo (não apenas `page.tsx`)
- Dynamic segments via `[param]` no nome do dir ou arquivo
- Cada arquivo pode exportar múltiplos HTTP methods

```typescript
interface ServerRouteNode {
  filePath: string        // absolute path to .ts file
  routePath: string       // '/api/users' or '/api/users/:id'
  params: string[]        // ['id'] from [id].ts
}
```

---

## 3. Arquitetura do Server Route Runtime

### Request Flow

```
Browser/curl → Vite dev server → configureServer middleware
                                      │
                                      ├── URL starts with /api/ ?
                                      │   NO → next() (Vite handles)
                                      │   YES ↓
                                      │
                                      ├── Match route from manifest
                                      │   NO → 404 JSON
                                      │   YES ↓
                                      │
                                      ├── Find handler for HTTP method
                                      │   NO → 405 JSON (Method Not Allowed)
                                      │   YES ↓
                                      │
                                      ├── Parse body (POST/PUT/PATCH only)
                                      │
                                      ├── Validate query/body/params with Zod
                                      │   FAIL → 400 JSON with issues
                                      │   OK ↓
                                      │
                                      ├── Execute handler({ query, body, params, request })
                                      │
                                      └── Serialize response as JSON
```

### Body Parsing (Connect/Node.js raw)

```typescript
function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      if (!raw) return resolve(undefined)
      try { resolve(JSON.parse(raw)) }
      catch { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', reject)
  })
}
```

### Route Matching

```typescript
// server/routes/users/[id].ts → routePattern: '/api/users/:id'
// Request: GET /api/users/123 → params: { id: '123' }

function matchRoute(url: string, routes: ServerRouteNode[]): { route: ServerRouteNode, params: Record<string, string> } | null {
  for (const route of routes) {
    const match = matchPattern(route.routePath, url)
    if (match) return { route, params: match.params }
  }
  return null
}
```

### Zod Validation

```typescript
const routeConfig = await loadRouteModule(route.filePath, method)

if (routeConfig.query) {
  const result = routeConfig.query.safeParse(queryParams)
  if (!result.success) return send400(res, result.error)
  query = result.data
}

if (routeConfig.body) {
  const result = routeConfig.body.safeParse(rawBody)
  if (!result.success) return send400(res, result.error)
  body = result.data
}

if (routeConfig.params) {
  const result = routeConfig.params.safeParse(urlParams)
  if (!result.success) return send400(res, result.error)
  params = result.data
}
```

---

## 4. Componentes a Construir

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Server Route Scanner | `packages/theo/src/server/scan.ts` (NEW) | Scan `server/routes/` → `ServerRouteNode[]` |
| Route Matcher | `packages/theo/src/server/match.ts` (NEW) | URL pattern matching com params extraction |
| Route Executor | `packages/theo/src/server/execute.ts` (NEW) | Parse body, validate, call handler, serialize |
| Vite Middleware | `packages/theo/src/vite-plugin/api-middleware.ts` (NEW) | `configureServer` hook para API routes |
| defineRoute (evolve) | `packages/theo/src/server/define-route.ts` (EDIT) | Adicionar `status` option |

---

## 5. Testes da Onda 3

### Teste 1 — GET simples
```typescript
it('GET /api/health returns { ok: true }', async () => {
  const res = await fetch(`http://localhost:${port}/api/health`)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})
```

### Teste 2 — POST com body válido
```typescript
it('POST /api/users with valid body returns 201', async () => {
  const res = await fetch(`http://localhost:${port}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Paulo', email: 'paulo@test.com' }),
  })
  expect(res.status).toBe(201)
})
```

### Teste 3 — POST com body inválido
```typescript
it('POST /api/users with invalid body returns 400', async () => {
  const res = await fetch(`http://localhost:${port}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', email: 'not-an-email' }),
  })
  expect(res.status).toBe(400)
  const data = await res.json()
  expect(data.error.code).toBe('VALIDATION_ERROR')
})
```

### Teste 4 — Params
```typescript
it('GET /api/users/123 receives params.id === "123"', async () => {
  const res = await fetch(`http://localhost:${port}/api/users/123`)
  const data = await res.json()
  expect(data.id).toBe('123')
})
```

### Teste 5 — Query
```typescript
it('GET /api/users?search=paulo receives query.search', async () => {
  const res = await fetch(`http://localhost:${port}/api/users?search=paulo`)
  const data = await res.json()
  expect(data.search).toBe('paulo')
})
```

---

## 6. Fixtures

```
fixtures/server-routes-basic/
├── server/
│   └── routes/
│       ├── health.ts         # GET → { ok: true }
│       ├── users.ts          # GET (query) + POST (body, 201)
│       └── users/
│           └── [id].ts       # GET (params)
├── app/
│   └── page.tsx              # Minimal page (required by validateProjectStructure)
├── index.html
├── theo.config.ts
└── package.json
```

---

## 7. Dependências

Nenhuma nova dependência. Tudo é Node.js nativo (`node:http`, `node:url`) + Zod (já é peerDep) + Vite `configureServer` (já disponível).

---

## 8. Fora de Escopo

- ❌ Server Actions (Onda 4)
- ❌ Middleware (Onda 5)
- ❌ Context (`ctx`) (Onda 5)
- ❌ OpenAPI generation (futuro)
- ❌ Streaming responses (futuro)
- ❌ Production server (Onda 6)
- ❌ Catch-all routes `[...rest]` (futuro)

---

## 9. Competitive Position

| Dimensão | Theo (target) | Next.js | Hono | Nitro | Best-in-class |
|----------|---------------|---------|------|-------|---------------|
| Zod validation built-in | 5/5 | 1/5 | 4/5 | 1/5 | Theo |
| File-based discovery | 5/5 | 5/5 | 1/5 | 5/5 | Next.js/Nitro/Theo |
| Type inference (input→output) | 5/5 | 2/5 | 4/5 | 3/5 | Theo/tRPC |
| Error response format | 4/5 | 2/5 | 3/5 | 2/5 | Theo |
| Status code control | 4/5 | 5/5 | 5/5 | 4/5 | Next.js/Hono |
| Body auto-parse | 4/5 | 1/5 | 5/5 | 4/5 | Hono |
| 405 auto-handling | 5/5 | 5/5 | 5/5 | 3/5 | All |

---

## Sources

- [Next.js app-route module.ts](referencias/next.js/packages/next/src/server/route-modules/app-route/module.ts) — execution pipeline
- [Next.js auto-implement-methods.ts](referencias/next.js/packages/next/src/server/route-modules/app-route/helpers/auto-implement-methods.ts) — 405 handling
- [Hono Validation Guide](https://hono.dev/docs/guides/validation) — zValidator pattern
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi) — OpenAPI from Zod
- [Vite configureServer](https://vite.dev/config/server-options) — middleware plugin hook
- [Vite API Routes Discussion](https://github.com/vitejs/vite/discussions/6562) — custom middleware
- [Adding REST API to Vite](https://dev.to/xjamundx/adding-a-rest-api-to-your-vite-server-in-5-seconds-270g) — Connect middleware
