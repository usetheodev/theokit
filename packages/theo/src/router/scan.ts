import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { RouteNode, RouteFileName } from './types.js'
import { ROUTE_FILE_NAMES, ROUTE_FILE_EXTENSIONS } from './types.js'

function toNodeKey(name: RouteFileName): 'page' | 'layout' | 'error' | 'loading' | 'notFound' {
  if (name === 'not-found') return 'notFound'
  return name as 'page' | 'layout' | 'error' | 'loading'
}

function setRouteFile(node: RouteNode, key: 'page' | 'layout' | 'error' | 'loading' | 'notFound', value: string): void {
  switch (key) {
    case 'page': node.page = value; break
    case 'layout': node.layout = value; break
    case 'error': node.error = value; break
    case 'loading': node.loading = value; break
    case 'notFound': node.notFound = value; break
  }
}

function scanDir(dir: string, segment: string, routePath: string): RouteNode {
  const node: RouteNode = { segment, path: routePath, children: [] }

  const entries = readdirSync(dir, { withFileTypes: true })

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

  // Recurse into subdirectories
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const childPath =
      routePath === '/' ? `/${entry.name}` : `${routePath}/${entry.name}`
    const child = scanDir(join(dir, entry.name), entry.name, childPath)

    // Prune empty nodes
    const hasRouteFile =
      child.page ||
      child.layout ||
      child.error ||
      child.loading ||
      child.notFound
    if (hasRouteFile || child.children.length > 0) {
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
