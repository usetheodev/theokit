export function generateEntryClient(ssr?: boolean): string {
  const rootMethod = ssr ? 'hydrateRoot' : 'createRoot'
  const renderCall = ssr
    ? `  ${rootMethod}(el,\n    React.createElement(Suspense, { fallback: null },\n      React.createElement(RouterProvider, { router })\n    )\n  )`
    : `  ${rootMethod}(el).render(\n    React.createElement(Suspense, { fallback: null },\n      React.createElement(RouterProvider, { router })\n    )\n  )`

  return [
    `import React, { Suspense } from 'react'`,
    `import { ${rootMethod} } from 'react-dom/client'`,
    `import { createBrowserRouter, RouterProvider } from 'react-router'`,
    `import { routes } from '/@theo/route-manifest'`,
    ``,
    `const router = createBrowserRouter(routes)`,
    `const el = document.getElementById('root')`,
    `if (el) {`,
    renderCall,
    `}`,
  ].join('\n')
}
