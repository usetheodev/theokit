import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson, executeRoute } from '../../packages/theo/src/server/execute.js'
import {
  jsonTransformer,
  superjsonTransformer,
} from '../../packages/theo/src/server/transformer.js'
import type { ServerRouteNode } from '../../packages/theo/src/server/match.js'

function createMockReq(method = 'GET', url = '/api/test'): IncomingMessage {
  return {
    method,
    url,
    headers: { host: 'localhost:3000' },
    on: vi.fn(),
  } as unknown as IncomingMessage
}

function createMockRes(): ServerResponse & {
  _getStatus: () => number
  _getBody: () => string
  _getHeader: (k: string) => string | undefined
} {
  let status = 0
  let body = ''
  const headers: Record<string, string> = {}
  const res = {
    writeHead: vi.fn((s: number, hdrs?: Record<string, string>) => {
      status = s
      if (hdrs) Object.assign(headers, hdrs)
    }),
    write: vi.fn(),
    end: vi.fn((b?: string) => {
      if (b) body = b
    }),
    setHeader: vi.fn((k: string, v: string) => {
      headers[k.toLowerCase()] = v
    }),
    getHeader: vi.fn((k: string) => headers[k.toLowerCase()]),
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    _getStatus: () => status,
    _getBody: () => body,
    _getHeader: (k: string) => headers[k.toLowerCase()],
  } as unknown as ServerResponse & {
    _getStatus: () => number
    _getBody: () => string
    _getHeader: (k: string) => string | undefined
  }
  return res
}

function createRoute(): ServerRouteNode {
  return {
    filePath: '/fake',
    routePath: '/api/test',
    pattern: /^\/api\/test$/,
    paramNames: [],
  }
}

describe('sendJson with transformer (T1.2)', () => {
  it('uses JSON.stringify by default (no transformer)', () => {
    const res = createMockRes()
    sendJson(res, { a: 1 }, 200)
    expect(JSON.parse(res._getBody())).toEqual({ a: 1 })
  })

  it('uses the provided transformer to serialize', () => {
    const res = createMockRes()
    sendJson(res, { a: 1 }, 200, jsonTransformer)
    expect(JSON.parse(res._getBody())).toEqual({ a: 1 })
  })

  it('preserves Date via superjson transformer', () => {
    const res = createMockRes()
    const d = new Date('2026-05-17T12:00:00.000Z')
    sendJson(res, { when: d }, 200, superjsonTransformer)
    const body = JSON.parse(res._getBody())
    // superjson serialize produces { json, meta } shape
    expect(body.meta).toBeDefined()
    expect(body.json.when).toBe(d.toISOString())
  })
})

describe('executeRoute with transformer (T1.2)', () => {
  it('emits x-theo-transformer header when non-default', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: { handler: () => ({ ok: true }) },
    })
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-1',
      undefined,
      superjsonTransformer,
    )
    expect(res._getHeader('x-theo-transformer')).toBe('superjson')
  })

  it('does NOT emit header for json transformer (default)', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: { handler: () => ({ ok: true }) },
    })
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-2',
      undefined,
      jsonTransformer,
    )
    expect(res._getHeader('x-theo-transformer')).toBeUndefined()
  })

  it('preserves Date via roundtrip when superjson transformer passed', async () => {
    const res = createMockRes()
    const d = new Date('2026-05-17T12:00:00.000Z')
    const loader = async () => ({
      GET: { handler: () => ({ when: d }) },
    })
    await executeRoute(
      createRoute(),
      'GET',
      {},
      createMockReq(),
      res,
      loader,
      undefined,
      'req-3',
      undefined,
      superjsonTransformer,
    )
    const body = JSON.parse(res._getBody())
    expect(body.json.when).toBe(d.toISOString())
    expect(body.meta).toBeDefined()
  })

  it('backward compat: no transformer passed → JSON.stringify default', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: { handler: () => ({ ok: true, n: 42 }) },
    })
    await executeRoute(createRoute(), 'GET', {}, createMockReq(), res, loader)
    expect(JSON.parse(res._getBody())).toEqual({ ok: true, n: 42 })
    expect(res._getHeader('x-theo-transformer')).toBeUndefined()
  })
})
