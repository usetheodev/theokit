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
