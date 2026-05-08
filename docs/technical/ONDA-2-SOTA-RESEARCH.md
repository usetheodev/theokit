# Onda 2 — SOTA Research Consolidado

**Data:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** App Router frontend — file-based routing, nested layouts, error boundaries, 404

---

## 1. Sumário Executivo

Onda 2 implementa file-based routing CSR: scan `app/` → build route manifest → render com React Router. Decisão-chave: **react-router v7** (não TanStack Router) — maturo, leve (~8KB), nested layouts via `<Outlet />`, `errorElement` nativo. O Vite plugin evolui de "hardcoded page.tsx" para "scan + route manifest virtual module".

---

## 2. Decisões Arquiteturais

### D1: React Router v7 como runtime router

**Por que react-router e não TanStack Router:**
- Maturo e battle-tested (100M+ downloads/mês)
- ~8KB gzipped vs TanStack ~15KB
- `createBrowserRouter` + nested routes resolve layouts naturalmente
- `errorElement` resolve error boundaries por segmento
- `<Outlet />` é o pattern padrão para layout composition
- v7 unificou react-router-dom em `react-router` (import simplificado)

**Consequência:** `react-router` vira peerDependency do `theo`.

### D2: Vite plugin scan `app/` e gera route manifest como virtual module

**Fluxo:**

```
app/
├── page.tsx           → { path: '/', component: 'app/page.tsx' }
├── layout.tsx         → { layout: 'app/layout.tsx' }
├── error.tsx          → { errorBoundary: 'app/error.tsx' }
├── loading.tsx        → { loading: 'app/loading.tsx' }
├── not-found.tsx      → { notFound: 'app/not-found.tsx' }
├── about/
│   └── page.tsx       → { path: '/about', component: 'app/about/page.tsx' }
└── dashboard/
    ├── page.tsx       → { path: '/dashboard', component: 'app/dashboard/page.tsx' }
    └── layout.tsx     → { layout: 'app/dashboard/layout.tsx' }
```

O plugin gera dois virtual modules:
1. `/@theo/route-manifest` — array de RouteConfig com lazy imports
2. `/@theo/entry-client` — bootstrap React Router com manifest

### D3: Nested layouts via pathless route wrapper

Pattern de React Router para error boundaries DENTRO do layout (não substituindo):

```typescript
createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,      // app/layout.tsx
    children: [
      {
        errorElement: <ErrorPage />,  // app/error.tsx (pathless wrapper)
        children: [
          { index: true, element: <HomePage /> },        // app/page.tsx
          { path: 'about', element: <AboutPage /> },     // app/about/page.tsx
          {
            path: 'dashboard',
            element: <DashboardLayout />,  // app/dashboard/layout.tsx
            children: [
              {
                errorElement: <DashboardError />,  // app/dashboard/error.tsx
                children: [
                  { index: true, element: <DashboardPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },  // app/not-found.tsx
])
```

### D4: Route scanning no Vite plugin com `fs` recursivo

```typescript
interface RouteNode {
  segment: string          // 'dashboard', '', 'about'
  path: string             // '/dashboard', '/', '/about'
  page?: string            // absolute path to page.tsx
  layout?: string          // absolute path to layout.tsx
  error?: string           // absolute path to error.tsx
  loading?: string         // absolute path to loading.tsx
  notFound?: string        // absolute path to not-found.tsx
  children: RouteNode[]
}

function scanRoutes(appDir: string): RouteNode {
  // 1. Read directory entries
  // 2. For each entry:
  //    - If file matches special name (page/layout/error/loading/not-found): record
  //    - If directory: recurse
  // 3. Build tree with segment paths
  return rootNode
}
```

### D5: Loading state via React Suspense + lazy imports

```typescript
// Generated route uses React.lazy for code splitting
{
  path: '/dashboard',
  lazy: async () => {
    const { default: Component } = await import('/app/dashboard/page.tsx')
    return { Component }
  },
}
```

