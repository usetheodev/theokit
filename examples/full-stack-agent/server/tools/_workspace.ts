import { resolve, sep } from 'node:path'

const AGENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/

/**
 * Resolve a relative path inside `<cwd>/.theokit/workspace/<agentId>/`.
 *
 * Defense-in-depth (ADR D6):
 *
 *   1. `agentId` matches `^[a-zA-Z0-9_-]{1,128}$` (rejects `..`, `/`, NUL,
 *      and any non-portable char).
 *   2. The Zod schema in the tool layer rejects NUL bytes in `relativePath`
 *      (EC-4 — `fs.writeFile` may truncate at NUL on some Node versions).
 *   3. `path.resolve(base, relativePath)` must result in a path that lives
 *      strictly under `base` (or equals `base`). Absolute paths in
 *      relativePath get rebased by resolve and then fail the prefix check.
 *
 * Throws on any violation. Returns an absolute path.
 */
export function resolveSafePath(agentId: string, relativePath: string): string {
  if (!AGENT_ID_REGEX.test(agentId)) {
    throw new Error('invalid agentId — workspace tools require a sandbox key')
  }
  if (relativePath.includes('\0')) {
    throw new Error('NUL byte not allowed in path')
  }
  const base = resolve(process.cwd(), '.theokit/workspace', agentId)
  const absolute = resolve(base, relativePath)
  if (!absolute.startsWith(base + sep) && absolute !== base) {
    throw new Error(`path traversal blocked: ${relativePath}`)
  }
  return absolute
}

/** Re-exported for the read/write tool builders. */
export function workspaceBaseDir(agentId: string): string {
  if (!AGENT_ID_REGEX.test(agentId)) {
    throw new Error('invalid agentId')
  }
  return resolve(process.cwd(), '.theokit/workspace', agentId)
}
