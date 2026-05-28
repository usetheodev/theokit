import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { loadConfig, TheoConfigError } from 'theokit'
import { deepMerge } from 'theokit'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const TEMP_DIR = path.join(tmpdir(), `theo-env-test-${Date.now()}`)

beforeAll(() => {
  // Base config only (no env file)
  const baseOnly = path.join(TEMP_DIR, 'base-only')
  mkdirSync(baseOnly, { recursive: true })
  writeFileSync(path.join(baseOnly, 'theo.config.ts'), 'export default { port: 4000 }')

  // Base + production override
  const withProd = path.join(TEMP_DIR, 'with-prod')
  mkdirSync(withProd, { recursive: true })
  writeFileSync(path.join(withProd, 'theo.config.ts'), 'export default { port: 4000, ssr: false }')
  writeFileSync(path.join(withProd, 'theo.config.production.ts'), 'export default { port: 8080 }')

  // Partial merge (only ssr override)
  const partial = path.join(TEMP_DIR, 'partial-merge')
  mkdirSync(partial, { recursive: true })
  writeFileSync(path.join(partial, 'theo.config.ts'), 'export default { port: 5000, ssr: false }')
  writeFileSync(path.join(partial, 'theo.config.production.ts'), 'export default { ssr: true }')

  // Missing env file (staging env, no file)
  const missingEnv = path.join(TEMP_DIR, 'missing-env')
  mkdirSync(missingEnv, { recursive: true })
  writeFileSync(path.join(missingEnv, 'theo.config.ts'), 'export default { port: 3000 }')

  // Invalid env override (invalid port)
  const invalidEnv = path.join(TEMP_DIR, 'invalid-env')
  mkdirSync(invalidEnv, { recursive: true })
  writeFileSync(path.join(invalidEnv, 'theo.config.ts'), 'export default { port: 3000 }')
  writeFileSync(path.join(invalidEnv, 'theo.config.production.ts'), 'export default { port: -1 }')
})

afterEach(() => {
  delete process.env.NODE_ENV
})

describe('deepMerge', () => {
  it('should merge flat objects', () => {
    const base = { a: 1, b: 2 }
    const override = { b: 3, c: 4 }
    const result = deepMerge(base, override)
    expect(result).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('should deep merge nested objects', () => {
    const base = { nested: { a: 1, b: 2 }, top: 'hello' }
    const override = { nested: { b: 3, c: 4 } }
    const result = deepMerge(base as Record<string, unknown>, override as Record<string, unknown>)
    expect(result).toEqual({ nested: { a: 1, b: 3, c: 4 }, top: 'hello' })
  })

  it('should replace arrays instead of concatenating', () => {
    const base = { items: [1, 2, 3] }
    const override = { items: [4, 5] }
    const result = deepMerge(base as Record<string, unknown>, override as Record<string, unknown>)
    expect(result).toEqual({ items: [4, 5] })
  })

  it('should skip __proto__ key to prevent prototype pollution (EC-4)', () => {
    const base = { a: 1 }
    const override = JSON.parse('{"__proto__": {"polluted": true}, "b": 2}')
    const result = deepMerge(base, override)
    expect(result).toEqual({ a: 1, b: 2 })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('should skip constructor key to prevent prototype pollution (EC-4)', () => {
    const base = { a: 1 }
    const override = { constructor: { polluted: true }, b: 2 } as Record<string, unknown>
    const result = deepMerge(base, override)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('should skip prototype key to prevent prototype pollution (EC-4)', () => {
    const base = { a: 1 }
    const override = { prototype: { polluted: true }, b: 2 } as Record<string, unknown>
    const result = deepMerge(base, override)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('should handle override with null value replacing object', () => {
    const base = { nested: { a: 1 } } as Record<string, unknown>
    const override = { nested: null } as Record<string, unknown>
    const result = deepMerge(base, override)
    expect(result).toEqual({ nested: null })
  })
})

describe('loadConfig with per-environment merging', () => {
  it('should load base config only when NODE_ENV is not set', async () => {
    delete process.env.NODE_ENV
    const config = await loadConfig(path.join(TEMP_DIR, 'base-only'))
    expect(config.port).toBe(4000)
  })

  it('should merge env-specific config over base when NODE_ENV is set', async () => {
    process.env.NODE_ENV = 'production'
    const config = await loadConfig(path.join(TEMP_DIR, 'with-prod'))
    expect(config.port).toBe(8080)
    expect(config.ssr).toBe(false)
  })

  it('should partially merge env config keeping base values for unset keys', async () => {
    process.env.NODE_ENV = 'production'
    const config = await loadConfig(path.join(TEMP_DIR, 'partial-merge'))
    expect(config.port).toBe(5000)
    expect(config.ssr).toBe(true)
  })

  it('should use base config without error when env file is missing', async () => {
    process.env.NODE_ENV = 'staging'
    const config = await loadConfig(path.join(TEMP_DIR, 'missing-env'))
    expect(config.port).toBe(3000)
  })

  it('should throw TheoConfigError when merged config is invalid', async () => {
    process.env.NODE_ENV = 'production'
    await expect(loadConfig(path.join(TEMP_DIR, 'invalid-env'))).rejects.toThrow(TheoConfigError)
  })

  it('should load base config when NODE_ENV is undefined', async () => {
    delete process.env.NODE_ENV
    const config = await loadConfig(path.join(TEMP_DIR, 'with-prod'))
    expect(config.port).toBe(4000)
    expect(config.ssr).toBe(false)
  })
})
