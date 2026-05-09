import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { createRateLimiter } from '../../packages/theo/src/server/rate-limit.js'

function mockReq(ip = '127.0.0.1'): IncomingMessage {
  return { socket: { remoteAddress: ip } } as unknown as IncomingMessage
}

describe('Rate Limiter', () => {
  it('should allow requests under the limit', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 3 })
    expect(check(mockReq()).limited).toBe(false)
    expect(check(mockReq()).limited).toBe(false)
    expect(check(mockReq()).limited).toBe(false)
  })

  it('should block after exceeding the limit', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 3 })
    check(mockReq())
    check(mockReq())
    check(mockReq())
    const result = check(mockReq())
    expect(result.limited).toBe(true)
  })

  it('should reset after window expires', async () => {
    const check = createRateLimiter({ windowMs: 100, max: 1 })
    check(mockReq())
    expect(check(mockReq()).limited).toBe(true)
    await new Promise(r => setTimeout(r, 150))
    expect(check(mockReq()).limited).toBe(false)
  })

  it('should include X-RateLimit-Limit header', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 5 })
    const result = check(mockReq())
    expect(result.headers['X-RateLimit-Limit']).toBe('5')
  })

  it('should include X-RateLimit-Remaining header', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 5 })
    check(mockReq())
    const result = check(mockReq())
    expect(result.headers['X-RateLimit-Remaining']).toBe('3')
  })

  it('should include Retry-After when limited', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 1 })
    check(mockReq())
    const result = check(mockReq())
    expect(result.limited).toBe(true)
    expect(Number(result.headers['Retry-After'])).toBeGreaterThan(0)
  })

  it('should track different IPs separately', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 1 })
    check(mockReq('10.0.0.1'))
    // Second IP should not be limited
    expect(check(mockReq('10.0.0.2')).limited).toBe(false)
    // First IP should be limited
    expect(check(mockReq('10.0.0.1')).limited).toBe(true)
  })

  it('should use fallback key when IP is unavailable', () => {
    const check = createRateLimiter({ windowMs: 10_000, max: 1 })
    const noIpReq = { socket: {} } as unknown as IncomingMessage
    check(noIpReq)
    expect(check(noIpReq).limited).toBe(true)
  })

  it('should clean up expired entries periodically (EC-1)', () => {
    const check = createRateLimiter({ windowMs: 1, max: 1000 })

    // Create 1000+ unique IP entries
    for (let i = 0; i < 1001; i++) {
      check(mockReq(`10.0.${Math.floor(i / 256)}.${i % 256}`))
    }

    // Wait for window to expire
    vi.useFakeTimers()
    vi.advanceTimersByTime(10)

    // The 1001st check triggers cleanup (checkCount % 1000 === 0 happens at 1000)
    // After cleanup, expired entries should be removed
    // This just verifies no crash and the function continues working
    const result = check(mockReq('10.0.0.1'))
    expect(result.limited).toBe(false) // window expired, should be allowed
    vi.useRealTimers()
  })
})
