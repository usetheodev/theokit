import { describe, it, expect, vi, expectTypeOf } from 'vitest'
import {
  enforceCsrf,
  type CsrfMode,
  type CsrfWarnPayload,
  CSRF_WARN_CODE,
  CSRF_WARN_DOCS_URL,
} from '../../packages/theo/src/server/security/csrf.js'

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
    const result = enforceCsrf(makeReq({ headers: { 'x-theo-action': '1' } }) as never, 'warn', {
      warn,
    })
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
    enforceCsrf(makeReq({ method: 'POST', headers: {} }) as never, 'warn', {
      warn,
      path: '/api/login',
    })
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
    const result = enforceCsrf(makeReq({ headers: { 'x-theo-action': '1' } }) as never, 'strict')
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

/**
 * T2.2 — Structured warn payload with `code` + `docsUrl`.
 *
 * Per `enforcement-cutover.md` §4 convergent pattern #2 (Vite deprecations.ts
 * pattern): every framework with mature deprecation cycles ships a stable
 * `code` identifier and a `docsUrl` link in the warn payload, so users can
 * (a) grep their logs for one stable string and (b) click through to the
 * migration guide. We add both fields here.
 *
 * Constants are exported so the migration guide and analyzer (T2.3) can
 * reference the same source-of-truth string.
 */
describe('T2.2 — warn payload includes code + docsUrl', () => {
  it('Given warn-mode CSRF failure, When emit, Then payload.code === CSRF_STRICT_CUTOVER', () => {
    const warn = vi.fn()
    enforceCsrf(makeReq({ method: 'POST', headers: {} }) as never, 'warn', {
      warn,
      path: '/api/login',
    })
    const [arg] = warn.mock.calls[0]
    expect((arg as CsrfWarnPayload).code).toBe('CSRF_STRICT_CUTOVER')
    expect(CSRF_WARN_CODE).toBe('CSRF_STRICT_CUTOVER')
  })

  it('Given warn-mode failure, Then payload.docsUrl matches /^https:\\/\\/theokit\\.dev\\/upgrade\\//', () => {
    const warn = vi.fn()
    enforceCsrf(makeReq({ method: 'POST', headers: {} }) as never, 'warn', {
      warn,
      path: '/api/whatever',
    })
    const [arg] = warn.mock.calls[0]
    expect((arg as CsrfWarnPayload).docsUrl).toMatch(/^https:\/\/theokit\.dev\/upgrade\//)
    expect(CSRF_WARN_DOCS_URL).toMatch(/^https:\/\/theokit\.dev\/upgrade\//)
  })

  it('Given 2 calls with different paths, Then both have identical code (cutover is stable across calls)', () => {
    const warn = vi.fn()
    enforceCsrf(makeReq({ method: 'POST', headers: {} }) as never, 'warn', {
      warn,
      path: '/api/a',
    })
    enforceCsrf(makeReq({ method: 'PATCH', headers: {} }) as never, 'warn', {
      warn,
      path: '/api/b',
    })
    expect(warn).toHaveBeenCalledTimes(2)
    const code1 = (warn.mock.calls[0][0] as CsrfWarnPayload).code
    const code2 = (warn.mock.calls[1][0] as CsrfWarnPayload).code
    expect(code1).toBe(code2)
    expect(code1).toBe('CSRF_STRICT_CUTOVER')
  })

  it('Type-test: CsrfWarnPayload includes code + docsUrl as required string fields', () => {
    expectTypeOf<CsrfWarnPayload>().toHaveProperty('code').toEqualTypeOf<string>()
    expectTypeOf<CsrfWarnPayload>().toHaveProperty('docsUrl').toEqualTypeOf<string>()
  })

  it('Backwards-compat: existing fields (event/method/path/reason) are still present', () => {
    const warn = vi.fn()
    enforceCsrf(makeReq({ method: 'POST', headers: {} }) as never, 'warn', {
      warn,
      path: '/api/login',
    })
    const [arg] = warn.mock.calls[0]
    expect(arg).toMatchObject({
      event: 'csrf.warn',
      method: 'POST',
      path: '/api/login',
      code: 'CSRF_STRICT_CUTOVER',
      docsUrl: expect.stringMatching(/^https:\/\/theokit\.dev\/upgrade\//),
    })
    expect(typeof (arg as CsrfWarnPayload).reason).toBe('string')
  })
})
