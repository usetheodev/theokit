# Build & CLI — Pesquisa SOTA

## Escopo
CLI commands (`theo dev`, `theo build`, `theo start`) e build pipeline via Vite.

## Packages alvo
- `@theo/cli` — CLI entry point, commands
- `@theo/vite-plugin` — Vite integration, HMR, dev server

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js bin/next.ts | Commander.js, Node.js version check, dependency validation, pre-action hooks |
| Next.js next-dev.ts | Dev server: child process fork, port retry (max 10), IPC, auto-restart |
| Next.js next-build.ts | Build pipeline: env loading → config → bundler → output |
| Next.js next-start.ts | Production server: no retry, no fork, keepAliveTimeout |
| Next.js start-server.ts | Shared bootstrap: HTTP/HTTPS, port conflict, graceful shutdown, timing |
| Vite CLI | `createServer()`, `build()`, `preview()` APIs |
| Nitro CLI | `nitro dev`, `nitro build`, preset system para deploy targets |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [ ] CLI framework: commander vs cac vs citty vs custom
- [ ] Dev server: Vite `createServer()` vs custom server wrapping Vite
- [ ] Build output: `.theo/` directory structure
- [ ] Production server: Node.js HTTP server servindo build output
- [ ] Port detection e retry strategy
- [ ] Graceful shutdown com signal handling
- [ ] Startup timing (`Ready in Xms`)
- [ ] Environment variable loading (`.env` files)
- [ ] Node.js version validation
