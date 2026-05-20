/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: walks `serverDir/actions/` derived from cwd.
 * No HTTP input ever reaches these fs calls.
 */
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, extname } from 'node:path'

export interface ActionNode {
  filePath: string
  actionPath: string
}

const ACTION_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

function scanDir(dir: string, actionsDir: string, results: ActionNode[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('_') && !entry.name.startsWith('.')) {
        scanDir(fullPath, actionsDir, results)
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name)
      if (!ACTION_EXTENSIONS.has(ext)) continue

      let rel = relative(actionsDir, fullPath)
      rel = rel.replace(/\\/g, '/')
      rel = rel.slice(0, -ext.length)

      results.push({
        filePath: resolve(fullPath),
        actionPath: rel,
      })
    }
  }
}

export function scanServerActions(serverDir: string): ActionNode[] {
  const actionsDir = join(serverDir, 'actions')
  if (!existsSync(actionsDir) || !statSync(actionsDir).isDirectory()) {
    return []
  }

  const results: ActionNode[] = []
  scanDir(actionsDir, actionsDir, results)
  return results
}
