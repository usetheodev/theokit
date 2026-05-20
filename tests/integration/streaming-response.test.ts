import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { executeRoute } from '../../packages/theo/src/server/execute.js'
import type { ServerRouteNode } from '../../packages/theo/src/server/match.js'

function createMockReq(method = 'GET', url = '/api/test'): IncomingMessage {
  return {
    method,
    url,
    headers: { host: 'localhost:3000' },
    on: vi.fn(),
  } as unknown as IncomingMessage
}

function createMockRes() {
  const writes: unknown[] = []
  const headers: Record<string, unknown> = {}
  let ended = false

  return {
    writeHead: vi.fn((status: number, hdrs: Record<string, string>) => {
      Object.assign(headers, hdrs)
    }),
    write: vi.fn((chunk: unknown) => {
      writes.push(chunk)
      return true
    }),
    end: vi.fn(() => {
      ended = true
    }),
    headersSent: false,
    writableEnded: false,
    _writes: writes,
    _headers: headers,
    _ended: () => ended,
  } as unknown as ServerResponse & {
    _writes: unknown[]
    _headers: Record<string, unknown>
    _ended: () => boolean
  }
}

function createRoute(filePath: string): ServerRouteNode {
  return {
    filePath,
    routePath: '/api/test',
    pattern: /^\/api\/test$/,
    paramNames: [],
  }
}

function createStreamingLoader(chunks: string[], headers?: Record<string, string>) {
  return async () => ({
    GET: {
      handler: () => {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          },
        })
        return new Response(stream, {
          status: 200,
          headers: headers ?? { 'content-type': 'text/plain' },
        })
      },
    },
  })
}

describe('Streaming Response via ReadableStream', () => {
  it('should pipe ReadableStream chunks individually (not buffer)', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = createStreamingLoader(['chunk1', 'chunk2', 'chunk3'])

    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.write).toHaveBeenCalledTimes(3)
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('should call res.end exactly once after all chunks', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = createStreamingLoader(['a', 'b'])

    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('should preserve Content-Type: text/event-stream for SSE', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = createStreamingLoader(['data: hello\n\n', 'data: world\n\n'], {
      'content-type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    })

    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'content-type': 'text/event-stream',
      }),
    )
    expect(res.write).toHaveBeenCalledTimes(2)
  })

  it('should handle empty ReadableStream (end without writes)', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = async () => ({
      GET: {
        handler: () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.close()
            },
          })
          return new Response(stream, { status: 200 })
        },
      },
    })

    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.write).not.toHaveBeenCalled()
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('should handle Response without body (null)', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = async () => ({
      GET: {
        handler: () => new Response(null, { status: 204 }),
      },
    })

    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.writeHead).toHaveBeenCalledWith(204, expect.anything())
    expect(res.write).not.toHaveBeenCalled()
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('should handle Response with string body', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = async () => ({
      GET: {
        handler: () =>
          new Response('hello world', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          }),
      },
    })

    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'content-type': 'text/plain',
      }),
    )
    // String body creates a single-chunk ReadableStream
    expect(res.write).toHaveBeenCalled()
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('should gracefully handle stream error mid-way (EC-1)', async () => {
    const res = createMockRes()
    const route = createRoute('/test')
    const loader = async () => ({
      GET: {
        handler: () => {
          const encoder = new TextEncoder()
          let count = 0
          const stream = new ReadableStream({
            pull(controller) {
              count++
              if (count <= 1) {
                controller.enqueue(encoder.encode('chunk1'))
              } else {
                controller.error(new Error('upstream failed'))
              }
            },
          })
          return new Response(stream, { status: 200 })
        },
      },
    })

    // Should NOT throw — error is caught internally
    await executeRoute(route, 'GET', {}, createMockReq(), res, loader)

    expect(res.write).toHaveBeenCalledTimes(1) // first chunk written
    expect(res.end).toHaveBeenCalledTimes(1) // response closed gracefully
  })
})
