# Server Routes — Pesquisa SOTA

## Escopo
Backend explícito e tipado via `defineRoute()` em `server/routes/`.

## Packages alvo
- `theo/server` — export `defineRoute`
- `theo` (vite-plugin) — route scanning, API middleware, handler execution

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js app-route module.ts | Execution pipeline: method validation → params → handler → Response |
| Next.js auto-implement-methods.ts | 405 auto, HEAD from GET, OPTIONS with Allow header |
| Hono zValidator | Zod middleware inline, 400 on validation failure |
| Hono @hono/zod-openapi | `createRoute` → OpenAPI generation |
| Nitro defineEventHandler | File-based discovery, auto JSON serialization |
| tRPC procedures | Zod input → typed output, zero codegen |
| Vite configureServer | Connect middleware para API routes no dev server |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md
- ONDA-3-SOTA-RESEARCH.md (consolidado)

## Gaps para pesquisar
- [x] Signature exata de `defineRoute()` — `{ query, params, body, handler }`, return object = JSON
- [x] File-based discovery — scan `server/routes/`, `[id]` → `:id` params
- [x] Auto-prefix `/api/` — convention, configurável futuro
- [x] Status code control — return object = 200, return Response = passthrough, config `status` option
- [x] Error response format — `{ error: { code, message, issues } }`
- [x] Body parsing — manual via `req.on('data')`, ~10 linhas
- [x] Route matching — pattern matching com params extraction
- [x] 405 auto-handling — default method → 405 response
- [ ] Response typing: return inference vs explicit `output` schema (futuro)
- [ ] Streaming responses (futuro)
- [ ] OpenAPI generation (futuro)
