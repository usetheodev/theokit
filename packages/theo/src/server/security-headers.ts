import type { ServerResponse } from 'node:http'

/**
 * Phase 6 — Default Security Headers (D4 / EC-2).
 *
 * Per-response security baseline. The framework applies these BEFORE the
 * route handler runs so a handler can still override via `res.setHeader`.
 *
 * EC-2 backward-compatibility: CSP ships in `report-only` mode by default
 * for 0.2.0. Existing apps with inline scripts or third-party CDN scripts
 * keep working but consumers see violation reports via their CSP report
 * collector (or browser DevTools). 0.3.0 will flip the default to
 * `enforce` after a release of visibility.
 */

/**
 * Default Content-Security-Policy. Conservative-but-not-paralyzing:
 *
 *   - default-src 'self'              — every fetch falls back to same-origin
 *   - script-src 'self' 'unsafe-inline' — allows the inline hydration data
 *                                         script the framework emits during
 *                                         SSR. 0.3.0 will tighten this with
 *                                         a per-request nonce.
 *   - style-src 'self' 'unsafe-inline' — Tailwind + TheoUI use style attrs
 *                                         in animation directives
 *   - img-src 'self' data: blob:      — supports inline data URIs, blobs
 *                                         from canvas exports
 *   - font-src 'self' data:           — Geist fonts inline-base64
 *   - connect-src 'self' ws: wss:     — WebSocket dev HMR + agent streams
 *   - frame-ancestors 'none'          — clickjacking defense
 */
export const DEFAULT_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' ws: wss:; " +
  "frame-ancestors 'none'"

export type CspMode = 'enforce' | 'report-only' | 'off'

export interface SecurityHeadersConfig {
  /**
   * Custom CSP policy string. When set, replaces the default verbatim.
   * Pass `false` to disable CSP entirely (alias for `cspMode: 'off'`).
   */
  csp?: string | false
  /**
   * Enforcement mode for CSP. Default `report-only` for 0.2.0 (EC-2).
   * 0.3.0 will default to `enforce`.
   */
  cspMode?: CspMode
  /**
   * Strict-Transport-Security value. Defaults to
   * `max-age=31536000; includeSubDomains` in production. Pass `false` to
   * suppress (e.g. internal LANs without TLS).
   */
  hsts?: string | false
  /** X-Frame-Options. Default DENY. */
  frameOptions?: 'DENY' | 'SAMEORIGIN'
  /** X-Content-Type-Options. Default `nosniff`. */
  contentTypeOptions?: 'nosniff'
  /** Referrer-Policy. Default `strict-origin-when-cross-origin`. */
  referrerPolicy?: string
}

export interface SecurityEnv {
  production: boolean
}

const DEFAULT_HSTS = 'max-age=31536000; includeSubDomains'

/**
 * Build the security headers map for a given config + env. Pure function —
 * returned object can be inspected, logged, or applied to a response.
 */
export function buildSecurityHeaders(
  config: SecurityHeadersConfig,
  env: SecurityEnv,
): Record<string, string> {
  const out: Record<string, string> = {}

  // CSP — handle the four shapes:
  //   csp: false             → opt out
  //   cspMode: 'off'         → opt out
  //   cspMode: 'enforce'     → Content-Security-Policy
  //   cspMode: 'report-only' (default) → Content-Security-Policy-Report-Only
  const cspDisabled = config.csp === false || config.cspMode === 'off'
  if (!cspDisabled) {
    const policy = typeof config.csp === 'string' ? config.csp : DEFAULT_CSP
    const mode: CspMode = config.cspMode ?? 'report-only'
    if (mode === 'enforce') {
      out['Content-Security-Policy'] = policy
    } else {
      out['Content-Security-Policy-Report-Only'] = policy
    }
  }

  // X-Frame-Options
  out['X-Frame-Options'] = config.frameOptions ?? 'DENY'

  // X-Content-Type-Options
  out['X-Content-Type-Options'] = config.contentTypeOptions ?? 'nosniff'

  // Referrer-Policy
  out['Referrer-Policy'] = config.referrerPolicy ?? 'strict-origin-when-cross-origin'

  // HSTS — production only, suppressible via hsts: false
  if (env.production && config.hsts !== false) {
    out['Strict-Transport-Security'] = typeof config.hsts === 'string' ? config.hsts : DEFAULT_HSTS
  }

  return out
}

/**
 * Apply security headers to a Node ServerResponse. Called by the
 * api-middleware before the route handler runs. The handler can override
 * any header via `res.setHeader()` — last write wins by Node convention.
 */
export function applySecurityHeaders(
  res: ServerResponse,
  config: SecurityHeadersConfig,
  env: SecurityEnv,
): void {
  const headers = buildSecurityHeaders(config, env)
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
}
