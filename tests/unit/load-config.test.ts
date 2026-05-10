import { describe, it, expect, beforeAll } from 'vitest'
import { loadConfig, TheoConfigError } from 'theokit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../../fixtures')

// Create inline temp fixtures for tests that don't depend on Phase 4 fixtures
const TEMP_DIR = path.join(tmpdir(), 'theo-test-' + Date.now())

beforeAll(() => {
  // Temp dir without theo.config.ts
  mkdirSync(path.join(TEMP_DIR, 'no-config'), { recursive: true })

  // Temp dir with config exporting null
  const nullDir = path.join(TEMP_DIR, 'null-config')
  mkdirSync(nullDir, { recursive: true })
  writeFileSync(path.join(nullDir, 'theo.config.ts'), 'export default null')

  // Temp dir with syntax error config
  const syntaxDir = path.join(TEMP_DIR, 'syntax-error-config')
  mkdirSync(syntaxDir, { recursive: true })
  writeFileSync(path.join(syntaxDir, 'theo.config.ts'), 'export default {{{')
})

describe('loadConfig', () => {
  it('should load and validate a valid config', async () => {
    const config = await loadConfig(path.join(FIXTURES, 'basic-valid-app'))
    expect(config.port).toBe(3000)
    expect(config.appDir).toBe('app')
    expect(config.serverDir).toBe('server')
  })

  it('should throw TheoConfigError for invalid config', async () => {
    await expect(
      loadConfig(path.join(FIXTURES, 'invalid-config')),
    ).rejects.toThrow(/port/)
  })

  it('should return defaults when config file is missing', async () => {
    const config = await loadConfig(path.join(TEMP_DIR, 'no-config'))
    expect(config.appDir).toBe('app')
    expect(config.serverDir).toBe('server')
    expect(config.port).toBe(3000)
  })

  it('should throw TheoConfigError instance', async () => {
    try {
      await loadConfig(path.join(FIXTURES, 'invalid-config'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(TheoConfigError)
    }
  })

  it('should throw TheoConfigError for config with syntax error (EC-2)', async () => {
    try {
      await loadConfig(path.join(TEMP_DIR, 'syntax-error-config'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(TheoConfigError)
      expect((e as TheoConfigError).message).toContain('theo.config.ts')
    }
  })

  it('should throw clear message when config exports null (EC-6)', async () => {
    await expect(
      loadConfig(path.join(TEMP_DIR, 'null-config')),
    ).rejects.toThrow(/must use export default defineConfig/)
  })
})
