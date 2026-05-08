# Build & CLI — Pesquisa SOTA

## Escopo
CLI commands (`theo dev`, `theo build`, `theo start`) e build pipeline via Vite.

## Packages alvo
- `theo` (bin) — CLI entry point via cac
- Vite plugin (inline na Onda 1, package separado futuro)

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js bin/next.ts | Commander.js, Node.js version check, dependency validation, pre-action hooks |
| Next.js next-dev.ts | Dev server: child process fork, port retry (max 10), IPC, auto-restart |
| Next.js next-build.ts | Build pipeline: env loading → config → bundler → output |
| Next.js next-start.ts | Production server: no retry, no fork, keepAliveTimeout |
| Next.js start-server.ts | Shared bootstrap: HTTP/HTTPS, port conflict, graceful shutdown, timing |
| Vite CLI | `createServer()`, `build()`, `preview()` APIs |
| Vite SSR guide | `middlewareMode: true`, `ssrLoadModule`, `transformIndexHtml` |
| Nitro CLI | `nitro dev`, `nitro build`, preset system para deploy targets |
| cac | v6.7.14, 4 APIs core, zero deps, usado por Vite/Vitest |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [x] CLI framework: cac (decidido)
- [x] Dev server: Vite `createServer()` nativo para Onda 1 (sem Express/SSR)
- [ ] Build output: `.theo/` directory structure (Onda 6)
- [ ] Production server: Node.js HTTP server servindo build output (Onda 6)
- [x] Port detection: Vite nativo (retry automático)
- [ ] Graceful shutdown com signal handling (Onda 6)
- [x] Startup timing: Vite `server.printUrls()` inclui timing
- [ ] Environment variable loading (`.env` files) — Vite nativo
- [ ] Node.js version validation
