/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: walks directories derived from cwd.
 * No HTTP input ever reaches these fs calls.
 */
import { readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

/**
 * Options for walkSourceFiles.
 *
 * Sequential by design — callers (route precedence) depend on insertion
 * order (EC-19 documented decision). Async-callback support is implicit
 * via JavaScript's serial await loop.
 *
 * Tested on macOS + Linux. Windows long-path support not validated (EC-20).
 */
export interface WalkOptions {
  /** File extensions to include (e.g., new Set(['.ts', '.tsx'])). */
  extensions: ReadonlySet<string>
  /** Skip directories whose name starts with any of these (default: ['_', '.']). */
  skipPrefixes?: readonly string[]
}

/**
 * Recursively walk `root`, invoking `onFile(absPath)` for every file matching
 * `opts.extensions`. Directories whose name starts with any `skipPrefixes`
 * char are skipped (defaults to `_` and `.`).
 *
 * Replaces 3 near-identical recursive walkers in scan.ts, action-scan.ts,
 * ws-scan.ts (PV-3 — DRY consolidation). Resolves T3.1 of
 * architecture-review-remediation-plan.
 *
 * Symlink loops are NOT tracked — callers must avoid them or pre-resolve
 * via `fs.realpath`. EC-11 documented but not implemented (rare in dev).
 */
export function walkSourceFiles(
  root: string,
  opts: WalkOptions,
  onFile: (absPath: string) => void,
): void {
  const skipPrefixes = opts.skipPrefixes ?? ['_', '.']
  const visit = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      // Silently skip unreadable directories — caller controls discoverability
      return
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory() && !skipPrefixes.some((p) => entry.name.startsWith(p))) {
        visit(fullPath)
      } else if (entry.isFile() && opts.extensions.has(extname(entry.name))) {
        onFile(resolve(fullPath))
      }
    }
  }
  visit(root)
}
