import { describe, it, expect } from 'vitest'

import { NonRetryableError } from '../../packages/theo/src/server/jobs/job-backend.js'

describe('NonRetryableError (T2.1)', () => {
  it('is constructible with a message', () => {
    const err = new NonRetryableError('do not retry')
    expect(err.message).toBe('do not retry')
  })

  it('has code === NON_RETRYABLE', () => {
    const err = new NonRetryableError('x')
    expect(err.code).toBe('NON_RETRYABLE')
  })

  it('is an instanceof Error', () => {
    const err = new NonRetryableError('x')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NonRetryableError)
  })

  it('preserves the name field', () => {
    const err = new NonRetryableError('x')
    expect(err.name).toBe('NonRetryableError')
  })
})
