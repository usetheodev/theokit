export function generateEntryClient(): string {
  return [
    `import React, { Suspense } from 'react'`,
    `import { createRoot } from 'react-dom/client'`,
    `import { createBrowserRouter, RouterProvider } from 'react-router'`,
    `import { routes } from '/@theo/route-manifest'`,
    ``,
    `const router = createBrowserRouter(routes)`,
    `const el = document.getElementById('root')`,
    `if (el) {`,
    `  createRoot(el).render(`,
    `    React.createElement(Suspense, { fallback: null },`,
    `      React.createElement(RouterProvider, { router })`,
    `    )`,
    `  )`,
    `}`,
  ].join('\n')
}
