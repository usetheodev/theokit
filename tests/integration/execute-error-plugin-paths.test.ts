import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { executeRoute } from '../../packages/theo/src/server/http/execute.js'
import type { ServerRouteNode } from '../../packages/theo/src/server/scan/match.js'
import { requireAuth } from '../../packages/theo/src/server/auth/auth.js'
import { PluginRunner } from '../../packages/theo/src/server/plugins/plugin-runner.js'
import { defineTheoPlugin } from '../../packages/theo/src/server/define/define-plugin.js'

/**
 * Coverage for the plugin-pipeline branches of `executeRoute` reachable only
 * when a runner is attached AND the handler errors:
 *   - lines 396-400 — onError hook ends the response itself (EC-9), forcing
 *     the inErrorPath onResponse path WITHOUT the auth/internal write below
 *   - lines 417-420 — AuthRequiredError with pluginRunner runs onResponse
 *     with `{ inErrorPath: true }` after sending the 401
 */

function createMockReq(method = 'GET', url = '/api/test'): IncomingMessage {
  return {
    method,
    url,
    headers: { host: 'localhost:3000' },
    on: vi.fn(),
  } as unknown as IncomingMessage
}

interface CapturingResponse extends ServerResponse {
  _getStatus(): number
  _getBody(): string
}

function createMockRes(): CapturingResponse {
  let status = 0
  let body = ''
  const res = {
    writeHead: vi.fn((s: number) => {
      status = s
      ;(res as { statusCode: number }).statusCode = s
    }),
    write: vi.fn(),
    end: vi.fn((b?: string) => {
      if (b) {
        body = b
      }
      ;(res as { writableEnded: boolean }).writableEnded = true
    }),
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    _getStatus: () => status,
    _getBody: () => body,
  } as unknown as CapturingResponse
  return res
}

function createRoute(): ServerRouteNode {
  return {
    filePath: '/test',
    routePath: '/api/test',
    pattern: /^\/api\/test$/,
    paramNames: [],
  }
}

describe('executeRoute — error-path plugin hooks', () => {
  it('runs onResponse(inErrorPath) after AuthRequiredError is mapped to 401', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'auth-tracer',
        register(app) {
          app.addHook('onResponse', () => {
            calls.push('onResponse')
          })
          app.addHook('onError', () => {
            calls.push('onError')
          })
        },
      }),
    )

    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => {
          requireAuth(null)
        },
      },
    })

    await executeRoute({
      route: createRoute(),
      method: 'GET',
      params: {},
      req: createMockReq(),
      res,
      loadModule: loader,
      requestId: 'req-auth-plugin',
      pluginRunner: runner,
    })

    expect(res._getStatus()).toBe(401)
    // onError fires first (from the catch); then onResponse(inErrorPath).
    expect(calls).toEqual(['onError', 'onResponse'])
  })

  it('returns 415 when the request body Content-Type is unsupported', async () => {
    const res = createMockRes()
    const loader = async () => ({
      POST: { handler: () => ({ ok: true }) },
    })

    // Build a POST request with an unsupported content type — the body parser
    // throws "Unsupported Content-Type: …" which executeRoute maps to 415.
    const stream = Readable.from([Buffer.from('hello world')]) as unknown as IncomingMessage
    stream.method = 'POST'
    stream.url = '/api/test'
    stream.headers = {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'content-type': 'application/x-unsupported',
      // Required to satisfy strict CSRF — the test is about content-type, not CSRF.
      'x-theo-action': '1',
    }

    await executeRoute({
      route: createRoute(),
      method: 'POST',
      params: {},
      req: stream,
      res,
      loadModule: loader,
      requestId: 'req-bad-ct',
      csrfMode: 'off', // skip CSRF entirely for this test
    })

    expect(res._getStatus()).toBe(415)
    expect(JSON.parse(res._getBody()).error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 VALIDATION_ERROR when query fails Zod validation', async () => {
    const { z } = await import('zod')
    const res = createMockRes()
    const loader = async () => ({
      GET: {
        // Schema requires `page` numeric — the runtime receives a string.
        query: z.object({ page: z.number() }),
        handler: () => ({ ok: true }),
      },
    })

    const req = createMockReq('GET', '/api/test?page=not-a-number')
    // The router-side query parsing happens before executeRoute; pass the
    // already-parsed query map directly. Empty query is enough — Zod will
    // still reject because `page: number` is missing.
    await executeRoute({
      route: createRoute(),
      method: 'GET',
      params: {},
      req,
      res,
      loadModule: loader,
      requestId: 'req-bad-query',
    })

    expect(res._getStatus()).toBe(400)
    expect(JSON.parse(res._getBody()).error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 VALIDATION_ERROR when params fail Zod validation', async () => {
    const { z } = await import('zod')
    const res = createMockRes()
    const loader = async () => ({
      GET: {
        // The `params` Zod schema rejects non-numeric ids.
        params: z.object({ id: z.string().regex(/^\d+$/) }),
        handler: () => ({ ok: true }),
      },
    })

    await executeRoute({
      route: createRoute(),
      method: 'GET',
      params: { id: 'not-a-number' },
      req: createMockReq(),
      res,
      loadModule: loader,
      requestId: 'req-bad-params',
    })

    expect(res._getStatus()).toBe(400)
    const body = JSON.parse(res._getBody())
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.issues.length).toBeGreaterThan(0)
  })

  it('returns 204 (or rc.status) when the handler returns null and runs onResponse', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'null-tracer',
        register(app) {
          app.addHook('onResponse', () => {
            calls.push('onResponse')
          })
        },
      }),
    )

    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => null,
      },
    })

    await executeRoute({
      route: createRoute(),
      method: 'GET',
      params: {},
      req: createMockReq(),
      res,
      loadModule: loader,
      requestId: 'req-null',
      pluginRunner: runner,
    })

    expect(res._getStatus()).toBe(204)
    expect(calls).toEqual(['onResponse'])
  })

  it('honors EC-9 when an onError hook ends the response itself', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'onerror-writes',
        register(app) {
          app.addHook('onError', (ctx) => {
            calls.push('onError')
            // Simulate a hook that writes its own error response.
            const response = ctx.response
            ;(response as ServerResponse).writeHead(503, { 'content-type': 'text/plain' })
            ;(response as ServerResponse).end('custom error')
          })
          app.addHook('onResponse', () => {
            calls.push('onResponse')
          })
        },
      }),
    )

    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => {
          throw new Error('handler boom')
        },
      },
    })

    await executeRoute({
      route: createRoute(),
      method: 'GET',
      params: {},
      req: createMockReq(),
      res,
      loadModule: loader,
      requestId: 'req-ec9',
      pluginRunner: runner,
    })

    // The hook took over the response (503), the inErrorPath onResponse still ran.
    expect(res._getStatus()).toBe(503)
    expect(res._getBody()).toBe('custom error')
    expect(calls).toEqual(['onError', 'onResponse'])
  })
})
