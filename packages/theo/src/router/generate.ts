import type { RouteNode } from './types.js'

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function safeVarName(segment: string, prefix: string): string {
  const safe = segment.replace(/[^a-zA-Z0-9]/g, '_') || 'root'
  return `${prefix}_${safe}`
}

interface ImportEntry {
  varName: string
  importPath: string
}

interface PreloadEntry {
  routePath: string
  importPath: string
}

/**
 * Build the absolute route path for a node by accumulating segments from
 * the root. Used to key the preload map exactly as react-router's
 * `matchRoutes` reports `match.route.path`.
 */
function buildRoutePath(parents: string[], segment: string): string {
  const joined = [...parents, segment].filter(Boolean).join('/')
  return '/' + joined
}

export function generateRouteManifest(tree: RouteNode): string {
  // Static imports (always-needed at boot): layouts, errors, loading, not-found.
  const staticImports: ImportEntry[] = []
  // Lazy-loaded pages — tracked separately so we emit React.lazy() and
  // build the preload map.
  const lazyPages: { varName: string; importPath: string; routePath: string }[] = []
  let hasLayout = false

  function walk(node: RouteNode, parents: string[]): void {
    const seg = node.segment || 'root'
    const routePath = buildRoutePath(parents, node.segment)

    if (node.page) {
      lazyPages.push({
        varName: safeVarName(seg, 'Page'),
        importPath: normalizePath(node.page),
        routePath,
      })
    }
    if (node.layout) {
      hasLayout = true
      staticImports.push({
        varName: safeVarName(seg, 'Layout'),
        importPath: normalizePath(node.layout),
      })
    }
    if (node.error) {
      staticImports.push({
        varName: safeVarName(seg, 'Error'),
        importPath: normalizePath(node.error),
      })
    }
    if (node.loading) {
      staticImports.push({
        varName: safeVarName(seg, 'Loading'),
        importPath: normalizePath(node.loading),
      })
    }
    if (node.notFound) {
      staticImports.push({
        varName: safeVarName(seg, 'NotFound'),
        importPath: normalizePath(node.notFound),
      })
    }
    for (const child of node.children) {
      const nextParents = node.segment ? [...parents, node.segment] : parents
      walk(child, nextParents)
    }
  }

  walk(tree, [])

  // Phase 4 — Code-splitting + matchRoutes safeguard (EC-3).
  //
  // PAGES are lazy. LAYOUTS / ERROR / LOADING / NOT-FOUND stay static
  // because they're always needed at boot regardless of route.
  //
  // The preload map exposes the same `import()` calls keyed by absolute
  // route path. The entry-client re-matches `routes` against
  // `location.pathname` and awaits the matched entries BEFORE
  // `hydrateRoot`, so React.lazy modules resolve from cache and no
  // Suspense fallback fires during hydration.
  const lines: string[] = [
    `import React, { Suspense } from 'react'`,
  ]

  if (hasLayout) {
    lines.push(`import { Outlet } from 'react-router'`)
  }

  lines.push('')

  // Static imports first
  for (const imp of staticImports) {
    lines.push(`import ${imp.varName} from '${imp.importPath}'`)
  }

  // Lazy-loaded pages
  for (const lp of lazyPages) {
    lines.push(`const ${lp.varName} = React.lazy(() => import('${lp.importPath}'))`)
  }

  lines.push('')

  // Preload map — keys are absolute route paths, values are factories that
  // return the same import() the lazy() above resolves. Browsers cache the
  // module by URL so the preload + lazy() share a single promise.
  const preloadEntries = lazyPages.map(
    (lp) => `  '${lp.routePath}': () => import('${lp.importPath}'),`,
  )
  // No TS type annotation — this manifest is emitted as a virtual JS module
  // and Rollup rejects type annotations in production builds.
  lines.push('export const __theoPreloadMap = {')
  for (const e of preloadEntries) lines.push(e)
  lines.push('}')
  lines.push('')

  // Generate route config
  function genRouteConfig(node: RouteNode, isRoot: boolean): string {
    const seg = node.segment || 'root'
    const childConfigs: string[] = []

    // Index route for this node's page — wrap in Suspense (the lazy module
    // is preloaded on initial hydrate, so this fallback never fires there;
    // it covers client-side navigation to other routes too).
    if (node.page) {
      const pageVar = safeVarName(seg, 'Page')
      const fallbackEl = node.loading
        ? `React.createElement(${safeVarName(seg, 'Loading')})`
        : 'null'
      const pageElement = `React.createElement(Suspense, { fallback: ${fallbackEl} }, React.createElement(${pageVar}))`
      childConfigs.push(`{ index: true, element: ${pageElement} }`)
    }

    // Child routes
    for (const child of node.children) {
      childConfigs.push(genRouteConfig(child, false))
    }

    // Not-found wildcard (only at this level)
    if (node.notFound) {
      const nfVar = safeVarName(seg, 'NotFound')
      childConfigs.push(
        `{ path: '*', element: React.createElement(${nfVar}) }`,
      )
    }

    // Wrap children in error boundary (pathless wrapper) if error exists
    let childrenArray = `[${childConfigs.join(', ')}]`
    if (node.error) {
      const errVar = safeVarName(seg, 'Error')
      childrenArray = `[{ errorElement: React.createElement(${errVar}), children: ${childrenArray} }]`
    }

    // Build route object
    if (node.layout) {
      const layoutVar = safeVarName(seg, 'Layout')
      const pathPart = isRoot
        ? `path: '/'`
        : `path: '${node.segment}'`
      // Layout receives `<Outlet />` as `children` prop. This supports BOTH
      // conventions: Next.js-style layouts that render `{children}` AND
      // layouts that call `<Outlet />` directly (the prop is the same element,
      // ignored by the latter). Without this, Next.js-style templates render
      // empty because react-router does not pass a `children` prop by default.
      return `{ ${pathPart}, element: React.createElement(${layoutVar}, { children: React.createElement(Outlet) }), children: ${childrenArray} }`
    }

    // No layout — if root, wrap in path '/'
    if (isRoot) {
      if (childConfigs.length === 0 && !node.page) {
        return `{ path: '/', children: [] }`
      }
      // Root without layout: children are direct routes
      return `{ path: '/', children: ${childrenArray} }`
    }

    // Child segment without layout — just a route
    if (node.page && node.children.length === 0 && !node.error && !node.notFound) {
      const pageVar = safeVarName(seg, 'Page')
      const fallbackEl = node.loading
        ? `React.createElement(${safeVarName(seg, 'Loading')})`
        : 'null'
      const pageElement = `React.createElement(Suspense, { fallback: ${fallbackEl} }, React.createElement(${pageVar}))`
      return `{ path: '${node.segment}', element: ${pageElement} }`
    }

    // Child with children but no layout
    return `{ path: '${node.segment}', children: ${childrenArray} }`
  }

  const routeConfig = genRouteConfig(tree, true)
  lines.push(`export const routes = [${routeConfig}]`)

  return lines.join('\n')
}
