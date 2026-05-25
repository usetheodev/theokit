import type { IncomingMessage, ServerResponse } from 'node:http'

import { describe, it, expect } from 'vitest'
import { createCorsHandler, matchesOrigin } from '../../packages/theo/src/server/http/cors.js'
import { corsSchema } from '../../packages/theo/src/config/schema.js'

/**
 * T1.2 — CORS middleware + config schema.
 *
 * Decisions (see plan ADR D3 + D10):
 *   - Single global middleware. Runs FIRST in middleware order (before
 *     rate limit, before CSRF, before security headers).
 *   - Preflight (`OPTIONS` with `Access-Control-Request-Method`) handled
 *     by `handlePreflight` which short-circuits the response.
 *   - Simple/regular requests get `Access-Control-*` headers via
 *     `applyHeaders` then continue down the pipeline.
 *
 * Schema rejects the spec-violating `origins:'*'` + `credentials:true`
 * combination at parse time (browsers ignore wildcard with credentials).
 *
 * EC-3 (CWE-113): every string-valued header config (allowedHeaders,
 * exposedHeaders) goes through the header-safe refinement — no CR/LF.
 */

function mockReq(input: {
  method: string
  origin?: string | string[] | null
  acRequestMethod?: string
  acRequestHeaders?: string
}) {
  const headers: Record<string, string | string[] | undefined> = {}
  if (input.origin !== undefined && input.origin !== null) headers.origin = input.origin
  if (input.acRequestMethod) headers['access-control-request-method'] = input.acRequestMethod
  if (input.acRequestHeaders) headers['access-control-request-headers'] = input.acRequestHeaders
  return { method: input.method, headers } as unknown as IncomingMessage
}

function mockRes() {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let ended = false
  return {
    headers,
    get statusCode() {
      return statusCode
    },
    set statusCode(v: number) {
      statusCode = v
    },
    setHeader(k: string, v: string) {
      headers[k] = v
    },
    end() {
      ended = true
    },
    get ended() {
      return ended
    },
  } as unknown as ServerResponse & { headers: Record<string, string>; ended: boolean }
}

