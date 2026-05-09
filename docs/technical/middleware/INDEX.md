# Middleware — Pesquisa SOTA

## Escopo
Request lifecycle via `server/middleware.ts` e `server/context.ts`.

## Packages alvo
- `theo/server` — defineMiddleware (type), middleware runner
- `theo` (vite-plugin) — integração middleware no pipeline

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Hono middleware | `await next()` pattern, onion model, `c.set`/`c.get` |
| Hono Context Storage | AsyncLocalStorage-based context access |
| Rails default_middleware_stack.rb | Stack order: RequestId → RemoteIp → Cookies |
| Rails request_id.rb | UUID generation, env hash propagation |
| Next.js middleware | Edge runtime, matcher patterns |
| Nitro middleware | `server/middleware/` directory, auto-registration |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [x] Global middleware via `server/middleware.ts` (single file, `await next()`)
- [x] Context via `server/context.ts` com `createContext()`
- [x] Middleware short-circuit (respond directly, skip handler)
- [x] Middleware modify response headers (after `await next()`)
- [x] Pipeline unificado routes + actions
- [x] Context passado via `ctx` param (explícito, não AsyncLocalStorage)
- [ ] Per-route middleware — futuro
- [ ] Middleware stack (múltiplos files) — futuro
- [ ] Typed context via generics — futuro
