/**
 * Shared build helper for tests that assert on `packages/theo/dist/` artifacts.
 * Multiple tests (`theokit-build-succeeds`, `publint-attw-green`,
 * `devtools-entry-dist`) require the same built package — running
 * `pnpm --filter theokit build` from each one races, wiping dist/ mid-read.
 *
 * Strategy:
 *  - Reuse a dist/ that is fresh (mtime within 10 minutes) — no rebuild.
 *  - Otherwise acquire a filesystem mutex and run a single build.
 *  - Other concurrent callers wait for the lock then verify dist/ existence.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(__dirname, '../../..')
const DIST = resolve(ROOT, 'packages/theo/dist')
const INDEX_DTS = resolve(DIST, 'index.d.ts')
const LOCK_DIR = resolve(tmpdir(), 'theokit-test-locks')
const LOCK_FILE = resolve(LOCK_DIR, 'packages-theo-build.lock')
const FRESH_WINDOW_MS = 10 * 60 * 1000

const hasFreshBuild = (): boolean => {
  if (!existsSync(INDEX_DTS)) return false
  return Date.now() - statSync(INDEX_DTS).mtimeMs < FRESH_WINDOW_MS
}

const acquireLock = (): number | null => {
  mkdirSync(LOCK_DIR, { recursive: true })
  try {
    return openSync(LOCK_FILE, 'wx')
  } catch {
    return null
  }
}

const waitForLockRelease = (timeoutMs = 240_000): void => {
  const start = Date.now()
  while (existsSync(LOCK_FILE) && Date.now() - start < timeoutMs) {
    const until = Date.now() + 100
    while (Date.now() < until) {
      // busy-wait 100ms slice — acceptable for serializing build runs
    }
  }
}

export const buildTheokitPackageOnce = (): void => {
  if (hasFreshBuild()) return
  const lockFd = acquireLock()
  if (lockFd === null) {
    waitForLockRelease()
    if (hasFreshBuild()) return
    // Lock released but no dist still — fall through and build ourselves
  }
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local test running the framework's own build CLI
    execSync('pnpm --filter theokit build', {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 240_000,
    })
  } finally {
    if (lockFd !== null) closeSync(lockFd)
    try {
      unlinkSync(LOCK_FILE)
    } catch {
      // already removed by other process
    }
  }
}

export const THEOKIT_DIST = DIST
