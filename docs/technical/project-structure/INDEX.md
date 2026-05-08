# Project Structure — Pesquisa SOTA

## Escopo
Estrutura de diretórios do projeto Theo, validação e discovery.

## Packages alvo
- `@theo/core` — structure validation, directory scanning
- `@theo/cli` — project scaffolding validation

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js find-pages-dir.ts | Required directories (app/ OR pages/), src/ fallback, error messages |
| Next.js find-config.ts | Config file discovery chain: package.json → rc files → config files |
| Next.js config.ts (unsupported files) | Explicit blocking of unsupported extensions com mensagens claras |
| Rails application.rb | Root detection via `config.ru`, lazy structure discovery |
| Nuxt directory structure | `app/`, `server/`, `components/`, `composables/`, `layouts/`, `pages/` |
| SvelteKit structure | `src/routes/`, `src/lib/`, `static/` |

## Estrutura oficial do Theo

```
my-app/
├── app/                  # REQUIRED — Pages, file-based routing
│   ├── page.tsx          # Landing page at /
│   └── layout.tsx        # Root layout
├── server/               # OPTIONAL — Backend
│   ├── routes/           # HTTP API routes
│   ├── actions/          # Server actions
│   ├── middleware.ts      # Request middleware
│   └── context.ts        # Request context
├── components/           # OPTIONAL — Shared React components
├── lib/                  # OPTIONAL — Shared utilities
├── public/               # OPTIONAL — Static assets
├── theo.config.ts        # REQUIRED — Framework config
└── package.json          # REQUIRED
```

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [ ] Quais diretórios são REQUIRED vs OPTIONAL?
- [ ] Suporte a `src/` prefix (como Next.js)?
- [ ] Validação eager (startup) vs lazy (on-demand)?
- [ ] Mensagens de erro para estrutura inválida
- [ ] File watching para novos diretórios em dev mode
- [ ] Extensões suportadas: `.tsx`, `.ts`, `.jsx`, `.js`?
