import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T1.2 — CLI commands (dev, build, start) call loadEnv() BEFORE loadConfig().
 *
 * Verified statically (source inspection) rather than via subprocess to keep
 * the test suite fast + deterministic. Subprocess invocation is exercised
 * in the integration suite (tests/integration/cli-zero-config-env.test.ts)
 * when added in T1.4.
 */

const DEV = resolve(process.cwd(), 'packages/theo/src/cli/commands/dev.ts')
const BUILD = resolve(process.cwd(), 'packages/theo/src/cli/commands/build.ts')
const START = resolve(process.cwd(), 'packages/theo/src/cli/commands/start.ts')

function read(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('T1.2 — CLI commands wire loadEnv before loadConfig', () => {
  it('dev.ts imports loadEnv', () => {
    expect(read(DEV)).toMatch(/import\s+\{\s*loadEnv\s*\}\s+from\s+['"]\.\.\/\.\.\/config\/load-env/)
  })

  it('dev.ts calls loadEnv before loadConfig', () => {
    const src = read(DEV)
    // Match the CALL site, not the import. loadEnv call is `loadEnv({`
    // (with options object); loadConfig call is `loadConfig(cwd)` or `await loadConfig`.
    const loadEnvCallIdx = src.search(/loadEnv\(\{/)
    const loadConfigCallIdx = src.search(/await\s+loadConfig\(/)
    expect(loadEnvCallIdx).toBeGreaterThan(0)
    expect(loadConfigCallIdx).toBeGreaterThan(0)
    expect(loadEnvCallIdx).toBeLessThan(loadConfigCallIdx)
  })

  it('build.ts imports loadEnv', () => {
    expect(read(BUILD)).toMatch(/import\s+\{\s*loadEnv\s*\}\s+from\s+['"]\.\.\/\.\.\/config\/load-env/)
  })

  it('build.ts calls loadEnv with mode: production before loadConfig', () => {
    const src = read(BUILD)
    expect(src).toMatch(/loadEnv\(\{\s*cwd,\s*mode:\s*['"]production['"]/)
    const loadEnvCallIdx = src.search(/loadEnv\(\{/)
    const loadConfigCallIdx = src.search(/await\s+loadConfig\(/)
    expect(loadEnvCallIdx).toBeLessThan(loadConfigCallIdx)
  })

  it('start.ts imports loadEnv', () => {
    expect(read(START)).toMatch(/import\s+\{\s*loadEnv\s*\}\s+from\s+['"]\.\.\/\.\.\/config\/load-env/)
  })

  it('start.ts calls loadEnv with mode: production before loadConfig', () => {
    const src = read(START)
    expect(src).toMatch(/loadEnv\(\{\s*cwd,\s*mode:\s*['"]production['"]/)
    const loadEnvCallIdx = src.search(/loadEnv\(\{/)
    const loadConfigCallIdx = src.search(/await\s+loadConfig\(/)
    expect(loadEnvCallIdx).toBeLessThan(loadConfigCallIdx)
  })
})

describe('T1.2 — fixture zero-config-env is well-formed', () => {
  const FIXTURE = resolve(process.cwd(), 'tests/fixtures/zero-config-env')

  it('has .env with OPENROUTER_API_KEY', () => {
    const envSrc = read(resolve(FIXTURE, '.env'))
    expect(envSrc).toMatch(/^OPENROUTER_API_KEY=/m)
  })

  it('has a route that echoes process.env', () => {
    const routeSrc = read(resolve(FIXTURE, 'server/routes/key.ts'))
    expect(routeSrc).toContain('process.env.OPENROUTER_API_KEY')
  })

  it('declares theokit workspace dep', () => {
    const pkg = JSON.parse(read(resolve(FIXTURE, 'package.json'))) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.theokit).toBe('workspace:*')
  })
})
