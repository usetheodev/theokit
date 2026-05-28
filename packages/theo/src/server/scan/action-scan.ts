/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: walks `serverDir/actions/` derived from cwd.
 * No HTTP input ever reaches these fs calls.
 */
import { existsSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import { walkSourceFiles } from '../_internal/scan-walker.js'

export interface ActionNode {
  filePath: string
  actionPath: string
}

const ACTION_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

export function scanServerActions(serverDir: string): ActionNode[] {
  const actionsDir = join(serverDir, 'actions')
  if (!existsSync(actionsDir) || !statSync(actionsDir).isDirectory()) {
    return []
  }

  const results: ActionNode[] = []
  walkSourceFiles(actionsDir, { extensions: ACTION_EXTENSIONS }, (absPath) => {
    let rel = relative(actionsDir, absPath)
    rel = rel.replace(/\\/g, '/')
    rel = rel.slice(0, -extname(rel).length)
    results.push({
      filePath: absPath,
      actionPath: rel,
    })
  })
  return results
}
