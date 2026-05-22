import { describe, it, expect } from 'vitest'
import { defineAgentEndpoint } from '../../packages/theo/src/server/define-agent-endpoint.js'
import type { AgentEvent } from '../../packages/theo/src/server/agent-types.js'

/**
 * T5.1 — defineAgentEndpoint
 *
 * Helper that wraps an async generator producing AgentEvents into a
 * defineRoute-compatible RouteConfig that responds with SSE.
 */

function makeMockRequest(): Request {
  return new Request('http://localhost/api/agent', { method: 'POST' })
}

async function collectSSEChunks(response: Response): Promise<string[]> {
  if (!response.body) return []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
  }
  // Filter out empty trailing chunks
  return buf.split('\n\n').filter((c) => c.length > 0)
}

function parseSSEChunk(chunk: string): AgentEvent {
  if (!chunk.startsWith('data:')) throw new Error(`invalid SSE chunk: ${chunk}`)
  return JSON.parse(chunk.slice(5).trim()) as AgentEvent
}

describe('defineAgentEndpoint (T5.1)', () => {
  it('returns a RouteConfig-shape with handler function', () => {
    const endpoint = defineAgentEndpoint({
      async *handler() {
        yield { type: 'message', content: 'hi' }
      },
    })
    expect(typeof endpoint.handler).toBe('function')
  })

  it('emits one SSE chunk per event yielded (happy path)', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        yield { type: 'message', content: 'one' }
        yield { type: 'tool_call', name: 'fetch', args: { url: 'x' } }
        yield { type: 'message', content: 'done' }
      },
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: makeMockRequest(),
      ctx: undefined,
    })) as Response

    const chunks = await collectSSEChunks(response)
    expect(chunks).toHaveLength(3)
    expect(parseSSEChunk(chunks[0]!)).toEqual({ type: 'message', content: 'one' })
    expect(parseSSEChunk(chunks[1]!)).toMatchObject({ type: 'tool_call', name: 'fetch' })
    expect(parseSSEChunk(chunks[2]!)).toEqual({ type: 'message', content: 'done' })
  })

  it('sets Content-Type: text/event-stream', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler() {
        yield { type: 'message', content: 'hi' } as AgentEvent
      },
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: makeMockRequest(),
      ctx: undefined,
    })) as Response

    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toContain('no-cache')
  })

  it('emits an error event when generator throws', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        yield { type: 'message', content: 'before' }
        throw new Error('boom')
      },
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: makeMockRequest(),
      ctx: undefined,
    })) as Response

    const chunks = await collectSSEChunks(response)
    expect(chunks).toHaveLength(2)
    const last = parseSSEChunk(chunks[1]!)
    expect(last.type).toBe('error')
    expect((last as { message: string }).message).toContain('boom')
  })

  it('stops streaming when request signal aborts (EC-7)', async () => {
    const controller = new AbortController()
    let yielded = 0

    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        while (true) {
          yielded++
          yield { type: 'message', content: `tick-${yielded}` }
          await new Promise((r) => setTimeout(r, 10))
        }
      },
    })

    const request = new Request('http://localhost/api/agent', {
      method: 'POST',
      signal: controller.signal,
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request,
      ctx: undefined,
    })) as Response

    // Start reading then abort
    if (!response.body) throw new Error('no body')
    const reader = response.body.getReader()
    const firstRead = await reader.read()
    expect(firstRead.done).toBe(false)
    controller.abort()

    // Drain — must finish within ~100ms even though generator is infinite
    const started = Date.now()
    while (true) {
      const { done } = await reader.read()
      if (done) break
      if (Date.now() - started > 500) throw new Error('stream did not close on abort')
    }
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('emits no chunks for empty generator (edge case)', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        // emits nothing
      },
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: makeMockRequest(),
      ctx: undefined,
    })) as Response

    const chunks = await collectSSEChunks(response)
    expect(chunks).toHaveLength(0)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
  })

  it('passes ctx + request through to handler', async () => {
    let captured: { request?: Request; ctx?: unknown } = {}

    const endpoint = defineAgentEndpoint<unknown, { userId: string }>({
      async *handler({ request, ctx }): AsyncGenerator<AgentEvent> {
        captured = { request, ctx }
        yield { type: 'message', content: 'ok' }
      },
    })

    const req = makeMockRequest()
    await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: req,
      ctx: { userId: 'u-1' },
    })

    expect(captured.request).toBe(req)
    expect(captured.ctx).toEqual({ userId: 'u-1' })
  })

  // Item #5 — cookieHeaders bridge
  it('forwards cookieHeaders writes from handler into the SSE response', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler({ cookieHeaders }): AsyncGenerator<AgentEvent> {
        cookieHeaders.append('set-cookie', 'theo_conversation=abc123; HttpOnly; Path=/')
        yield { type: 'message', content: 'hi' }
      },
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: makeMockRequest(),
      ctx: undefined,
    })) as Response

    expect(response.headers.getSetCookie()).toContain(
      'theo_conversation=abc123; HttpOnly; Path=/',
    )
  })

  it('does not add Set-Cookie when handler does not touch cookieHeaders', async () => {
    const endpoint = defineAgentEndpoint({
      async *handler(): AsyncGenerator<AgentEvent> {
        yield { type: 'message', content: 'silent' }
      },
    })

    const response = (await endpoint.handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request: makeMockRequest(),
      ctx: undefined,
    })) as Response

    expect(response.headers.getSetCookie()).toEqual([])
  })
})
