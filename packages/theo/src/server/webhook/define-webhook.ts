import {
  extractTraceContext,
  generateNewTraceContext,
} from '../observability/trace-context-propagation.js'

import { BodyTooLargeError, readRawBody } from './raw-body.js'
import type {
  DefineWebhookOptions,
  VerifyResult,
  WebhookContext,
  WebhookDefinition,
} from './webhook-types.js'

/**
 * Declare a webhook handler with first-class signature verification
 * (R0.5.10, ADR-0005). Pure identity helper — returns the definition
 * unchanged for downstream dispatch.
 *
 * @example
 * ```ts
 * // server/webhooks/stripe.ts
 * import { defineWebhook } from 'theokit/server'
 * import { stripe } from 'theokit/server/webhook/providers'
 *
 * export default defineWebhook({
 *   verify: stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }),
 *   async handler({ rawBody }) {
 *     const event = JSON.parse(rawBody)
 *     // ...
 *     return new Response('ok')
 *   },
 * })
 * ```
 */
export function defineWebhook(opts: DefineWebhookOptions): WebhookDefinition {
  return {
    verify: opts.verify,
    handler: opts.handler,
    maxBodyBytes: opts.maxBodyBytes,
    __theokit_kind: 'webhook',
  }
}

/**
 * Dispatch a webhook request through the definition's verify → handler
 * pipeline. Returns the handler's `Response` (or a wrapped one), or a
 * 401/413 response when verification or body size guards trip.
 *
 * EC-101: enforces `maxBodyBytes` (default 1MB via readRawBody).
 * EC-103: every throw from `verify` (sync or async) is treated as
 * `{ok: false, reason: 'verify threw: <message>'}`. Handler NEVER
 * invoked on verify failure.
 */
export async function dispatchWebhook(def: WebhookDefinition, request: Request): Promise<Response> {
  let rawBody: string
  let bodyClone: Request
  try {
    const result = await readRawBody(request, { maxBodyBytes: def.maxBodyBytes })
    rawBody = result.rawBody
    bodyClone = result.bodyClone
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return new Response(JSON.stringify({ error: err.code, message: err.message }), {
        status: 413,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        error: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'failed to read body',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // Resolve traceId — propagate or generate.
  const incomingTrace = extractTraceContext(request.headers)
  const traceId = incomingTrace?.trace_id ?? generateNewTraceContext().trace_id

  // EC-103: verify exception MUST close the door, never let handler run.
  let verifyResult: VerifyResult
  try {
    verifyResult = await def.verify(bodyClone)
  } catch (err) {
    verifyResult = {
      ok: false,
      reason: `verify threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!verifyResult.ok) {
    return new Response(
      JSON.stringify({ error: 'WEBHOOK_VERIFY_FAILED', message: verifyResult.reason }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }

  const ctx: WebhookContext = {
    request: bodyClone,
    rawBody,
    traceId,
    signal: request.signal,
  }

  const result = await def.handler(ctx)
  if (result instanceof Response) return result
  if (result === undefined || result === null) {
    return new Response(null, { status: 204 })
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
