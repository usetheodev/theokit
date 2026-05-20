import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSessionManager, rotateIfNeeded } from '../../packages/theo/src/server/session.js'

/**
 * T3.2 — Integration tests for transparent session re-encrypt.
 *
 * EC-4 — Timing-safe rotation:
 *   - `rotateIfNeeded` runs in `createContext` BEFORE `renderToPipeableStream`
 *     fires. Once headers commit, Set-Cookie is locked → re-encrypt would be
 *     a silent no-op.
 *   - The cookie value after rotation MUST be different from the input cookie
 *     (new IV → new ciphertext).
 *   - For streaming SSR routes, the regression we're guarding against is:
 *     re-encrypt happens AFTER res.writeHead → browser keeps the legacy
 *     cookie → user is locked on the legacy secret forever once it's
 *     dropped from the array.
 */

const NEW_SECRET = 'new-secret-' + 'x'.repeat(32)
const OLD_SECRET = 'old-secret-' + 'y'.repeat(32)

interface TS {
  userId: string
  role: string
}

function createMockRes(): ServerResponse & { headersSent: boolean } {
  const headers: Record<string, string | string[]> = {}
  let headersSent = false
  const res = {
    get headersSent() {
      return headersSent
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string | string[]) => {
      if (headersSent) throw new Error('Cannot set headers after they are sent')
      headers[name.toLowerCase()] = value
    },
    writeHead: (_statusCode?: number) => {
      headersSent = true
    },
  } as unknown as ServerResponse & { headersSent: boolean }
  return res
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

describe('T3.2 — session rotation integration (rotateIfNeeded)', () => {
  it('legacy-encrypted cookie is re-issued after first request', async () => {
    // Step 1: legacy server creates session with OLD secret
    const legacy = createSessionManager<TS>({ secret: OLD_SECRET })
    const legacyRes = createMockRes()
    await legacy.createSession(legacyRes, { userId: 'u1', role: 'reader' })
    const legacyCookie = extractCookieValue(legacyRes, 'theo_session')!

    // Step 2: rotated server (NEW + OLD) receives that legacy cookie
    const rotated = createSessionManager<TS>({ secret: [NEW_SECRET, OLD_SECRET] })
    const req = createMockReq({ theo_session: legacyCookie })
    const res = createMockRes()

    const data = await rotateIfNeeded(rotated, req, res)
    expect(data).toEqual({ userId: 'u1', role: 'reader' })

    // Set-Cookie MUST be present (this is the re-encrypt)
    const newCookie = extractCookieValue(res, 'theo_session')!
    expect(newCookie).toBeDefined()
    // ...and the value MUST be different from the legacy cookie (new IV → new ciphertext)
    expect(newCookie).not.toBe(legacyCookie)
  })

  it('newest-encrypted cookie is NOT re-issued (no Set-Cookie emitted)', async () => {
    const rotated = createSessionManager<TS>({ secret: [NEW_SECRET, OLD_SECRET] })
    const r1 = createMockRes()
    await rotated.createSession(r1, { userId: 'u1', role: 'reader' })
    const cookieValue = extractCookieValue(r1, 'theo_session')!

    const r2 = createMockRes()
    await rotateIfNeeded(rotated, createMockReq({ theo_session: cookieValue }), r2)
    expect(r2.getHeader('set-cookie')).toBeUndefined()
  })

  it('no session cookie → no re-encrypt, no Set-Cookie emitted', async () => {
    const rotated = createSessionManager<TS>({ secret: [NEW_SECRET, OLD_SECRET] })
    const res = createMockRes()
    const data = await rotateIfNeeded(rotated, createMockReq(), res)
    expect(data).toBeNull()
    expect(res.getHeader('set-cookie')).toBeUndefined()
  })

  it('EC-4: Set-Cookie is emitted BEFORE res.writeHead is called (so streaming SSR sees it)', async () => {
    // Build a legacy cookie first
    const legacy = createSessionManager<TS>({ secret: OLD_SECRET })
    const legacyRes = createMockRes()
    await legacy.createSession(legacyRes, { userId: 'u1', role: 'reader' })
    const legacyCookie = extractCookieValue(legacyRes, 'theo_session')!

    const rotated = createSessionManager<TS>({ secret: [NEW_SECRET, OLD_SECRET] })
    const req = createMockReq({ theo_session: legacyCookie })
    const res = createMockRes()

    // Simulate the SSR pipeline: createContext (which calls rotateIfNeeded)
    // runs BEFORE renderToPipeableStream's onShellReady flushes headers.
    const data = await rotateIfNeeded(rotated, req, res)
    expect(data).not.toBeNull()
    // The cookie was emitted while headers were still mutable
    expect(res.headersSent).toBe(false)
    expect(res.getHeader('set-cookie')).toBeDefined()

    // NOW the SSR pipeline calls writeHead. Set-Cookie is locked in.
    res.writeHead(200)
    expect(res.headersSent).toBe(true)
    // The browser receives the new cookie via the Set-Cookie header that was set
    // BEFORE writeHead. If we had deferred re-encrypt to post-handler, this test
    // would either fail at the setHeader call (headersSent) or silently drop
    // the new cookie.
  })

  it('REGRESSION: calling re-encrypt AFTER writeHead throws (mockRes simulates real Node behavior)', async () => {
    const legacy = createSessionManager<TS>({ secret: OLD_SECRET })
    const legacyRes = createMockRes()
    await legacy.createSession(legacyRes, { userId: 'u1', role: 'reader' })
    const legacyCookie = extractCookieValue(legacyRes, 'theo_session')!

    const rotated = createSessionManager<TS>({ secret: [NEW_SECRET, OLD_SECRET] })
    const res = createMockRes()
    res.writeHead(200) // headers already sent
    await expect(
      rotateIfNeeded(rotated, createMockReq({ theo_session: legacyCookie }), res),
    ).rejects.toThrow(/headers/i)
  })
})
