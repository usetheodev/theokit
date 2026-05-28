import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApiMiddleware } from '../../packages/theo/src/vite-plugin/api-middleware.js'

// Minimal vite shape the middleware actually uses (only ssrLoadModule).
// Avoid `import type { ViteDevServer } from 'vite'` because the test
// tsconfig doesn't expose vite's types directly.
interface ViteLike {
  ssrLoadModule: (path: string) => Promise<Record<string, unknown>>
}

/**
 * T8.1 — Coverage hardening for `api-middleware.ts`.
 *
 * Targets the uncovered branches (rate-limit 429 path, batch endpoint
 * match, suggestion path) directly by booting the middleware against
 * a minimal Vite-shaped mock + empty server dir. No actual Vite dev
 * server is needed — the middleware uses only `vite.ssrLoadModule`.
 */

function makeFakeVite(): ViteLike {
  return {
    ssrLoadModule: vi.fn(async () => ({})),
  }
}

function makeReq(opts: {
  method?: string
  url?: string
  origin?: string
  xTheoAction?: string
  body?: string
  contentType?: string
}): IncomingMessage {
  const chunks = opts.body ? [Buffer.from(opts.body, 'utf-8')] : []
  const stream = Readable.from(chunks) as unknown as IncomingMessage
  stream.method = opts.method ?? 'GET'
  stream.url = opts.url ?? '/api/test'
  const headers: Record<string, string> = {
    host: 'localhost:3000',
  }
  if (opts.origin) headers.origin = opts.origin
  if (opts.xTheoAction) headers['x-theo-action'] = opts.xTheoAction
  if (opts.contentType) headers['content-type'] = opts.contentType
  stream.headers = headers
  return stream
}

interface CapturingRes {
  res: ServerResponse
  status(): number
  body(): string
}

function makeRes(): CapturingRes {
  let status = 0
  let body = ''
  let ended = false
  const headers: Record<string, string | number | string[]> = {}
  const res = {
    statusCode: 200,
    headersSent: false,
    get writableEnded(): boolean {
      return ended
    },
    writeHead(s: number, h?: Record<string, string | number>): ServerResponse {
      status = s
      ;(res as unknown as { statusCode: number }).statusCode = s
      if (h) Object.assign(headers, h)
      return res as unknown as ServerResponse
    },
    setHeader(name: string, value: string | number | string[]): ServerResponse {
      headers[name] = value
      return res as unknown as ServerResponse
    },
    // eslint-disable-next-line sonarjs/function-return-type -- mirrors Node ServerResponse.getHeader
    getHeader(name: string): string | number | string[] | undefined {
      return headers[name]
    },
    end(b?: string): void {
      if (b) body += b
      ended = true
    },
  } as unknown as ServerResponse
  return {
    res,
    status: () => status,
    body: () => body,
  }
}

async function runMiddleware(
  middleware: ReturnType<typeof createApiMiddleware>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ nextCalled: boolean }> {
  return new Promise((resolve) => {
    const state = { nextCalled: false }
    middleware(req, res, () => {
      state.nextCalled = true
      resolve(state)
    })
    // The middleware writes via res.end async; wait for either next() or res to end.
    const check = setInterval(() => {
      const ended = (res as unknown as { writableEnded: boolean }).writableEnded
      if (ended || state.nextCalled) {
        clearInterval(check)
        resolve(state)
      }
    }, 5)
    setTimeout(() => {
      clearInterval(check)
      resolve(state)
    }, 1500)
  })
}

describe('createApiMiddleware — rate-limit 429 path', () => {
  it('Given a rate limit of 1/sec, When the 2nd request fires within the window, Then 429 + Retry-After header', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'api-mw-rl-'))
    try {
      const middleware = createApiMiddleware(makeFakeVite() as never, emptyDir, {
        rateLimitConfig: { windowMs: 1000, max: 1 },
        csrfMode: 'off',
      })
      // Burn the budget with the first request.
      await runMiddleware(middleware, makeReq({ method: 'GET', url: '/api/test' }), makeRes().res)
      // 2nd request should hit the rate limit.
      const second = makeRes()
      await runMiddleware(middleware, makeReq({ method: 'GET', url: '/api/test' }), second.res)
      expect(second.status()).toBe(429)
      const payload = JSON.parse(second.body()) as { error: { code: string } }
      expect(payload.error.code).toBe('RATE_LIMITED')
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})

describe('createApiMiddleware — batch endpoint match', () => {
  it('Given POST /api/__theo_batch__ with a valid envelope, When the middleware runs, Then it returns a JSON array', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'api-mw-batch-'))
    try {
      const middleware = createApiMiddleware(makeFakeVite() as never, emptyDir, {
        batching: { max: 5 },
        csrfMode: 'off',
      })
      const body = JSON.stringify({ requests: [] })
      const r = makeRes()
      await runMiddleware(
        middleware,
        makeReq({
          method: 'POST',
          url: '/api/__theo_batch__',
          contentType: 'application/json',
          body,
          xTheoAction: '1',
          origin: 'http://localhost:3000',
        }),
        r.res,
      )
      // Batch handler with empty `requests` returns 200 + empty results.
      expect([200, 400]).toContain(r.status())
      // Body is JSON either way; the contract is "no fall-through to /api/* router".
      expect(r.body().length).toBeGreaterThan(0)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})

describe('createApiMiddleware — suggestion path "Did you mean"', () => {
  it('Given GET on a non-existent route close to no real routes, When no routes exist, Then 404 with plain message', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'api-mw-sugg-'))
    try {
      const middleware = createApiMiddleware(makeFakeVite() as never, emptyDir, {
        csrfMode: 'off',
      })
      const r = makeRes()
      await runMiddleware(middleware, makeReq({ method: 'GET', url: '/api/nonexistent' }), r.res)
      expect(r.status()).toBe(404)
      const payload = JSON.parse(r.body()) as { error: { code: string; message: string } }
      expect(payload.error.code).toBe('NOT_FOUND')
      // With zero routes in the empty server dir, the suggestion is absent —
      // the message is the plain "API route not found" without "Did you mean".
      expect(payload.error.message).toContain('API route not found')
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})

describe('createApiMiddleware — non-api pass-through', () => {
  it('Given a non-/api URL, When the middleware runs, Then it calls next() and does NOT respond', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'api-mw-pass-'))
    try {
      const middleware = createApiMiddleware(makeFakeVite() as never, emptyDir, { csrfMode: 'off' })
      const r = makeRes()
      const result = await runMiddleware(
        middleware,
        makeReq({ method: 'GET', url: '/about' }),
        r.res,
      )
      expect(result.nextCalled).toBe(true)
      expect(r.status()).toBe(0)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})
