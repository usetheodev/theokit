export interface EntryClientOptions {
  theoUi?: {
    fonts?: 'bundled' | 'cdn'
    theme?: 'violet-forge' | 'noir' | 'paper'
  }
}

export function generateEntryClient(
  ssr?: boolean,
  opts: EntryClientOptions = {},
): string {
  const rootMethod = ssr ? 'hydrateRoot' : 'createRoot'

  // T2.2 — TheoUI CSS imports (client-only; EC-2: NEVER in entry-server)
  // T2.3 — Wrap RouterProvider in <TheoUIProvider>
  const theoUiImports: string[] = []
  if (opts.theoUi) {
    theoUiImports.push(`// T2.2 — TheoUI CSS auto-injected (config.ui)`)
    theoUiImports.push(`import '@usetheo/ui/styles.css'`)
    const fontsModule = opts.theoUi.fonts === 'cdn' ? 'fonts-cdn.css' : 'fonts.css'
    theoUiImports.push(`import '@usetheo/ui/${fontsModule}'`)
    theoUiImports.push(`// T2.3 — TheoUIProvider auto-wraps RouterProvider`)
    theoUiImports.push(`import { TheoUIProvider } from '@usetheo/ui'`)
  }

  const theme = opts.theoUi?.theme ?? 'violet-forge'
  // Build the React tree: when theoUi enabled, RouterProvider sits inside
  // TheoUIProvider; otherwise RouterProvider is the top-level child.
  const routerTree = opts.theoUi
    ? `React.createElement(TheoUIProvider, { theme: { defaultTheme: '${theme}' } },\n      React.createElement(Suspense, { fallback: null },\n        React.createElement(RouterProvider, { router })\n      )\n    )`
    : `React.createElement(Suspense, { fallback: null },\n      React.createElement(RouterProvider, { router })\n    )`

  const renderCall = ssr
    ? `  ${rootMethod}(el,\n    ${routerTree}\n  )`
    : `  ${rootMethod}(el).render(\n    ${routerTree}\n  )`

  // SSR hydration: <StaticRouterProvider hydrate> emits
  // `<script>window.__staticRouterHydrationData = …</script>` into the
  // server HTML. The browser router MUST receive this so it continues
  // from the server's state instead of re-fetching everything.
  //
  // Without `hydrationData`, `createBrowserRouter` boots from scratch,
  // React detects a DOM mismatch with the SSR-rendered HTML, and
  // hydration silently falls back to client-only render — every
  // `onClick` handler attached during hydration is lost. The page
  // looks fine but is "dead HTML".
  const hydrationLine = ssr
    ? `const router = createBrowserRouter(routes, { hydrationData: window.__staticRouterHydrationData })`
    : `const router = createBrowserRouter(routes)`

  return [
    `import React, { Suspense } from 'react'`,
    `import { ${rootMethod} } from 'react-dom/client'`,
    `import { createBrowserRouter, RouterProvider } from 'react-router'`,
    `import { routes } from '/@theo/route-manifest'`,
    `// T1.3 — side-effect import sets globalThis.__THEO_TRANSFORMER__ for theoFetch`,
    `import '/@theo/runtime-config'`,
    ...theoUiImports,
    ``,
    hydrationLine,
    `const el = document.getElementById('root')`,
    `if (el) {`,
    renderCall,
    `}`,
  ].join('\n')
}