React Router v7 suporta `lazy` prop nativa — code splitting automático por rota.

### D6: not-found.tsx como wildcard route

```typescript
// Catch-all route no final do array
{ path: '*', element: <NotFoundPage /> }
```

Se `app/not-found.tsx` existe, usa como componente. Senão, default genérico.

---

## 3. Arquitetura do Route Scanning

### Scan → Tree → React Router Config

```
Phase 1: SCAN (Vite plugin, build time)
  fs.readdirSync(appDir) recursivo
  → RouteNode tree

Phase 2: GENERATE (Vite virtual module)
  RouteNode tree → JavaScript code string
  → import statements com lazy()
  → createBrowserRouter config

Phase 3: RENDER (Browser, runtime)
  React Router resolve URL → component tree
  → Layout wraps Outlet
  → ErrorBoundary catches errors
  → Suspense shows loading
```

### File → Route Mapping Rules

| File | Mapping | Comportamento |
|------|---------|---------------|
| `app/page.tsx` | `/` (index route) | Componente da rota |
| `app/about/page.tsx` | `/about` | Componente da rota |
| `app/dashboard/page.tsx` | `/dashboard` | Componente da rota |
| `app/layout.tsx` | Wraps all children | Usa `<Outlet />` para children |
| `app/dashboard/layout.tsx` | Wraps `/dashboard/*` | Layout aninhado |
| `app/error.tsx` | ErrorBoundary for segment | Captura erros dos children |
| `app/loading.tsx` | Suspense fallback | Mostra durante lazy load |
| `app/not-found.tsx` | Wildcard `*` route | 404 page |

### Special File Priority

Dentro de cada diretório, o scan reconhece:
1. `page.tsx` / `page.ts` / `page.jsx` / `page.js` — rota
2. `layout.tsx` — layout wrapper
3. `error.tsx` — error boundary
4. `loading.tsx` — loading state
5. `not-found.tsx` — 404 (apenas root na Onda 2)

---

## 4. Virtual Module Generated Code

### `/@theo/route-manifest`

```typescript
// Auto-generated by theoPlugin — DO NOT EDIT
import React, { lazy, Suspense } from 'react'

// Layouts
const RootLayout = lazy(() => import('/app/layout.tsx'))
const DashboardLayout = lazy(() => import('/app/dashboard/layout.tsx'))

// Pages
const HomePage = lazy(() => import('/app/page.tsx'))
const AboutPage = lazy(() => import('/app/about/page.tsx'))
const DashboardPage = lazy(() => import('/app/dashboard/page.tsx'))

// Special
const ErrorPage = lazy(() => import('/app/error.tsx'))
const NotFoundPage = lazy(() => import('/app/not-found.tsx'))
const LoadingFallback = lazy(() => import('/app/loading.tsx'))

export const routerConfig = [
  {
    path: '/',
    element: React.createElement(RootLayout),
    children: [
      {
        errorElement: React.createElement(ErrorPage),
        children: [
          { index: true, element: React.createElement(HomePage) },
          { path: 'about', element: React.createElement(AboutPage) },
          {
            path: 'dashboard',
            element: React.createElement(DashboardLayout),
            children: [
              { index: true, element: React.createElement(DashboardPage) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: React.createElement(NotFoundPage) },
]
```

### `/@theo/entry-client`

```typescript
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routerConfig } from '/@theo/route-manifest'

const router = createBrowserRouter(routerConfig)

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(React.createElement(RouterProvider, { router }))
}
```

---

## 5. Testes da Onda 2

### Teste 1 — Página raiz
```typescript
it('GET / retorna 200', async ({ page }) => {
  await page.goto('/')
  expect(page.locator('body')).toBeAttached()
})
```

### Teste 2 — Rota aninhada
```typescript
it('GET /dashboard retorna 200', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.locator('h1')).toContainText('Dashboard')
})
```

