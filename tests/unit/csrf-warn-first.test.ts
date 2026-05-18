import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enforceCsrf, type CsrfMode } from '../../packages/theo/src/server/csrf.js'

/**
 * Phase 5 — CSRF warn-first (EC-1).
 *
 * The framework already had `validateCsrf` covering the action path (custom
 * header `X-Theo-Action: 1` + Origin match). The `defineRoute` path was
 * unprotected. Default-on would be a breaking change for 0.2.0 — existing
 * apps that POST without the header would start failing.
 *
 * EC-1 resolution: ship `warn` as the default mode in 0.2.0, flip to
 * `strict` in 0.3.0. Migration is a single config flag for users who want
 * to test strict mode earlier.
 *
 * `enforceCsrf(req, mode, logger?)` returns whether the request should be
 * allowed and (in warn mode) emits a structured warning so apps can grep
 * their logs and migrate before the strict cutover.
 */

interface FakeRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

function makeReq(opts: Partial<FakeRequest> = {}): FakeRequest {
  return {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
  }
}

describe('enforceCsrf — mode === "off"', () => {
  it('Given any request, When mode is off, Then it always allows the request', () => {
    const req = makeReq({ headers: {} })
    const result = enforceCsrf(req as never, 'off')
    expect(result.allow).toBe(true)
  })

  it('Given an invalid request, When mode is off, Then no warning is emitted', () => {
    const warn = vi.fn()
    enforceCsrf(makeReq({ headers: {} }) as never, 'off', { warn })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('enforceCsrf — mode === "warn"', () => {
  it('Given a missing X-Theo-Action header, When mode is warn, Then allow=true but warn is called', () => {
    const warn = vi.fn()
    const result = enforceCsrf(makeReq({ headers: {} }) as never, 'warn', { warn })
    expect(result.allow).toBe(true)
    expect(result.reason).toMatch(/X-Theo-Action/)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('Given a valid request, When mode is warn, Then allow=true and no warning', () => {
    const warn = vi.fn()
    const result = enforceCsrf(
      makeReq({ headers: { 'x-theo-action': '1' } }) as never,
      'warn',
      { warn },
    )
    expect(result.allow).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('Given an origin mismatch, When mode is warn, Then allow=true with a clear reason', () => {
    const warn = vi.fn()
    const result = enforceCsrf(
      makeReq({
        headers: {
          'x-theo-action': '1',
          origin: 'https://evil.com',
          host: 'app.example.com',
        },
      }) as never,
      'warn',
      { warn },
    )
    expect(result.allow).toBe(true)
    expect(result.reason).toMatch(/Origin/)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('Warn payload includes the request method and path for log correlation', () => {
    const warn = vi.fn()
    enforceCsrf(
      makeReq({ method: 'POST', headers: {} }) as never,
      'warn',
      { warn, path: '/api/login' },
    )
    const [arg] = warn.mock.calls[0]
    expect(arg).toMatchObject({
      event: 'csrf.warn',
      method: 'POST',
      path: '/api/login',
    })
  })
})

describe('enforceCsrf — mode === "strict"', () => {
  it('Given a missing X-Theo-Action header, When mode is strict, Then allow=false with reason', () => {
    const result = enforceCsrf(makeReq({ headers: {} }) as never, 'strict')
    expect(result.allow).toBe(false)
    expect(result.reason).toMatch(/X-Theo-Action/)
  })

  it('Given a valid header, When mode is strict, Then allow=true', () => {
    const result = enforceCsrf(
      makeReq({ headers: { 'x-theo-action': '1' } }) as never,
      'strict',
    )
    expect(result.allow).toBe(true)
  })

  it('Given an origin mismatch, When mode is strict, Then allow=false', () => {
    const result = enforceCsrf(
      makeReq({
        headers: {
          'x-theo-action': '1',
          origin: 'https://evil.com',
          host: 'app.example.com',
        },
      }) as never,
      'strict',
    )
    expect(result.allow).toBe(false)
  })
})

describe('enforceCsrf — type contract', () => {
  it('CsrfMode is the discriminated union "off" | "warn" | "strict"', () => {
    // Type-level assertion via runtime assignment
    const modes: CsrfMode[] = ['off', 'warn', 'strict']
    expect(modes).toHaveLength(3)
  })
})
