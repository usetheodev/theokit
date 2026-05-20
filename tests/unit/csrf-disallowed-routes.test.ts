import { describe, it, expect, vi } from 'vitest'
import {
  enforceCsrf,
  matchDisallowed,
  type DisallowedConfig,
} from '../../packages/theo/src/server/csrf.js'

/**
 * T5.1 — disallowedRoutes + disallowedBehavior (Rails-inspired).
 *
 * Per ADR D3: per-route escalation that turns CSRF warnings into 403s
 * for specific paths, regardless of global `csrf` mode. Lets teams roll
 * out strict mode incrementally — flip /api/auth/* first, then the
 * rest of the surface.
 *
 * Rules tested:
 *   1. Exact-string match treats trailing slashes as DISTINCT paths
 *      (use RegExp for tolerance).
 *   2. RegExp.test is stateless across calls (EC-5: explicit lastIndex
 *      reset, otherwise /g flag retains state and intermittent misses).
 *   3. Disallowed match + behavior='raise' escalates warn-mode failures
 *      to 403; warn-behavior is a no-op vs normal dispatch.
 *   4. No disallowed config → identical to legacy behavior.
 */

interface FakeRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
}

function makeReq(opts: Partial<FakeRequest> = {}): FakeRequest {
  return {
    method: opts.method ?? 'POST',
    url: opts.url,
    headers: opts.headers ?? {},
  }
}

describe('matchDisallowed — pattern matching', () => {
  it('Given exact string route, When path matches, Then true', () => {
    expect(matchDisallowed('/api/login', ['/api/login'])).toBe(true)
  })

  it('Given exact string route, When path differs, Then false', () => {
    expect(matchDisallowed('/api/other', ['/api/login'])).toBe(false)
  })

  it('Given exact string + trailing slash mismatch, Then false (documented)', () => {
    expect(matchDisallowed('/api/login', ['/api/login/'])).toBe(false)
    expect(matchDisallowed('/api/login/', ['/api/login'])).toBe(false)
  })

  it('Given RegExp pattern, When path matches, Then true', () => {
    expect(matchDisallowed('/api/admin/users', [/^\/api\/admin\//])).toBe(true)
  })

  it('Given RegExp with trailing-slash tolerance, Then both forms match', () => {
    const pattern = /^\/api\/login\/?$/
    expect(matchDisallowed('/api/login', [pattern])).toBe(true)
    expect(matchDisallowed('/api/login/', [pattern])).toBe(true)
  })

  it('Given mixed string + RegExp patterns, When any matches, Then true', () => {
    expect(matchDisallowed('/api/admin/x', ['/exact', /^\/api\/admin\//])).toBe(true)
  })

  /**
   * EC-5: a RegExp with the /g (global) flag carries `lastIndex` state
   * across `.test()` calls. Without explicit reset, the same pattern
   * applied to the same path 3 times in a row would miss on call #2
   * (because lastIndex was moved past the match position by call #1).
   * The matcher MUST reset lastIndex before each test.
   */
  it('EC-5: Given RegExp with /g flag, When matched against same path 3 times, Then all 3 match', () => {
    const stickyPattern = /^\/api\/admin\/.*/g
    expect(matchDisallowed('/api/admin/x', [stickyPattern])).toBe(true)
    expect(matchDisallowed('/api/admin/x', [stickyPattern])).toBe(true)
    expect(matchDisallowed('/api/admin/x', [stickyPattern])).toBe(true)
  })

  it('Given empty pattern array, Then false', () => {
    expect(matchDisallowed('/api/x', [])).toBe(false)
  })

  it('Given pattern that is neither string nor RegExp, Then false (no crash)', () => {
    expect(matchDisallowed('/api/x', [42 as unknown as string])).toBe(false)
  })
})

describe('enforceCsrf — disallowed dispatch in warn mode', () => {
  const disallowedRaise: DisallowedConfig = {
    routes: ['/api/login'],
    behavior: 'raise',
  }

  it('Given matched route + raise behavior + invalid request, Then allow=false (escalated to 403)', () => {
    const warn = vi.fn()
    const result = enforceCsrf(
      makeReq({ method: 'POST', url: '/api/login', headers: {} }) as never,
      'warn',
      { warn, path: '/api/login' },
      disallowedRaise,
    )
    expect(result.allow).toBe(false)
    expect(result.reason).toMatch(/X-Theo-Action|Origin/)
  })

  it('Given matched route + raise + valid request, Then allow=true (no false positives)', () => {
    const result = enforceCsrf(
      makeReq({
        method: 'POST',
        url: '/api/login',
        headers: { 'x-theo-action': '1' },
      }) as never,
      'warn',
      { warn: vi.fn(), path: '/api/login' },
      disallowedRaise,
    )
    expect(result.allow).toBe(true)
  })

  it('Given non-matching route + raise + invalid request, Then warn-mode dispatch (allow=true)', () => {
    const warn = vi.fn()
    const result = enforceCsrf(
      makeReq({ method: 'POST', url: '/api/public', headers: {} }) as never,
      'warn',
      { warn, path: '/api/public' },
      disallowedRaise,
    )
    expect(result.allow).toBe(true)
    expect(warn).toHaveBeenCalled()
  })
})

describe('enforceCsrf — disallowed behavior = warn (no escalation)', () => {
  const disallowedWarn: DisallowedConfig = {
    routes: ['/api/login'],
    behavior: 'warn',
  }

  it('Given matched route + warn behavior + invalid request, Then normal warn dispatch (allow=true)', () => {
    const warn = vi.fn()
    const result = enforceCsrf(
      makeReq({ method: 'POST', url: '/api/login', headers: {} }) as never,
      'warn',
      { warn, path: '/api/login' },
      disallowedWarn,
    )
    expect(result.allow).toBe(true)
    expect(warn).toHaveBeenCalled()
  })
})

describe('enforceCsrf — undefined disallowed config (legacy path)', () => {
  it('Given no disallowed config, Then enforceCsrf behaves identically to the legacy 3-arg signature', () => {
    const result = enforceCsrf(makeReq({ method: 'POST', headers: {} }) as never, 'warn', {
      warn: vi.fn(),
    })
    expect(result.allow).toBe(true)
  })
})

describe('enforceCsrf — disallowed never escalates in strict mode (already 403)', () => {
  const disallowedRaise: DisallowedConfig = {
    routes: ['/api/login'],
    behavior: 'raise',
  }

  it('Given mode=strict + matched route + invalid request, Then allow=false (same as without disallowed)', () => {
    const result = enforceCsrf(
      makeReq({ method: 'POST', url: '/api/login', headers: {} }) as never,
      'strict',
      undefined,
      disallowedRaise,
    )
    expect(result.allow).toBe(false)
  })
})

describe('enforceCsrf — disallowed never downgrades in off mode', () => {
  /**
   * Invariant from the plan: a disallowed route in `off` mode still
   * gets allowed (off skips validation entirely). disallowed only
   * ESCALATES — it never re-introduces a check that the user has
   * explicitly turned off.
   */
  it('Given mode=off + matched route + invalid request, Then allow=true (off short-circuits)', () => {
    const disallowed: DisallowedConfig = {
      routes: ['/api/login'],
      behavior: 'raise',
    }
    const result = enforceCsrf(
      makeReq({ method: 'POST', url: '/api/login', headers: {} }) as never,
      'off',
      undefined,
      disallowed,
    )
    expect(result.allow).toBe(true)
  })
})
