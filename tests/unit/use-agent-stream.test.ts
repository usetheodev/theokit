import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  consumeAgentStream,
  parseSSEChunk,
} from '../../packages/theo/src/client/agent-stream-core.js'
import type { AgentEvent } from '../../packages/theo/src/server/agent-types.js'

/**
 * T5.2 — useAgentStream
 *
 * The hook is glue over a pure primitive (`consumeAgentStream`) that handles
 * fetch + ReadableStream + SSE chunk parsing. We exercise the primitive
 * exhaustively (covers the wire behavior) and assert architectural facts
 * about the hook source (EC-3: no EventSource).
 */

function encodeSSE(events: AgentEvent[]): Uint8Array {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new TextEncoder().encode(text)
}

function streamFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

function fetchMockOnce(events: AgentEvent[]): typeof fetch {
  return async (_input, _init) => {
    return new Response(streamFrom([encodeSSE(events)]), {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
}

describe('parseSSEChunk', () => {
  it('parses a data: line', () => {
    const ev = parseSSEChunk('data: {"type":"message","content":"hi"}')
    expect(ev).toEqual({ type: 'message', content: 'hi' })
  })

  it('returns null for non-data lines', () => {
    expect(parseSSEChunk('event: foo')).toBeNull()
    expect(parseSSEChunk('')).toBeNull()
    expect(parseSSEChunk(':comment')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseSSEChunk('data: not-json')).toBeNull()
  })
})

describe('consumeAgentStream (T5.2 primitive)', () => {
  it('accumulates 3 events from SSE response', async () => {
    const events: AgentEvent[] = [
      { type: 'message', content: 'one' },
      { type: 'tool_call', name: 'fetch', args: {} },
      { type: 'message', content: 'done' },
    ]
    const fetchMock = fetchMockOnce(events)
    const captured: AgentEvent[] = []

    await consumeAgentStream('/api/chat', {
      body: { message: 'hi' },
      fetch: fetchMock,
      onEvent: (e) => captured.push(e),
    })

    expect(captured).toEqual(events)
  })

  it('uses POST with JSON body (EC-3)', async () => {
    let capturedInit: RequestInit | undefined
    const fetchSpy: typeof fetch = async (_input, init) => {
      capturedInit = init
      return new Response(streamFrom([encodeSSE([])]), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    await consumeAgentStream('/api/chat', {
      body: { message: 'hello' },
      fetch: fetchSpy,
      onEvent: () => {},
    })

    expect(capturedInit?.method).toBe('POST')
    expect(typeof capturedInit?.body).toBe('string')
    expect(capturedInit?.body).toContain('hello')
  })

  it('aborts via signal — fetch sees AbortController and stream closes', async () => {
    let receivedSignal: AbortSignal | undefined
    const fetchSpy: typeof fetch = async (_input, init) => {
      receivedSignal = init?.signal ?? undefined
      // Return a stream that errors when the request signal aborts.
      // This mirrors real fetch behavior: reader.read() rejects on abort.
      return new Response(
        new ReadableStream({
          start(controller) {
            const sig = init?.signal
            if (sig) {
              sig.addEventListener('abort', () => {
                controller.error(new DOMException('aborted', 'AbortError'))
              })
            }
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }

    const controller = new AbortController()
    const promise = consumeAgentStream('/api/chat', {
      body: {},
      fetch: fetchSpy,
      onEvent: () => {},
      signal: controller.signal,
    })

    // Give the stream a tick to start before aborting.
    await new Promise((r) => setTimeout(r, 5))
    controller.abort()
    await promise.catch(() => {})

    expect(receivedSignal).toBeDefined()
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('handles error event from server', async () => {
    const captured: AgentEvent[] = []
    let finalStatus = 'idle'

    await consumeAgentStream('/api/chat', {
      body: {},
      fetch: fetchMockOnce([
        { type: 'message', content: 'partial' },
        { type: 'error', message: 'rate limit' },
      ]),
      onEvent: (e) => {
        captured.push(e)
        if (e.type === 'error') finalStatus = 'error'
      },
    })

    expect(captured).toHaveLength(2)
    expect(finalStatus).toBe('error')
  })

  it('handles chunks split across multiple reads', async () => {
    // First chunk: half of event 1. Second chunk: rest of event 1 + full event 2.
    const ev1 = `data: ${JSON.stringify({ type: 'message', content: 'one' })}\n\n`
    const ev2 = `data: ${JSON.stringify({ type: 'message', content: 'two' })}\n\n`
    const enc = new TextEncoder()
    const split = Math.floor(ev1.length / 2)

    const fetchSplit: typeof fetch = async () => {
      return new Response(
        streamFrom([
          enc.encode(ev1.slice(0, split)),
          enc.encode(ev1.slice(split) + ev2),
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }

    const captured: AgentEvent[] = []
    await consumeAgentStream('/api/chat', {
      body: {},
      fetch: fetchSplit,
      onEvent: (e) => captured.push(e),
    })

    expect(captured).toHaveLength(2)
    expect(captured[0]).toEqual({ type: 'message', content: 'one' })
    expect(captured[1]).toEqual({ type: 'message', content: 'two' })
  })

  it('completes cleanly when server closes empty stream (edge)', async () => {
    const captured: AgentEvent[] = []
    await consumeAgentStream('/api/chat', {
      body: {},
      fetch: fetchMockOnce([]),
      onEvent: (e) => captured.push(e),
    })
    expect(captured).toHaveLength(0)
  })
})

describe('useAgentStream source — architectural checks (EC-3)', () => {
  const src = readFileSync(
    resolve(__dirname, '../../packages/theo/src/client/use-agent-stream.ts'),
    'utf-8',
  )

  it('does NOT use EventSource (EC-3 — needs POST + body)', () => {
    expect(src).not.toMatch(/new\s+EventSource\b/)
  })

  it('uses fetch + ReadableStream via the core primitive', () => {
    // The hook delegates to consumeAgentStream — that import is the proof.
    expect(src).toMatch(/consumeAgentStream/)
  })

  it('wires AbortController for cleanup on unmount', () => {
    expect(src).toMatch(/AbortController/)
    expect(src).toMatch(/\.abort\(\)/)
  })
})
