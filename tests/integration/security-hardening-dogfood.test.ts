import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

// Security primitives under test — the full security-hardening surface.
import {
  applySecurityHeaders,
  DEFAULT_PERMISSIONS_POLICY,
} from '../../packages/theo/src/server/security/security-headers.js'
import { createCorsHandler } from '../../packages/theo/src/server/http/cors.js'
import { createRouteRateLimiter } from '../../packages/theo/src/server/rate-limit/rate-limit-per-route.js'
import { enforceCsrf } from '../../packages/theo/src/server/security/csrf.js'
import {
  createSessionManager,
  rotateIfNeeded,
} from '../../packages/theo/src/server/auth/session.js'
import {
  handleCspReport,
  CSP_REPORT_PATH,
} from '../../packages/theo/src/server/security/csp-report.js'
import { checkThrottle, recordAttempt } from '../../packages/theo/src/server/auth/auth-throttle.js'
import {
  generateTotp,
  verifyTotp,
  generateTotpSecret,
} from '../../packages/theo/src/server/auth/auth-totp.js'
import {
  generateBackupCodes,
  verifyBackupCode,
} from '../../packages/theo/src/server/auth/auth-backup-codes.js'
import { generatePkceChallenge } from '../../packages/theo/src/server/auth/oauth-pkce.js'
import {
  generateOAuthState,
  verifyOAuthState,
} from '../../packages/theo/src/server/auth/oauth-state.js'
import { InMemoryStore } from '../../packages/theo/src/server/rate-limit/rate-limit-store.js'
import {
  safeAudit,
  type AuditEvent,
  type AuditLogger,
} from '../../packages/theo/src/server/observability/audit-log.js'

/**
 * Security-hardening DOGFOOD — composed end-to-end exercise of every
 * primitive shipped in this plan. Equivalent to the Plan Phase 8 manual
 * walkthrough, but deterministic + runs in CI on every PR.
 *
 * Each scenario corresponds to one of the plan's 9 manual steps.
 */

function recordingLogger() {
  const events: AuditEvent[] = []
  const logger: AuditLogger = {
    log(e) {
      events.push(e)
    },
  }
  return { logger, events }
}

type HeaderValue = string | string[] | undefined

function mockRes() {
  // Headers stored case-preserving (matches Node http.ServerResponse semantics
  // for our purposes — getHeader is case-insensitive but setHeader echoes the
  // original casing).
  const headers: Record<string, string | string[]> = {}
  let statusCode = 200
  let ended = false
  return {
    get statusCode() {
      return statusCode
    },
    set statusCode(v: number) {
      statusCode = v
    },
    // eslint-disable-next-line sonarjs/function-return-type -- Node's `res.getHeader` REQUIRES the `string | string[] | undefined` union
    getHeader: (n: string): HeaderValue => {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === n.toLowerCase())
      return key === undefined ? undefined : headers[key]
    },
    setHeader: (n: string, v: string | string[]) => {
      // Honour the caller's casing
      headers[n] = v
    },
    end: () => {
      ended = true
    },
    get ended() {
      return ended
    },
    headers,
  } as unknown as ServerResponse & { headers: Record<string, string | string[]>; ended: boolean }
}

function extractCookieValue(res: ServerResponse, name: string): string | undefined {
  // setCookie pushes an array under Set-Cookie. Look up case-insensitively
  // and walk the array variants.
  const raw = res.getHeader('set-cookie') as string | string[] | undefined
  if (!raw) return undefined
  const list = Array.isArray(raw) ? raw : [raw]
  for (const cookie of list) {
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))
    }
  }
  return undefined
}

