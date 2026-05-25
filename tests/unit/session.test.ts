import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSessionManager } from '../../packages/theo/src/server/auth/session.js'

const SECRET = 'a-very-secure-secret-key-for-testing-purposes-1234'

interface TestSession {
  userId: string
  role: string
}

function createMockRes(): ServerResponse {
  const headers: Record<string, string | string[]> = {}
  return {
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = value
    },
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
    await new Promise((r) => setTimeout(r, 10))
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
    interface CustomSession {
      userId: string
      permissions: string[]
      theme: 'dark' | 'light'
    }
    const auth = createSessionManager<CustomSession>({ secret: SECRET })
    const res = createMockRes()
    const sessionData: CustomSession = {
      userId: '456',
      permissions: ['read', 'write'],
      theme: 'dark',
    }
    await auth.createSession(res, sessionData)

    const cookieValue = extractCookieValue(res, 'theo_session')!
    const req = createMockReq({ theo_session: cookieValue })
    const session = await auth.getSession(req)
    expect(session).toEqual(sessionData)
  })

  it('should reject secret shorter than 32 characters (EC-1)', () => {
    expect(() => createSessionManager<TestSession>({ secret: 'short' })).toThrow(
      'Session secret must be at least 32 characters',
    )
  })
})

/**
 * T3.1 — Session secret rotation (dual-key window).
 *
 * createSessionManager accepts secret as `string | string[]`. Array
 * form: index 0 = newest. Encrypt always uses secrets[0]; decrypt walks
 * the array (fallback on legacy keys).
 *
 * EC-1: array length capped at 5 — enforced via throw at construction.
 * No silent truncation (which would give false sense of rotation).
 */
describe('T3.1 — Session secret as string | string[]', () => {
  const NEW_SECRET = 'a-new-secret-' + 'x'.repeat(32)
  const OLD_SECRET = 'an-old-secret-' + 'y'.repeat(32)

  it('Backwards compat: string secret works as before', async () => {
    const auth = createSessionManager<TestSession>({ secret: NEW_SECRET })
    const res = createMockRes()
    await auth.createSession(res, { userId: '1', role: 'a' })
    const cookieValue = extractCookieValue(res, 'theo_session')!
    const req = createMockReq({ theo_session: cookieValue })
    expect(await auth.getSession(req)).toEqual({ userId: '1', role: 'a' })
  })

  it('Array secret encrypts with secrets[0] (newest)', async () => {
    const auth = createSessionManager<TestSession>({ secret: [NEW_SECRET, OLD_SECRET] })
    const res = createMockRes()
    await auth.createSession(res, { userId: '1', role: 'a' })
    // Session created with NEW_SECRET — managers with only NEW_SECRET should read it
    const cookieValue = extractCookieValue(res, 'theo_session')!
    const onlyNew = createSessionManager<TestSession>({ secret: NEW_SECRET })
    expect(await onlyNew.getSession(createMockReq({ theo_session: cookieValue }))).toEqual({
      userId: '1',
      role: 'a',
    })
  })

  it('Decrypt falls back to old key when newest fails', async () => {
    // Step 1: create session with OLD_SECRET only
    const legacy = createSessionManager<TestSession>({ secret: OLD_SECRET })
    const legacyRes = createMockRes()
    await legacy.createSession(legacyRes, { userId: '42', role: 'reader' })
    const legacyCookie = extractCookieValue(legacyRes, 'theo_session')!

    // Step 2: operator rotates — now secret=[NEW, OLD]
    const rotated = createSessionManager<TestSession>({ secret: [NEW_SECRET, OLD_SECRET] })
    const session = await rotated.getSession(createMockReq({ theo_session: legacyCookie }))
    expect(session).toEqual({ userId: '42', role: 'reader' })
  })

  it('Decrypt returns null when no secret in array matches', async () => {
    const thirdParty = createSessionManager<TestSession>({
      secret: 'unknown-secret-' + 'z'.repeat(32),
    })
    const r = createMockRes()
    await thirdParty.createSession(r, { userId: '99', role: 'x' })
    const cookieValue = extractCookieValue(r, 'theo_session')!

    const ours = createSessionManager<TestSession>({ secret: [NEW_SECRET, OLD_SECRET] })
    expect(await ours.getSession(createMockReq({ theo_session: cookieValue }))).toBeNull()
  })

  it('Empty array throws at construction', () => {
    expect(() => createSessionManager<TestSession>({ secret: [] })).toThrow(/secret/i)
  })

  it('Array with one too-short secret throws at construction', () => {
    expect(() => createSessionManager<TestSession>({ secret: [NEW_SECRET, 'shrt'] })).toThrow(
      /32 characters/,
    )
  })

  it('EC-1: Array with more than 5 secrets throws at construction (fail-loud, no silent truncation)', () => {
    const s = (i: number) => 'secret-' + String(i).padEnd(32, '0')
    expect(() =>
      createSessionManager<TestSession>({ secret: [s(1), s(2), s(3), s(4), s(5), s(6)] }),
    ).toThrow(/maximum of 5/i)
  })
})
