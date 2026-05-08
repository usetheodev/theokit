# Developer Experience (DX) — Pesquisa SOTA

## Escopo
CLI design (`create-theo`, `theo dev/build/start`), scaffolding, templates, error messages, onboarding.

## Packages alvo
- `create-theo` — scaffolding CLI
- `theo` (bin) — framework CLI commands

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js create-next-app | Commander.js, prompts, template copy, pkg manager detection, CI mode |
| create-vite | `mri` parser, template-{variant} dirs, renameFiles, `_gitignore` → `.gitignore` |
| Rails AppGenerator | Thor templates (.tt), builder pattern, post-generation hooks |
| cac CLI framework | Leve, usado por Vite/Vitest, 4 APIs core, zero deps |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [x] CLI framework choice (cac vs commander vs citty) — decidido: `cac`
- [x] Scaffolding: como copiar template files — decidido: file copy approach
- [x] Package manager detection (npm/pnpm/yarn/bun)
- [ ] Template structure mínima para Onda 1
- [ ] Interactive vs non-interactive mode
- [ ] Error messages para CLI (missing deps, wrong node version)
- [ ] `theo dev` startup sequence com Vite
- [ ] Progress/spinner durante scaffolding
