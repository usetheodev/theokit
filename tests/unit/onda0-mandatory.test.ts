import { describe, it, expect } from 'vitest'
import { validateProjectStructure, loadConfig } from 'theokit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../../fixtures')

describe('Onda 0 Mandatory Tests', () => {
  // Teste 1 — Valid project structure recognized
  it('should recognize a valid project structure', () => {
    expect(() => validateProjectStructure(path.join(FIXTURES, 'basic-valid-app'))).not.toThrow()
  })

  // Teste 2 — Invalid config fails with clear error
  it('should fail with clear error on invalid config', async () => {
    await expect(loadConfig(path.join(FIXTURES, 'invalid-config'))).rejects.toThrow(/port/)
  })

  // Teste 3 — Missing app/ fails with clear message
  it('should fail with "Missing required directory: app/" when app/ is missing', () => {
    expect(() => validateProjectStructure(path.join(FIXTURES, 'invalid-no-app'))).toThrow(
      'Missing required directory: app/',
    )
  })
})
