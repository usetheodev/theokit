# Onda 1 — SOTA Research Consolidado

**Data:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** CLI + projeto mínimo executável (create-theo, theo dev)

---

## 1. Sumário Executivo

Onda 1 entrega o primeiro momento mágico: `npx create-theo my-app && cd my-app && theo dev` abre "Hello Theo" no browser. Dois componentes: `create-theo` (scaffolding) e `theo dev` (Vite dev server). Decisão-chave: **sem SSR na Onda 1** — Vite dev server nativo com `@vitejs/plugin-react` é suficiente para CSR. SSR vem na Onda 2.

| Framework | Tipo | O que extraímos |
|-----------|------|-----------------|
| **Next.js create-next-app** | Local | Commander.js, prompts, template copy via fast-glob, pkg manager detection |
| **create-vite** | Web | `mri` parser, template-{variant} dirs, renameFiles, título no index.html |
| **Rails AppGenerator** | Local | Thor templates, builder pattern, post-generation hooks |
| **Vite SSR guide** | Web | `middlewareMode`, `ssrLoadModule`, `transformIndexHtml` (futuro) |
| **cac** | Web | v6.7.14, 58M downloads/mês, 4 APIs, zero deps |

---

## 2. Decisões Arquiteturais

### D1: `create-theo` é NON-INTERACTIVE

Sem prompts. Um template. TypeScript always. Convention over configuration.

```bash
npx create-theo@latest my-app
# 1. Cria diretório
# 2. Copia template
# 3. Ajusta package.json name
# 4. Detecta pkg manager
# 5. Roda install
# Done.
```

**Justificativa:** create-next-app pergunta 8 coisas. Theo é opinativo como Rails — não pergunta, decide.

### D2: Template mínimo (default)

```
templates/default/
├── app/
│   ├── page.tsx             # <h1>Hello Theo</h1>
│   └── layout.tsx           # html + body + {children}
├── server/
│   └── routes/
│       └── health.ts        # defineRoute GET → { ok: true }
├── public/
│   └── .gitkeep
├── index.html               # Vite entry: <div id="root"> + <script src="/app/entry-client.tsx">
├── theo.config.ts           # defineConfig({})
├── tsconfig.json            # strict, jsx: react-jsx, paths
├── _gitignore               # → .gitignore during copy
└── package.json.tmpl        # { name: "{{name}}", deps: theo, react, react-dom }
```

### D3: `theo dev` = Vite dev server nativo (sem SSR, sem Express)

```typescript
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const server = await createServer({
  plugins: [react()],
  root: process.cwd(),
  server: { port: config.port ?? 3000 },
})
await server.listen()
server.printUrls()
```

**Por que não SSR:** Na Onda 1, o objetivo é "Hello Theo" no browser. CSR via Vite é suficiente. SSR adiciona: entry-server.tsx, Express, renderToString, hydration — complexidade para Onda 2.

**Por que não Express:** Vite dev server já serve arquivos, faz HMR, e resolve imports. Express é necessário apenas quando server routes precisam executar (Onda 3).

### D4: CLI via `cac`

```typescript
import cac from 'cac'

const cli = cac('theo')

cli.command('dev', 'Start development server')
   .option('--port <port>', 'Port number', { default: 3000 })
   .action(devCommand)

cli.help()
cli.version(version)
cli.parse()
```

### D5: Package manager detection

```typescript
function getPkgManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}
```

### D6: Entry client (CSR bootstrap)

```tsx
// app/entry-client.tsx (gerado pelo framework, não pelo template)
import { createRoot } from 'react-dom/client'
import Page from './page'
import Layout from './layout'

createRoot(document.getElementById('root')!).render(
  <Layout><Page /></Layout>
)
```

**Decisão:** O entry-client é virtual module gerado pelo Vite plugin do Theo, NÃO um arquivo no template. O dev não precisa saber que existe.

### D7: index.html no template

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Theo App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/@theo/entry-client"></script>
  </body>
</html>
```

O `/@theo/entry-client` é um virtual module resolvido pelo Vite plugin. O dev não toca nesse arquivo.

---

## 3. Fluxo de Execução

### `npx create-theo my-app`

```
1. Parse args: directory name
2. Validate directory (not exists or empty)
3. Copy templates/default/ → my-app/
4. Rename _gitignore → .gitignore
5. Replace {{name}} in package.json.tmpl → package.json
6. Detect pkg manager
7. Run install (spawn child process)
8. Print success message
```

### `theo dev`

```
1. Load config: loadConfig(cwd)
2. Validate structure: validateProjectStructure(cwd)
3. Create Vite server:
   - plugins: [react(), theoPlugin()]
   - root: cwd
   - port: config.port
