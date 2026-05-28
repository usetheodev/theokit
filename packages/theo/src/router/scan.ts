/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time file-system scanner. All paths originate from `appDir`,
 * which is itself derived from `process.cwd()`. No HTTP input flows here.
 */
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { RouteNode, RouteFileName } from './types.js'
import { ROUTE_FILE_NAMES, ROUTE_FILE_EXTENSIONS } from './types.js'

function toNodeKey(name: RouteFileName): 'page' | 'layout' | 'error' | 'loading' | 'notFound' {
  if (name === 'not-found') return 'notFound'
  return name
}

function setRouteFile(
  node: RouteNode,
  key: 'page' | 'layout' | 'error' | 'loading' | 'notFound',
  value: string,
): void {
  switch (key) {
    case 'page':
      node.page = value
      break
    case 'layout':
      node.layout = value
      break
    case 'error':
      node.error = value
      break
    case 'loading':
      node.loading = value
      break
    case 'notFound':
      node.notFound = value
      break
  }
}

function attachRouteFiles(node: RouteNode, dir: string): void {
  // Check route files with extension priority (.tsx > .ts > .jsx > .js)
  for (const name of ROUTE_FILE_NAMES) {
    const key = toNodeKey(name)
    if (node[key] !== undefined) continue
    for (const ext of ROUTE_FILE_EXTENSIONS) {
      const filename = `${name}${ext}`
      if (existsSync(join(dir, filename))) {
        setRouteFile(node, key, resolve(dir, filename))
        break
      }
    }
  }
}

function nodeHasContent(node: RouteNode): boolean {
  return (
    node.page !== undefined ||
    node.layout !== undefined ||
    node.error !== undefined ||
    node.loading !== undefined ||
    node.notFound !== undefined ||
    node.children.length > 0
  )
}

function scanDir(dir: string, segment: string, routePath: string): RouteNode {
  const node: RouteNode = { segment, path: routePath, children: [] }
  attachRouteFiles(node, dir)

  // Recurse into subdirectories
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const childPath = routePath === '/' ? `/${entry.name}` : `${routePath}/${entry.name}`
    const child = scanDir(join(dir, entry.name), entry.name, childPath)

    // Prune empty nodes — a directory with no route files AND no
    // children is irrelevant to the manifest.
    if (nodeHasContent(child)) {
      node.children.push(child)
    }
  }

  return node
}

export function scanRoutes(appDir: string): RouteNode {
  if (!existsSync(appDir)) {
    throw new Error(`App directory does not exist: ${appDir}`)
  }
  if (!statSync(appDir).isDirectory()) {
    throw new Error(`App path is not a directory: ${appDir}`)
  }
  return scanDir(appDir, '', '/')
}
