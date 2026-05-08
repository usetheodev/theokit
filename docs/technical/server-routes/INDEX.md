# Server Routes — Pesquisa SOTA

## Escopo
Backend explícito e tipado via `defineRoute()` em `server/routes/`.

## Packages alvo
- `theo/server` — export `defineRoute`
- `@theo/server` — route discovery, handler execution, Zod validation

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js app-route module.ts | `AppRouteHandlerFn` signature, HTTP_METHOD union type, auto-implement HEAD/OPTIONS |
| Next.js auto-implement-methods.ts | 405 Method Not Allowed automático, validation de lowercase exports |
| Next.js find-page-file.ts | Route file discovery via regex patterns |
| Hono zValidator | Zod middleware inline, RPC mode para type sharing |
| Hono @hono/zod-openapi | `createRoute` com schema completo → OpenAPI generation |
| Nitro defineEventHandler | File-based route discovery, auto JSON serialization |
| Nitro defineHandler (v3+) | Melhor type inference, acesso direto ao event |
| tRPC procedures | Zod input → typed output → client inference, zero codegen |
| Fastify schema-based | JSON Schema validation + serialization, ahead-of-time compilation |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [ ] Signature exata de `defineRoute()`: `{ query, params, body, headers, handler }` vs `{ input, handler }`
- [ ] File-based discovery: como mapear `server/routes/users/[id].ts` → `GET /api/users/:id`
- [ ] Auto-prefix `/api/` ou configurável?
- [ ] Response typing: return inference vs explicit `output` schema
- [ ] Status code control: como retornar 201, 204, etc
- [ ] Streaming responses: suporte nativo?
- [ ] OpenAPI generation a partir dos schemas Zod
- [ ] Error response format padronizado
