import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { createRouteRateLimiter, deriveKey, matchRoutePattern } from '../../packages/theo/src/server/rate-limit-per-route.js'
import { InMemoryStore } from '../../packages/theo/src/server/rate-limit-store.js'

/**
 * T2.2 — Per-route + per-user rate limiting.
 *
 * Extends the base `createRateLimiter` with:
 *   - `routes` map: path → RateLimitConfig (exact string OR RegExp)
 *   - `default`: fallback config when no route matches
 *   - `keyBy`: 'ip' | 'session' | 'user' | callback
 *
 * Backwards compatibility: a legacy flat `{ windowMs, max }` config is
 * accepted and treated as `default` (no per-route variants).
 *
 * EC-5: trailing-slash normalization on path match.
 * EC-6: keyBy='session' reads cookie name from `cookieName` option,
 *       not hardcoded 'theo_session'.
 */

function mockReq(input: {
  url?: string
  ip?: string
  cookie?: string
  user?: { id: string }
}): IncomingMessage {
  const headers: Record<string, string> = {}
  if (input.cookie) headers.cookie = input.cookie
  return {
    url: input.url ?? '/api/health',
    socket: { remoteAddress: input.ip ?? '127.0.0.1' },
    headers,
    user: input.user,
  } as unknown as IncomingMessage
}

describe('T2.2 — per-route rate limit', () => {
  it('per-route config applied when path matches', () => {
    const limiter = createRouteRateLimiter({
      default: { windowMs: 60_000, max: 100 },
      routes: { '/api/login': { windowMs: 60_000, max: 5 } },
    })
    // Hit /api/login 6 times → 6th should be limited
    for (let i = 0; i < 5; i++) {
      expect(limiter(mockReq({ url: '/api/login' })).limited).toBe(false)
    }
    expect(limiter(mockReq({ url: '/api/login' })).limited).toBe(true)
  })

  it('default config used when path is unmatched', () => {
    const limiter = createRouteRateLimiter({
      default: { windowMs: 60_000, max: 3 },
      routes: { '/api/login': { windowMs: 60_000, max: 5 } },
    })
    // /api/users has no entry → uses default (max=3)
    expect(limiter(mockReq({ url: '/api/users' })).limited).toBe(false)
    expect(limiter(mockReq({ url: '/api/users' })).limited).toBe(false)
    expect(limiter(mockReq({ url: '/api/users' })).limited).toBe(false)
    expect(limiter(mockReq({ url: '/api/users' })).limited).toBe(true)
  })

  it('no rate limit when no default and no route matches', () => {
    const limiter = createRouteRateLimiter({
      routes: { '/api/login': { windowMs: 60_000, max: 5 } },
      // no default
    })
    // /api/health doesn't match → passes through (not limited)
    for (let i = 0; i < 1000; i++) {
      expect(limiter(mockReq({ url: '/api/health' })).limited).toBe(false)
    }
  })

  it('EC-5: trailing slash normalized — /api/login matches /api/login/', () => {
    const limiter = createRouteRateLimiter({
      routes: { '/api/login': { windowMs: 60_000, max: 2 } },
    })
    expect(limiter(mockReq({ url: '/api/login' })).limited).toBe(false)
    expect(limiter(mockReq({ url: '/api/login/' })).limited).toBe(false)
    // Third hit (regardless of trailing slash form) should be limited
    expect(limiter(mockReq({ url: '/api/login' })).limited).toBe(true)
  })
})

describe('T2.2 — keyBy variants', () => {
  it("keyBy='ip' uses remote address (default)", () => {
    expect(deriveKey(mockReq({ ip: '1.2.3.4' }), 'ip', 'theo_session')).toBe('ip:1.2.3.4')
  })

  it("keyBy='session' hashes cookie (not raw value)", () => {
    const key = deriveKey(mockReq({ cookie: 'theo_session=secret-token' }), 'session', 'theo_session')
    expect(key).toMatch(/^session:[A-Za-z0-9_-]+$/) // base64url-ish prefix
    expect(key).not.toContain('secret-token') // raw token NEVER leaks
  })

  it("EC-6: keyBy='session' reads configured cookie name (not hardcoded)", () => {
    const key = deriveKey(mockReq({ cookie: 'app_session=token123' }), 'session', 'app_session')
    expect(key).toMatch(/^session:/)
    const fallback = deriveKey(mockReq({ cookie: 'app_session=token123' }), 'session', 'theo_session')
    expect(fallback).toMatch(/^ip:/) // wrong cookie name → fall back to IP
  })

  it("keyBy='user' falls back to ip when req.user is undefined", () => {
    const key = deriveKey(mockReq({ ip: '5.6.7.8' }), 'user', 'theo_session')
    expect(key).toBe('ip:5.6.7.8')
  })

  it("keyBy='user' uses user.id when present", () => {
    const key = deriveKey(mockReq({ user: { id: 'u-42' } }), 'user', 'theo_session')
    expect(key).toBe('user:u-42')
  })

  it('keyBy callback invoked with req and result used', () => {
    const key = deriveKey(mockReq({ url: '/x' }), (req) => `custom:${req.url}`, 'theo_session')
    expect(key).toBe('custom:/x')
  })
})

describe('T2.2 — backwards compat', () => {
  it('legacy flat config { windowMs, max } works as default', () => {
    const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 2 })
    expect(limiter(mockReq({ url: '/api/anywhere' })).limited).toBe(false)
    expect(limiter(mockReq({ url: '/api/anywhere' })).limited).toBe(false)
    expect(limiter(mockReq({ url: '/api/anywhere' })).limited).toBe(true)
  })
})

describe('T2.2 — matchRoutePattern', () => {
  it('exact string', () => {
    expect(matchRoutePattern('/api/login', '/api/login')).toBe(true)
    expect(matchRoutePattern('/api/login', '/api/users')).toBe(false)
  })

  it('trailing slash normalized', () => {
    expect(matchRoutePattern('/api/login/', '/api/login')).toBe(true)
    expect(matchRoutePattern('/api/login', '/api/login/')).toBe(true)
  })

  it('regex', () => {
    expect(matchRoutePattern('/api/users/42', /^\/api\/users\/\d+$/)).toBe(true)
    expect(matchRoutePattern('/api/users/abc', /^\/api\/users\/\d+$/)).toBe(false)
  })

  it('strips query string from path before matching', () => {
    expect(matchRoutePattern('/api/login?foo=bar', '/api/login')).toBe(true)
  })
})
