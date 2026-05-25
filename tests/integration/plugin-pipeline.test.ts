import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { executeRoute } from '../../packages/theo/src/server/http/execute.js'
import type { ServerRouteNode } from '../../packages/theo/src/server/scan/match.js'
import { PluginRunner } from '../../packages/theo/src/server/plugins/plugin-runner.js'
import { defineTheoPlugin } from '../../packages/theo/src/server/define/define-plugin.js'

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
  let writableEnded = false
  const res = {
    writeHead: vi.fn((s: number) => {
      status = s
      // mimic node behavior: writeHead sets statusCode
      ;(res as { statusCode: number }).statusCode = s
    }),
    write: vi.fn(),
    end: vi.fn((b?: string) => {
      if (b) body = b
      writableEnded = true
      ;(res as { writableEnded: boolean }).writableEnded = true
    }),
    headersSent: false,
    writableEnded,
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

describe('executeRoute — plugin pipeline (T4.2 + T4.3 + T4.4)', () => {
  it('invokes onRequest before preHandler before handler before onResponse on the happy path', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'tracer',
        register(app) {
          app.addHook('onRequest', () => {
            calls.push('onRequest')
          })
          app.addHook('preHandler', () => {
            calls.push('preHandler')
          })
          app.addHook('onResponse', () => {
            calls.push('onResponse')
          })
        },
      }),
    )

    const loader = async () => ({
      GET: {
        handler: () => {
          calls.push('handler')
          return { ok: true }
        },
      },
    })

    const res = createMockRes()
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-1',
      runner,
    )

    expect(calls).toEqual(['onRequest', 'preHandler', 'handler', 'onResponse'])
    expect(res._getStatus()).toBe(200)
    const body = JSON.parse(res._getBody())
    expect(body.ok).toBe(true)
  })

  it('short-circuits when onRequest writes the response', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'auth-guard',
        register(app) {
          app.addHook('onRequest', (ctx) => {
            calls.push('onRequest')
            ctx.response.writeHead(401, { 'Content-Type': 'application/json' })
            ctx.response.end(JSON.stringify({ error: 'unauthorized' }))
          })
          app.addHook('preHandler', () => {
            calls.push('preHandler')
          })
        },
      }),
    )

    const handler = vi.fn(() => ({ ok: true }))
    const loader = async () => ({ GET: { handler } })

    const res = createMockRes()
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-2',
      runner,
    )

    expect(calls).toEqual(['onRequest'])
    expect(handler).not.toHaveBeenCalled()
    expect(res._getStatus()).toBe(401)
  })

  it('runs onError when handler throws (T4.4)', async () => {
    const capturedErrors: unknown[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'sentry-fake',
        register(app) {
          app.addHook('onError', (ctx) => {
            capturedErrors.push(ctx.error)
          })
        },
      }),
    )

    const err = new Error('handler boom')
    const loader = async () => ({
      GET: {
        handler: () => {
          throw err
        },
      },
    })

    const res = createMockRes()
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-3',
      runner,
    )

    expect(capturedErrors).toEqual([err])
    expect(res._getStatus()).toBe(500)
  })

  it('decorations from plugins appear on ctx visible to handler', async () => {
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'db',
        register(app) {
          app.decorateRequest('db', { query: () => 'rows' })
        },
      }),
    )

    let observedDb: unknown = null
    const loader = async () => ({
      GET: {
        handler: ({ ctx }: { ctx: { db?: { query: () => string } } }) => {
          observedDb = ctx.db
          return { result: ctx.db?.query() }
        },
      },
    })

    const res = createMockRes()
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-4',
      runner,
    )

    expect(observedDb).toBeTruthy()
    const body = JSON.parse(res._getBody())
    expect(body.result).toBe('rows')
  })

  it('preserves existing behavior when no pluginRunner is passed (regression check)', async () => {
    const loader = async () => ({
      GET: { handler: () => ({ ok: true }) },
    })

    const res = createMockRes()
    await executeRoute(createRoute(), 'GET', {}, createMockReq(), res, loader, undefined, 'req-5')

    expect(res._getStatus()).toBe(200)
    const body = JSON.parse(res._getBody())
    expect(body.ok).toBe(true)
  })
})
