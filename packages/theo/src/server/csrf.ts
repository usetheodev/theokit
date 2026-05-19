import type { IncomingMessage } from 'node:http'

/**
 * CSRF enforcement mode.
 *
 * - `off`     — skip CSRF entirely. Use only when you have another defense
 *               (e.g. you don't ship session cookies, all auth is bearer).
 * - `warn`    — log a structured warning when the check would fail, but
 *               still serve the request. Default for 0.2.0. Migration mode.
 * - `strict`  — reject failing requests with 403 + code `CSRF_INVALID`.
 *               Will become the default in 0.3.0.
 */
export type CsrfMode = 'off' | 'warn' | 'strict'

/**
 * Per-request structured logger surface. Only `warn` is used by enforceCsrf;
 * we don't require a full Logger here so callers can pass a mock or the
 * console directly.
 */
export interface CsrfLogger {
  warn: (payload: CsrfWarnPayload) => void
  /** Optional path the request was destined for — used for log correlation. */
  path?: string
}

export interface CsrfWarnPayload {
  event: 'csrf.warn'
  method: string
  path: string | undefined
  reason: string
}

export function validateCsrf(
  req: IncomingMessage,
): { valid: true } | { valid: false; reason: string } {
  // 1. Custom header must be present (primary defense — simple form posts
  //    cannot set custom headers, browsers gate via CORS preflight)
  if (req.headers['x-theo-action'] !== '1') {
    return { valid: false, reason: 'Missing X-Theo-Action header' }
  }

  // 2. Origin matching (secondary defense)
  const origin = req.headers['origin']
  if (!origin) {
    // Browsers omit Origin for same-origin requests — treat as valid
    return { valid: true }
  }

  const host = req.headers['host']
  if (!host) {
    return { valid: true }
  }

  try {
    const originStr = Array.isArray(origin) ? origin[0] : origin
    const hostStr = Array.isArray(host) ? host[0] : host
    if (!originStr || !hostStr) return { valid: true }
    const originHost = new URL(originStr).host
    if (originHost !== hostStr) {
      return { valid: false, reason: `Origin ${originStr} does not match host ${hostStr}` }
    }
  } catch {
    return { valid: false, reason: `Invalid origin: ${String(origin)}` }
  }

  return { valid: true }
}

/**
 * Enforce CSRF policy with mode-aware behavior. Wrapper over `validateCsrf`
 * that turns the boolean valid/invalid into a request-level allow decision,
 * gated by mode + structured warning in warn mode.
 *
 * Phase 5 — CSRF warn-first (EC-1). See plan docs/plans/nextjs-maturity-plan.md.
 */
export function enforceCsrf(
  req: IncomingMessage,
  mode: CsrfMode,
  logger?: CsrfLogger,
): { allow: boolean; reason?: string } {
  if (mode === 'off') {
    return { allow: true }
  }

  const check = validateCsrf(req)
  if (check.valid) {
    return { allow: true }
  }

  if (mode === 'warn') {
    // T2.1: emit via warnOnce by default — callers can override via the
    // injected logger.warn (tests, custom log routers).
    logger?.warn({
      event: 'csrf.warn',
      method: req.method ?? 'UNKNOWN',
      path: logger.path,
      reason: check.reason,
    })
    return { allow: true, reason: check.reason }
  }

  // strict
  return { allow: false, reason: check.reason }
}
