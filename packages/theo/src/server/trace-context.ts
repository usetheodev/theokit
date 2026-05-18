import type { IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'

/**
 * Phase 7 — Observability: traceId propagation (D7).
 *
 * Extract a stable identifier from incoming requests so a single value
 * correlates the client request, every server log line, the response
 * envelope, and any downstream span. Precedence:
 *
 *   1. `traceparent` (W3C Trace Context — `00-{32-hex}-{16-hex}-{flags}`)
 *   2. `x-request-id` (Heroku / GCP / generic proxy header)
 *   3. Generated UUID (fresh per request)
 *
 * UUIDs are accepted as trace identifiers by every major vendor that
 * does not enforce strict 32-hex (Datadog, Honeycomb, Sentry, Logflare,
 * Axiom, etc). We don't need ULIDs to ship this surface.
 */

export const TRACE_HEADER = 'x-trace-id'
export const TRACE_PARENT_HEADER = 'traceparent'
export const REQUEST_ID_HEADER = 'x-request-id'

// W3C Trace Context: 00-<trace-id 32 hex>-<span-id 16 hex>-<flags 2 hex>
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/

/**
 * Parse a W3C Trace Context `traceparent` header value. Returns the
 * 32-hex trace-id when valid (and not the reserved all-zeros), else
 * `null`.
 */
export function parseTraceparent(value: string): string | null {
  if (!value) return null
  const m = TRACEPARENT_RE.exec(value)
  if (!m) return null
  const traceId = m[1]
  // W3C: trace-id of all zeroes is invalid by spec
  if (/^0+$/.test(traceId)) return null
  return traceId
}

/**
 * Pick the first string value out of an IncomingMessage header. Node
 * collapses repeated headers into arrays; proxies sometimes do this for
 * `x-request-id`. Empty strings count as absent.
 */
function pickHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === 'string' && v.length > 0) return v
    }
    return null
  }
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

/**
 * Resolve the request's traceId following the precedence above.
 */
export function extractTraceId(req: IncomingMessage): string {
  const traceparent = pickHeader(req.headers[TRACE_PARENT_HEADER])
  if (traceparent) {
    const parsed = parseTraceparent(traceparent)
    if (parsed) return parsed
  }
  const requestId = pickHeader(req.headers[REQUEST_ID_HEADER])
  if (requestId) return requestId
  return randomUUID()
}
