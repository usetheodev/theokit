import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, extname } from 'node:path'

const WS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

export interface WebSocketRouteNode {
  filePath: string
  wsPath: string
}

function scanDir(dir: string, wsDir: string, results: WebSocketRouteNode[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('_') && !entry.name.startsWith('.')) {
        scanDir(fullPath, wsDir, results)
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name)
      if (!WS_EXTENSIONS.includes(ext)) continue

      let rel = relative(wsDir, fullPath)
      rel = rel.replace(/\\/g, '/')
      rel = rel.slice(0, -ext.length)
      if (rel.endsWith('/index')) rel = rel.slice(0, -6)
      else if (rel === 'index') rel = ''

      results.push({
        filePath: resolve(fullPath),
        wsPath: `/ws/${rel}`,
      })
    }
  }
}

export function scanWebSocketRoutes(serverDir: string): WebSocketRouteNode[] {
  const wsDir = join(serverDir, 'ws')
  if (!existsSync(wsDir) || !statSync(wsDir).isDirectory()) {
    return []
  }

  const results: WebSocketRouteNode[] = []
  scanDir(wsDir, wsDir, results)
  return results
}
