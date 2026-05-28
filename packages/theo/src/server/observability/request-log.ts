/**
 * Request log primitive (T6.2 of architecture-review-remediation-plan).
 *
 * Split out from `logger.ts` per PV-12 (SRP) — the file previously mixed
 * 3 concerns (factory, warnOnce, request log). This module owns ONLY the
 * `logRequest` flow + the devtools broadcast best-effort forwarder.
 *
 * Public API surface is unchanged — `logger.ts` re-exports `logRequest`
 * + `RequestLog` + `LoggerFn` for backward compat.
 */

export interface RequestLog {
  level: string
  method: string
  url: string
  status: number
  duration: number
  requestId: string
  timestamp: string
}

export type LoggerFn = (log: RequestLog) => void

const defaultLoggerFn: LoggerFn = (log) => {
  // eslint-disable-next-line no-console -- request-log default output IS the contract
  console.log(JSON.stringify(log))
}

export function logRequest(
  info: Omit<RequestLog, 'level' | 'timestamp'>,
  customLogger?: LoggerFn,
): void {
  const log: RequestLog = {
    level: 'info',
    ...info,
    timestamp: new Date().toISOString(),
  }
  const logger = customLogger ?? defaultLoggerFn
  logger(log)
  // T2.1 — also broadcast to devtools (no-op in prod / when no dev server).
  broadcastRequestToDevtools(info)
}

/**
 * T2.1 — Forward a request record to the devtools UI. Lazy import keeps
 * this module dep-free for prod; broadcast.ts internally guards on
 * `globalThis.__theoViteHotServer`.
 */
function randomRequestId(): string {
  // eslint-disable-next-line sonarjs/pseudo-random -- non-secret correlation id for devtools UI
  return `req-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`
}

function broadcastRequestToDevtools(info: Omit<RequestLog, 'level' | 'timestamp'>): void {
  // T2.1 forwarder. Errors here must not propagate.
  void import('../../devtools/server-side/broadcast.js')
    .then(({ broadcastRequest }) => {
      broadcastRequest({
        id: randomRequestId(),
        traceId: info.requestId,
        method: info.method,
        path: info.url,
        status: info.status,
        durationMs: info.duration,
        startedAt: Date.now() - info.duration,
      })
    })
    .catch(() => {
      // No-op: devtools forwarding is best-effort.
    })
}
