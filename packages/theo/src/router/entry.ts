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

  return [
    `import React, { Suspense } from 'react'`,
    `import { ${rootMethod} } from 'react-dom/client'`,
    `import { createBrowserRouter, RouterProvider } from 'react-router'`,
    `import { routes } from '/@theo/route-manifest'`,
    `// T1.3 — side-effect import sets globalThis.__THEO_TRANSFORMER__ for theoFetch`,
    `import '/@theo/runtime-config'`,
    ...theoUiImports,
    ``,
    `const router = createBrowserRouter(routes)`,
    `const el = document.getElementById('root')`,
    `if (el) {`,
    renderCall,
    `}`,
  ].join('\n')
}
