import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { executeAction } from '../../packages/theo/src/server/action-execute.js'
import { AuthRequiredError } from '../../packages/theo/src/server/auth.js'
import { PluginRunner } from '../../packages/theo/src/server/plugin-runner.js'
import { defineTheoPlugin } from '../../packages/theo/src/server/define-plugin.js'

/**
 * Coverage for the plugin-pipeline branches of `executeAction`:
 *   - runOnResponse after a successful handler (happy path)
 *   - handleActionError full path: plugin runOnError + runOnResponse(inErrorPath)
 *     for both AuthRequiredError and generic errors, plus the silent-catch
 *     branches when the error hooks themselves throw.
 */

function createMockReq(body: unknown, opts: { method?: string } = {}): IncomingMessage {
  const json = body === undefined ? '' : JSON.stringify(body)
  // Body parser concats Buffer chunks — passing strings via Readable.from breaks
  // Buffer.concat. Emit a single Buffer chunk.
  const chunks = json ? [Buffer.from(json, 'utf-8')] : []
  const stream = Readable.from(chunks) as unknown as IncomingMessage
  stream.method = opts.method ?? 'POST'
  stream.url = '/api/__actions/x/y'
  stream.headers = {
    'content-type': 'application/json',
    'x-theo-action': '1',
    origin: 'http://localhost:3000',
    host: 'localhost:3000',
  }
  return stream
}

interface CapturingResponse extends ServerResponse {
  _getStatus(): number
  _getBody(): string
}

function createMockRes(): CapturingResponse {
  let status = 200
  let body = ''
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    writeHead: vi.fn((s: number) => {
      status = s
      ;(res as { statusCode: number }).statusCode = s
    }),
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    end: vi.fn((b?: string) => {
      if (b) {
        body = b
      }
      ;(res as { writableEnded: boolean }).writableEnded = true
    }),
    write: vi.fn(),
    _getStatus: () => status,
    _getBody: () => body,
  } as unknown as CapturingResponse
  return res
}

function makeLoader(handlerImpl: (input: unknown) => unknown) {
  // Lazy import zod once.
  return async () => {
    const { z } = await import('zod')
    return {
      myAction: {
        input: z.object({ name: z.string() }),
        handler: ({ input }: { input: { name: string } }) => handlerImpl(input),
      },
    }
  }
}

describe('executeAction — plugin pipeline', () => {
  it('invokes runOnResponse after a successful handler', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 't',
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

    const res = createMockRes()
    await executeAction(
      '/virtual/action.ts',
      'myAction',
      createMockReq({ name: 'Paulo' }),
      res,
      makeLoader(() => ({ id: '1', name: 'Paulo' })),
      undefined,
      'req-success',
      runner,
      'off',
    )

    expect(res._getStatus()).toBe(200)
    expect(JSON.parse(res._getBody())).toEqual({ id: '1', name: 'Paulo' })
    expect(calls).toEqual(['onRequest', 'preHandler', 'onResponse'])
  })

  it('invokes runOnError and runOnResponse(inErrorPath) when handler throws', async () => {
    const calls: string[] = []
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'err',
        register(app) {
          app.addHook('onError', () => {
            calls.push('onError')
          })
          app.addHook('onResponse', () => {
            calls.push('onResponse')
          })
        },
      }),
    )

    const res = createMockRes()
    await executeAction(
      '/virtual/action.ts',
      'myAction',
      createMockReq({ name: 'Paulo' }),
      res,
      makeLoader(() => {
        throw new Error('handler boom')
      }),
      undefined,
      'req-error',
      runner,
      'off',
    )

    expect(res._getStatus()).toBe(500)
    const payload = JSON.parse(res._getBody())
    expect(payload.error.code).toBe('INTERNAL_ERROR')
    // Both error hooks must have fired; order: onError before onResponse(inErrorPath).
    expect(calls).toEqual(['onError', 'onResponse'])
  })

  it('maps AuthRequiredError to its declared status without 500-shifting', async () => {
    const res = createMockRes()
    await executeAction(
      '/virtual/action.ts',
      'myAction',
      createMockReq({ name: 'Paulo' }),
      res,
      makeLoader(() => {
        throw new AuthRequiredError('not signed in')
      }),
      undefined,
      'req-auth',
      undefined, // no plugin runner — exercises the no-plugin branch of handleActionError
      'off',
    )

    expect(res._getStatus()).toBe(401)
    expect(JSON.parse(res._getBody()).error.code).toBe('AUTH_REQUIRED')
  })

  it('silently swallows a throwing onError hook and still sends the error response', async () => {
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'badOnError',
        register(app) {
          app.addHook('onError', () => {
            throw new Error('onError boom')
          })
        },
      }),
    )

    const res = createMockRes()
    await executeAction(
      '/virtual/action.ts',
      'myAction',
      createMockReq({ name: 'Paulo' }),
      res,
      makeLoader(() => {
        throw new Error('handler boom')
      }),
      undefined,
      'req-err-rec',
      runner,
      'off',
    )

    // The error response is still emitted even though onError threw.
    expect(res._getStatus()).toBe(500)
  })

  it('silently swallows a throwing onResponse(inErrorPath) hook', async () => {
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'badOnResponse',
        register(app) {
          app.addHook('onResponse', () => {
            throw new Error('onResponse error path boom')
          })
        },
      }),
    )

    const res = createMockRes()
    await executeAction(
      '/virtual/action.ts',
      'myAction',
      createMockReq({ name: 'Paulo' }),
      res,
      makeLoader(() => {
        throw new Error('handler boom')
      }),
      undefined,
      'req-err-rec2',
      runner,
      'off',
    )

    expect(res._getStatus()).toBe(500)
  })
})
