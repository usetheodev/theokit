# Onda 16 — SOTA Research: SSR/Streaming HTML

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Server-Side Rendering com React para o Theo — renderToPipeableStream, hydrateRoot, React Router v7 SSR, Vite SSR.

---

## 1. Estado Atual do Theo (CSR-only)

### Pipeline Atual

```
Browser request → Production server (start.ts)
  → API route? → executeRoute → JSON
  → Static file? → serve file
  → Else? → serve index.html (SPA fallback)
      → Browser loads JS → React renders client-side
```

**Problema**: O `index.html` é um shell vazio (`<div id="root"></div>`). O browser precisa baixar JS, executar React, e renderizar — só então o user vê conteúdo. SEO crawlers veem página vazia.

### O Que SSR Muda

```
Browser request → Production server
  → API route? → executeRoute → JSON (unchanged)
  → Static file? → serve file (unchanged)
  → Else? → React renderToPipeableStream → HTML com conteúdo
      → Browser recebe HTML completo → mostra conteúdo imediatamente
      → Hydration: React attach event listeners ao HTML existente
```

---

## 2. Componentes Necessários para SSR

### A. Build Pipeline (2 builds em vez de 1)

**Hoje**: 1 build (client-only)
```
theo build → Vite client build → .theo/client/ (index.html + assets)
```

**Com SSR**: 2 builds
```
theo build → Vite client build → .theo/client/ (assets, sem index.html completo)
           → Vite SSR build → .theo/server/ (server entry para renderizar React)
```

O Vite já suporta SSR build nativamente:
```typescript
await viteBuild({
  build: {
    ssr: true,
    outDir: '.theo/server',
    rollupOptions: { input: 'app/entry-server.tsx' },
  },
})
```

### B. Entry Server (`app/entry-server.tsx`)

Novo arquivo que o framework gera (virtual module ou template):

```typescript
import { renderToPipeableStream } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from './route-manifest'

export async function render(url: string): Promise<NodeJS.ReadableStream> {
  const handler = createStaticHandler(routes)
  const request = new Request(`http://localhost${url}`)
  const context = await handler.query(request)
  
  if (context instanceof Response) {
    throw context // redirect
  }
  
  const router = createStaticRouter(handler.dataRoutes, context)
  
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StaticRouterProvider router={router} context={context} />,
      {
        onShellReady() { resolve(pipe) },
        onError: reject,
      }
    )
  })
}
```

### C. Entry Client (hydration em vez de createRoot)

**Hoje** (`entry.ts` gera):
```typescript
createRoot(el).render(<RouterProvider router={router} />)
```

**Com SSR**:
```typescript
hydrateRoot(el, <RouterProvider router={router} />)
```

### D. Production Server (start.ts changes)

O SPA fallback muda de "servir index.html" para "renderizar React no server":

```typescript
// Antes: SPA fallback
res.writeHead(200, { 'Content-Type': 'text/html' })
res.end(indexHtml)

