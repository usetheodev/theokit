# Onda 13 — SOTA Research: Typed Client

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Client tipado end-to-end para consumir API routes definidos com defineRoute + Zod.

---

## 1. Abordagens na Indústria

### Comparação de Frameworks

| Framework | Abordagem | Codegen? | Contract | Transport |
|-----------|-----------|----------|----------|-----------|
| **tRPC** | Inferência via router type export | Não | TypeScript types | HTTP/fetch |
| **Hono RPC** | `hc(url)` com `AppType` generic | Não | Hono route chain type | HTTP/fetch |
| **ts-rest** | Contrato shared (object literal) | Não | Contract object | HTTP/fetch |
| **Zodios** | Route array com Zod schemas | Não | Route definitions | axios/fetch |
| **oRPC** | Router + contract + OpenAPI | Não | TypeScript types | HTTP/fetch |
| **OpenAPI codegen** | Geração de client code | SIM | OpenAPI spec | Various |

### Insight Principal

Todos os frameworks type-safe modernos convergem no mesmo pattern:

1. **Server define routes** com schemas (Zod ou equivalente)
2. **Type é exportado** como tipo TypeScript (não runtime)
3. **Client importa o type** e usa para inferir inputs/outputs
4. **Zero codegen** — inferência pura via TypeScript generics

### O Theo Já Tem a Base

O `defineRoute` com generics `TQuery`, `TBody`, `TParams` já carrega TODA a informação de tipos necessária. O que falta é:
1. Um mecanismo para **exportar o tipo do router** para o client
2. Uma **função client** que faz fetch tipado usando esse tipo

---

## 2. Análise dos Approaches

### Approach A — tRPC-like (Router type export)

```typescript
// SERVER: definir e exportar tipo do app
const api = createTheoAPI(import.meta.glob('./server/routes/**/*.ts'))
export type AppAPI = typeof api

// CLIENT: usar o tipo para criar client
import type { AppAPI } from '../server'
const client = createTheoClient<AppAPI>({ baseUrl: '/api' })
const result = await client.users.GET({ query: { search: 'alice' } })
```

**Problema**: O Theo usa file-based routing com dynamic import (`import.meta.glob`). Os types dos modules não são conhecidos staticamente — são carregados em runtime. tRPC contorna isso com um router object construído em code, não filesystem.

### Approach B — Hono-like (Chained route type)

Hono infere types de rotas encadeadas:
```typescript
const app = new Hono().get('/users', ...).post('/users', ...)
export type AppType = typeof app
```

**Problema**: O Theo usa file-based routing — não há encadeamento. Cada route é um arquivo separado.

### Approach C — Contract-first (ts-rest style)

O client e server compartilham um **contrato** — um objeto TypeScript que descreve as routes:

```typescript
// shared/api-contract.ts
import { defineContract } from 'theo/client'
import type { routes } from '../server/routes'

export const contract = defineContract<typeof routes>()
```

**Problema**: Requer que o user crie/mantenha um contrato manualmente. Friction.

### Approach D — Manual type export per route (PRAGMÁTICO)

O user exporta o tipo de cada route file, e o client importa:

```typescript
// server/routes/users.ts
export const GET = defineRoute({
  query: z.object({ search: z.string() }),
  handler: ({ query }) => ({ users: [{ name: 'alice' }] }),
})

// client usage
import type { GET as GetUsers } from '../server/routes/users'
import { theoFetch } from 'theo/client'

const result = await theoFetch<typeof GetUsers>('/api/users', {
  query: { search: 'alice' }
})
// result is typed as { users: { name: string }[] }
```

**Vantagem**: Zero magic, zero codegen, zero router object. O user importa `typeof` da route e o `theoFetch` infere tudo.

**Desvantagem**: O user faz `import type` manual para cada route. Mas é explícito e type-safe.

### Approach E — Proxy-based inferred client (AVANÇADO)

Criar um proxy que infere o path e method:

