import type { z } from 'zod'

import type { AgentEvent } from './agent-types.js'
import type { RouteConfig } from './define-route.js'

/**
 * T5.1 — defineAgentEndpoint
 *
 * Sugar over defineRoute (ADR D4). Accepts an async generator that yields
 * AgentEvents and produces a RouteConfig whose handler returns a Response
 * streaming Server-Sent Events (SSE).
 *
 * Wire format: `data: <JSON>\n\n` per event. Standards-compliant.
 *
 * The generator may throw — the wrapper catches and emits a final
 * `{ type: 'error', message }` event before closing the stream.
 *
 * The wrapper observes `request.signal` (EC-7) — when aborted, the
 * underlying generator is told to `return()` and the stream closes
 * promptly.
 *
 * Note (EC-12, Out of Scope): SSE backpressure (slow consumer) is not
 * handled here. For high-frequency token streaming consider a different
 * transport (WS) or a buffer policy. This MVP enqueues each event
 * immediately.
 */

export interface AgentEndpointHandlerArgs<TCtx = unknown, TBody = unknown> {
  query: undefined
  body: TBody
  params: undefined
  request: Request
  ctx: TCtx
  /**
   * Mutable headers bag that the wrapper merges into the SSE response BEFORE
   * the stream starts. Used by `createConversationHistory` to issue a
   * conversation-id cookie on first request. Append entries via
   * `cookieHeaders.append('set-cookie', '<cookie-string>')`.
   *
   * Cookies appended AFTER the first yield are NOT applied — the response
   * headers commit when the wrapper constructs the Response, before the
   * async generator runs. This is per HTTP semantics, not a wrapper choice.
   */
  cookieHeaders: Headers
}

export interface AgentEndpointConfig<TCtx = unknown, TBody = unknown> {
  handler: (
    args: AgentEndpointHandlerArgs<TCtx, TBody>,
  ) => AsyncGenerator<AgentEvent, void, unknown>
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const

function encodeSSE(event: AgentEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * Resolve an AbortSignal from either a Web `Request` (`.signal`) or a
 * Node `IncomingMessage` (`.aborted` flag + `'close'`/'aborted' events).
 *
 * The framework's `executeRoute` passes IncomingMessage to route handlers
 * today, but `defineAgentEndpoint` was designed for the Web Standards
 * `Request` shape. This helper bridges both — preventing a runtime crash
 * (`Cannot read properties of undefined (reading 'aborted')`) that would
 * otherwise abort the SSE stream silently before the first yield.
 */
function resolveAbortSignal(request: unknown): AbortSignal {
  if (typeof request !== 'object' || request === null) {
    return new AbortController().signal
  }
  const r = request as {
    signal?: unknown
    aborted?: boolean
    on?: (event: string, cb: () => void) => void
  }
  if (
    typeof r.signal === 'object' &&
    r.signal !== null &&
    'aborted' in r.signal &&
    typeof (r.signal as AbortSignal).addEventListener === 'function'
  ) {
    return r.signal as AbortSignal
  }

  const controller = new AbortController()
  if (r.aborted === true) controller.abort()
  if (typeof r.on === 'function') {
    r.on('close', () => {
      if (!controller.signal.aborted) controller.abort()
    })
    r.on('aborted', () => {
      if (!controller.signal.aborted) controller.abort()
    })
  }
  return controller.signal
}

export function defineAgentEndpoint<TBody = unknown, TCtx = unknown>(
  config: AgentEndpointConfig<TCtx, TBody>,
): RouteConfig<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, TCtx, Response> {
  return {
    handler: async ({ request, ctx, body, query, params }) => {
      const cookieHeaders = new Headers()
      const generator = config.handler({
        request,
        ctx: ctx,
        body: body as TBody,
        query: query,
        params: params,
        cookieHeaders,
      })

      const signal = resolveAbortSignal(request)

      // Prime the generator to its first yield. This forces the handler's
      // synchronous + async setup (including `createConversationHistory` if
      // used) to run BEFORE the Response headers commit, so any Set-Cookie
      // lines appended to `cookieHeaders` land in the actual response.
      //
      // First-byte latency cost: bounded by the work up to the first yield
      // (typically 100-500ms for an LLM chat with `agent.send`). Acceptable
      // for the use case; alternative (heuristic detection of cookie writes)
      // is brittle.
      let firstResult: IteratorResult<AgentEvent, void>
      let primeError: unknown
      try {
        firstResult = await generator.next()
      } catch (err) {
        primeError = err
        firstResult = { value: undefined, done: true }
      }

      // Merge any cookies the handler issued into the response headers.
      const responseHeaders = new Headers(SSE_HEADERS)
      for (const value of cookieHeaders.getSetCookie()) {
        responseHeaders.append('set-cookie', value)
      }

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const onAbort = () => {
            void generator.return(undefined)
          }

          if (signal.aborted) {
            controller.close()
            return
          }
          signal.addEventListener('abort', onAbort, { once: true })

          try {
            // If priming threw, yield a final error event and close.
            if (primeError !== undefined) {
              let message: string
              if (primeError instanceof Error) {
                message = primeError.message
              } else if (typeof primeError === 'string') {
                message = primeError
              } else {
                message = 'agent handler failed during setup'
              }
              controller.enqueue(encodeSSE({ type: 'error', message }))
              return
            }
            // Enqueue the primed first value (if any).
            if (firstResult.done !== true) {
              controller.enqueue(encodeSSE(firstResult.value))
            } else {
              return
            }
            // Continue iterating remaining events.
            for await (const event of generator) {
              // `signal.aborted` can flip true asynchronously via the
              // listener registered above. ESLint's narrowing only sees
              // the false assertion at line 114; the dynamic abort is
              // legitimate and the guard prevents enqueue-after-close.
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (signal.aborted) break
              controller.enqueue(encodeSSE(event))
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            controller.enqueue(encodeSSE({ type: 'error', message }))
          } finally {
            signal.removeEventListener('abort', onAbort)
            controller.close()
          }
        },
        cancel() {
          void generator.return(undefined)
        },
      })

      return new Response(stream, { headers: responseHeaders })
    },
  }
}
