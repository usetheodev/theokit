# Middleware — Pesquisa SOTA

## Escopo
Request lifecycle via `defineMiddleware()` em `server/middleware.ts`.

## Packages alvo
- `theo/server` — export `defineMiddleware`
- `@theo/server` — middleware execution, context creation, stack ordering

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js middleware.ts (web/) | Signature: `(request, event) => Response`, edge runtime, matcher patterns |
| Next.js middleware-loader.ts | Build-time validation, export detection |
| Next.js middleware-config.ts | `config.matcher` para route patterns |
| Rails default_middleware_stack.rb | 20+ middleware padrão (RequestId, Logger, SSL, Sessions, CSRF, etc) |
| Rails middleware/stack.rb | Stack manipulation: `insert_before`, `insert_after`, `swap`, instrumentation |
| Hono middleware | Composable via `app.use()`, async/await, `c.next()` pattern |
| Nitro middleware | `server/middleware/` directory, auto-registration |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [ ] Global middleware vs per-route middleware
- [ ] Middleware ordering: declarative vs file-based
- [ ] Context creation: middleware vs separado (`server/context.ts`)
- [ ] Middleware pode retornar Response diretamente (short-circuit)?
- [ ] Middleware pode modificar request/response headers?
- [ ] Middleware async: `await next()` pattern como Hono/Koa
- [ ] Middleware vs interceptors: são a mesma coisa?
- [ ] Middleware stack padrão do Theo (RequestId, Logger, CORS, etc)