```typescript
const client = createTheoClient<{
  '/api/users': { GET: typeof import('../server/routes/users').GET }
  '/api/posts': { GET: typeof import('../server/routes/posts').GET }
}>({ baseUrl: '' })

const users = await client['/api/users'].GET({ query: { search: 'a' } })
```

**Problema**: O user precisa montar o type map manualmente. Nenhum ganho sobre Approach D.

---

## 3. Decisão: Approach D — `theoFetch` com `typeof RouteExport`

### Por que Approach D?

1. **Zero magic** — user entende exatamente o que acontece
2. **Zero codegen** — nenhum step de build adicional
3. **Zero dependência** — usa fetch nativo
4. **Explícito** — import type mostra exatamente qual route está sendo consumida
5. **Incremental** — user tipifica uma route por vez, sem tudo-ou-nada
6. **KISS** — ~30 linhas de implementação

### API do Typed Client

```typescript
// packages/theo/src/client/theo-fetch.ts

import type { RouteConfig } from '../server/define-route.js'
import type { z } from 'zod'

// Infer response type from handler return
type InferResponse<T> = T extends RouteConfig<any, any, any, any>
  ? Awaited<ReturnType<T['handler']>>
  : unknown

// Infer input types from Zod schemas
type InferInput<T> = T extends RouteConfig<infer TQ, infer TB, infer TP, any>
  ? {
      query?: z.infer<TQ> extends undefined ? never : z.infer<TQ>
      body?: z.infer<TB> extends undefined ? never : z.infer<TB>
      params?: z.infer<TP> extends undefined ? never : z.infer<TP>
    }
  : {}

interface TheoFetchOptions<T> extends Omit<RequestInit, 'body' | 'method'> {
  query?: InferInput<T> extends { query: infer Q } ? Q : never
  body?: InferInput<T> extends { body: infer B } ? B : never
}

// Main fetch function
async function theoFetch<T extends RouteConfig>(
  url: string,
  options?: TheoFetchOptions<T>,
): Promise<InferResponse<T>> {
  const fetchUrl = new URL(url, window.location.origin)
  
  // Append query params
  if (options?.query) {
    for (const [k, v] of Object.entries(options.query as Record<string, string>)) {
      fetchUrl.searchParams.set(k, String(v))
    }
  }
  
  const init: RequestInit = { ...options }
  if (options?.body) {
    init.body = JSON.stringify(options.body)
    init.headers = { ...init.headers as Record<string, string>, 'Content-Type': 'application/json' }
  }
  
  const response = await fetch(fetchUrl.toString(), init)
  if (!response.ok) throw new TheoFetchError(response)
  return response.json()
}
```

### Uso pelo Developer

```typescript
// server/routes/users.ts
import { defineRoute } from 'theo/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({ search: z.string().optional() }),
  handler: ({ query }) => ({
    users: [{ id: '1', name: 'Alice', email: 'alice@example.com' }]
  })
})

export const POST = defineRoute({
  body: z.object({ name: z.string(), email: z.string().email() }),
  status: 201,
  handler: ({ body }) => ({
    id: crypto.randomUUID(),
    ...body
  })
})
```

```typescript
// app/components/UserList.tsx
import { theoFetch } from 'theo/client'
import type { GET } from '../../server/routes/users'

// Fully typed! query.search is string | undefined
const data = await theoFetch<typeof GET>('/api/users', {
  query: { search: 'alice' }
})
// data is { users: { id: string, name: string, email: string }[] }

// POST — body is typed
import type { POST } from '../../server/routes/users'
const created = await theoFetch<typeof POST>('/api/users', {
  body: { name: 'Bob', email: 'bob@example.com' }
})
// created is { id: string, name: string, email: string }
```

### Error Handling

```typescript
class TheoFetchError extends Error {
  status: number
  code?: string
  issues?: unknown[]
  
  constructor(response: Response, body?: unknown) {
    super(`HTTP ${response.status}`)
    this.status = response.status
    if (body && typeof body === 'object') {
      const err = (body as { error?: { code?: string; issues?: unknown[] } }).error
      this.code = err?.code
      this.issues = err?.issues
    }
  }
}
```

