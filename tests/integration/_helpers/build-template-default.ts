/**
 * Shared build helper for tests that assert on `fixtures/template-default`'s
 * production bundle. Multiple tests can request a build concurrently — we
 * serialize via filesystem mutex AND reuse a build that is fresh (mtime
 * within 5 minutes) to avoid clobbering each other in vitest's parallel
 * worker pool.
 *
 * Rationale: the previous race produced `dist/` disappearing between
 * `existsSync` and `readFileSync` because two `pnpm exec theokit build`
 * processes were deleting `.theo/` simultaneously.
 */
import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(__dirname, '../../..')
const FIXTURE = resolve(ROOT, 'fixtures/template-default')
const ASSETS = resolve(FIXTURE, '.theo/client/assets')
const LOCK_DIR = resolve(tmpdir(), 'theokit-test-locks')
const LOCK_FILE = resolve(LOCK_DIR, 'template-default-build.lock')
const FRESH_WINDOW_MS = 5 * 60 * 1000

const hasFreshBuild = (): boolean => {
  if (!existsSync(ASSETS)) return false
  const indexFiles = readdirSync(ASSETS).filter((f) => /^index-.*\.js$/.test(f))
  if (indexFiles.length === 0) return false
  const newest = indexFiles
    .map((f) => statSync(join(ASSETS, f)).mtimeMs)
    .reduce((a, b) => Math.max(a, b), 0)
  return Date.now() - newest < FRESH_WINDOW_MS
}

const acquireLock = (): number | null => {
  mkdirSync(LOCK_DIR, { recursive: true })
  try {
    return openSync(LOCK_FILE, 'wx')
  } catch {
    return null
  }
}

const waitForLockRelease = (timeoutMs = 180_000): void => {
  const start = Date.now()
  while (existsSync(LOCK_FILE) && Date.now() - start < timeoutMs) {
    const buffer = Buffer.alloc(4096)
    // Busy-wait 50ms slices — acceptable for build coordination
    const until = Date.now() + 50
    while (Date.now() < until) {
      buffer[0] = 0
    }
  }
}

export const buildTemplateDefaultOnce = (): void => {
  if (hasFreshBuild()) return
  const lockFd = acquireLock()
  if (lockFd === null) {
    waitForLockRelease()
    if (hasFreshBuild()) return
    // Lock released but no build present — fall through to build ourselves
  }
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local test running the framework's own CLI
    execSync('pnpm exec theokit build', {
      cwd: FIXTURE,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production', CI: '1' },
      timeout: 180_000,
    })
  } finally {
    if (lockFd !== null) closeSync(lockFd)
    try {
      unlinkSync(LOCK_FILE)
    } catch {
      // already removed by other process — fine
    }
  }
}

export const TEMPLATE_DEFAULT_FIXTURE = FIXTURE
export const TEMPLATE_DEFAULT_ASSETS = ASSETS
