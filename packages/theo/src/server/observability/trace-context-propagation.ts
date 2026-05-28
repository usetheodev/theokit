import { randomBytes } from 'node:crypto'

/**
 * W3C Trace Context propagation helpers for non-HTTP carriers (job
 * leases, webhook reply headers, agent SSE frames). Works against any
 * `Headers`-shaped carrier — Web Standards only.
 *
 * The HTTP-side extractor `extractTraceId` in `../http/trace-context.ts`
 * is request-scoped and returns only the trace_id string. This module
 * exposes the full `TraceContext` shape (trace_id + span_id + flags)
 * because downstream jobs/webhooks need to propagate a NEW span_id
 * (child span) while keeping the same trace_id.
 *
 * Format spec (W3C Trace Context Level 2):
 *   traceparent: version-trace_id-parent_id-trace_flags
 *   - version    = '00' (current)
 *   - trace_id   = 32 hex chars (128-bit)
 *   - parent_id  = 16 hex chars (64-bit) — "span_id" of the producer
 *   - trace_flags = 2 hex chars (sampled bit)
 *
 * @see https://www.w3.org/TR/trace-context/
 */

export interface TraceContext {
  /** 32 hex chars. NEVER the reserved all-zeros value. */
  readonly trace_id: string
  /** 16 hex chars. NEVER the reserved all-zeros value. */
  readonly span_id: string
  /** 2 hex chars. Sampled bit + reserved. */
  readonly flags: string
}

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/
const ALL_ZEROS_TRACE = '00000000000000000000000000000000'
const ALL_ZEROS_SPAN = '0000000000000000'

/**
 * Extract a TraceContext from a Web Headers object. Returns `null` for:
 * - missing header
 * - malformed (not matching the version-trace-span-flags regex)
 * - reserved all-zeros trace_id (W3C-invalid)
 * - reserved all-zeros span_id (W3C-invalid)
 *
 * NEVER throws — defensive read.
 */
export function extractTraceContext(headers: Headers): TraceContext | null {
  const value = headers.get('traceparent')
  if (!value) return null
  const m = TRACEPARENT_RE.exec(value)
  if (!m) return null
  const trace_id = m[1]
  const span_id = m[2]
  const flags = m[3]
  if (trace_id === ALL_ZEROS_TRACE) return null
  if (span_id === ALL_ZEROS_SPAN) return null
  return { trace_id, span_id, flags }
}

/**
 * Write a canonical traceparent into a Web Headers object. Always
 * succeeds (defensive write — the caller is responsible for passing
 * a valid TraceContext; passing malformed input is a programming bug).
 */
export function injectTraceContext(headers: Headers, ctx: TraceContext): void {
  headers.set('traceparent', `00-${ctx.trace_id}-${ctx.span_id}-${ctx.flags}`)
}

/**
 * Generate a fresh TraceContext (new trace_id + span_id, flags='01' for
 * sampled). Used when no upstream traceparent exists — e.g., when a
 * cron fires or a webhook arrives without an upstream tracer.
 */
export function generateNewTraceContext(): TraceContext {
  return {
    trace_id: randomHex(16), // 16 bytes = 32 hex chars
    span_id: randomHex(8), //  8 bytes = 16 hex chars
    flags: '01',
  }
}

function randomHex(bytes: number): string {
  // randomBytes is overwhelmingly unlikely to produce all-zeros, but we
  // guard anyway — the W3C spec rejects all-zeros and tests assert this.
  for (;;) {
    const hex = randomBytes(bytes).toString('hex')
    if (!/^0+$/.test(hex)) return hex
  }
}