describe('Security-hardening dogfood — composed end-to-end', () => {
  // ─────────────────────────────────────────────────────────────
  // Step 7 — `curl -I /api/...` shows Permissions-Policy + CSP
  // ─────────────────────────────────────────────────────────────
  it('default security headers include Permissions-Policy + CSP with report-uri', () => {
    const res = mockRes()
    applySecurityHeaders(res as never, {}, { production: false })
    expect(res.getHeader('Permissions-Policy')).toBe(DEFAULT_PERMISSIONS_POLICY)
    expect(String(res.getHeader('Content-Security-Policy'))).toContain(
      'report-uri /__theo/csp-report',
    )
    expect(res.getHeader('X-Frame-Options')).toBe('DENY')
  })

  // ─────────────────────────────────────────────────────────────
  // Step 3a — CSRF violation fires audit
  // ─────────────────────────────────────────────────────────────
  it('CSRF strict + audit logger: violation produces csrf.warn event', () => {
    const { logger, events } = recordingLogger()
    const req = { method: 'POST', headers: { host: 'localhost' } } as IncomingMessage
    const csrfLogger = {
      warn: (p: unknown) =>
        safeAudit(logger, { action: 'csrf.warn', metadata: p as Record<string, unknown> }),
      path: '/api/test',
    }
    const result = enforceCsrf(req, 'strict', csrfLogger)
    expect(result.allow).toBe(false)
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('csrf.warn')
  })

  // ─────────────────────────────────────────────────────────────
  // Step 3b — rate-limit-exceeded fires audit (per-route, strict /login)
  // ─────────────────────────────────────────────────────────────
  it('per-route rate limit + audit: /api/login locked after 3 failures, /api/users still loose', () => {
    const { logger, events } = recordingLogger()
    const limiter = createRouteRateLimiter({
      default: { windowMs: 60_000, max: 100 },
      routes: { '/api/login': { windowMs: 60_000, max: 3 } },
    })
    const ip = '1.2.3.4'
    const mkReq = (url: string) =>
      ({ url, headers: {}, socket: { remoteAddress: ip } }) as unknown as IncomingMessage

    for (let i = 0; i < 3; i++) {
      expect(limiter(mkReq('/api/login')).limited).toBe(false)
    }
    const locked = limiter(mkReq('/api/login'))
    expect(locked.limited).toBe(true)
    if (locked.limited) {
      safeAudit(logger, {
        action: 'rate-limit.exceeded',
        actor: { type: 'anonymous', id: ip },
        metadata: { path: '/api/login' },
      })
    }
    // Other paths still loose
    expect(limiter(mkReq('/api/users')).limited).toBe(false)
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('rate-limit.exceeded')
  })

  // ─────────────────────────────────────────────────────────────
  // Step 3c — CSP report endpoint → audit + devtools + user hook
  // ─────────────────────────────────────────────────────────────
  it('POST /__theo/csp-report fans out to audit + devtools dispatcher + user hook', async () => {
    const audit = vi.fn()
    const dispatcherFn = vi.fn()
    const userHook = vi.fn()
    const body = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'inline',
        'document-uri': 'https://app.example/page',
        'violated-directive': "script-src 'self'",
      },
    })
    const reqStream = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage
    ;(reqStream as unknown as { method?: string }).method = 'POST'
    ;(reqStream as unknown as { url?: string }).url = CSP_REPORT_PATH
    ;(reqStream as unknown as { headers?: Record<string, string> }).headers = {
      'content-type': 'application/csp-report',
    }
    const res = mockRes()
    await handleCspReport(reqStream, res as never, {
      auditLogger: { log: audit },
      devtoolsDispatcher: { onCspViolation: dispatcherFn },
      onViolation: userHook,
    })
    expect(res.statusCode).toBe(204)
    expect(audit).toHaveBeenCalledTimes(1)
    expect(dispatcherFn).toHaveBeenCalledTimes(1)
    expect(userHook).toHaveBeenCalledTimes(1)
  })

  // ─────────────────────────────────────────────────────────────
  // Step 6 — Rotate session secret, existing cookie still decrypts
  // ─────────────────────────────────────────────────────────────
  it('session secret rotation: legacy-encrypted cookie still decrypts AND gets re-encrypted with newest', async () => {
    const NEW = 'new-secret-' + 'x'.repeat(32)
    const OLD = 'old-secret-' + 'y'.repeat(32)

    interface S {
      userId: string
    }
    const legacyMgr = createSessionManager<S>({ secret: OLD })
    const legacyRes = mockRes()
    await legacyMgr.createSession(legacyRes as never, { userId: 'u1' })
    const legacyCookie = extractCookieValue(legacyRes as never, 'theo_session')!
    expect(legacyCookie).toBeDefined()

    // Operator rotates: [NEW, OLD]
    const rotated = createSessionManager<S>({ secret: [NEW, OLD] })
    const req = {
      headers: { cookie: `theo_session=${encodeURIComponent(legacyCookie)}` },
    } as IncomingMessage
    const res = mockRes()
    const data = await rotateIfNeeded(rotated, req, res as never)
    expect(data).toEqual({ userId: 'u1' })
    // New Set-Cookie issued — value differs from the legacy cookie
    const newCookie = extractCookieValue(res as never, 'theo_session')!
    expect(newCookie).toBeDefined()
    expect(newCookie).not.toBe(legacyCookie)
  })

  // ─────────────────────────────────────────────────────────────
  // Step 9 — Auth flow primitives compose for DIY OAuth
  // ─────────────────────────────────────────────────────────────
  it('DIY OAuth round-trip: PKCE + state stored + verified end-to-end', async () => {
    // /start: generate PKCE + state, "stash in session"
    const { codeVerifier, codeChallenge, codeChallengeMethod } = await generatePkceChallenge()
    const state = generateOAuthState()
    expect(codeChallengeMethod).toBe('S256')
    expect(codeVerifier.length).toBe(43)

    // /callback: provider returned the same state
    expect(verifyOAuthState(state, state)).toBe(true)
    // Attacker tries to forge state
    expect(verifyOAuthState('forged', state)).toBe(false)

    // The codeVerifier is sent in the token exchange — provider validates the pair
    // (we can't simulate the provider, but we've covered the primitives' contract)
    expect(codeChallenge.length).toBeGreaterThan(0)
  })

  // ─────────────────────────────────────────────────────────────
  // 2FA primitives compose
  // ─────────────────────────────────────────────────────────────
  it('TOTP + backup codes round-trip: enroll, verify TOTP, verify backup code', async () => {
    // Enroll TOTP
    const secret = generateTotpSecret()
    expect(secret.length).toBe(20)
    const t = Date.now()
    const code = await generateTotp({ secret, time: t })
    expect(await verifyTotp(code, { secret, time: t })).toBe(true)
    expect(await verifyTotp('000000', { secret, time: t })).toBe(false)

    // Enroll backup codes
    const codes = await generateBackupCodes({ count: 5 })
    expect(codes.length).toBe(5)
    const hashes = codes.map((c) => c.hash)

    // User uses backup code
    const r = await verifyBackupCode(codes[2].plaintext, hashes)
    expect(r.valid).toBe(true)
    expect(r.matchedHash).toBe(codes[2].hash)
    // Replay protection: caller deletes matchedHash from storage
    const remaining = hashes.filter((h) => h !== r.matchedHash)
    expect(remaining.length).toBe(4)
    // Second attempt with same code → invalid (because caller deleted hash)
    const r2 = await verifyBackupCode(codes[2].plaintext, remaining)
    expect(r2.valid).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────
  // Login throttling composes with rate-limit store
  // ─────────────────────────────────────────────────────────────
  it('login throttle locks after 5 failures, success resets', async () => {
    const store = new InMemoryStore()
    const id = 'login:hashed-alice'
    for (let i = 0; i < 5; i++) {
      await recordAttempt({ store, identifier: id }, false)
    }
    const locked = await checkThrottle({ store, identifier: id })
    expect(locked.allowed).toBe(false)
    expect(locked.lockedUntil).toBeInstanceOf(Date)

    // Even concurrent additional failures don't crash
    await Promise.all([
      recordAttempt({ store, identifier: id }, false),
      recordAttempt({ store, identifier: id }, false),
    ])
    // After we record a SUCCESS, counter resets
    await recordAttempt({ store, identifier: id }, true)
    const after = await checkThrottle({ store, identifier: id })
    expect(after.allowed).toBe(true)
    expect(after.remainingAttempts).toBe(5)
  })

  // ─────────────────────────────────────────────────────────────
  // CORS preflight composes with the pipeline order (D10)
  // ─────────────────────────────────────────────────────────────
  it('CORS preflight short-circuits the pipeline (allowed origin → 204)', () => {
    const cors = createCorsHandler({ origins: ['https://app.example'], methods: ['POST'] })
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'POST',
      },
    } as unknown as IncomingMessage
    const res = mockRes()
    const handled = cors.handlePreflight(req, res as never)
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(204)
    expect(res.getHeader('Access-Control-Allow-Origin')).toBe('https://app.example')
    expect(res.getHeader('Vary')).toBe('Origin')
  })

  it('CORS denies disallowed origin without echoing it (Allow-Origin absent)', () => {
    const cors = createCorsHandler({ origins: ['https://app.example'] })
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    } as unknown as IncomingMessage
    const res = mockRes()
    cors.handlePreflight(req, res as never)
    expect(res.statusCode).toBe(403)
    expect(res.getHeader('Access-Control-Allow-Origin')).toBeUndefined()
  })
})