// Depois: SSR
const { render } = await import('.theo/server/entry-server.js')
const stream = await render(url)
res.writeHead(200, { 'Content-Type': 'text/html' })
// Pipe HTML template head + stream + template tail
```

### E. HTML Template Split

O `index.html` precisa ser dividido em head e tail para injetar o HTML renderizado:

```html
<!-- HEAD (antes do #root) -->
<!DOCTYPE html><html><head>...</head><body><div id="root">

<!-- SSR CONTENT (React renderiza aqui) -->

<!-- TAIL (depois do #root) -->
</div><script type="module" src="/assets/entry-client.js"></script></body></html>
```

---

## 3. React Router v7 SSR (Library Mode)

O Theo usa React Router v7 em "library mode" (não "framework mode"). Para SSR, as APIs relevantes são:

| API | Lado | Propósito |
|-----|------|-----------|
| `createStaticHandler(routes)` | Server | Cria handler para matching + data loading |
| `handler.query(request)` | Server | Executa loaders, resolve route |
| `createStaticRouter(dataRoutes, context)` | Server | Cria router para render |
| `StaticRouterProvider` | Server | Componente para renderizar no server |
| `createBrowserRouter(routes)` | Client | Router do browser (já existe) |
| `hydrateRoot()` | Client | Hydration (substitui `createRoot`) |

**Import em v7**: Tudo de `"react-router"` (não `"react-router-dom/server"`).

---

## 4. Vite SSR Build

O Vite tem suporte SSR nativo:

```typescript
// Client build (já existe)
await viteBuild({
  build: { outDir: '.theo/client' },
})

// SSR build (NOVO)
await viteBuild({
  build: {
    ssr: true,
    outDir: '.theo/server',
    rollupOptions: { input: 'app/entry-server.tsx' },
  },
})
```

A diferença:
- **Client build**: Bundla para browser (ES modules, code splitting)
- **SSR build**: Bundla para Node.js (CommonJS ou ESM, sem code splitting, externals)

---

## 5. Análise de Complexidade

### O que MUDA no Theo

| Componente | Mudança | Complexidade |
|-----------|---------|-------------|
| `entry.ts` (virtual module) | `createRoot` → `hydrateRoot` | Baixa |
| `build.ts` | Adicionar SSR build | Média |
| `start.ts` | SPA fallback → SSR render | Alta |
| `dev.ts` | SSR em dev via `vite.ssrLoadModule` | Alta |
| `index.html` template | Split head/tail | Baixa |
| `theoPlugin` | Gerar entry-server virtual module | Média |
| Config schema | Adicionar `ssr: boolean` | Baixa |

### O que NÃO muda

- API routes (server/routes/) — inalterado
- Server actions — inalterado
- Middleware/context — inalterado
- Cookies/auth — inalterado
- Templates — precisam de atualização mas lógica é a mesma

---

## 6. Decisões Arquiteturais

### D1 — SSR opt-in via config

```typescript
// theo.config.ts
export default defineConfig({
  ssr: true, // default: false (backward compat)
})
```

**Se `ssr: false`**: Comportamento atual (CSR-only). Nada muda.
**Se `ssr: true`**: Build gera client + server. Production server faz SSR.

### D2 — Streaming SSR (renderToPipeableStream, não renderToString)

`renderToPipeableStream` é a API moderna do React 19:
- Streaming: HTML é enviado progressivamente
- Suspense boundaries: Conteúdo fora de Suspense é enviado imediatamente, rest segue
- Melhor TTFB que `renderToString` (que bufferiza tudo)

### D3 — Dev SSR via vite.ssrLoadModule

Em dev, o Vite pode fazer SSR sem build:
```typescript
const mod = await vite.ssrLoadModule('/app/entry-server.tsx')
const html = await mod.render(url)
```

### D4 — Entry server como virtual module

O framework gera `entry-server.tsx` como virtual module (mesmo pattern do entry-client). O user NÃO precisa criar esse arquivo.

### D5 — Fallback para CSR em erro de SSR

Se o SSR falha (ex: componente com window reference), o server serve o `index.html` shell (CSR fallback). Graceful degradation.

---

## 7. Benchmark

| Dimensão | Theo (CSR) | Theo (SSR proposto) | Next.js | Remix |
|----------|-----------|---------------------|---------|-------|
| First Contentful Paint | Lento (JS-first) | Rápido (HTML-first) | Rápido | Rápido |
| SEO | ❌ Vazio | ✅ HTML completo | ✅ | ✅ |
| Time to Interactive | Médio | Mesmo (hydration) | Mesmo | Mesmo |
| Streaming | N/A | ✅ renderToPipeableStream | ✅ | ✅ |
| Complexity | Simples | Médio | Alto (RSC) | Médio |
| Opt-in | N/A | ✅ config flag | N/A (always SSR) | N/A |

---

## 8. Escopo Mínimo para Onda 16

### O que implementar (MVP SSR)

1. **Config `ssr: boolean`** no schema (default false)
2. **Entry server virtual module** para SSR render
3. **Entry client com hydrateRoot** quando SSR=true
4. **Build command** gera 2 outputs (client + server)
5. **Production server** usa SSR render em vez de SPA fallback
6. **Dev server** usa `vite.ssrLoadModule` para SSR em dev
7. **Fallback para CSR** em erro de SSR
8. **HTML template split** (head/tail injection)

### O que NÃO implementar (post-MVP)

- React Server Components (RSC) — complexidade astronômica
- Selective hydration com Suspense boundaries — React faz automaticamente
- Pre-rendering / SSG — onda futura
- Per-route SSR toggle — onda futura
- Data loaders (Remix-style) — React Router data routers já suportam

---

## 9. Impacto Estimado

| Item | Mudança |
|------|---------|
| Arquivos modificados | 5 (entry.ts, build.ts, start.ts, dev.ts, theoPlugin, schema.ts) |
| Arquivos novos | 1 (entry-server generator) |
| Testes novos | ~12 (SSR render, hydration, build outputs, fallback) |
| Breaking changes | Zero (SSR é opt-in, default false) |
| Complexidade | **ALTA** — maior onda desde o início |

---

## Sources

- [React renderToPipeableStream](https://react.dev/reference/react-dom/server/renderToPipeableStream)
- [Streaming SSR with TypeScript (2026)](https://stevekinney.com/courses/react-typescript/streaming-ssr-typescript)
- [Vite SSR Guide](https://vite.dev/guide/ssr)
- [React Router v7 Custom Framework](https://reactrouter.com/start/data/custom)
- [React Router createStaticHandler](https://reactrouter.com/en/main/routers/create-static-handler)
- [React Router StaticRouterProvider](https://reactrouter.com/api/data-routers/StaticRouterProvider)
- [React Router SSR Guide (GitHub)](https://github.com/remix-run/react-router/blob/main/docs/guides/ssr.md)
- [SSRx vs Vinxi vs Vike](https://dev.to/this-is-learning/ssrx-vs-vinxi-vs-vike-for-ssr-with-vite-45np)
- [React Hydration Rules](https://github.com/jantimon/react-hydration-rules)
- [Server-side rendering with React Router v7](https://blog.logrocket.com/server-side-rendering-react-router-v7/)
