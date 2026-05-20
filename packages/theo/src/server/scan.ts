/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: walks `serverDir/routes/` derived from cwd.
 * No HTTP input ever reaches these fs calls.
 */
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, extname } from 'node:path'

import { compilePattern, type ServerRouteNode } from './match.js'

const ROUTE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

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
  // Replace [...param] with :...param (catch-all, before regular params).
  // Replace [param] with :param. Inputs are file paths bounded by the
  // OS filename limit; the bracket capture is bounded by `]`.
  rel = rel.replace(/\[\.\.\.([^\]]+)\]/g, ':...$1')
  // eslint-disable-next-line sonarjs/slow-regex -- bounded by `]`; input is a single filename
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
      if (!ROUTE_EXTENSIONS.has(ext)) continue

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

  // T1.4 / EC-2 — refuse to scan if a user route collides with the reserved
  // batch endpoint path. User must rename or disable batching.
  const conflicting = results.find((r) => r.routePath === '/api/__theo_batch__')
  if (conflicting) {
    throw new Error(
      `Server route ${conflicting.filePath} resolves to '/api/__theo_batch__' which is reserved for the batch endpoint. Rename the route or disable batching in theo.config.ts.`,
    )
  }

  // Sort: static first, then dynamic, then catch-all last
  const isCatchAll = (route: ServerRouteNode) => route.routePath.includes(':...')
  results.sort((a, b) => {
    const aStatic = a.paramNames.length === 0
    const bStatic = b.paramNames.length === 0
    const aCatchAll = isCatchAll(a)
    const bCatchAll = isCatchAll(b)

    // Static routes first
    if (aStatic && !bStatic) return -1
    if (!aStatic && bStatic) return 1
    // Catch-all routes last
    if (aCatchAll && !bCatchAll) return 1
    if (!aCatchAll && bCatchAll) return -1
    return a.routePath.localeCompare(b.routePath)
  })

  return results
}
