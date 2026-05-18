import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { executeRoute } from '../../packages/theo/src/server/execute.js'
import type { ServerRouteNode } from '../../packages/theo/src/server/match.js'

/**
 * Phase 5 — CSRF integration test.
 *
 * End-to-end coverage of CSRF enforcement through `executeRoute`:
 *
 *   - GET requests bypass CSRF entirely (safe method).
 *   - POST without `X-Theo-Action: 1` in `warn` mode → handler runs,
 *     stderr carries a structured `csrf.warn` line.
 *   - POST without the header in `strict` mode → 403 + `CSRF_INVALID`,
 *     handler does NOT run.
 *   - POST with valid header in any mode → handler runs.
 *   - Per-route `csrf: false` opt-out → handler runs in `strict` even
 *     without the header (webhook scenario).
 *   - Cross-origin POST in `strict` mode → 403.
 */

interface FakeReq extends Partial<IncomingMessage> {
  method?: string
  headers: Record<string, string | string[] | undefined>
  url?: string
}

function makeReq(opts: Partial<FakeReq> = {}): IncomingMessage {
  return {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
    url: opts.url ?? '/api/login',
    on() {},
    removeListener() {},
    emit() { return true },
  } as unknown as IncomingMessage
}

interface FakeRes {
  statusCode: number
  headers: Record<string, string>
  body?: string
  ended: boolean
  writeHead(s: number, h?: Record<string, string>): void
  setHeader(k: string, v: string): void
  end(body?: string): void
}

function makeRes(): FakeRes & ServerResponse {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    ended: false,
    writeHead(s, h) { this.statusCode = s; if (h) Object.assign(this.headers, h) },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(body) { this.body = body; this.ended = true },
  }
  return res as FakeRes & ServerResponse
}

const ROUTE: ServerRouteNode = {
  routePath: '/api/login',
  filePath: '/virtual/api/login.ts',
  params: [],
} as unknown as ServerRouteNode

function makeLoader(routeConfig: Record<string, unknown>) {
  return async () => ({ POST: routeConfig, GET: routeConfig })
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('CSRF integration — warn mode (default)', () => {
  it('Given POST without header, When warn mode, Then handler runs + structured warn line', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({ method: 'POST', headers: {} })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-1', undefined, undefined, 'warn',
    )

    expect(handler).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
    expect(warnSpy).toHaveBeenCalledOnce()
    const arg = warnSpy.mock.calls[0][0] as string
    expect(arg).toContain('csrf.warn')
    expect(arg).toContain('POST')
  })

  it('Given POST with valid X-Theo-Action header, When warn mode, Then no warn emitted', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({ method: 'POST', headers: { 'x-theo-action': '1' } })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-2', undefined, undefined, 'warn',
    )

    expect(handler).toHaveBeenCalledOnce()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('Given GET request, When warn mode, Then no CSRF check (safe method)', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({ method: 'GET', headers: {} })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'GET', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-3', undefined, undefined, 'warn',
    )

    expect(handler).toHaveBeenCalledOnce()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('CSRF integration — strict mode', () => {
  it('Given POST without header, When strict mode, Then 403 CSRF_INVALID + handler skipped', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({ method: 'POST', headers: {} })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-4', undefined, undefined, 'strict',
    )

    expect(handler).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toContain('CSRF_INVALID')
  })

  it('Given POST with valid header, When strict mode, Then handler runs (200)', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({ method: 'POST', headers: { 'x-theo-action': '1' } })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-5', undefined, undefined, 'strict',
    )

    expect(handler).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('Given cross-origin POST with header, When strict mode, Then 403 (origin mismatch)', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({
      method: 'POST',
      headers: {
        'x-theo-action': '1',
        origin: 'https://evil.com',
        host: 'app.example.com',
      },
    })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-6', undefined, undefined, 'strict',
    )

    expect(handler).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('Given route with csrf: false, When strict mode + no header, Then handler runs (webhook opt-out)', async () => {
    const handler = vi.fn().mockReturnValue({ received: true })
    const req = makeReq({ method: 'POST', headers: {} })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler, csrf: false }),
      undefined, 'rid-7', undefined, undefined, 'strict',
    )

    expect(handler).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })
})

describe('CSRF integration — off mode', () => {
  it('Given POST without header, When off mode, Then handler runs + no warn', async () => {
    const handler = vi.fn().mockReturnValue({ ok: true })
    const req = makeReq({ method: 'POST', headers: {} })
    const res = makeRes()

    await executeRoute(
      ROUTE, 'POST', {}, req, res, makeLoader({ handler }),
      undefined, 'rid-8', undefined, undefined, 'off',
    )

    expect(handler).toHaveBeenCalledOnce()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
