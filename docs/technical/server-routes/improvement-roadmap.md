# Server Routes — Improvement Roadmap

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 1/5
**Target SOTA score:** 3/5 (após Onda 0, 4/5 após Onda 3)
**Gaps filled this session:** 0 of 8 (pesquisa inicial)

## Executive Summary

`defineRoute()` é o contrato central do backend do Theo. Precisa combinar: Zod validation obrigatória (diferencial vs Next.js que não valida), file-based discovery (como Next.js/Nitro), HTTP method exports nomeados (como Next.js), e type inference end-to-end (como tRPC). O desafio é ser tão simples quanto Hono mas tão type-safe quanto tRPC.

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js app-route module.ts | NEW | Handler: `(req, ctx) => Response`, HTTP_METHOD union, auto HEAD/OPTIONS |
| Next.js auto-implement-methods.ts | NEW | 405 automático, validation de lowercase exports |
| Hono zValidator | NEW | `zValidator('json', schema)` inline middleware, RPC type sharing |
| Hono @hono/zod-openapi | NEW | `createRoute({ method, path, request, responses })` → OpenAPI |
| Nitro defineHandler v3 | NEW | Melhor inference que `defineEventHandler`, auto JSON |
| tRPC procedures | NEW | Zod input → typed output → zero codegen client inference |
| Fastify schema | NEW | JSON Schema compile-time optimization, serialization |

## Competitive Position

| Dimensão | Theo (target) | Next.js | Hono | tRPC | Nitro | Best-in-class |
|----------|---------------|---------|------|------|-------|---------------|
| Input validation obrigatória | 5/5 | 1/5 | 4/5 | 5/5 | 1/5 | Theo/tRPC |
| Type inference (input→output) | 5/5 | 2/5 | 4/5 | 5/5 | 3/5 | tRPC |
| File-based discovery | 5/5 | 5/5 | 1/5 | 1/5 | 5/5 | Next.js/Nitro |
| OpenAPI generation | 4/5 | 1/5 | 5/5 | 3/5 | 2/5 | Hono |
| HTTP method handling | 5/5 | 5/5 | 5/5 | 2/5 | 4/5 | Next.js/Hono |
| Error response format | 5/5 | 2/5 | 3/5 | 4/5 | 2/5 | tRPC |

## Decisões Arquiteturais para Onda 0

### D1: `defineRoute()` signature — Zod obrigatório para input

```typescript
// server/routes/users.ts
import { defineRoute } from 'theo/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({
    search: z.string().optional(),
    page: z.coerce.number().default(1),
  }),
  handler: async ({ query, ctx }) => {
    // query é tipado: { search?: string; page: number }
    return { users: [], page: query.page }
    // return type é inferido automaticamente
  },
})

export const POST = defineRoute({
  body: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  handler: async ({ body, ctx }) => {
    return { id: 'user_1', ...body }
  },
})
```

**Diferencial vs Next.js:** Next.js não tem validation built-in — o dev precisa validar manualmente. Theo faz validation ser o default, não opt-in.

**Diferencial vs tRPC:** tRPC não é file-based e não mapeia para HTTP methods. Theo combina file-based routing de Next.js com type inference de tRPC.

### D2: File-based route discovery

```
server/routes/health.ts      → GET /api/health
server/routes/users.ts        → GET|POST /api/users
server/routes/users/[id].ts   → GET|PUT|DELETE /api/users/:id
```

**Regras:**
- Prefix `/api/` automático (configurável via `theo.config.ts`)
- HTTP methods via named exports (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
- Dynamic params via `[param]` no filename
- 405 automático para methods não implementados
- HEAD auto-gerado de GET
- OPTIONS auto-gerado listando methods disponíveis

### D3: Handler context tipado

```typescript
type RouteHandler<TQuery, TBody, TParams> = (ctx: {
  query: TQuery       // inferido do Zod schema
  body: TBody         // inferido do Zod schema
  params: TParams     // inferido do filename ([id] → { id: string })
  headers: Headers    // Web Standard
  request: Request    // Web Standard
  ctx: AppContext     // Request context (middleware-provided)
}) => unknown | Promise<unknown>  // return type inferido
```

### D4: Contrato de `defineRoute` na Onda 0

Na Onda 0, `defineRoute` é apenas o **tipo e a validação**. A execução real vem na Onda 3.

```typescript
// packages/theo/src/server/define-route.ts
import { z } from 'zod'

interface RouteConfig<
  TQuery extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
  TParams extends z.ZodType = z.ZodType,
> {
  query?: TQuery
  body?: TBody
  params?: TParams
  headers?: z.ZodType
  handler: (input: {
    query: z.infer<TQuery>
    body: z.infer<TBody>
    params: z.infer<TParams>
    request: Request
    ctx: any // expandido na Onda 5
  }) => unknown | Promise<unknown>
}

export function defineRoute<
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TParams extends z.ZodType,
>(config: RouteConfig<TQuery, TBody, TParams>) {
  return config // identity + type inference
}
```

## Quick Wins (1-2 sessões cada)

1. **Criar tipo `RouteConfig`** — type inference com generics Zod → `packages/theo/src/server/types.ts`
2. **Criar `defineRoute()` function** — identity function tipada → `packages/theo/src/server/define-route.ts`
3. **Criar type test** — verificar que input/output infere corretamente → `tests/type/define-route.test-d.ts`
4. **Criar fixture `fixtures/basic-valid-app/server/routes/health.ts`** — rota mínima

## Anti-Patterns to Eliminate

1. **Validation opt-in** — Se validation é opcional, ninguém valida. Theo deve exigir schema ou handler sem input.
2. **`req/res` pattern** — Usar Web Standards `Request/Response`, não Node.js `IncomingMessage/ServerResponse`
3. **God handler** — Handler não deve fazer validação manualmente, o framework faz

## Sources

- [Next.js route-modules/app-route/module.ts](referencias/next.js/packages/next/src/server/route-modules/app-route/module.ts) — handler types
- [Next.js auto-implement-methods.ts](referencias/next.js/packages/next/src/server/route-modules/app-route/helpers/auto-implement-methods.ts)
- [Hono Validation Guide](https://hono.dev/docs/guides/validation) — zValidator pattern
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi) — createRoute + OpenAPI
- [Hono RPC](https://hono.dev/docs/guides/rpc) — type sharing with client
- [tRPC](https://trpc.io/) — end-to-end type inference
- [Nitro Routing](https://nitro.build/guide/routing/) — file-based route discovery
