import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { executeRoute } from '../../packages/theo/src/server/execute.js'
import type { ServerRouteNode } from '../../packages/theo/src/server/match.js'
import { requireAuth } from '../../packages/theo/src/server/auth.js'

function createMockReq(method = 'GET', url = '/api/test'): IncomingMessage {
  return {
    method,
    url,
    headers: { host: 'localhost:3000' },
    on: vi.fn(),
  } as unknown as IncomingMessage
}

function createMockRes() {
  let status = 0
  let body = ''
  return {
    writeHead: vi.fn((s: number) => {
      status = s
    }),
    write: vi.fn(),
    end: vi.fn((b?: string) => {
      if (b) body = b
    }),
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    _getStatus: () => status,
    _getBody: () => body,
  } as unknown as ServerResponse & { _getStatus: () => number; _getBody: () => string }
}

function createRoute(): ServerRouteNode {
  return { filePath: '/test', routePath: '/api/test', pattern: /^\/api\/test$/, paramNames: [] }
}

describe('Auth Error Handling in executeRoute', () => {
  it('should return 401 with AUTH_REQUIRED when handler throws requireAuth(null)', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => {
          requireAuth(null)
        },
      },
    })

    await executeRoute(createRoute(), 'GET', {}, createMockReq(), res, loader, undefined, 'req-123')

    expect(res.writeHead).toHaveBeenCalledWith(401, expect.anything())
    const body = JSON.parse((res.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(body.error.code).toBe('AUTH_REQUIRED')
    expect(body.error.message).toBe('Authentication required')
  })

  it('should include requestId in 401 response', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => {
          requireAuth(null)
        },
      },
    })

    await executeRoute(createRoute(), 'GET', {}, createMockReq(), res, loader, undefined, 'req-456')

    const body = JSON.parse((res.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(body.error.requestId).toBe('req-456')
  })

  it('should still return 500 for non-auth errors (backward compat)', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => {
          throw new Error('Something broke')
        },
      },
    })

    await executeRoute(createRoute(), 'GET', {}, createMockReq(), res, loader, undefined, 'req-789')

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.anything())
    const body = JSON.parse((res.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('should allow handler to pass requireAuth with valid session', async () => {
    const res = createMockRes()
    const loader = async () => ({
      GET: {
        handler: () => {
          const session: { userId: string } | null = { userId: '123' }
          requireAuth(session)
          return { userId: session.userId }
        },
      },
    })

    await executeRoute(createRoute(), 'GET', {}, createMockReq(), res, loader)

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
    const body = JSON.parse((res.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(body.userId).toBe('123')
  })
})
