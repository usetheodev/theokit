/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: walks `serverDir/ws/` derived from cwd.
 * No HTTP input ever reaches these fs calls.
 */
import { existsSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import { walkSourceFiles } from '../_internal/scan-walker.js'

const WS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

export interface WebSocketRouteNode {
  filePath: string
  wsPath: string
}

export function scanWebSocketRoutes(serverDir: string): WebSocketRouteNode[] {
  const wsDir = join(serverDir, 'ws')
  if (!existsSync(wsDir) || !statSync(wsDir).isDirectory()) {
    return []
  }

  const results: WebSocketRouteNode[] = []
  walkSourceFiles(wsDir, { extensions: WS_EXTENSIONS }, (absPath) => {
    let rel = relative(wsDir, absPath)
    rel = rel.replace(/\\/g, '/')
    rel = rel.slice(0, -extname(rel).length)
    if (rel.endsWith('/index')) rel = rel.slice(0, -6)
    else if (rel === 'index') rel = ''
    results.push({
      filePath: absPath,
      wsPath: `/ws/${rel}`,
    })
  })
  return results
}
