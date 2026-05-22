import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../../packages/theo/src/config/load-config.js'
import { _resetEnvCache } from '../../packages/theo/src/config/load-env.js'

/**
 * T1.3 — loadConfig() calls loadEnv() first so theo.config.ts functions
 * referencing process.env.* see populated values.
 */

const KEYS_TO_CLEAN = ['SECRET', 'TEST_VAR', '__THEOKIT_USER_NODE_ENV', '__THEOKIT_PROCESSED_ENV']

function makeTmp(): string {
  const dir = join(tmpdir(), `__loadconfig_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('T1.3 — loadConfig loads env first', () => {
  let tmpDir: string
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    _resetEnvCache()
    for (const k of KEYS_TO_CLEAN) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- KEYS_TO_CLEAN is a fixed literal list of test env keys
      delete process.env[k]
    }
    tmpDir = makeTmp()
  })

  afterEach(() => {
    for (const k of KEYS_TO_CLEAN) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- KEYS_TO_CLEAN is a fixed literal list of test env keys
      delete process.env[k]
    }
    rmSync(tmpDir, { recursive: true, force: true })
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv
    else delete process.env.NODE_ENV
  })

  it('loadConfig sees .env values for theo.config.ts functions', async () => {
    writeFileSync(join(tmpDir, '.env'), 'TEST_VAR=fromdotenv\n')
    writeFileSync(
      join(tmpDir, 'theo.config.ts'),
      `export default { port: 4242 }\n`, // simple inline config
    )

    // Direct call (no CLI) — loadConfig must call loadEnv defensively
    await loadConfig(tmpDir)
    expect(process.env.TEST_VAR).toBe('fromdotenv')
  })

  it('loadConfig handles missing .env gracefully (no throw)', async () => {
    writeFileSync(join(tmpDir, 'theo.config.ts'), `export default { port: 3000 }\n`)
    await expect(loadConfig(tmpDir)).resolves.toBeDefined()
  })

  it('loadConfig does NOT break NODE_ENV when .env tries to override', async () => {
    process.env.NODE_ENV = 'test'
    writeFileSync(join(tmpDir, '.env'), 'NODE_ENV=production\n')
    writeFileSync(join(tmpDir, 'theo.config.ts'), `export default { port: 3000 }\n`)
    await loadConfig(tmpDir)
    expect(process.env.NODE_ENV).toBe('test') // real NODE_ENV preserved
    // loadEnv stashes the would-be NODE_ENV in __THEOKIT_USER_NODE_ENV
    // (only when not already set)
    expect(process.env.__THEOKIT_USER_NODE_ENV).toBe('production')
  })

  it('cache: re-calling loadConfig does not re-read .env', async () => {
    writeFileSync(join(tmpDir, '.env'), 'SECRET=v1\n')
    writeFileSync(join(tmpDir, 'theo.config.ts'), `export default { port: 3000 }\n`)
    await loadConfig(tmpDir)
    expect(process.env.SECRET).toBe('v1')

    // Mutate .env — should NOT be picked up because cache hit
    writeFileSync(join(tmpDir, '.env'), 'SECRET=v2\n')
    await loadConfig(tmpDir)
    expect(process.env.SECRET).toBe('v1') // cache held the value
  })
})
