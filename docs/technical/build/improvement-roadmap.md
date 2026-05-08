# Build & CLI — Improvement Roadmap

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 1/5
**Target SOTA score:** 2/5 (após Onda 0, 4/5 após Onda 6)
**Gaps filled this session:** 0 of 9 (pesquisa inicial)

## Executive Summary

O CLI do Theo (`theo dev`, `theo build`, `theo start`) é o ponto de entrada do framework. Precisa: subir rápido, falhar claro, e ser simples. Vite é o build tool (decisão já tomada no README). O CLI wrapa Vite com convenções Theo. Next.js usa Commander.js e child process fork para dev — Theo pode ser mais simples com Vite nativo.

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js bin/next.ts | NEW | Commander.js, Node.js version check, pre-action hooks, env setup |
| Next.js next-dev.ts | NEW | Child process fork, port retry max 10, IPC protocol, auto-restart |
| Next.js next-build.ts | NEW | Env loading → config → bundler → output, memory management |
| Next.js next-start.ts | NEW | Production: no retry, no fork, keepAliveTimeout |
| Next.js start-server.ts | NEW | Graceful shutdown, timing instrumentation, port conflict |
| Vite CLI | NEW | `createServer()`, `build()`, `preview()` — clean API |
| Nitro CLI | NEW | `nitro dev`, `nitro build`, preset system |

## Competitive Position

| Dimensão | Theo (target) | Next.js | Vite | Nitro | Best-in-class |
|----------|---------------|---------|------|-------|---------------|
| Startup speed | 4/5 | 3/5 | 5/5 | 4/5 | Vite |
| Error messages | 5/5 | 4/5 | 3/5 | 3/5 | Next.js |
| Port handling | 4/5 | 5/5 | 4/5 | 3/5 | Next.js |
| Graceful shutdown | 4/5 | 5/5 | 3/5 | 4/5 | Next.js |
| Simplicity | 5/5 | 2/5 | 5/5 | 4/5 | Vite |

## Decisões Arquiteturais para Onda 0

### D1: CLI framework — `citty` (Nuxt/Nitro) ou `cac` (Vite)

**Recomendação: `cac`**
- Já usado pelo Vite (dependency natural)
- Leve (< 5KB), zero dependencies
- API simples: `cac().command('dev').action(fn)`
- Alternativa: `citty` (usado por Nitro/Nuxt, mais novo, ESM native)

### D2: `theo dev` — Vite dev server + backend

```typescript
// packages/theo-cli/src/commands/dev.ts
import { createServer } from 'vite'
import { theoVitePlugin } from '@theo/vite-plugin'

async function dev(options: { port?: number }) {
  const config = await loadConfig(process.cwd())
  
  const server = await createServer({
    plugins: [theoVitePlugin(config)],
    server: { port: options.port ?? config.port ?? 3000 },
  })
  
  await server.listen()
  const elapsed = Date.now() - startTime
  console.log(`\n  Theo v${version}`)
  console.log(`  → http://localhost:${server.config.server.port}`)
  console.log(`  Ready in ${elapsed}ms\n`)
}
```

### D3: `theo build` — Vite build

```typescript
async function build() {
  const config = await loadConfig(process.cwd())
  validateProjectStructure(process.cwd(), config) // fail fast
  
  await viteBuild({
    plugins: [theoVitePlugin(config)],
    build: { outDir: '.theo' },
  })
}
```

### D4: `theo start` — Production server

```typescript
async function start(options: { port?: number }) {
  const distDir = path.join(process.cwd(), '.theo')
  if (!existsSync(distDir)) {
    throw new Error('No build found. Run `theo build` first.')
  }
  // Serve production build
}
```

### D5: Contrato na Onda 0

Na Onda 0, o CLI define apenas **os comandos e validações**. O dev server real vem na Onda 1.

```typescript
// packages/theo-cli/src/index.ts
import cac from 'cac'

const cli = cac('theo')

cli.command('dev', 'Start development server')
   .option('--port <port>', 'Port number', { default: 3000 })
   .action(dev)

cli.command('build', 'Build for production')
   .action(build)

cli.command('start', 'Start production server')
   .option('--port <port>', 'Port number', { default: 3000 })
   .action(start)

cli.help()
cli.version(version)
cli.parse()
```

## Quick Wins (1-2 sessões cada)

1. **Criar CLI entry point** com `cac` → `packages/theo-cli/src/index.ts`
2. **Criar `validateProjectStructure()`** → `packages/theo/src/core/validate-structure.ts`
3. **Criar fixture `fixtures/basic-valid-app/`** com estrutura mínima completa

## Anti-Patterns to Eliminate

1. **Child process fork** — Next.js forka para restart, Theo usa Vite HMR nativo (mais simples)
2. **Startup lento** — config loading deve ser < 50ms
3. **Mensagens genéricas de erro** — `"Cannot start"` vs `"Missing required directory: app/"`

## Sources

- [Next.js CLI](referencias/next.js/packages/next/src/bin/next.ts) — Commander.js, pre-action hooks
- [Next.js dev server](referencias/next.js/packages/next/src/cli/next-dev.ts) — child process, port retry
- [Next.js start-server.ts](referencias/next.js/packages/next/src/server/lib/start-server.ts) — graceful shutdown
- [Vite API](https://vite.dev/guide/api-javascript) — createServer, build, preview
- [cac](https://github.com/cacjs/cac) — CLI framework
- [citty](https://github.com/unjs/citty) — CLI framework (Nuxt/Nitro)
