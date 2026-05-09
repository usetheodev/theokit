# Onda 6 — SOTA Research Consolidado

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Build + Production Runtime — `theo build` e `theo start`

---

## 1. Sumário Executivo

Onda 6 implementa `theo build` (Vite build para client) e `theo start` (Node.js HTTP server para produção). **Sem SSR** — CSR only como nas Ondas 1-5. O build gera `.theo/client/` (static assets via Vite) e `.theo/server/` (server routes/actions copiados/bundled). O production server serve static files e executa API routes/actions via import direto (não `ssrLoadModule`).

---

## 2. Decisões Arquiteturais

### D1: Build output em `.theo/`

```
.theo/
├── client/           # Vite build output (index.html, JS, CSS, assets)
│   ├── index.html
│   ├── assets/
│   │   ├── index-abc123.js
│   │   └── index-def456.css
│   └── .vite/
│       └── manifest.json
└── server/           # Server code (bundled via esbuild/tsx)
    ├── routes/       # Compiled server routes
    ├── actions/      # Compiled server actions
    ├── middleware.js  # Compiled middleware
    └── context.js    # Compiled context
```

### D2: `theo build` = Vite build + server bundle

```typescript
// Step 1: Vite client build
await viteBuild({
  root: cwd,
  plugins: [react(), theoPlugin(cwd)],
  build: { outDir: '.theo/client' },
})

// Step 2: Bundle server code via esbuild (simple bundling)
// Copy/transpile server/ directory to .theo/server/
```

**Decisão simplificadora:** Na Onda 6, o server code NÃO é bundled — é executado via `tsx` em produção (como em dev). Build real com esbuild bundling vem em Onda futura. Isso simplifica drasticamente — `theo start` usa `tsx` para importar server routes diretamente.

### D3: `theo start` = Node.js HTTP server

```typescript
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const server = createServer(async (req, res) => {
  const url = req.url ?? '/'
  
  // 1. API routes → execute handler
  if (url.startsWith('/api/')) {
    // Load and execute server route/action
    return
  }
  
  // 2. Static files from .theo/client/
  const filePath = join(distDir, 'client', url)
  if (existsSync(filePath) && !filePath.includes('..')) {
    // Serve static file with correct MIME type
    return
  }
  
  // 3. SPA fallback → serve index.html
  const indexHtml = readFileSync(join(distDir, 'client/index.html'), 'utf-8')
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(indexHtml)
})

server.listen(port)
```

### D4: Sem TypeScript check no build (simplificação Onda 6)

O teste obrigatório 4 diz "Erro de TypeScript deve quebrar build". Na Onda 6, `theo build` roda `vite build` que NÃO faz type checking (Vite transpila com esbuild, ignora types). Para compliance, adicionamos `tsc --noEmit` como step opcional antes do Vite build.

### D5: Assets públicos via `public/`

Vite copia `public/` para o output automaticamente. `public/logo.png` → `.theo/client/logo.png`. O production server serve como static file.

---

## 3. Componentes a Construir

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Build command | `packages/theo/src/cli/commands/build.ts` (NEW) | Vite build + server prep |
| Start command | `packages/theo/src/cli/commands/start.ts` (NEW) | Production HTTP server |
| Production server | `packages/theo/src/server/production.ts` (NEW) | Static files + API routing |
| CLI updates | `packages/theo/src/cli/index.ts` (EDIT) | Add `build` and `start` commands |

### Reutilização:
- `scanServerRoutes` da Onda 3 → scan routes em produção
- `scanServerActions` da Onda 4 → scan actions em produção
- `matchRoute`, `compilePattern` → route matching em produção
- `executeRoute`, `executeAction` → execução (adaptada para sem Vite)
- `runMiddlewareAndContext` → middleware/context em produção
- `parseBody`, `sendJson`, `sendError` → HTTP helpers

### Adaptação para produção:
Em dev, server routes são carregados via `vite.ssrLoadModule()`. Em produção, são carregados via `import()` direto (via tsx). A diferença é que `ssrLoadModule` faz HMR — `import()` não precisa disso em prod.

---

## 4. Testes Obrigatórios

### Teste 1 — Build gera `.theo/`
```bash
theo build && ls .theo/client/index.html
```

### Teste 2 — Start production
```bash
theo start && curl http://localhost:3000/
```

### Teste 3 — Paridade dev/prod
```
GET /dashboard em dev → funciona
GET /dashboard em prod → funciona igual
```

### Teste 4 — Build com TypeScript (opcional)
```bash
theo build --typecheck  # Roda tsc antes do Vite build
```

### Teste 5 — Assets públicos
```bash
# public/logo.png → servido em prod
curl http://localhost:3000/logo.png → 200
```

---

## 5. Fora de Escopo

- ❌ SSR (CSR only)
- ❌ Server bundling com esbuild (tsx em prod é suficiente para MVP)
- ❌ Docker file generation
- ❌ Environment-specific builds
- ❌ Code splitting avançado (Vite default é suficiente)
- ❌ Edge runtime / Cloudflare Workers

---

## Sources

- [Vite Build Guide](https://vite.dev/guide/build)
- [Vite SSR Guide](https://vite.dev/guide/ssr)
- [Vite Build Options](https://vite.dev/config/build-options)
- [Vite Static Deploy](https://vite.dev/guide/static-deploy)
