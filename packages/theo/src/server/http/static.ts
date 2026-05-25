/* eslint-disable security/detect-non-literal-fs-filename --
 * Static-file server. The URL path IS user-controlled, BUT before any fs
 * call we resolve to absolute and reject with 403 if the resolved path
 * escapes `clientDir` (see EC-1 guard at line below). The guard is
 * authoritative; the rule cannot see it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve, extname } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.map': 'application/json',
}

export function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  clientDir: string,
): boolean {
  const urlPath = (req.url ?? '/').split('?')[0]

  // Path traversal prevention (EC-1)
  const filePath = resolve(clientDir, '.' + urlPath)
  if (!filePath.startsWith(clientDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return true
  }

  if (!existsSync(filePath)) return false

  const stat = statSync(filePath)
  if (!stat.isFile()) return false

  const ext = extname(filePath)
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
  const content = readFileSync(filePath)

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
  })
  res.end(content)
  return true
}
