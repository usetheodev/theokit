import { describe, it, expect } from 'vitest'
import { TheoConfigError } from 'theo'

describe('TheoConfigError', () => {
  it('should include the config file path in the message', () => {
    const error = new TheoConfigError(
      [{ field: 'port', message: 'Expected number, received string' }],
      '/my-app/theo.config.ts',
    )
    expect(error.message).toContain('/my-app/theo.config.ts')
  })

  it('should include the field name in the message', () => {
    const error = new TheoConfigError(
      [{ field: 'port', message: 'Expected number, received string' }],
      '/my-app/theo.config.ts',
    )
    expect(error.message).toContain('port')
  })

  it('should be an instance of Error', () => {
    const error = new TheoConfigError([], '/my-app/theo.config.ts')
    expect(error).toBeInstanceOf(Error)
  })

  it('should still have file path with empty issues', () => {
    const error = new TheoConfigError([], '/my-app/theo.config.ts')
    expect(error.message).toContain('/my-app/theo.config.ts')
  })

  it('should list multiple issues', () => {
    const error = new TheoConfigError(
      [
        { field: 'port', message: 'Expected number' },
        { field: 'appDir', message: 'Expected string' },
      ],
      '/my-app/theo.config.ts',
    )
    expect(error.message).toContain('port')
    expect(error.message).toContain('appDir')
  })

  it('should expose issues and configPath properties', () => {
    const issues = [{ field: 'port', message: 'bad' }]
    const error = new TheoConfigError(issues, '/path')
    expect(error.issues).toBe(issues)
    expect(error.configPath).toBe('/path')
  })
})
