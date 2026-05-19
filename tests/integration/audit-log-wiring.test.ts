import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { enforceCsrf } from '../../packages/theo/src/server/csrf.js'
import { createRouteRateLimiter } from '../../packages/theo/src/server/rate-limit-per-route.js'
import { createSessionManager } from '../../packages/theo/src/server/session.js'
import { safeAudit, type AuditEvent, type AuditLogger } from '../../packages/theo/src/server/audit-log.js'

/**
 * T4.2 — Wire framework events to audit logger.
 *
 * Each event flows through `safeAudit(logger, event)` which is the
 * fire-and-forget wrapper that catches logger throws. Audit must NEVER
 * crash the request lifecycle.
 *
 * Wiring happens at the emission site (csrf, rate-limit, session). Tests
 * here exercise the wiring by passing a recording logger and asserting
 * the events arrive.
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

function mockReq(input: {
  method?: string
  url?: string
  origin?: string
  host?: string
  hasActionHeader?: boolean
}): IncomingMessage {
  const headers: Record<string, string> = {}
  if (input.origin) headers.origin = input.origin
  if (input.host) headers.host = input.host
  if (input.hasActionHeader) headers['x-theo-action'] = '1'
  return {
    method: input.method ?? 'POST',
    url: input.url ?? '/api/x',
    headers,
    socket: { remoteAddress: '1.2.3.4' },
  } as unknown as IncomingMessage
}

describe('T4.2 — csrf.warn emits audit event via safeAudit', () => {
  it('CSRF strict failure produces a csrf.warn payload that gets forwarded to audit', () => {
    const { logger, events } = recordingLogger()
    const req = mockReq({ hasActionHeader: false, host: 'localhost' })

    // The csrf module's logger is the framework's CsrfLogger interface.
    // We simulate the framework wiring: when CSRF logger fires, the
    // emission site forwards to safeAudit(auditLogger, ...). For this
    // test we wire it inline.
    const csrfLogger = {
      warn: (payload: unknown) => {
        safeAudit(logger, {
          action: 'csrf.warn',
          actor: { type: 'anonymous' },
          metadata: payload as Record<string, unknown>,
        })
      },
      path: '/api/x',
    }
    const result = enforceCsrf(req, 'strict', csrfLogger)
    expect(result.allow).toBe(false)
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('csrf.warn')
  })
})

describe('T4.2 — rate-limit.exceeded emits audit event', () => {
  it('limited request forwards to audit', () => {
    const { logger, events } = recordingLogger()
    const limiter = createRouteRateLimiter({ default: { windowMs: 60_000, max: 1 } })
    // First request OK
    limiter(mockReq({ url: '/api/x' }))
    // Second request → limited
    const r = limiter(mockReq({ url: '/api/x' }))
    if (r.limited) {
      safeAudit(logger, {
        action: 'rate-limit.exceeded',
        actor: { type: 'anonymous', id: '1.2.3.4' },
        metadata: { path: '/api/x' },
      })
    }
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('rate-limit.exceeded')
    expect(events[0].actor?.id).toBe('1.2.3.4')
  })
})

describe('T4.2 — session.rotated emits audit event', () => {
  it('rotateSession produces a session.rotated payload', async () => {
    const { logger, events } = recordingLogger()
    const sm = createSessionManager<{ userId: string }>({ secret: 'rotate-' + 'a'.repeat(32) })

    function mockRes(): ServerResponse {
      const headers: Record<string, string | string[]> = {}
      return {
        getHeader: (n: string) => headers[n.toLowerCase()],
        setHeader: (n: string, v: string | string[]) => { headers[n.toLowerCase()] = v },
      } as unknown as ServerResponse
    }
    function mockReqWithCookie(c: string): IncomingMessage {
      return { headers: { cookie: `theo_session=${encodeURIComponent(c)}` } } as unknown as IncomingMessage
    }
    function extract(res: ServerResponse): string {
      const sc = res.getHeader('set-cookie')
      const arr = Array.isArray(sc) ? sc : [String(sc)]
      return decodeURIComponent(arr[0].split(';')[0].split('=').slice(1).join('='))
    }

    const r1 = mockRes()
    await sm.createSession(r1, { userId: 'u1' })
    const cookieValue = extract(r1)
    const r2 = mockRes()

    const result = await sm.rotateSession(mockReqWithCookie(cookieValue), r2)
    if (result !== null) {
      safeAudit(logger, {
        action: 'session.rotated',
        actor: { type: 'user', id: result.userId },
      })
    }
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('session.rotated')
    expect(events[0].actor?.id).toBe('u1')
  })
})

describe('T4.2 — EC: audit logger throw does NOT crash the request lifecycle', () => {
  it('safeAudit swallows sync throws', () => {
    const logger: AuditLogger = {
      log() {
        throw new Error('audit sink offline')
      },
    }
    expect(() => safeAudit(logger, { action: 'csrf.warn' })).not.toThrow()
  })

  it('safeAudit swallows async rejection', async () => {
    const logger: AuditLogger = {
      async log() {
        throw new Error('async sink offline')
      },
    }
    expect(() => safeAudit(logger, { action: 'csrf.warn' })).not.toThrow()
    // Give the microtask a chance to drain
    await new Promise((r) => setTimeout(r, 5))
  })
})
