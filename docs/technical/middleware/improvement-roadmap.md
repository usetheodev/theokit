# Middleware — Improvement Roadmap

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 1/5
**Target SOTA score:** 2/5 (após Onda 0, 4/5 após Onda 5)
**Gaps filled this session:** 0 of 8 (pesquisa inicial)

## Executive Summary

Middleware do Theo segue o pattern `await next()` (Hono/Koa), não o pattern Edge-only do Next.js. É global por default (`server/middleware.ts`) mas extensível para per-route na Onda 5. O modelo mental: Rails middleware stack (config-based, ordered) + Hono DX (async/await, composable).

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js middleware (web/) | NEW | Edge runtime, `(request, event) => Response`, matcher patterns |
| Next.js middleware-loader.ts | NEW | Build-time validation, export detection |
| Rails default_middleware_stack.rb | NEW | 20+ middleware padrão, `insert_before`/`insert_after`/`swap` |
| Rails middleware/stack.rb | NEW | Stack manipulation, instrumentation proxy |
| Hono middleware | NEW | `app.use()`, `c.next()`, composable, async |
| Nitro middleware | NEW | `server/middleware/` directory, auto-registration |

## Competitive Position

| Dimensão | Theo (target) | Next.js | Rails | Hono | Nitro | Best-in-class |
|----------|---------------|---------|-------|------|-------|---------------|
| Composability | 5/5 | 2/5 | 5/5 | 5/5 | 3/5 | Rails/Hono |
| Async support | 5/5 | 5/5 | 3/5 | 5/5 | 5/5 | Hono/Next.js |
| Per-route matching | 3/5 | 5/5 | 5/5 | 5/5 | 3/5 | Next.js/Hono |
| Context sharing | 5/5 | 3/5 | 5/5 | 4/5 | 4/5 | Rails |
| DX (simplicity) | 5/5 | 4/5 | 3/5 | 5/5 | 4/5 | Hono |
| Built-in stack | 4/5 | 2/5 | 5/5 | 2/5 | 3/5 | Rails |

## Decisões Arquiteturais para Onda 0

### D1: `defineMiddleware()` com pattern Hono/Koa

```typescript
// server/middleware.ts
import { defineMiddleware } from 'theo/server'

export default defineMiddleware(async (request, next) => {
  // Before handler
  const start = Date.now()
  
  const response = await next(request)
  
  // After handler
  response.headers.set('X-Response-Time', `${Date.now() - start}ms`)
  return response
})
```

**Decisão:** `await next()` pattern (Hono/Koa) vs Next.js `NextResponse.next()`:
- `await next()` permite before/after logic no mesmo middleware
- Mais intuitivo para devs vindos de Express/Koa/Hono
- Web Standard: `Request` in, `Response` out

### D2: Middleware pode short-circuit

```typescript
export default defineMiddleware(async (request, next) => {
  const token = request.headers.get('Authorization')
  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }
  return next(request)
})
```

### D3: Contrato na Onda 0

```typescript
// packages/theo/src/server/define-middleware.ts
type MiddlewareHandler = (
  request: Request,
  next: (request: Request) => Promise<Response>
) => Response | Promise<Response>

export function defineMiddleware(handler: MiddlewareHandler) {
  return handler // identity + type na Onda 0
}
```

### D4: Execução global, single file (Onda 0)

Na Onda 0, middleware é apenas `server/middleware.ts` (single file, global).
Na Onda 5, expandir para middleware stack e per-route matching.

## Quick Wins (1-2 sessões cada)

1. **Criar tipo `MiddlewareHandler`** → `packages/theo/src/server/types.ts`
2. **Criar `defineMiddleware()` function** → `packages/theo/src/server/define-middleware.ts`
3. **Criar fixture** → `fixtures/basic-valid-app/server/middleware.ts`

## Anti-Patterns to Eliminate

1. **Edge-only middleware** — Next.js limita middleware a edge runtime. Theo roda em Node.js.
2. **Middleware sem `await next()`** — pattern fire-and-forget perde o after-response hook
3. **`req/res` mutation** — usar `Request`/`Response` imutáveis (Web Standards)

## Sources

- [Next.js middleware types](referencias/next.js/packages/next/src/server/web/types.ts)
- [Rails middleware stack](referencias/rails/actionpack/lib/action_dispatch/middleware/stack.rb)
- [Rails default stack](referencias/rails/railties/lib/rails/application/default_middleware_stack.rb)
- [Hono Middleware](https://hono.dev/docs/guides/middleware)
- [Nitro Middleware](https://nitro.build/guide/routing/)
