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

export function generateRouteManifest(tree: RouteNode): string {
  const imports: ImportEntry[] = []
  let hasLayout = false

  function collectImports(node: RouteNode): void {
    const seg = node.segment || 'root'
    if (node.page) {
      imports.push({
        varName: safeVarName(seg, 'Page'),
        importPath: normalizePath(node.page),
      })
    }
    if (node.layout) {
      hasLayout = true
      imports.push({
        varName: safeVarName(seg, 'Layout'),
        importPath: normalizePath(node.layout),
      })
    }
    if (node.error) {
      imports.push({
        varName: safeVarName(seg, 'Error'),
        importPath: normalizePath(node.error),
      })
    }
    if (node.loading) {
      imports.push({
        varName: safeVarName(seg, 'Loading'),
        importPath: normalizePath(node.loading),
      })
    }
    if (node.notFound) {
      imports.push({
        varName: safeVarName(seg, 'NotFound'),
        importPath: normalizePath(node.notFound),
      })
    }
    for (const child of node.children) {
      collectImports(child)
    }
  }

  collectImports(tree)

  // Build import lines
  const lines: string[] = [
    `import React, { Suspense, lazy } from 'react'`,
  ]

  if (hasLayout) {
    lines.push(`import { Outlet } from 'react-router'`)
  }

  lines.push('')

  for (const imp of imports) {
    lines.push(
      `const ${imp.varName} = lazy(() => import('${imp.importPath}'))`,
    )
  }

  lines.push('')

  // Generate route config
  function genRouteConfig(node: RouteNode, isRoot: boolean): string {
    const seg = node.segment || 'root'
    const childConfigs: string[] = []

    // Index route for this node's page
    if (node.page) {
      const pageVar = safeVarName(seg, 'Page')
      let pageElement = `React.createElement(${pageVar})`
      if (node.loading) {
        const loadVar = safeVarName(seg, 'Loading')
        pageElement = `React.createElement(Suspense, { fallback: React.createElement(${loadVar}) }, ${pageElement})`
      }
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
      return `{ ${pathPart}, element: React.createElement(${layoutVar}), children: ${childrenArray} }`
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
      let pageElement = `React.createElement(${pageVar})`
      if (node.loading) {
        const loadVar = safeVarName(seg, 'Loading')
        pageElement = `React.createElement(Suspense, { fallback: React.createElement(${loadVar}) }, ${pageElement})`
      }
      return `{ path: '${node.segment}', element: ${pageElement} }`
    }

    // Child with children but no layout
    return `{ path: '${node.segment}', children: ${childrenArray} }`
  }

  const routeConfig = genRouteConfig(tree, true)
  lines.push(`export const routes = [${routeConfig}]`)

  return lines.join('\n')
}
