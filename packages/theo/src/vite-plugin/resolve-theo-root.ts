/* eslint-disable security/detect-non-literal-fs-filename --
 * Resolves theokit's own install directory (the `node_modules/theokit/`).
 * Build-time tool. Read-only check. No HTTP input.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Resolve the directory that holds the framework's compiled (or source)
 * subpaths — `client/`, `server/`, `react-query/`, etc.
 *
 * Cases (regression T1.3):
 *   - Source mode (`src/vite-plugin/index.ts`) — `currentDir` is
 *     `…/src/vite-plugin`. Parent (`…/src`) contains `client/`. Return parent.
 *   - Dist mode (`dist/chunk-XYZ.js`) — `currentDir` is `…/dist`. That dir
 *     itself contains `client/`. Return currentDir.
 *   - Unknown shape — fall back to parent (legacy behavior). The dogfood
 *     validator will catch the misconfiguration before runtime.
 *
 * Pure function — no side effects, only filesystem reads via `existsSync`.
 * Exported so the regression test can exercise the branch logic directly.
 */
export function resolveTheoRootDir(currentDir: string): string {
  if (existsSync(resolve(currentDir, 'client'))) {
    return currentDir
  }
  return resolve(currentDir, '..')
}
