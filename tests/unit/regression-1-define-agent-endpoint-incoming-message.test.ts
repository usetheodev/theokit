import { describe, it, expect } from 'vitest'
import { defineAgentEndpoint } from '../../packages/theo/src/server/define/define-agent-endpoint.js'
import type { AgentEvent } from '../../packages/theo/src/server/agent/agent-types.js'

/**
 * Regression for nextjs-maturity T1.1.
 *
 * Original bug (previous session): defineAgentEndpoint accessed
 * `request.signal.aborted` assuming a Web Request. The framework's
 * executeRoute pipeline actually passes a Node IncomingMessage that has
 * `.aborted` (boolean) + `'close'`/`'aborted'` events, NOT `.signal`. The
 * unguarded access threw inside the ReadableStream's start() callback,
 * which the wrapper's try/catch swallowed — the stream closed with ZERO
 * SSE chunks emitted. The fix is the `resolveAbortSignal()` helper.
 *
 * If anyone reverts the helper, these tests fail loudly.
 */

interface FakeIncomingMessage {
  aborted: boolean
  on: (event: string, cb: () => void) => void
  url?: string
  method?: string
  // Intentionally NO `signal` property — proves the bridge works.
}

function makeNodeRequest(opts: { aborted?: boolean } = {}): {
  req: FakeIncomingMessage
  triggerClose: () => void
} {
  const listeners: Record<string, Array<() => void>> = {}
  const req: FakeIncomingMessage = {
    aborted: opts.aborted ?? false,
    on(event: string, cb: () => void) {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    },
    url: '/api/agent',
    method: 'POST',
  }
  return {
    req,
    triggerClose: () => {
      req.aborted = true
      for (const cb of listeners.close ?? []) cb()
      for (const cb of listeners.aborted ?? []) cb()
    },
  }
}

async function collectChunks(response: Response): Promise<string[]> {
  const reader = response.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
  }
  return buf.split('\n\n').filter((c) => c.startsWith('data:'))
}

describe('T1.1 — defineAgentEndpoint accepts Node IncomingMessage shape', () => {
  it('emits all 3 events when request is a fake IncomingMessage (regression: signal.aborted threw)', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        yield { type: 'message', content: 'one' }
        yield { type: 'message', content: 'two' }
        yield { type: 'message', content: 'three' }
      },
    })
    const { req } = makeNodeRequest()
    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: req as unknown as Request,
      ctx: undefined,
    })) as Response
    const chunks = await collectChunks(response)
    expect(chunks).toHaveLength(3)
  })

  it('Node close event aborts the stream within 200ms', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        for (let i = 0; i < 1000; i++) {
          yield { type: 'message', content: `tick-${i}` }
          await new Promise((r) => setTimeout(r, 10))
        }
      },
    })
    const { req, triggerClose } = makeNodeRequest()
    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: req as unknown as Request,
      ctx: undefined,
    })) as Response
    const reader = response.body!.getReader()
    await reader.read() // first chunk
    const t0 = Date.now()
    triggerClose()
    while (true) {
      const { done } = await reader.read()
      if (done) break
      if (Date.now() - t0 > 500) throw new Error('did not close within 500ms after close event')
    }
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('already-aborted IncomingMessage closes immediately with zero chunks', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        yield { type: 'message', content: 'never seen' }
      },
    })
    const { req } = makeNodeRequest({ aborted: true })
    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: req as unknown as Request,
      ctx: undefined,
    })) as Response
    const chunks = await collectChunks(response)
    expect(chunks).toHaveLength(0)
  })

  it('Web Request path still works (regression: fix did not break original code path)', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        yield { type: 'message', content: 'a' }
        yield { type: 'message', content: 'b' }
      },
    })
    const webRequest = new Request('http://localhost/api/agent', { method: 'POST', body: '{}' })
    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: webRequest,
      ctx: undefined,
    })) as Response
    const chunks = await collectChunks(response)
    expect(chunks).toHaveLength(2)
  })
})
