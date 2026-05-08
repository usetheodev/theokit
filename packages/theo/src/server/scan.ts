import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, extname, basename } from 'node:path'
import { compilePattern, type ServerRouteNode } from './match.js'

const ROUTE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

function fileToRoutePath(filePath: string, routesDir: string): string {
  let rel = relative(routesDir, filePath)
  // Strip extension
  const ext = extname(rel)
  rel = rel.slice(0, -ext.length)
  // Normalize separators
  rel = rel.replace(/\\/g, '/')
  // Strip index suffix
  if (rel.endsWith('/index')) {
    rel = rel.slice(0, -6)
  } else if (rel === 'index') {
    rel = ''
  }
  // Replace [param] with :param
  rel = rel.replace(/\[([^\]]+)\]/g, ':$1')
  return `/api/${rel}`
}

function scanDir(dir: string, routesDir: string, results: ServerRouteNode[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('_') && !entry.name.startsWith('.')) {
        scanDir(fullPath, routesDir, results)
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name)
      if (!ROUTE_EXTENSIONS.includes(ext)) continue

      const routePath = fileToRoutePath(fullPath, routesDir)
      const { pattern, paramNames } = compilePattern(routePath)
      results.push({
        filePath: resolve(fullPath),
        routePath,
        paramNames,
        pattern,
      })
    }
  }
}

export function scanServerRoutes(serverDir: string): ServerRouteNode[] {
  const routesDir = join(serverDir, 'routes')
  if (!existsSync(routesDir) || !statSync(routesDir).isDirectory()) {
    return []
  }

  const results: ServerRouteNode[] = []
  scanDir(routesDir, routesDir, results)

  // Sort: static routes before dynamic (routes without params first)
  results.sort((a, b) => {
    if (a.paramNames.length === 0 && b.paramNames.length > 0) return -1
    if (a.paramNames.length > 0 && b.paramNames.length === 0) return 1
    return a.routePath.localeCompare(b.routePath)
  })

  return results
}
