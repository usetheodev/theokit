import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  CSRF_READINESS_PATH,
  CSRF_READINESS_RESET_PATH,
  handleCsrfReadiness,
} from '../../packages/theo/src/server/security/csrf-readiness-endpoint.js'
import { CsrfReadinessStore } from '../../packages/theo/src/server/security/csrf-readiness-store.js'

/**
 * T2.2 — `/__theo/csrf-readiness` endpoint contract tests.
 *
 * GET  /__theo/csrf-readiness        → 200 + JSON summary of store
 * POST /__theo/csrf-readiness/reset  → 204 (with CSRF check via Origin)
 * Anything else                      → 405 / 403 / pass-through
 */

function makeReq(opts: {
  method: string
  url: string
  origin?: string
  xTheoAction?: string
  host?: string
}): IncomingMessage {
  const stream = Readable.from([]) as unknown as IncomingMessage
  stream.method = opts.method
  stream.url = opts.url
  stream.headers = {
    host: opts.host ?? 'localhost:3000',
  }
  if (opts.origin !== undefined) stream.headers.origin = opts.origin
  if (opts.xTheoAction !== undefined) stream.headers['x-theo-action'] = opts.xTheoAction
  return stream
}

function makeRes(): ServerResponse & { _status: () => number; _body: () => string } {
  let status = 200
  let body = ''
  let ended = false
  const headers: Record<string, string | number | string[]> = {}
  const out = {
    statusCode: 200,
    headersSent: false,
    get writableEnded(): boolean {
      return ended
    },
    writeHead(s: number, h?: Record<string, string | number>): ServerResponse {
      status = s
      this.statusCode = s
      if (h) Object.assign(headers, h)
      return out as unknown as ServerResponse
    },
    setHeader(name: string, value: string | number | string[]): ServerResponse {
      headers[name] = value
      return out as unknown as ServerResponse
    },
    // eslint-disable-next-line sonarjs/function-return-type -- mirrors Node ServerResponse.getHeader exactly
    getHeader(name: string): string | number | string[] | undefined {
      return headers[name]
    },
    end(b?: string): void {
      if (b) body += b
      ended = true
    },
    _status: (): number => status,
    _body: (): string => body,
  }
  return out as unknown as ServerResponse & { _status: () => number; _body: () => string }
}

describe('handleCsrfReadiness — GET summary', () => {
  it('Given an empty store, When GET, Then 200 with totalEvents===0', async () => {
    const store = new CsrfReadinessStore()
    const req = makeReq({ method: 'GET', url: CSRF_READINESS_PATH })
    const res = makeRes()
    const handled = await handleCsrfReadiness(req, res, store)
    expect(handled).toBe(true)
    expect(res._status()).toBe(200)
    const payload = JSON.parse(res._body()) as { totalEvents: number }
    expect(payload.totalEvents).toBe(0)
  })

  it('Given store has records, When GET, Then 200 with routes array', async () => {
    const store = new CsrfReadinessStore()
    store.record({ method: 'POST', path: '/api/x', reason: 'r' })
    const req = makeReq({ method: 'GET', url: CSRF_READINESS_PATH })
    const res = makeRes()
    await handleCsrfReadiness(req, res, store)
    const payload = JSON.parse(res._body()) as { routes: unknown[] }
    expect(payload.routes).toHaveLength(1)
  })
})

describe('handleCsrfReadiness — POST /reset', () => {
  it('Given valid CSRF (X-Theo-Action + Origin match), When POST /reset, Then 204 + store empty', async () => {
    const store = new CsrfReadinessStore()
    store.record({ method: 'POST', path: '/api/x', reason: 'r' })
    const req = makeReq({
      method: 'POST',
      url: CSRF_READINESS_RESET_PATH,
      origin: 'http://localhost:3000',
      xTheoAction: '1',
    })
    const res = makeRes()
    const handled = await handleCsrfReadiness(req, res, store)
    expect(handled).toBe(true)
    expect(res._status()).toBe(204)
    expect(store.summary().totalEvents).toBe(0)
  })

  it('Given missing X-Theo-Action, When POST /reset, Then 403 + store unchanged', async () => {
    const store = new CsrfReadinessStore()
    store.record({ method: 'POST', path: '/api/x', reason: 'r' })
    const req = makeReq({
      method: 'POST',
      url: CSRF_READINESS_RESET_PATH,
      origin: 'http://localhost:3000',
    })
    const res = makeRes()
    await handleCsrfReadiness(req, res, store)
    expect(res._status()).toBe(403)
    expect(store.summary().totalEvents).toBe(1)
  })

  it('Given cross-origin (EC-15), When POST /reset, Then 403 + store unchanged', async () => {
    const store = new CsrfReadinessStore()
    store.record({ method: 'POST', path: '/api/x', reason: 'r' })
    const req = makeReq({
      method: 'POST',
      url: CSRF_READINESS_RESET_PATH,
      origin: 'http://evil.example',
      xTheoAction: '1',
    })
    const res = makeRes()
    await handleCsrfReadiness(req, res, store)
    expect(res._status()).toBe(403)
    expect(store.summary().totalEvents).toBe(1)
  })
})

describe('handleCsrfReadiness — non-matching URLs', () => {
  it('Given a non-readiness URL, When called, Then returns false (pass-through)', async () => {
    const store = new CsrfReadinessStore()
    const req = makeReq({ method: 'GET', url: '/api/whatever' })
    const res = makeRes()
    const handled = await handleCsrfReadiness(req, res, store)
    expect(handled).toBe(false)
  })

  it('Given GET on /reset, When called, Then 405 method not allowed', async () => {
    const store = new CsrfReadinessStore()
    const req = makeReq({ method: 'GET', url: CSRF_READINESS_RESET_PATH })
    const res = makeRes()
    const handled = await handleCsrfReadiness(req, res, store)
    expect(handled).toBe(true)
    expect(res._status()).toBe(405)
  })
})
