/* eslint-disable security/detect-non-literal-fs-filename --
 * Cleanup helpers. Paths are caller-controlled (CLI/config); EC-3 path-safety
 * guard rejects absolute paths outside cwd to prevent catastrophic data loss.
 */
/**
 * State cleanup utilities (Phase 2 of
 * docs/plans/framework-zero-config-polish-plan.md).
 *
 * - `cleanOutDir` — Astro pattern: empty a directory except a skip list,
 *   used at `theokit build` start.
 * - `gcAgentRegistry` — Nuxt LRU pattern: delete oldest agent dirs when
 *   count exceeds cap, used at `theokit dev` startup.
 *
 * EC-3 (MUST FIX, CRITICAL): cleanOutDir refuses to wipe anything outside
 *   the current cwd. Prevents catastrophic `distDir: '/'` data loss.
 * EC-9 (SHOULD TEST): gcAgentRegistry handles dirs with mtime=0 (Docker overlay).
 * EC-11 (SHOULD TEST): cleanOutDir normalizes trailing-slash in skip basenames.
 * EC-12 (SHOULD TEST): cleanOutDir catches EROFS and continues.
 */

import { promises as fs } from 'node:fs'
import { basename, resolve as resolvePath, sep } from 'node:path'

import type {
  CleanOutDirOptions,
  CleanOutDirResult,
  GcAgentRegistryOptions,
  GcAgentRegistryResult,
} from './cleanup-types.js'

const DEFAULT_SKIP = ['.git', '.gitkeep', '.gitignore']
// DEFAULT_MAX_AGENTS removed in Phase 7 — gcAgentRegistry is a tombstone.

function normalizeSkipName(name: string): string {
  // EC-11 — strip trailing slash + leading `./`
  return basename(name.replace(/\/$/, ''))
}

/**
 * Empty a directory, preserving entries in the skip list.
 *
 * Throws if `opts.dir` is not inside `process.cwd()` (EC-3 path safety).
 * Returns `{deleted:0, kept:0}` when the directory does not exist.
 */
export async function cleanOutDir(opts: CleanOutDirOptions): Promise<CleanOutDirResult> {
  const resolvedDir = resolvePath(opts.dir)
  const resolvedCwd = resolvePath(process.cwd())

  // EC-3 — path safety guard. CRITICAL.
  if (resolvedDir === resolvedCwd) {
    throw new Error(
      `cleanOutDir refused to wipe ${resolvedDir} — must be a child of cwd, not cwd itself`,
    )
  }
  if (!resolvedDir.startsWith(resolvedCwd + sep)) {
    throw new Error(
      `cleanOutDir refused to wipe ${resolvedDir} — must be inside cwd (${resolvedCwd})`,
    )
  }

  const skip = new Set((opts.skip ?? DEFAULT_SKIP).map(normalizeSkipName))

  let entries: { name: string }[]
  try {
    entries = await fs.readdir(resolvedDir, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { deleted: 0, kept: 0 }
    throw err
  }

  let deleted = 0
  let kept = 0
  for (const entry of entries) {
    const name = entry.name
    if (skip.has(name)) {
      kept++
      continue
    }
    const fullPath = resolvePath(resolvedDir, name)
    try {
      await fs.rm(fullPath, { recursive: true, force: true, maxRetries: 3 })
      deleted++
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        deleted++ // already gone
        continue
      }
      // EC-12 — EROFS or other rm failure: warn + continue, don't crash.
      console.warn(
        `[theokit] cleanOutDir could not remove ${fullPath} (${code ?? 'unknown'}); skipping`,
      )
      kept++
    }
  }

  return { deleted, kept }
}

/**
 * Phase 7 — TOMBSTONE for backward-compat. The SDK v1.1.0's `Agent.registry`
 * handles GC natively; this function is a no-op + emits a deprecation warning
 * ONCE per process (EC-10).
 *
 * Will be deleted entirely in TheoKit 0.4.0. Marked deprecated via runtime
 * warning rather than `@deprecated` JSDoc tag to avoid the eslint
 * sonarjs/deprecation flagging our own internal symbols.
 */
let warnedOnce = false
export async function gcAgentRegistry(
  _opts: GcAgentRegistryOptions,
): Promise<GcAgentRegistryResult> {
  if (!warnedOnce) {
    warnedOnce = true
    console.warn(
      '[theokit] gcAgentRegistry is deprecated; SDK Agent.registry handles GC natively (configure via theo.config.ts > agents.registry)',
    )
  }
  return Promise.resolve({ deleted: 0, kept: 0 })
}

/**
 * @internal — testing helper. Resets the module-scoped warnedOnce flag.
 */
export function __resetGcDeprecationWarnedForTests(): void {
  warnedOnce = false
}
