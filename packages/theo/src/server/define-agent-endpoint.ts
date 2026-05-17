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

export function defineAgentEndpoint<TBody = unknown, TCtx = unknown>(
  config: AgentEndpointConfig<TCtx, TBody>,
): RouteConfig<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, TCtx, Response> {
  return {
    handler: ({ request, ctx, body, query, params }) => {
      const generator = config.handler({
        request,
        ctx: ctx as TCtx,
        body: body as TBody,
        query: query as undefined,
        params: params as undefined,
      })

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const onAbort = () => {
            // Best-effort: cancel the generator, then close the stream.
            // generator.return() is the documented way to short-circuit
            // an async generator from outside.
            void generator.return(undefined as unknown as void)
          }

          if (request.signal.aborted) {
            controller.close()
            return
          }
          request.signal.addEventListener('abort', onAbort, { once: true })

          try {
            for await (const event of generator) {
              if (request.signal.aborted) break
              controller.enqueue(encodeSSE(event))
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            controller.enqueue(
              encodeSSE({ type: 'error', message }),
            )
          } finally {
            request.signal.removeEventListener('abort', onAbort)
            controller.close()
          }
        },
        cancel() {
          void generator.return(undefined as unknown as void)
        },
      })

      return new Response(stream, { headers: SSE_HEADERS }) as Response
    },
  } as RouteConfig<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, TCtx, Response>
}