describe('T1.2 — CORS preflight handling', () => {
  it('Given OPTIONS request with allowed origin + method, Then 204 + Access-Control-Allow-* headers set', () => {
    const cors = createCorsHandler({ origins: ['https://app.example.com'] })
    const req = mockReq({
      method: 'OPTIONS',
      origin: 'https://app.example.com',
      acRequestMethod: 'POST',
    })
    const res = mockRes() as any
    const handled = cors.handlePreflight(req, res)
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(res.headers['Access-Control-Allow-Methods']).toBeDefined()
    expect(res.headers['Access-Control-Max-Age']).toBeDefined()
  })

  it('Given OPTIONS from origin NOT in list, Then 403 + no allow-origin header', () => {
    const cors = createCorsHandler({ origins: ['https://app.example.com'] })
    const req = mockReq({
      method: 'OPTIONS',
      origin: 'https://evil.example',
      acRequestMethod: 'POST',
    })
    const res = mockRes() as any
    const handled = cors.handlePreflight(req, res)
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(403)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('Given OPTIONS without Access-Control-Request-Method, Then handler returns false (let routing handle)', () => {
    const cors = createCorsHandler({ origins: ['*'] })
    const req = mockReq({ method: 'OPTIONS', origin: 'https://app.example.com' })
    const res = mockRes() as any
    const handled = cors.handlePreflight(req, res)
    expect(handled).toBe(false)
  })

  it('Given non-OPTIONS, Then handler returns false (preflight not applicable)', () => {
    const cors = createCorsHandler({ origins: ['*'] })
    const req = mockReq({ method: 'POST', origin: 'https://app.example.com' })
    const res = mockRes() as any
    const handled = cors.handlePreflight(req, res)
    expect(handled).toBe(false)
  })
})

describe('T1.2 — applyHeaders for non-preflight requests', () => {
  it('Given GET request from allowed origin, Then response has Access-Control-Allow-Origin echoed', () => {
    const cors = createCorsHandler({ origins: ['https://app.example.com'] })
    const req = mockReq({ method: 'GET', origin: 'https://app.example.com' })
    const res = mockRes() as any
    cors.applyHeaders(req, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  })

  it('Given exposedHeaders configured, Then Access-Control-Expose-Headers header added', () => {
    const cors = createCorsHandler({
      origins: ['https://app.example.com'],
      exposedHeaders: ['X-Trace-Id'],
    })
    const req = mockReq({ method: 'GET', origin: 'https://app.example.com' })
    const res = mockRes() as any
    cors.applyHeaders(req, res)
    expect(res.headers['Access-Control-Expose-Headers']).toBe('X-Trace-Id')
  })

  it('Given credentials=true + matched origin, Then Access-Control-Allow-Credentials: true header set', () => {
    const cors = createCorsHandler({ origins: ['https://app.example.com'], credentials: true })
    const req = mockReq({ method: 'GET', origin: 'https://app.example.com' })
    const res = mockRes() as any
    cors.applyHeaders(req, res)
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true')
  })

  it('Given maxAge=3600, Then preflight response has Access-Control-Max-Age: 3600', () => {
    const cors = createCorsHandler({ origins: ['https://app.example.com'], maxAge: 3600 })
    const req = mockReq({
      method: 'OPTIONS',
      origin: 'https://app.example.com',
      acRequestMethod: 'POST',
    })
    const res = mockRes() as any
    cors.handlePreflight(req, res)
    expect(res.headers['Access-Control-Max-Age']).toBe('3600')
  })
})

describe('T1.2 — origin matching variants', () => {
  it('exact-string match', () => {
    expect(matchesOrigin('https://app.example.com', ['https://app.example.com'])).toBe(true)
    expect(matchesOrigin('https://other.example.com', ['https://app.example.com'])).toBe(false)
  })

  it('regex match', () => {
    expect(matchesOrigin('https://sub.example.com', /\.example\.com$/)).toBe(true)
    expect(matchesOrigin('https://sub.evil.com', /\.example\.com$/)).toBe(false)
  })

  it('callback match', () => {
    const cb = (o: string) => o.endsWith('.example.com')
    expect(matchesOrigin('https://app.example.com', cb)).toBe(true)
    expect(matchesOrigin('https://evil.com', cb)).toBe(false)
  })

  it('EC-8: callback that throws is fail-closed (denies origin)', () => {
    const cb = () => {
      throw new Error('userDB offline')
    }
    expect(matchesOrigin('https://app.example.com', cb)).toBe(false)
  })

  it('wildcard "*"', () => {
    expect(matchesOrigin('https://anywhere.example', '*')).toBe(true)
  })
})

describe('T1.2 — corsSchema validation', () => {
  it('origin: "*" combined with credentials: true → rejected at parse', () => {
    expect(() => corsSchema.parse({ origins: '*', credentials: true })).toThrow()
  })

  it('origins: "*" alone is OK (no credentials)', () => {
    expect(() => corsSchema.parse({ origins: '*' })).not.toThrow()
    expect(() => corsSchema.parse({ origins: '*', credentials: false })).not.toThrow()
  })

  it('EC-3: allowedHeaders entries containing CR/LF rejected (CWE-113)', () => {
    expect(() =>
      corsSchema.parse({
        origins: ['https://app.example.com'],
        allowedHeaders: ['X-Good', 'X-Bad\r\nX-Injected: yes'],
      }),
    ).toThrow()
  })

  it('EC-3: exposedHeaders entries containing CR/LF rejected (CWE-113)', () => {
    expect(() =>
      corsSchema.parse({
        origins: ['https://app.example.com'],
        exposedHeaders: ['X-Trace-Id\nbad'],
      }),
    ).toThrow()
  })
})

describe('T1.2 — array Origin header (edge case)', () => {
  it('multiple Origin headers → first value used', () => {
    const cors = createCorsHandler({ origins: ['https://a.example.com'] })
    const req = mockReq({
      method: 'OPTIONS',
      origin: ['https://a.example.com', 'https://b.example.com'],
      acRequestMethod: 'POST',
    })
    const res = mockRes() as any
    cors.handlePreflight(req, res)
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://a.example.com')
  })
})