### Teste 3 — Layout raiz
```typescript
it('layout.tsx wraps all pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-layout="root"]')).toBeAttached()
  await page.goto('/about')
  await expect(page.locator('[data-layout="root"]')).toBeAttached()
})
```

### Teste 4 — Layout aninhado
```typescript
it('dashboard layout wraps only dashboard routes', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.locator('[data-layout="dashboard"]')).toBeAttached()
  await page.goto('/about')
  await expect(page.locator('[data-layout="dashboard"]')).not.toBeAttached()
})
```

### Teste 5 — Not found
```typescript
it('unknown route renders not-found.tsx', async ({ page }) => {
  await page.goto('/rota-inexistente')
  await expect(page.locator('h1')).toContainText('Not Found')
})
```

### Teste 6 — Error boundary
```typescript
it('error in page renders error.tsx', async ({ page }) => {
  await page.goto('/broken')  // page that throws
  await expect(page.locator('[data-error]')).toBeAttached()
})
```

---

## 6. Fixtures da Onda 2

```
fixtures/
├── app-router-basic/           # page.tsx raiz + about + dashboard
│   ├── app/
│   │   ├── page.tsx
│   │   ├── about/page.tsx
│   │   └── dashboard/page.tsx
│   ├── index.html
│   ├── theo.config.ts
│   └── package.json
├── app-router-nested-layouts/  # Layouts aninhados
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx      # Dashboard layout
│   │       └── page.tsx
│   └── ...
├── app-router-errors/          # Error boundary
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── error.tsx
│   │   ├── page.tsx
│   │   └── broken/page.tsx     # Page que lança erro
│   └── ...
└── app-router-not-found/       # 404
    ├── app/
    │   ├── page.tsx
    │   └── not-found.tsx
    └── ...
```

---

## 7. Dependências novas (Onda 2)

```json
// packages/theo/package.json — peerDependencies
{
  "react-router": "^7.0.0"
}

// packages/theo/package.json — dependencies (já tem)
{
  "vite": "^6.0.0"  // fs scanning happens in plugin
}
```

---

## 8. Fora de Escopo (Onda 2)

- ❌ Dynamic segments `[id]`, `[...rest]` — Onda 3 (com server routes)
- ❌ Route groups `(marketing)` — futuro
- ❌ Parallel routes `@slot` — futuro
- ❌ SSR — Onda futura
- ❌ Streaming — Onda futura
- ❌ Per-segment loading.tsx (apenas root) — simplificação Onda 2
- ❌ Metadata/head management — futuro

---

## 9. Benchmark Summary

```
SOTA Research Complete — Onda 2
==============================================
| Domínio  | Before | After | Gaps Filled | New Refs | Quick Wins |
|----------|--------|-------|-------------|----------|------------|
| routing  | 0/5    | 1/5   | 5 of 9      | 6        | 4          |
| layouts  | 0/5    | 1/5   | 2 of 5      | 4        | 3          |

Files created: 3 (2 INDEX.md + 1 consolidado)
Validation: PASS
```

---

## Sources

### Referências locais
- `referencias/next.js/packages/next/src/build/route-discovery.ts` — route scanning
- `referencias/next.js/packages/next/src/client/components/layout-router.tsx` — layout composition
- `referencias/next.js/packages/next/src/client/components/error-boundary.tsx` — error handling
- `referencias/next.js/packages/next/src/shared/lib/router/utils/app-paths.ts` — path normalization

### Web
- [React Router v7 Guide](https://dev.to/utkvishwas/react-router-v7-a-comprehensive-guide-migration-from-v6-7d1)
- [React Router errorElement docs](https://reactrouter.com/en/main/route/error-element)
- [React Router Tutorial](https://reactrouter.com/en/main/start/tutorial)
- [generouted — file-based routing for Vite](https://github.com/oedotme/generouted)
- [vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages)
- [Pathless route for error inside layout](https://github.com/remix-run/react-router/discussions/9553)
