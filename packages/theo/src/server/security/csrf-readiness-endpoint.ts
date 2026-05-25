/**
 * T2.2 — `/__theo/csrf-readiness` endpoint.
 *
 *   GET  /__theo/csrf-readiness        → 200 + JSON summary
 *   POST /__theo/csrf-readiness/reset  → 204; clears the store
 *
 * The reset endpoint enforces CSRF (own dog food) — requires
 * `X-Theo-Action: 1` AND a matching Origin header (EC-15). This avoids
 * the endpoint being weaponizable from a cross-origin page when the
 * endpoint is opt-in exposed in production.
 *
 * Mount opt-in: in dev mode, the host wires this in unconditionally. In
 * production, only mount when `config.security.csrfTelemetry.exposeReadinessEndpoint === true`.
 * EC-10 parallel: returns 404 (via boolean false return) when the URL
 * does not match — the caller continues normal request handling.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { CsrfReadinessStore } from './csrf-readiness-store.js'

export const CSRF_READINESS_PATH = '/__theo/csrf-readiness'
export const CSRF_READINESS_RESET_PATH = '/__theo/csrf-readiness/reset'

function originMatchesHost(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (typeof origin !== 'string') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  try {
    const parsed = new URL(origin)
    return parsed.host === host
  } catch {
    return false
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendNoContent(res: ServerResponse): void {
  res.writeHead(204)
  res.end()
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { code, message } }))
}

// eslint-disable-next-line @typescript-eslint/require-await -- async return for future telemetry hooks
export async function handleCsrfReadiness(
  req: IncomingMessage,
  res: ServerResponse,
  store: CsrfReadinessStore,
): Promise<boolean> {
  const url = (req.url ?? '').split('?')[0]
  const method = req.method ?? 'GET'

  if (url === CSRF_READINESS_PATH) {
    if (method === 'GET') {
      sendJson(res, 200, store.summary())
      return true
    }
    sendError(res, 405, 'METHOD_NOT_ALLOWED', `Use GET on ${CSRF_READINESS_PATH}`)
    return true
  }

  if (url === CSRF_READINESS_RESET_PATH) {
    if (method !== 'POST') {
      sendError(res, 405, 'METHOD_NOT_ALLOWED', `Use POST on ${CSRF_READINESS_RESET_PATH}`)
      return true
    }
    // Enforce CSRF on our own endpoint (dog-food).
    const hasHeader = req.headers['x-theo-action'] === '1'
    if (!hasHeader || !originMatchesHost(req)) {
      sendError(res, 403, 'CSRF_INVALID', 'Reset requires X-Theo-Action: 1 + same-origin')
      return true
    }
    store.reset()
    sendNoContent(res)
    return true
  }

  return false
}
