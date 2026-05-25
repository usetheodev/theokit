import { describe, it, expect, afterEach } from 'vitest'
import { getCookie, setCookie, deleteCookie } from '../../packages/theo/src/server/http/cookies.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function mockReq(cookieHeader: string): IncomingMessage {
  return { headers: { cookie: cookieHeader } } as unknown as IncomingMessage
}

type HeaderValue = string | string[] | undefined

function mockRes(): ServerResponse & { _headers: Record<string, string | string[]> } {
  const headers: Record<string, string | string[]> = {}
  return {
    _headers: headers,
    // eslint-disable-next-line sonarjs/function-return-type -- Node's `res.getHeader` REQUIRES the `string | string[] | undefined` union
    getHeader(name: string): HeaderValue {
      const key = name.toLowerCase()
      return Object.hasOwn(headers, key) ? headers[key] : undefined
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value
    },
  } as unknown as ServerResponse & { _headers: Record<string, string | string[]> }
}

const origEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = origEnv
})

describe('getCookie', () => {
  it('should return cookie value', () => {
    expect(getCookie(mockReq('session=abc123'), 'session')).toBe('abc123')
  })

  it('should return undefined for missing cookie', () => {
    expect(getCookie(mockReq(''), 'session')).toBeUndefined()
  })

  it('should handle multiple cookies', () => {
    expect(getCookie(mockReq('a=1; b=2; c=3'), 'b')).toBe('2')
  })

  it('should handle values with equals (EC-2: base64)', () => {
    expect(getCookie(mockReq('token=abc=='), 'token')).toBe('abc==')
  })

  it('should return undefined for no cookie header', () => {
    const req = { headers: {} } as unknown as IncomingMessage
    expect(getCookie(req, 'session')).toBeUndefined()
  })
})

describe('setCookie', () => {
  it('should set cookie with secure defaults', () => {
    const res = mockRes()
    setCookie(res, 'token', 'xyz')
    const cookies = res._headers['set-cookie'] as string[]
    expect(cookies[0]).toContain('token=xyz')
    expect(cookies[0]).toContain('HttpOnly')
    expect(cookies[0]).toContain('SameSite=Lax')
    expect(cookies[0]).toContain('Path=/')
  })

  it('should set custom options', () => {
    const res = mockRes()
    setCookie(res, 'token', 'xyz', { maxAge: 3600, domain: 'example.com' })
    const cookies = res._headers['set-cookie'] as string[]
    expect(cookies[0]).toContain('Max-Age=3600')
    expect(cookies[0]).toContain('Domain=example.com')
  })

  it('should append multiple cookies (EC-1)', () => {
    const res = mockRes()
    setCookie(res, 'a', '1')
    setCookie(res, 'b', '2')
    const cookies = res._headers['set-cookie'] as string[]
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain('a=1')
    expect(cookies[1]).toContain('b=2')
  })

  it('should set Secure in production', () => {
    process.env.NODE_ENV = 'production'
    const res = mockRes()
    setCookie(res, 'token', 'xyz')
    const cookies = res._headers['set-cookie'] as string[]
    expect(cookies[0]).toContain('Secure')
  })

  it('should not set Secure in development', () => {
    process.env.NODE_ENV = 'development'
    const res = mockRes()
    setCookie(res, 'token', 'xyz')
    const cookies = res._headers['set-cookie'] as string[]
    expect(cookies[0]).not.toContain('Secure')
  })
})

describe('deleteCookie', () => {
  it('should set Max-Age=0', () => {
    const res = mockRes()
    deleteCookie(res, 'token')
    const cookies = res._headers['set-cookie'] as string[]
    expect(cookies[0]).toContain('Max-Age=0')
    expect(cookies[0]).toContain('token=')
  })
})
