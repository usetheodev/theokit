# Build & CLI — Pesquisa SOTA

## Escopo
CLI commands (`theo dev`, `theo build`, `theo start`) e build pipeline via Vite.

## Packages alvo
- `theo` (bin) — CLI entry point via cac
- Vite plugin (inline, theoPlugin)

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Vite build guide | `vite build`, outDir, manifest.json, asset hashing |
| Vite SSR guide | Client/server split build, ssrManifest |
| Vite static deploy | `vite preview`, dist/ structure |
| Next.js next-build.ts | Build pipeline: env → config → bundler → output |
| Next.js next-start.ts | Production server: static files + SSR |
| Nitro CLI | `nitro build`, preset system |
| cac | CLI framework, 4 APIs |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [x] CLI framework: cac (Onda 1)
- [x] Dev server: Vite createServer (Onda 1)
- [x] Build output: `.theo/client/` + `.theo/server/` (Onda 6 research)
- [x] Production server: Node.js HTTP + static files + API execution (Onda 6 research)
- [x] Port detection: Vite nativo
- [x] Startup timing: Vite printUrls
- [ ] Graceful shutdown com signal handling — Onda 6 implementation
- [ ] Environment variable loading (`.env` files)
- [ ] Server bundling via esbuild — futuro
