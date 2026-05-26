/**
 * T3.1 — defineAgentEndpoint exposes ctx.signal AND derives it via duck-type.
 *
 * EC-1 (MUST FIX): instanceof AbortSignal breaks cross-realm — verify a
 * polyfilled signal (object without `instanceof AbortSignal === true`) is
 * still detected via the duck-type guard (`'aborted' in sig &&
 * typeof sig.addEventListener === 'function'`).
 */
import { describe, it, expect } from 'vitest'

import {
  defineAgentEndpoint,
  type AgentEndpointHandlerArgs,
} from '../../packages/theo/src/server/define/define-agent-endpoint.js'

describe('defineAgentEndpoint signal threading (T3.1)', () => {
  it('test_signal_threaded_from_web_request — Web Request signal propagates to handler', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const route = defineAgentEndpoint({
      async *handler(args: AgentEndpointHandlerArgs) {
        received = args.signal
        yield { type: 'message', content: 'ok' }
      },
    })
    const req = new Request('https://e.test/', { signal: controller.signal })
    const res = await route.handler({
      request: req,
      ctx: undefined,
      body: undefined,
      query: undefined,
      params: undefined,
    } as unknown as Parameters<typeof route.handler>[0])
    expect(received).toBeDefined()
    // The signal MUST be linked to the controller — abort propagates.
    expect(received!.aborted).toBe(false)
    controller.abort()
    expect(received!.aborted).toBe(true)
    // Cancel cleanup
    if (res instanceof Response) await res.body?.cancel()
  })

  it('test_signal_threading_cross_realm (EC-1) — duck-typed polyfill signal detected', async () => {
    // Simulate a polyfilled AbortSignal — duck-type matches but
    // `instanceof AbortSignal` would return false in cross-realm.
    const polyfilledSignal = {
      aborted: false as boolean,
      addEventListener(_event: string, _cb: () => void): void {
        /* polyfill stub */
      },
      removeEventListener(_event: string, _cb: () => void): void {
        /* polyfill stub */
      },
    }
    const polyfilledReq = { signal: polyfilledSignal }

    let received: unknown
    const route = defineAgentEndpoint({
      async *handler(args: AgentEndpointHandlerArgs) {
        received = args.signal
        yield { type: 'message', content: 'ok' }
      },
    })
    const res = await route.handler({
      request: polyfilledReq,
      ctx: undefined,
      body: undefined,
      query: undefined,
      params: undefined,
    } as unknown as Parameters<typeof route.handler>[0])
    expect(received).toBe(polyfilledSignal)
    if (res instanceof Response) await res.body?.cancel()
  })

  it('test_signal_threaded_from_node_incoming_message — close event triggers abort', async () => {
    // Simulate Node IncomingMessage shape: no `signal`, has `on(close,...)`
    const onListeners: Record<string, () => void> = {}
    const nodeReq = {
      on(event: string, cb: () => void): void {
        onListeners[event] = cb
      },
    }

    let received: AbortSignal | undefined
    const route = defineAgentEndpoint({
      async *handler(args: AgentEndpointHandlerArgs) {
        received = args.signal
        yield { type: 'message', content: 'ok' }
      },
    })
    const res = await route.handler({
      request: nodeReq,
      ctx: undefined,
      body: undefined,
      query: undefined,
      params: undefined,
    } as unknown as Parameters<typeof route.handler>[0])
    expect(received).toBeDefined()
    expect(received!.aborted).toBe(false)
    // Fire the close event
    onListeners.close?.()
    expect(received!.aborted).toBe(true)
    if (res instanceof Response) await res.body?.cancel()
  })

  it('test_fallback_signal_when_request_unknown — handler still receives a non-null signal', async () => {
    let received: AbortSignal | undefined
    const route = defineAgentEndpoint({
      async *handler(args: AgentEndpointHandlerArgs) {
        received = args.signal
        yield { type: 'message', content: 'ok' }
      },
    })
    const res = await route.handler({
      request: 'not-a-request',
      ctx: undefined,
      body: undefined,
      query: undefined,
      params: undefined,
    } as unknown as Parameters<typeof route.handler>[0])
    expect(received).toBeDefined()
    expect(received!.aborted).toBe(false)
    if (res instanceof Response) await res.body?.cancel()
  })
})
