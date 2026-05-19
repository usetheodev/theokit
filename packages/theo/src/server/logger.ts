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
    debug: (msg, ctx) => log('debug', msg, ctx),
    info: (msg, ctx) => log('info', msg, ctx),
    warn: (msg, ctx) => log('warn', msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
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
 * Per-key dedup state. Module-scoped Set; reset per-process at boot.
 * For long-running prod with thousands of unique keys, document the
 * trade-off; future enhancement could be a TTL'd Map.
 */
const _warnOnceSeen = new Set<string>()

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
}

// --- Backward compat ---

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
}
