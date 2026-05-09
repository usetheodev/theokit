import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSessionManager } from '../../packages/theo/src/server/session.js'

const SECRET = 'a-very-secure-secret-key-for-testing-purposes-1234'

interface TestSession {
  userId: string
  role: string
}

function createMockRes(): ServerResponse {
  const headers: Record<string, string | string[]> = {}
  return {
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string | string[]) => { headers[name.toLowerCase()] = value },
  } as unknown as ServerResponse
}

function createMockReq(cookies: Record<string, string> = {}): IncomingMessage {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ')
  return { headers: { cookie: cookieHeader } } as unknown as IncomingMessage
}

function extractCookieValue(res: ServerResponse, name: string): string | undefined {
  const setCookie = res.getHeader('set-cookie')
  if (!setCookie) return undefined
  const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie)]
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      const value = cookie.split(';')[0].split('=').slice(1).join('=')
      return decodeURIComponent(value)
    }
  }
  return undefined
}

describe('Session Manager', () => {
  it('should set encrypted cookie when creating session', async () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET })
    const res = createMockRes()
    await auth.createSession(res, { userId: '123', role: 'admin' })
    const cookieValue = extractCookieValue(res, 'theo_session')
    expect(cookieValue).toBeDefined()
    expect(cookieValue).toContain(':') // iv:ciphertext format
  })

  it('should return session data from cookie (round-trip)', async () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET })
    const res = createMockRes()
    await auth.createSession(res, { userId: '123', role: 'admin' })

    const cookieValue = extractCookieValue(res, 'theo_session')!
    const req = createMockReq({ theo_session: cookieValue })
    const session = await auth.getSession(req)
    expect(session).toEqual({ userId: '123', role: 'admin' })
  })

  it('should return null when no cookie present', async () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET })
    const req = createMockReq()
    const session = await auth.getSession(req)
    expect(session).toBeNull()
  })

  it('should return null for expired session', async () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET, maxAge: 0 })
    const res = createMockRes()
    await auth.createSession(res, { userId: '123', role: 'admin' })

    // Session created with maxAge=0 → exp = Date.now() + 0 → already expired
    await new Promise(r => setTimeout(r, 10))
    const cookieValue = extractCookieValue(res, 'theo_session')!
    const req = createMockReq({ theo_session: cookieValue })
    const session = await auth.getSession(req)
    expect(session).toBeNull()
  })

  it('should clear cookie when destroying session', () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET })
    const res = createMockRes()
    auth.destroySession(res)
    const cookieValue = extractCookieValue(res, 'theo_session')
    expect(cookieValue).toBe('') // deleteCookie sets empty value with Max-Age=0
  })

  it('should not be readable JSON in raw cookie', async () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET })
    const res = createMockRes()
    await auth.createSession(res, { userId: '123', role: 'admin' })

    const cookieValue = extractCookieValue(res, 'theo_session')!
    // Should NOT be parseable as JSON (it's encrypted)
    expect(() => JSON.parse(cookieValue)).toThrow()
  })

  it('should use custom cookie name', async () => {
    const auth = createSessionManager<TestSession>({ secret: SECRET, cookieName: 'my_session' })
    const res = createMockRes()
    await auth.createSession(res, { userId: '123', role: 'admin' })

    const cookieValue = extractCookieValue(res, 'my_session')
    expect(cookieValue).toBeDefined()
  })

  it('should preserve generic TSession through round-trip', async () => {
    interface CustomSession { userId: string; permissions: string[]; theme: 'dark' | 'light' }
    const auth = createSessionManager<CustomSession>({ secret: SECRET })
    const res = createMockRes()
    const sessionData: CustomSession = { userId: '456', permissions: ['read', 'write'], theme: 'dark' }
    await auth.createSession(res, sessionData)

    const cookieValue = extractCookieValue(res, 'theo_session')!
    const req = createMockReq({ theo_session: cookieValue })
    const session = await auth.getSession(req)
    expect(session).toEqual(sessionData)
  })

  it('should reject secret shorter than 32 characters (EC-1)', () => {
    expect(() => createSessionManager<TestSession>({ secret: 'short' }))
      .toThrow('Session secret must be at least 32 characters')
  })
})
