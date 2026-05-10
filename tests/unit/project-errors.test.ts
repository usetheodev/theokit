import { describe, it, expect } from 'vitest'
import { TheoProjectError } from 'theokit'

describe('TheoProjectError', () => {
  it('should include the root dir in the message', () => {
    const error = new TheoProjectError(['Missing required directory: app/'], '/my-app')
    expect(error.message).toContain('/my-app')
  })

  it('should include all error messages', () => {
    const error = new TheoProjectError(
      ['Missing required directory: app/', 'Missing required file: theo.config.ts'],
      '/my-app',
    )
    expect(error.message).toContain('Missing required directory: app/')
    expect(error.message).toContain('Missing required file: theo.config.ts')
  })

  it('should be an instance of Error', () => {
    const error = new TheoProjectError([], '/my-app')
    expect(error).toBeInstanceOf(Error)
  })

  it('should still have root dir with empty errors', () => {
    const error = new TheoProjectError([], '/my-app')
    expect(error.message).toContain('/my-app')
  })

  it('should expose errors and rootDir properties', () => {
    const errors = ['Missing app/']
    const error = new TheoProjectError(errors, '/path')
    expect(error.errors).toBe(errors)
    expect(error.rootDir).toBe('/path')
  })
})
