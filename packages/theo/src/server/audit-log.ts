/**
 * T4.1 — Audit logging interface + default JSON stdout sink.
 *
 * Per ADR D4: define the interface; ship a zero-dep default; reserve
 * adapter shapes for Postgres, File, OpenTelemetry, Sentry as follow-up
 * packages. Persistence has heavy deps (`pg`, `better-sqlite3`); we
 * keep core dep-free and let users opt in.
 *
 * Compatibility:
 *   - Node / Bun / Deno / Vercel — console.log is sync, captured.
 *   - Edge runtimes (CF Workers, Vercel Edge) — console.log is captured
 *     but may be rate-limited by the platform. For high-volume edge audit,
 *     implement a custom sink writing to a queue / HTTP endpoint.
 */

export interface AuditEvent {
  /** Domain-qualified verb. Convention: `<domain>.<verb>` (e.g. csrf.warn, session.rotated). */
  action: string
  /** Who triggered the event. Anonymous = no auth at time of event. */
  actor?: { type: 'user' | 'system' | 'anonymous'; id?: string }
  /** What was operated on (optional). */
  resource?: { type: string; id?: string }
  /** Arbitrary event-specific metadata. JSON-serializable. */
  metadata?: Record<string, unknown>
  /** ISO 8601 timestamp. If absent, sink fills in `new Date().toISOString()`. */
  timestamp?: string
  /** Optional trace id (populated by middleware from `x-trace-id`). */
  traceId?: string
}

export interface AuditLogger {
  log(event: AuditEvent): void | Promise<void>
}

/**
 * Default sink: one JSON line per event to stdout. Sync. Never throws.
 *
 * EC: circular refs / BigInt values fall back to a placeholder line so
 * the event is still observable (action + traceId) without crashing the
 * request lifecycle.
 */
export class JsonStdoutSink implements AuditLogger {
  log(event: AuditEvent): void {
    const enriched = {
      level: 'audit' as const,
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    }
    try {
      console.log(JSON.stringify(enriched, jsonReplacer))
    } catch {
      console.log(
        `{"level":"audit","action":${JSON.stringify(event.action)},"timestamp":${JSON.stringify(enriched.timestamp)},"note":"payload could not be serialized"}`,
      )
    }
  }
}

/**
 * Replacer that walks BigInt → string. Circular ref handling is via the
 * outer try/catch (JSON.stringify throws TypeError on cycles; we drop to
 * the fallback line). We don't implement custom cycle-breaking walker
 * because the audit payload is meant to be JSON — if user metadata has
 * a cycle, the right answer is to fix the caller, not silently lose
 * the structure.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  return value
}

/**
 * No-op logger. Returned when `config.audit` is unset. Zero overhead;
 * framework wiring sites null-check before calling.
 */
export function createNoOpLogger(): AuditLogger {
  return {
    log() {
      // intentionally empty
    },
  }
}

/**
 * T4.2 — Safe-emit wrapper. Used by framework wiring sites (csrf.ts,
 * rate-limit.ts, session.ts) so a logger throw NEVER propagates into
 * the request handler.
 */
export function safeAudit(logger: AuditLogger | undefined, event: AuditEvent): void {
  if (!logger) return
  try {
    const r = logger.log(event)
    // Discard the Promise — async sinks are fire-and-forget by design.
    if (r && typeof (r as Promise<void>).then === 'function') {
      (r as Promise<void>).catch(() => {
        // swallow async sink failures — audit must never crash the request
      })
    }
  } catch {
    // swallow sync sink failures — audit must never crash the request
  }
}
