import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
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
