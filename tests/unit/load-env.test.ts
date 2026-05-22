import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { _resetEnvCache, loadEnv } from '../../packages/theo/src/config/load-env.js'

/**
 * Tests for `loadEnv()` — env auto-load utility (T1.1 of
 * docs/plans/framework-zero-config-polish-plan.md).
 *
 * Covers 12 base scenarios + 4 EC-related scenarios (EC-1, EC-2, EC-8, EC-13)
 * per the plan's TDD+BDD requirements.
 */

const PRESERVED_KEYS = new Set([
  // Vitest / Node internals — must NEVER be wiped by tests
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'NODE_ENV',
])

const ENV_SNAPSHOT_PREFIX = '__test_le_'
const KEYS_TO_CLEAN = [
  'K',
  'KEY',
  'KEY1',
  'A',
  'B',
  'BASE',
  'GREETING',
  'COMBINED',
  'SECRET',
  'SHELL_VAR',
  'UNSET_VAR_REF',
  'SENTINEL',
  '__THEOKIT_USER_NODE_ENV',
  '__THEOKIT_PROCESSED_ENV',
]

function makeTmp(): string {
  const dir = join(tmpdir(), `${ENV_SNAPSHOT_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupKeys(): void {
  for (const k of KEYS_TO_CLEAN) {
    if (!PRESERVED_KEYS.has(k)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- KEYS_TO_CLEAN is a fixed literal list of test env keys
      delete process.env[k]
    }
  }
}

describe('loadEnv() — env auto-load', () => {
  let tmpDir: string

  beforeEach(() => {
    _resetEnvCache()
    cleanupKeys()
    tmpDir = makeTmp()
  })

  afterEach(() => {
    cleanupKeys()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('happy: basic .env file populates process.env', () => {
    writeFileSync(join(tmpDir, '.env'), 'KEY=value\n')
    const result = loadEnv({ cwd: tmpDir })
    expect(process.env.KEY).toBe('value')
    expect(result.loadedFromFiles).toHaveLength(1)
    expect(result.loadedFromFiles[0]).toMatch(/\.env$/)
  })

  it('priority: .env.local overrides .env', () => {
    writeFileSync(join(tmpDir, '.env'), 'K=base\n')
    writeFileSync(join(tmpDir, '.env.local'), 'K=local\n')
    // Explicit non-test mode — .env.local is intentionally skipped in test mode.
    loadEnv({ cwd: tmpDir, mode: 'development' })
    expect(process.env.K).toBe('local')
  })

  it('priority: .env.{mode}.local wins over all', () => {
    writeFileSync(join(tmpDir, '.env'), 'K=base\n')
    writeFileSync(join(tmpDir, '.env.local'), 'K=local\n')
    writeFileSync(join(tmpDir, '.env.development'), 'K=mode\n')
    writeFileSync(join(tmpDir, '.env.development.local'), 'K=modelocal\n')
    loadEnv({ cwd: tmpDir, mode: 'development' })
    expect(process.env.K).toBe('modelocal')
  })

  it('test mode skips .env.local', () => {
    writeFileSync(join(tmpDir, '.env.local'), 'K=fromlocal\n')
    writeFileSync(join(tmpDir, '.env.test'), 'K=fromtest\n')
    loadEnv({ cwd: tmpDir, mode: 'test' })
    expect(process.env.K).toBe('fromtest')
  })

  it('expand: resolves ${VAR} references within .env', () => {
    writeFileSync(join(tmpDir, '.env'), 'BASE=hi\nGREETING=${BASE}-world\n')
    loadEnv({ cwd: tmpDir })
    expect(process.env.GREETING).toBe('hi-world')
  })

  it('expand: ${VAR} resolves from real process.env when set', () => {
    process.env.SHELL_VAR = 'shellvalue'
    writeFileSync(join(tmpDir, '.env'), 'COMBINED=${SHELL_VAR}-extra\n')
    loadEnv({ cwd: tmpDir })
    expect(process.env.COMBINED).toBe('shellvalue-extra')
  })

  it('D6: real process.env wins over .env file values', () => {
    process.env.K = 'realvalue'
    writeFileSync(join(tmpDir, '.env'), 'K=filevalue\n')
    loadEnv({ cwd: tmpDir })
    expect(process.env.K).toBe('realvalue')
  })

  it('NODE_ENV stash: .env NODE_ENV stored in __THEOKIT_USER_NODE_ENV, real NODE_ENV unchanged', () => {
    process.env.NODE_ENV = 'test'
    writeFileSync(join(tmpDir, '.env'), 'NODE_ENV=production\nK=1\n')
    loadEnv({ cwd: tmpDir, mode: 'test' })
    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.__THEOKIT_USER_NODE_ENV).toBe('production')
    expect(process.env.K).toBe('1')
  })

  it('missing file: no-op, no throw', () => {
    const result = loadEnv({ cwd: tmpDir })
    expect(result.loaded).toEqual({})
    expect(result.loadedFromFiles).toEqual([])
  })

  it('cache: second call with same cwd+mode skips FS read', () => {
    writeFileSync(join(tmpDir, '.env'), 'K=once\n')
    const first = loadEnv({ cwd: tmpDir })
    // Edit the file
    writeFileSync(join(tmpDir, '.env'), 'K=twice\n')
    const second = loadEnv({ cwd: tmpDir })
    // Cache hit — process.env unchanged from second read
    expect(process.env.K).toBe('once')
    expect(second.loaded).toEqual(first.loaded)
  })

  it('forceReload: bypasses cache', () => {
    writeFileSync(join(tmpDir, '.env'), 'K=once\n')
    loadEnv({ cwd: tmpDir })
    expect(process.env.K).toBe('once')
    // Mutate file + delete process.env.K (simulates a fresh server) — forceReload re-reads
    writeFileSync(join(tmpDir, '.env'), 'K=twice\n')
    delete process.env.K
    loadEnv({ cwd: tmpDir, forceReload: true })
    expect(process.env.K).toBe('twice')
  })

  it('sentinel: __THEOKIT_PROCESSED_ENV set after load', () => {
    writeFileSync(join(tmpDir, '.env'), 'K=1\n')
    loadEnv({ cwd: tmpDir })
    expect(process.env.__THEOKIT_PROCESSED_ENV).toBe('true')
  })

  // EC-1 — file-size cap (MUST FIX)
  it('EC-1: skips .env > 1MB, logs warn', () => {
    const big = 'K=' + 'x'.repeat(2_000_000) + '\n' // > 1MB
    writeFileSync(join(tmpDir, '.env'), big)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadEnv({ cwd: tmpDir })
    expect(result.loadedFromFiles).toEqual([])
    expect(process.env.K).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/exceeds.*1048576.*bytes.*skipping/))
    warnSpy.mockRestore()
  })

  // EC-2 — cache reset isolates tests
  it('EC-2: _resetEnvCache() causes re-read on next call', () => {
    writeFileSync(join(tmpDir, '.env'), 'K=first\n')
    const first = loadEnv({ cwd: tmpDir })
    expect(first.loadedFromFiles).toHaveLength(1)

    // Mutate + reset cache + delete process.env.K → re-read should pick up new value
    writeFileSync(join(tmpDir, '.env'), 'K=second\n')
    delete process.env.K
    _resetEnvCache()
    const second = loadEnv({ cwd: tmpDir })
    expect(second.loadedFromFiles).toHaveLength(1)
    expect(process.env.K).toBe('second')
  })

  // EC-8 — circular ref doesn't loop
  it('EC-8: circular ${A}/${B} returns without infinite loop', () => {
    writeFileSync(join(tmpDir, '.env'), 'A=${B}\nB=${A}\n')
    const t0 = Date.now()
    loadEnv({ cwd: tmpDir })
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(500) // generous bound; should be <10ms
    // dotenv-expand returns literal for unresolvable; both A and B are defined
    expect(process.env.A).toBeDefined()
    expect(process.env.B).toBeDefined()
  })

  // EC-13 — symlink transparency
  it('EC-13: symlink .env logs info', () => {
    // Create real .env in a different dir, then symlink
    const externalDir = makeTmp()
    const externalEnv = join(externalDir, 'external.env')
    writeFileSync(externalEnv, 'KEY=fromsymlink\n')

    try {
      symlinkSync(externalEnv, join(tmpDir, '.env'))
    } catch (err) {
      // Some CIs lack symlink perms (Windows). Skip rather than fail.
      console.warn('Skipping EC-13 — symlink unsupported in this env:', err)
      return
    }
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    loadEnv({ cwd: tmpDir })
    expect(process.env.KEY).toBe('fromsymlink')
    expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/symlink/))
    infoSpy.mockRestore()
    rmSync(externalDir, { recursive: true, force: true })
  })
})

// Top-level `vi` import shim
import { vi } from 'vitest'
