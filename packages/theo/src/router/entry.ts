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

  // Phase 4 — Code-splitting + matchRoutes safeguard (EC-3).
  //
  // SSR mode: pages are React.lazy()-wrapped in the manifest. If we render
  // before the matched route's module is loaded, React.lazy throws a
  // promise, the outer Suspense fires its fallback (null), and the SSR
  // DOM is wiped before hydration → onClick handlers die.
  //
  // The fix:
  //   1. matchRoutes(routes, location.pathname) on the client to discover
  //      which routes actually render at this URL. Using the client matcher
  //      (not a server hint) avoids URL-drift races: SSR may have prepared
  //      /foo while a browser auto-redirect now points at /bar.
  //   2. Look up each matched route's path in __theoPreloadMap and call
  //      the import() factory. Browsers cache modules by URL — when
  //      React.lazy fires its own import() during render, it gets the
  //      cached promise instantly.
  //   3. Promise.all with a 1500ms timeout. On slow networks we'd rather
  //      lose hydration on ONE request than hang the page forever. The
  //      fallback path proceeds to hydrate anyway — React.lazy will then
  //      Suspense its fallback as usual.
  const preloadBlock = ssr
    ? [
        `// Phase 4 — preload matched-route modules before hydrate (EC-3 safeguard)`,
        `const __theoMatches = matchRoutes(routes, window.location.pathname) ?? []`,
        `const __theoPreloadPaths = __theoMatches`,
        `  .map((m) => m.route && (m.route).path)`,
        `  .filter((p) => typeof p === 'string' && p in __theoPreloadMap)`,
        `const __theoPreloadPromise = Promise.all(`,
        `  __theoPreloadPaths.map((p) => __theoPreloadMap[p]().catch((err) => { console.error('[theo] preload failed', p, err); return null }))`,
        `)`,
        `const __theoTimeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 1500))`,
        `await Promise.race([__theoPreloadPromise, __theoTimeout])`,
        '',
      ]
    : []

  // The hydrate/render call needs to live inside an async IIFE when we
  // await preloads. In CSR-only mode we keep the existing synchronous
  // block for backward compat.
  const renderBlock = ssr
    ? [
        `if (el) {`,
        `  ;(async () => {`,
        ...preloadBlock.map((l) => '    ' + l),
        `${renderCall}`,
        `  })()`,
        `}`,
      ]
    : [
        `if (el) {`,
        renderCall,
        `}`,
      ]

  const manifestImports = ssr
    ? `import { routes, __theoPreloadMap } from '/@theo/route-manifest'`
    : `import { routes } from '/@theo/route-manifest'`

  const reactRouterImports = ssr
    ? `import { createBrowserRouter, RouterProvider, matchRoutes } from 'react-router'`
    : `import { createBrowserRouter, RouterProvider } from 'react-router'`

  return [
    `import React, { Suspense } from 'react'`,
    `import { ${rootMethod} } from 'react-dom/client'`,
    reactRouterImports,
    manifestImports,
    `// T1.3 — side-effect import sets globalThis.__THEO_TRANSFORMER__ for theoFetch`,
    `import '/@theo/runtime-config'`,
    ...theoUiImports,
    ``,
    hydrationLine,
    `const el = document.getElementById('root')`,
    ...renderBlock,
  ].join('\n')
}