---

## 4. O Que NÃO Fazer

| Tentação | Por que não |
|----------|-----------|
| Gerar client code automaticamente | Codegen adiciona build step, complexity. Approach D é zero-codegen. |
| Criar proxy object que mapeia todas as routes | Precisa de runtime scanning. TypeScript não infere de filesystem. |
| Usar `import.meta.glob` para tipar client | Glob retorna `Record<string, () => Promise<unknown>>` — sem type info. |
| Bundlar tRPC como dep | Seria reinventar o Theo em cima do tRPC. YAGNI. |
| Criar router object (como tRPC/Hono) | Contradiz file-based routing do Theo. |

---

## 5. Exports

### Novo subpath: `theo/client`

```typescript
// packages/theo/src/client/index.ts
export { theoFetch } from './theo-fetch.js'
export { TheoFetchError } from './theo-fetch.js'
export type { InferResponse, InferInput, TheoFetchOptions } from './theo-fetch.js'
```

Package.json:
```json
"exports": {
  "./client": {
    "types": "./dist/client/index.d.ts",
    "import": "./dist/client/index.js"
  }
}
```

---

## 6. Impacto Mínimo

| Item | Mudança |
|------|---------|
| Arquivos novos | 2 (`client/index.ts`, `client/theo-fetch.ts`) |
| Arquivos modificados | 2 (`package.json` exports, `tsup.config.ts` entry) |
| Testes novos | ~8 (unit + type tests) |
| Breaking changes | Zero |
| Deps novas | Zero (usa fetch nativo) |

---

## 7. Benchmark

| Dimensão | Theo (Approach D) | tRPC | Hono RPC | ts-rest |
|----------|-------------------|------|----------|---------|
| Codegen required | ❌ | ❌ | ❌ | ❌ |
| Type inference | ✅ via `typeof` | ✅ via router | ✅ via chain | ✅ via contract |
| Manual import per route | ✅ (explicit) | ❌ (all routes via router) | ❌ (all routes via AppType) | ❌ (all routes via contract) |
| File-based routing compat | ✅ | ❌ | ❌ | ❌ |
| Zero new deps | ✅ | ❌ (@trpc/*) | ❌ (hono/client) | ❌ (@ts-rest/*) |
| Runtime validation | ✅ (Zod on server) | ✅ | ✅ | ✅ |
| Error typing | ✅ TheoFetchError | ✅ TRPCError | Partial | ✅ |

**Trade-off aceito**: O user faz `import type` manual por route. Em troca, zero magic, zero codegen, zero deps, e 100% compatível com file-based routing.

---

## Sources

- [tRPC Official](https://trpc.io/)
- [tRPC Zero-Codegen Type Safety](https://www.gocodeo.com/post/trpc-achieving-end-to-end-type-safety-without-code-generation)
- [tRPC vs REST vs GraphQL 2026](https://dev.to/whoffagents/trpc-vs-rest-vs-graphql-in-2026-a-saas-builders-honest-take-459k)
- [Hono RPC Docs](https://hono.dev/docs/guides/rpc)
- [Hono RPC Blog — Yusuke Wada](https://blog.yusu.ke/hono-rpc/)
- [oRPC vs tRPC vs Hono RPC (2026)](https://www.pkgpulse.com/blog/orpc-vs-trpc-vs-hono-rpc-type-safe-apis-2026)
- [ts-rest GitHub](https://github.com/ts-rest/ts-rest)
- [ts-rest Official](https://ts-rest.com/)
- [Type-Safe API Clients Guide (2026)](https://oneuptime.com/blog/post/2026-01-30-typescript-type-safe-api-clients/view)
- [Total Type Safety: TypeScript & tRPC 2026](https://blog.weskill.org/2026/04/total-type-safety-typescript-trpc-in.html)