4. Listen
5. Print URLs
```

### `theoPlugin()` (Vite plugin)

```typescript
function theoPlugin(): Plugin {
  return {
    name: 'theo',
    resolveId(id) {
      if (id === '/@theo/entry-client') return '\0@theo/entry-client'
    },
    load(id) {
      if (id === '\0@theo/entry-client') {
        return `
          import { createRoot } from 'react-dom/client'
          import Page from '${resolve(root, 'app/page.tsx')}'
          createRoot(document.getElementById('root')).render(<Page />)
        `
      }
    },
  }
}
```

---

## 4. Testes da Onda 1

### Teste 1 — Scaffold
```typescript
it('should generate project structure', async () => {
  await createTheo(tempDir, 'my-app')
  expect(existsSync(join(tempDir, 'my-app/package.json'))).toBe(true)
  expect(existsSync(join(tempDir, 'my-app/app/page.tsx'))).toBe(true)
  expect(existsSync(join(tempDir, 'my-app/theo.config.ts'))).toBe(true)
})
```

### Teste 2 — Dev server sobe
```typescript
it('should respond HTTP 200 on /', async () => {
  const server = await startDevServer(fixtureDir)
  const res = await fetch(`http://localhost:${server.port}/`)
  expect(res.status).toBe(200)
  await server.close()
})
```

### Teste 3 — Conteúdo renderizado (Playwright)
```typescript
test('should render Hello Theo', async ({ page }) => {
  await page.goto('http://localhost:3000/')
  await expect(page.locator('h1')).toHaveText('Hello Theo')
})
```

---

## 5. Tecnologias para Onda 1

| Componente | Tecnologia | Motivo |
|-----------|------------|--------|
| CLI framework | **cac** | Leve, usado pelo Vite, zero deps |
| Dev server | **Vite** (createServer) | Nativo, HMR, React plugin |
| React plugin | **@vitejs/plugin-react** | Official, SWC/Babel transform |
| Scaffolding | File copy + template | Simples, sem deps extras |
| Pkg manager detect | `npm_config_user_agent` | Pattern padrão (Next.js, Vite) |
| E2E tests | **Playwright** | Browser real |
| Process spawn | **cross-spawn** | Cross-platform child process |

---

## 6. Dependências novas (Onda 1)

```json
// packages/theo/package.json — dependencies
{
  "cac": "^6.7.14",
  "vite": "^6.0.0",
  "@vitejs/plugin-react": "^4.4.0"
}

// packages/theo/package.json — peerDependencies (já existe)
{
  "zod": "^3.24.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
}

// packages/create-theo/package.json — dependencies
{
  "cross-spawn": "^7.0.6"
}
```

---

## 7. Fora de Escopo (Onda 1)

- ❌ SSR (Onda 2)
- ❌ Server routes execution (Onda 3)
- ❌ Server actions execution (Onda 4)
- ❌ Middleware execution (Onda 5)
- ❌ `theo build` / `theo start` (Onda 6)
- ❌ Templates múltiplos (Onda 9)
- ❌ Interactive prompts
- ❌ TypeScript/JavaScript toggle (TypeScript always)

---

## 8. Benchmark Summary

```
SOTA Research Complete — Onda 1
==============================================
| Domínio | Before | After | Gaps Filled | New Refs | Quick Wins |
|---------|--------|-------|-------------|----------|------------|
| dx      | 0/5    | 1/5   | 3 of 8      | 5        | 4          |
| build   | 1/5    | 1/5   | 4 of 9      | 2        | 3          |

Files updated: 2 INDEX.md, 1 improvement-roadmap.md
Files created: 1 INDEX.md, 1 improvement-roadmap.md, 1 consolidado
Validation: PASS
```

---

## Sources

### Referências locais
- `referencias/next.js/packages/create-next-app/` — scaffolding CLI
- `referencias/rails/railties/lib/rails/generators/` — generator pattern

### Web
- [Vite SSR Guide](https://vite.dev/guide/ssr)
- [create-vite source](https://github.com/vitejs/vite/tree/main/packages/create-vite)
- [cac CLI framework](https://github.com/cacjs/cac)
- [StartER Express+Vite SSR](https://rocambille.github.io/en/2025/05/05/how-starter-solves-the-express-vite-ssr-puzzle/)
- [React SSR with Vite+Express](https://thenewstack.io/how-to-build-a-server-side-react-app-using-vite-and-express/)
- [create-vite DeepWiki](https://deepwiki.com/vitejs/vite/6-project-scaffolding)
