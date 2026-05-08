# Config System — Pesquisa SOTA

## Escopo
Sistema de configuração do framework via `theo.config.ts` com `defineConfig()`.

## Packages alvo
- `theo` — export `defineConfig` via subpath `theo`
- `@theo/core` — config schema, defaults, validation

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js config-schema.ts | Zod validation com `z.strictObject()`, error classification (fatal vs warning) |
| Next.js config-shared.ts | `defaultConfig` object freeze, deep merge strategy |
| Next.js config.ts | `loadConfig()` flow: find → transpile → normalize → validate |
| Next.js transpile-config.ts | TypeScript config transpilation via SWC |
| Vite `defineConfig` | Identity function for type inference, pattern adotado por todo ecossistema |
| Nitro `defineNitroConfig` | `compatibilityDate`, runtime config typing |
| Nuxt `defineNuxtConfig` | Typed config com auto-complete |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [ ] Definir schema Zod completo para `TheoConfig`
- [ ] Estratégia de defaults: deep merge vs shallow merge
- [ ] Config reload em dev mode (hot reload de config)
- [ ] Suporte a `theo.config.js` / `theo.config.mjs` além de `.ts`
- [ ] Mensagens de erro para config inválida (DX)
- [ ] Config phases (dev vs build vs start) como Next.js
