import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const MW_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

/**
 * Scan the server/middleware/ directory for middleware files.
 * Files are returned sorted alphabetically — use numeric prefixes
 * (e.g. 01-cors.ts, 02-auth.ts) to control execution order.
 *
 * Files starting with '_' or '.' are ignored (helpers, hidden files).
 */
export function scanMiddlewares(serverDir: string): string[] {
  const mwDir = join(serverDir, 'middleware')
  if (!existsSync(mwDir) || !statSync(mwDir).isDirectory()) {
    return []
  }

  const entries = readdirSync(mwDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const ext = extname(entry.name)
    if (!MW_EXTENSIONS.includes(ext)) continue
    files.push(join(mwDir, entry.name))
  }

  // Sort alphabetically — numeric prefix (01-, 02-) guarantees order
  files.sort()
  return files
}
