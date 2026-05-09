# Server Actions — Pesquisa SOTA

## Escopo
Funções server-side chamadas pelo frontend com contrato tipado via `defineAction()`.

## Packages alvo
- `theo/server` — export `defineAction`
- `theo` (vite-plugin) — action middleware, CSRF protection

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js action-handler.ts | Execution pipeline, CSRF via origin checking, body size limiting |
| Next.js csrf-protection.ts | Origin matching, wildcard domain support, case-insensitive |
| Next.js server-action-request-meta.ts | Action ID detection via headers, request classification |
| SvelteKit form actions | `+page.server.ts`, progressive enhancement, `ActionData` |
| tRPC mutations | Zod input validation, typed output, `useMutation` |
| OWASP CSRF Prevention | Synchronizer Token, Origin header, SameSite cookies, custom headers |
| MDN CSRF Prevention | Non-simple requests as defense, Fetch-Metadata headers |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md
- ONDA-4-SOTA-RESEARCH.md (consolidado)

## Gaps para pesquisar
- [x] `defineAction()` explícito (não `'use server'` magic) — decisão confirmada
- [x] Wire protocol: REST endpoint `/api/__actions/{file}/{export}` 
- [x] Serialization: JSON (simples, debuggável)
- [x] CSRF: origin checking + custom header `X-Theo-Action` (double defense)
- [x] Bundle boundary: server/actions/ nunca importado no client (sem proxy)
- [x] Action discovery: file-based `server/actions/*.ts` scan
- [ ] Client proxy generation: typed `callAction()` helper — futuro
- [ ] Progressive enhancement: actions sem JS — futuro
- [ ] Streaming responses de actions — futuro
