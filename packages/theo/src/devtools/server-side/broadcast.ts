/**
 * T2.1 + T2.3 + T2.4 — Server-side broadcast helper.
 *
 * `globalThis.__theoViteHotServer` is populated by the Vite plugin's
 * `configureServer` hook (T2.4) when dev mode is active. The helper:
 *  - no-ops if the global is undefined (production, build, no dev server)
 *  - applies redaction (T2.3) before sending — secrets never enter the WS payload
 *  - wraps the whole send in try/catch to prevent ws.send failures from
 *    leaking out and crashing the request handler
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import {
  redactHeaders,
  redactQueryString,
  serializeSafely,
  truncateBody,
} from './redact.js'
import type { RequestRecord, CsrfWarnPayload, ErrorRecord } from '../shared.js'

interface ViteWsLike {
  ws?: {
    send(payload: { type: 'custom'; event: string; data: unknown }): void
  }
  httpServer?: unknown
}

function getViteServer(): ViteWsLike | undefined {
  const g = globalThis as { __theoViteHotServer?: ViteWsLike }
  return g.__theoViteHotServer
}

/**
 * Send a typed event to the devtools UI over Vite's HMR WebSocket.
 *
 * Default-deny — ALL errors (server gone, redact throws, ws.send fails)
 * result in a silent no-op + console.warn. Never throws to caller.
 */
export function broadcastToDevtools(event: string, data: unknown): void {
  try {
    const server = getViteServer()
    if (!server?.ws) return
    // Safe-serialize: convert BigInt; pure pass-through otherwise.
    const safe = serializeSafely(data)
    server.ws.send({ type: 'custom', event, data: safe })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[theo devtools] broadcast failed', err)
  }
}

/**
 * Convenience: redact a RequestRecord before broadcasting.
 *
 * Applies:
 *  - EC-18: redactQueryString on path
 *  - redactHeaders on headers
 *  - EC-19: truncateBody (binary-safe)
 *  - EC-26: serializeSafely (BigInt walk) inside broadcastToDevtools
 */
export function broadcastRequest(req: RequestRecord): void {
  const safePath = redactQueryString(req.path)
  const safeHeaders = req.headers ? redactHeaders(req.headers) : undefined
  const bodyInfo = truncateBody(req.bodyPreview)
  const sanitized: RequestRecord = {
    ...req,
    path: safePath,
    headers: safeHeaders,
    bodyPreview: bodyInfo.preview,
    bodyLength: bodyInfo.length,
    bodyTruncated: bodyInfo.truncated,
  }
  broadcastToDevtools('theo:devtools:request', sanitized)
}

export function broadcastError(err: ErrorRecord): void {
  broadcastToDevtools('theo:devtools:error', err)
}

export function broadcastCsrfWarn(payload: CsrfWarnPayload): void {
  // CSRF payload has no secret-ish fields, but the path may carry tokens.
  const safe: CsrfWarnPayload = { ...payload, path: redactQueryString(payload.path) }
  broadcastToDevtools('theo:devtools:csrf.warn', safe)
}
