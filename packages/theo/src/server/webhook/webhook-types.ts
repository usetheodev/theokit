/**
 * Webhook primitive types (R0.5.10).
 *
 * @see docs/adr/0005-webhook-verify-inline-function.md
 */

export type VerifyResult = { ok: true } | { ok: false; reason: string }

/**
 * A verify function — pure, async-or-sync. Takes the cloned request
 * (raw body NOT yet consumed by handler), returns ok/notOk + reason.
 *
 * Per ADR-0005, helper factories (`stripe`, `github`, `slack`) return
 * this shape. Users can also write inline `verify: async (req) => ...`
 * for custom providers.
 */
export type VerifyFn = (req: Request) => Promise<VerifyResult> | VerifyResult

export interface WebhookContext {
  /** The cloned Request (still readable by user code). */
  readonly request: Request
  /** Raw body bytes as UTF-8 string — already-verified at this point. */
  readonly rawBody: string
  /** W3C trace_id propagated from request. */
  readonly traceId: string
  /** Abort signal triggered by client disconnect or server stop. */
  readonly signal: AbortSignal
}

export interface DefineWebhookOptions {
  verify: VerifyFn
  handler: (ctx: WebhookContext) => unknown
  /** Override `readRawBody` body size cap (EC-101). Default 1MB. */
  maxBodyBytes?: number
}

export interface WebhookDefinition {
  readonly verify: VerifyFn
  readonly handler: (ctx: WebhookContext) => unknown
  readonly maxBodyBytes?: number
  /** Discriminator for runtime dispatch. */
  readonly __theokit_kind: 'webhook'
}
