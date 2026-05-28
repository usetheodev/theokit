import { describe, it, expect } from 'vitest'
import { requireAuth, AuthRequiredError } from '../../packages/theo/src/server/auth/auth.js'

describe('requireAuth', () => {
  it('should pass with valid session object', () => {
    const session = { userId: '123', role: 'admin' }
    expect(() => requireAuth(session)).not.toThrow()
  })

  it('should throw AuthRequiredError when session is null', () => {
    expect(() => requireAuth(null)).toThrow(AuthRequiredError)
  })

  it('should throw AuthRequiredError when session is undefined', () => {
    expect(() => requireAuth(undefined)).toThrow(AuthRequiredError)
  })

  it('should pass with truthy non-null values', () => {
    expect(() => requireAuth({ id: 1 })).not.toThrow()
    expect(() => requireAuth('session-token')).not.toThrow()
    expect(() => requireAuth(42)).not.toThrow()
  })
})

describe('AuthRequiredError', () => {
  it('should have code AUTH_REQUIRED', () => {
    const err = new AuthRequiredError()
    expect(err.code).toBe('AUTH_REQUIRED')
  })

  it('should have status 401', () => {
    const err = new AuthRequiredError()
    expect(err.status).toBe(401)
  })

  it('should be instanceof Error', () => {
    const err = new AuthRequiredError()
    expect(err).toBeInstanceOf(Error)
  })

  it('should have default message', () => {
    const err = new AuthRequiredError()
    expect(err.message).toBe('Authentication required')
  })

  it('should accept custom message', () => {
    const err = new AuthRequiredError('Please log in')
    expect(err.message).toBe('Please log in')
  })
})
