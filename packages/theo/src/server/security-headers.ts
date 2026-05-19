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
 *   - script-src 'self'               — T6.1 (0.3.0): `'unsafe-inline'`
 *                                         dropped. The SSR pipeline issues a
 *                                         per-request nonce that REPLACES
 *                                         this directive at runtime
 *                                         (`'nonce-<token>'`). For static /
 *                                         non-SSR contexts where no nonce is
 *                                         available, the policy is strict-
 *                                         no-inline — user inline scripts
 *                                         must be migrated to external
 *                                         `<script src="...">` or threaded
 *                                         through `ctx.nonce`.
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
  "script-src 'self'; " +
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

/**
 * T4.1 — Per-request options passed by the SSR pipeline.
 *
 * - `nonce`: when set, the framework substitutes the `'unsafe-inline'`
 *   token in `script-src` with `'nonce-<nonce>'`. EC-3 forces
 *   `Cache-Control: private, no-store` so a CDN cannot cache the HTML
 *   (carrying one nonce) and re-serve it with a freshly-generated CSP
 *   header (carrying a different nonce).
 * - `prerender`: when true, the nonce is IGNORED. Prerendered HTML is
 *   generated at build time with no nonce in the script tags; mixing a
 *   runtime nonce in the header would block every script. EC-4.
 */
export interface SecurityHeadersOptions {
  nonce?: string
  prerender?: boolean
}

const DEFAULT_HSTS = 'max-age=31536000; includeSubDomains'

/**
 * Apply a nonce to the script-src directive of an existing CSP policy
 * string. Replaces `'unsafe-inline'` (if present) with `'nonce-<value>'`;
 * otherwise appends the nonce directive to the script-src line.
 */
function applyNonceToCsp(policy: string, nonce: string): string {
  return policy
    .split(';')
    .map((directive) => {
      const trimmed = directive.trim()
      if (!trimmed.startsWith('script-src')) return directive
      if (trimmed.includes("'unsafe-inline'")) {
        return directive.replace("'unsafe-inline'", `'nonce-${nonce}'`)
      }
      return `${directive} 'nonce-${nonce}'`
    })
    .join(';')
}

/**
 * Build the security headers map for a given config + env. Pure function —
 * returned object can be inspected, logged, or applied to a response.
 */
export function buildSecurityHeaders(
  config: SecurityHeadersConfig,
  env: SecurityEnv,
  options: SecurityHeadersOptions = {},
): Record<string, string> {
  const out: Record<string, string> = {}

  // EC-4: prerendered routes must NOT receive a nonce — the build-time
  // HTML carries no nonce, so a runtime nonce would mismatch.
  const effectiveNonce = options.prerender ? undefined : options.nonce

  // CSP — handle the four shapes:
  //   csp: false             → opt out
  //   cspMode: 'off'         → opt out
  //   cspMode: 'enforce' (T6.1 default for 0.3.0) → Content-Security-Policy
  //   cspMode: 'report-only' (legacy 0.2.x) → Content-Security-Policy-Report-Only
  const cspDisabled = config.csp === false || config.cspMode === 'off'
  if (!cspDisabled) {
    let policy = typeof config.csp === 'string' ? config.csp : DEFAULT_CSP
    if (effectiveNonce) {
      policy = applyNonceToCsp(policy, effectiveNonce)
    }
    // T6.1 — default flipped from 'report-only' to 'enforce' for 0.3.0.
    const mode: CspMode = config.cspMode ?? 'enforce'
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

  // EC-3: when a nonce is in play, the response carries a one-shot CSP
  // header AND inline scripts in the HTML body. A CDN that caches the
  // HTML and proxies a fresh CSP per request would block every script
  // (nonces wouldn't match). Force no-store to prevent that class of
  // silent prod-only failure. Prerendered routes (which carry no nonce
  // by design — EC-4) are exempt; their HTML is meant to be cacheable.
  if (effectiveNonce) {
    out['Cache-Control'] = 'private, no-store'
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
  options: SecurityHeadersOptions = {},
): void {
  const headers = buildSecurityHeaders(config, env, options)
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
}
