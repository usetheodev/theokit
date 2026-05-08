# DX — Improvement Roadmap (Onda 1)

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 0/5
**Target SOTA score:** 2/5 (após Onda 1)
**Gaps filled this session:** 3 of 8

## Executive Summary

A Onda 1 precisa de duas peças: `create-theo` (scaffolding) e `theo dev` (dev server). O approach mais simples: `create-theo` copia um template directory e roda `pnpm install`; `theo dev` usa Vite em middleware mode com Express para servir React SSR. `cac` é o CLI framework (leve, usado pelo Vite, zero deps).

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js create-next-app | UPDATED | Commander.js + prompts, template copy via fast-glob, pkg manager via npm_config_user_agent |
| create-vite | NEW | `mri` parser, template-{variant} dirs, renameFiles pattern, title replacement |
| Rails AppGenerator | NEW | Thor templates, builder pattern, sequential post-generation hooks |
| cac | UPDATED | v6.7.14, 58M downloads/month, usado por Vite+Vitest, 4 APIs |
| Vite SSR guide | NEW | `middlewareMode: true` + `ssrLoadModule` + `transformIndexHtml` |

## Decisões Arquiteturais para Onda 1

### D1: `create-theo` — Copy approach (como create-vite), não prompts

Para Onda 1, scaffolding é NON-INTERACTIVE. Razão: simplicidade, CI-friendly, um jeito só.

```bash
npx create-theo@latest my-app
# Copia template, ajusta package.json name, roda pnpm install
```

Sem prompts. Sem opções TypeScript/JavaScript (TypeScript always). Sem Tailwind toggle. Convention over configuration.

**Futuro (Onda 9):** templates opcionais via `--template dashboard`.

### D2: Template structure mínima

```
templates/default/
├── app/
│   ├── page.tsx          # export default function Page() { return <h1>Hello Theo</h1> }
│   └── layout.tsx        # Root layout com html/body
├── server/
│   └── routes/
│       └── health.ts     # GET /api/health → { ok: true }
├── public/
│   └── .gitkeep
├── theo.config.ts        # defineConfig({})
├── tsconfig.json
├── _gitignore            # Renamed to .gitignore during copy
├── _env.example          # Renamed to .env.example
└── package.json.tmpl     # Template com {{name}} placeholder
```

### D3: `theo dev` — Vite middleware mode + Express

```typescript
// Simplified flow:
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
  plugins: [react()],
})

const app = express()
app.use(vite.middlewares)

app.use('*', async (req, res) => {
  const template = fs.readFileSync('index.html', 'utf-8')
  const html = await vite.transformIndexHtml(req.originalUrl, template)
  const { render } = await vite.ssrLoadModule('/src/entry-server.tsx')
  const appHtml = await render(req.originalUrl)
  res.send(html.replace('<!--ssr-outlet-->', appHtml))
})

app.listen(config.port)
```

**Decisão simplificadora para Onda 1:** NÃO fazer SSR. Apenas client-side rendering via Vite dev server padrão. SSR é complexidade que vem na Onda 2+.

Onda 1 = `vite.createServer()` + `server.listen()` + `@vitejs/plugin-react`. Sem Express. Sem SSR. Apenas:

```typescript
const server = await createServer({
  plugins: [react()],
  root: process.cwd(),
  server: { port: config.port },
})
await server.listen()
server.printUrls()
```

### D4: CLI entry point — bin field no package `theo`

```json
// packages/theo/package.json
{
  "bin": {
    "theo": "./src/cli/index.ts"
  }
}
```

Na Onda 1, o CLI é executado via `npx theo dev` ou diretamente se instalado. Usa `cac` para parsing.

### D5: Package manager detection para create-theo

```typescript
function getPkgManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}
```

Pattern usado por Next.js e create-vite — confiável, sem deps extras.

## Competitive Position

| Dimensão | Theo (target) | Next.js | create-vite | Rails | Best-in-class |
|----------|---------------|---------|-------------|-------|---------------|
| Time to scaffold | 5/5 | 3/5 | 5/5 | 3/5 | create-vite |
| Zero config needed | 5/5 | 3/5 | 4/5 | 5/5 | Rails/Theo |
| Interactive prompts | 1/5 | 5/5 | 3/5 | 4/5 | Next.js |
| Template variety | 1/5 | 3/5 | 5/5 | 5/5 | create-vite/Rails |
| Dev server startup | 5/5 | 3/5 | 5/5 | 3/5 | Vite |
| Error messages | 4/5 | 4/5 | 2/5 | 4/5 | Next.js |

## Quick Wins (1-2 sessões cada)

1. **Criar `create-theo` CLI** — copia template dir, ajusta name → `packages/create-theo/src/index.ts`
2. **Criar template default** — page.tsx + layout.tsx + health route + config → `packages/create-theo/templates/default/`
3. **Criar `theo dev` command** — Vite createServer + listen → `packages/theo/src/cli/dev.ts`
4. **Criar `theo` bin entry** — cac commands → `packages/theo/src/cli/index.ts`

## Anti-Patterns to Eliminate

1. **Prompts excessivos** — create-next-app pergunta 8 coisas. Theo não pergunta nada. Convention.
2. **SSR na Onda 1** — Complexidade desnecessária. CSR com Vite é suficiente para "Hello Theo".
3. **Express dependency** — Na Onda 1, Vite dev server nativo basta. Express vem quando precisar de server routes (Onda 3).

## Sources

- [Vite SSR Guide](https://vite.dev/guide/ssr) — middleware mode pattern
- [create-vite source](https://github.com/vitejs/vite/tree/main/packages/create-vite) — scaffolding pattern
- [cac](https://github.com/cacjs/cac) — CLI framework
- [StartER Express+Vite](https://rocambille.github.io/en/2025/05/05/how-starter-solves-the-express-vite-ssr-puzzle/) — SSR pattern
- [React SSR with Vite](https://thenewstack.io/how-to-build-a-server-side-react-app-using-vite-and-express/) — tutorial
- [Next.js create-next-app](referencias/next.js/packages/create-next-app/) — scaffolding reference
- [Rails AppGenerator](referencias/rails/railties/lib/rails/generators/rails/app/app_generator.rb) — generator pattern
