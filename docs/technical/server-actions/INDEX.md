# Server Actions — Pesquisa SOTA

## Escopo
Funções server-side chamadas pelo frontend com contrato tipado via `defineAction()`.

## Packages alvo
- `theo/server` — export `defineAction`
- `@theo/server` — action discovery, execution, CSRF, serialization

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js action-handler.ts | Server Action execution pipeline, CSRF via origin checking, body size limiting |
| Next.js server_actions.rs | Action ID generation (SHA1 hash + arg metadata), deterministic IDs |
| Next.js server-reference-proxy-loader.ts | Client proxy pattern: `createServerReference(actionId, callServer)` |
| Next.js server-action-reducer.ts | Wire protocol: `POST` com header `next-action`, React Flight encoding |
| Next.js csrf-protection.ts | Origin matching com wildcard support, case-insensitive |
| Next.js action-validate.ts | Runtime validation: `ensureServerEntryExports` (must be async functions) |
| SvelteKit form actions | `+page.server.ts` pattern, progressive enhancement, `ActionData` typing |
| tRPC mutations | Zod input validation, typed output, `useMutation` hook |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [ ] Theo usa `'use server'` directive ou `defineAction()` explícito? (decisão arquitetural)
- [ ] Wire protocol: REST endpoint por action ou multiplexed?
- [ ] Serialization: JSON vs React Flight vs custom
- [ ] CSRF: token-based vs origin checking vs ambos
- [ ] Client proxy generation: build-time vs runtime
- [ ] Progressive enhancement: actions funcionam sem JS?
- [ ] Bundle boundary: como garantir que handler não vaza pro client
- [ ] Action discovery: file-based (`server/actions/*.ts`) vs export-based
