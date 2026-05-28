// --- Types ---

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface StructuredLog {
  level: string
  msg: string
  timestamp: string
  [key: string]: unknown
}

export interface TheoLogger {
  debug(msg: string, context?: Record<string, unknown>): void
  info(msg: string, context?: Record<string, unknown>): void
  warn(msg: string, context?: Record<string, unknown>): void
  error(msg: string, context?: Record<string, unknown>): void
  child(context: Record<string, unknown>): TheoLogger
}

// --- Level filtering ---

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

function shouldLog(msgLevel: string, configLevel: string): boolean {
  return LEVEL_ORDER[msgLevel] >= LEVEL_ORDER[configLevel]
}

// --- Default output ---

function defaultOutput(log: StructuredLog): void {
  // eslint-disable-next-line no-console -- structured logger output IS the contract here
  console.log(JSON.stringify(log))
}

// --- Factory ---

export function createLogger(options?: {
  level?: LogLevel
  output?: (log: StructuredLog) => void
  context?: Record<string, unknown>
}): TheoLogger {
  const level = options?.level ?? 'info'
  const output = options?.output ?? defaultOutput
  const baseContext = options?.context ?? {}

  function log(msgLevel: string, msg: string, context?: Record<string, unknown>): void {
    if (!shouldLog(msgLevel, level)) return

    const entry: StructuredLog = {
      level: msgLevel,
      msg,
      timestamp: new Date().toISOString(),
      ...baseContext,
      ...context,
    }

    // Serialize Error objects to stack string
    if (entry.error instanceof Error) {
      entry.error = entry.error.stack ?? entry.error.message
    }

    output(entry)
  }

  return {
    debug: (msg, ctx) => {
      log('debug', msg, ctx)
    },
    info: (msg, ctx) => {
      log('info', msg, ctx)
    },
    warn: (msg, ctx) => {
      log('warn', msg, ctx)
    },
    error: (msg, ctx) => {
      log('error', msg, ctx)
    },
    child(ctx) {
      return createLogger({
        level,
        output,
        context: { ...baseContext, ...ctx },
      })
    },
  }
}

// --- warnOnce (T2.1) ---

/**
 * Per-key dedup state. Module-scoped — reset per-process at boot.
 *
 * CR-011 fix: previous implementation used an unbounded `Set` which grew
 * forever in long-running prod processes with high-cardinality keys
 * (e.g. dynamic path segments). The bound below uses LRU-by-insertion:
 * when the Set hits `MAX_SEEN`, the OLDEST key is evicted. Subsequent
 * occurrences of that key will warn ONCE more — acceptable in exchange
 * for bounded memory.
 */
const _warnOnceSeen = new Set<string>()
const MAX_SEEN = 1024

/**
 * Reset internal state. Test-only export — do not call from production.
 */
export function _resetWarnOnceForTests(): void {
  _warnOnceSeen.clear()
}

/**
 * Emit a structured warning ONCE per key. Subsequent calls with the same
 * key are suppressed. Used for cutover-style warnings (e.g. CSRF warn)
 * that would otherwise flood logs under load.
 *
 * Convention: key is `<event>:<method>:<path>` — see callers in csrf.ts.
 *
 * EC-2: payload may contain circular references. Wrap `JSON.stringify`
 * in try/catch so a malformed payload doesn't crash the request handler.
 */
export function warnOnce(key: string, payload: Record<string, unknown>): void {
  if (_warnOnceSeen.has(key)) return
  // CR-011: bounded LRU. Evict oldest insertion when at capacity.
  if (_warnOnceSeen.size >= MAX_SEEN) {
    const oldest = _warnOnceSeen.values().next().value
    if (oldest !== undefined) _warnOnceSeen.delete(oldest)
  }
  _warnOnceSeen.add(key)

  let line: string
  try {
    line = JSON.stringify({ ...payload, warnOnce: true })
  } catch {
    // EC-2 fallback — preserve the key for grep-ability even when payload
    // can't serialize (e.g., circular references, BigInt, etc.).
    line = `[warnOnce] ${key} — (payload could not be serialized)`
  }
  console.warn(line)

  // T2.1 — also broadcast to devtools (no-op in prod / when no dev server).
  // Imported lazily to keep logger.ts dependency-free for non-dev contexts;
  // broadcastToDevtools internally guards on globalThis.__theoViteHotServer.
  broadcastWarnOnceToDevtools(key, payload)
}

/**
 * T2.1 — Forward a warnOnce payload to the devtools UI. Recognizes the
 * canonical CSRF warn shape and dispatches as 'csrf.warn'; otherwise
 * falls back to a generic 'error' broadcast.
 *
 * No-op when:
 *  - globalThis.__theoViteHotServer is undefined (prod / no dev server)
 *  - any error occurs (default-deny via broadcastToDevtools' try/catch)
 */
function payloadField(payload: Record<string, unknown>, key: string, fallback = ''): string {
  const value = payload[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function randomDevtoolsId(): string {
  // eslint-disable-next-line sonarjs/pseudo-random -- non-secret correlation id for devtools UI
  return `warn-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`
}

function broadcastWarnOnceToDevtools(key: string, payload: Record<string, unknown>): void {
  // CR-021: removed dead `void key` statement.
  // T2.1 forwarder. Errors here must not propagate (default-deny).
  void import('../../devtools/server-side/broadcast.js')
    .then(({ broadcastCsrfWarn, broadcastError }) => {
      if (
        payload.event === 'csrf.warn' &&
        typeof payload.code === 'string' &&
        typeof payload.docsUrl === 'string'
      ) {
        broadcastCsrfWarn({
          event: 'csrf.warn',
          code: payload.code,
          docsUrl: payload.docsUrl,
          method: payloadField(payload, 'method'),
          path: payloadField(payload, 'path'),
          reason: payloadField(payload, 'reason'),
        })
      } else {
        broadcastError({
          id: randomDevtoolsId(),
          type: 'console',
          message: payloadField(payload, 'event', key),
          timestamp: Date.now(),
        })
      }
    })
    .catch(() => {
      // No-op: devtools forwarding is best-effort.
    })
}

// --- Backward compat re-exports ---
//
// T6.2 (PV-12 SRP): `logRequest` + `RequestLog` + `LoggerFn` moved to a
// dedicated `request-log.ts`. Re-exported here so consumers importing
// from `theokit/server` see no change.

export { logRequest } from './request-log.js'
export type { RequestLog, LoggerFn } from './request-log.js'
