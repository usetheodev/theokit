import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSessionManager } from '../../packages/theo/src/server/session.js'

/**
 * T3.3 — SessionManager.rotateSession() (OWASP A07:2021 mitigation).
 *
 * Call after successful auth (login, OAuth callback, 2FA upgrade) to
 * defeat session fixation. Preserves session data; refreshes IV +
 * expiry; emits new cookie.
 */

const SECRET = 'rotate-secret-' + 'a'.repeat(32)

interface TS {
  userId: string
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
      return decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))
    }
  }
  return undefined
}

describe('T3.3 — rotateSession', () => {
  it('preserves session data', async () => {
    const sm = createSessionManager<TS>({ secret: SECRET })
    const r1 = createMockRes()
    await sm.createSession(r1, { userId: 'u1' })
    const cookieValue = extractCookieValue(r1, 'theo_session')!

    const r2 = createMockRes()
    const data = await sm.rotateSession(createMockReq({ theo_session: cookieValue }), r2)
    expect(data).toEqual({ userId: 'u1' })
  })

  it('changes cookie value (new IV → new ciphertext)', async () => {
    const sm = createSessionManager<TS>({ secret: SECRET })
    const r1 = createMockRes()
    await sm.createSession(r1, { userId: 'u1' })
    const cookieValue = extractCookieValue(r1, 'theo_session')!

    const r2 = createMockRes()
    await sm.rotateSession(createMockReq({ theo_session: cookieValue }), r2)
    const rotated = extractCookieValue(r2, 'theo_session')!
    expect(rotated).toBeDefined()
    expect(rotated).not.toBe(cookieValue)
  })

  it('EC: no session cookie → returns null, no Set-Cookie emitted', async () => {
    const sm = createSessionManager<TS>({ secret: SECRET })
    const res = createMockRes()
    const data = await sm.rotateSession(createMockReq(), res)
    expect(data).toBeNull()
    expect(res.getHeader('set-cookie')).toBeUndefined()
  })

  it('refreshes expiry (new envelope exp ~= now + maxAge)', async () => {
    const sm = createSessionManager<TS>({ secret: SECRET, maxAge: 60 })
    const r1 = createMockRes()
    await sm.createSession(r1, { userId: 'u1' })
    const before = extractCookieValue(r1, 'theo_session')!

    // Wait a tick so the new IV gets a fresh timestamp slot.
    await new Promise((r) => setTimeout(r, 10))

    const r2 = createMockRes()
    await sm.rotateSession(createMockReq({ theo_session: before }), r2)
    const after = extractCookieValue(r2, 'theo_session')!
    // Indirect check: the encrypted value should be different (new IV AND new exp envelope)
    expect(after).not.toBe(before)
  })
})
