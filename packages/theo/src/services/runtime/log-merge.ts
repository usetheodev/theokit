/**
 * Log merger (T2.3).
 *
 * Combines stdout/stderr from multiple polyglot services into TheoKit's
 * dev terminal, prefixed with `[service-name]`. Parses JSON-line logs
 * (ADR-0015 invariant #5) for pretty-printing; falls back to raw line on
 * non-JSON.
 *
 * Pure / synchronous. The Vite plugin (T2.1) wires this as the `onLog`
 * callback passed to spawnServices.
 */

interface LogEntry {
  level?: string
  message?: string
  timestamp?: string
  traceparent?: string
  service?: string
}

export interface LogMergerOptions {
  write: (s: string) => void
}

export interface LogMerger {
  onLog: (service: string, stream: 'stdout' | 'stderr', chunk: string) => void
}

/**
 * Try to parse a log line as JSON. Returns parsed object on success,
 * undefined on failure (will fall back to raw rendering).
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function tryParseJson(line: string): LogEntry | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isPlainObject(parsed)) return undefined
    const entry: LogEntry = {}
    if (typeof parsed.level === 'string') entry.level = parsed.level
    if (typeof parsed.message === 'string') entry.message = parsed.message
    if (typeof parsed.timestamp === 'string') entry.timestamp = parsed.timestamp
    if (typeof parsed.traceparent === 'string') entry.traceparent = parsed.traceparent
    if (typeof parsed.service === 'string') entry.service = parsed.service
    return entry
  } catch {
    return undefined
  }
}

function renderLine(
  service: string,
  stream: 'stdout' | 'stderr',
  line: string,
  write: (s: string) => void,
): void {
  if (line.length === 0) return

  const prefix = `[${service}]`
  const streamMarker = stream === 'stderr' ? '!' : ' '

  const parsed = tryParseJson(line)
  if (parsed) {
    const level = parsed.level ?? 'info'
    const msg = parsed.message ?? line
    write(`${prefix}${streamMarker}${level.toUpperCase()} ${msg}\n`)
    return
  }

  write(`${prefix}${streamMarker}${line}\n`)
}

export function createLogMerger(options: LogMergerOptions): LogMerger {
  return {
    onLog(service, stream, chunk) {
      // Multi-line chunks: split by \n and render each
      const lines = chunk.split('\n')
      for (const line of lines) {
        renderLine(service, stream, line, options.write)
      }
    },
  }
}
