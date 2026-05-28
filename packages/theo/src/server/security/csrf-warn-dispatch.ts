/**
 * Canonical CSRF warn dispatcher (T3.3 of architecture-review-remediation-plan).
 *
 * Consolidates the duplicated `warn: (payload) => { warnOnce(...) }` closure
 * that previously appeared in both `http/execute.ts` and
 * `http/action-execute.ts`. Resolves PV-10 (DRY).
 *
 * `warnOnce` dedupes by `event:method:path` so a request loop with 1000 POSTs
 * doesn't flood logs with identical warnings. Apps grep for `event":"csrf.warn"`
 * (stable event shape — see [[enforcement-cutover.md]]).
 */
import { warnOnce } from '../observability/logger.js'

export interface CsrfWarnPayload {
  event: string
  method: string
  path?: string
  reason: string
  code?: string
  docsUrl?: string
  warnOnce?: boolean
}

/**
 * Build the warn callback that `enforceCsrf` invokes for soft-mode warnings.
 * Returned function is suitable for the `warn` field of `enforceCsrf`'s options.
 */
export function dispatchCsrfWarn(payload: CsrfWarnPayload): void {
  const key = `${payload.event}:${payload.method}:${payload.path ?? ''}`
  warnOnce(key, payload as unknown as Record<string, unknown>)
}
