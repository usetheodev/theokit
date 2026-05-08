import { describe, it, expect, beforeAll } from 'vitest'
import { validateProjectStructure, TheoProjectError } from 'theo'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../../fixtures')
const TEMP_DIR = path.join(tmpdir(), 'theo-validate-' + Date.now())

beforeAll(() => {
  // Create a temp dir without app/ and without theo.config.ts (for multi-error test)
  const multiErrorDir = path.join(TEMP_DIR, 'multi-error')
  mkdirSync(multiErrorDir, { recursive: true })
  writeFileSync(path.join(multiErrorDir, 'package.json'), '{}')
  // No app/ and no theo.config.ts

  // Create a temp dir without optional dirs (but with required ones)
  const minimalDir = path.join(TEMP_DIR, 'minimal-valid')
  mkdirSync(path.join(minimalDir, 'app'), { recursive: true })
  writeFileSync(path.join(minimalDir, 'theo.config.ts'), 'export default {}')
  writeFileSync(path.join(minimalDir, 'package.json'), '{}')
})

describe('validateProjectStructure', () => {
  it('should accept a valid project structure', () => {
    expect(() => validateProjectStructure(path.join(FIXTURES, 'basic-valid-app'))).not.toThrow()
  })

  it('should fail when app/ directory is missing', () => {
    expect(() => validateProjectStructure(path.join(FIXTURES, 'invalid-no-app'))).toThrow(
      'Missing required directory: app/',
    )
  })

  it('should throw TheoProjectError instance', () => {
    try {
      validateProjectStructure(path.join(FIXTURES, 'invalid-no-app'))
    } catch (e) {
      expect(e).toBeInstanceOf(TheoProjectError)
    }
  })

  it('should accept project without optional directories', () => {
    expect(() => validateProjectStructure(path.join(TEMP_DIR, 'minimal-valid'))).not.toThrow()
  })

  it('should collect all errors in one throw', () => {
    try {
      validateProjectStructure(path.join(TEMP_DIR, 'multi-error'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(TheoProjectError)
      const err = e as TheoProjectError
      expect(err.errors.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('should fail when rootDir does not exist (EC-3)', () => {
    expect(() => validateProjectStructure('/nonexistent/path/that/does/not/exist')).toThrow(
      'Project directory does not exist',
    )
  })
})
