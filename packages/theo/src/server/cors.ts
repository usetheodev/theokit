import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * T1.2 — CORS middleware.
 *
 * Single global middleware that runs FIRST in the request pipeline:
 *   CORS preflight → rate limit → CSRF → security headers → handler
 *
 * Preflight (`OPTIONS` with `Access-Control-Request-Method`) is handled
 * by `handlePreflight`, which short-circuits the response with 204 +
 * Access-Control-* headers.
 *
 * Non-preflight requests pass through; `applyHeaders` adds
 * `Access-Control-Allow-Origin` (echoing the request's Origin),
 * `Access-Control-Expose-Headers`, and `Access-Control-Allow-Credentials`.
 *
 * Per ADR D3: preflight responses are deterministic and only the matched
 * origin is echoed back (never `'*'` when credentials are enabled —
 * required by the CORS spec).
 */

export type CorsOrigin =
  | '*'
  | string
  | RegExp
  | ReadonlyArray<string | RegExp>
  | ((origin: string) => boolean)

export interface CorsConfig {
  origins: CorsOrigin
  methods?: ReadonlyArray<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'>
  allowedHeaders?: ReadonlyArray<string>
  exposedHeaders?: ReadonlyArray<string>
  credentials?: boolean
  maxAge?: number
}

export interface CorsHandler {
  handlePreflight(req: IncomingMessage, res: ServerResponse): boolean
  applyHeaders(req: IncomingMessage, res: ServerResponse): void
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const
const DEFAULT_ALLOWED_HEADERS = ['Content-Type', 'X-Theo-Action', 'Authorization'] as const
const DEFAULT_MAX_AGE = 600

/**
 * Read the request Origin header. Per Node typing, it can be a string,
 * string[] (proxy doubled), or undefined. We take the FIRST non-empty
 * value (consistent with `csrf.ts:121-122`).
 */
function readOrigin(req: IncomingMessage): string | undefined {
  const raw = req.headers.origin
  if (!raw) return undefined
  if (Array.isArray(raw)) {
    return raw.find((v) => typeof v === 'string' && v.length > 0)
  }
  return raw
}

/**
 * Test whether `origin` is allowed by `allowed`. Pure function — no I/O.
 *
 * EC-8: callback variants that throw are fail-closed (deny). Without
 * this, a transient datastore outage would silently widen CORS during
 * the failure window.
 */
export function matchesOrigin(origin: string, allowed: CorsOrigin): boolean {
  if (allowed === '*') return true
  if (typeof allowed === 'string') return origin === allowed
  if (allowed instanceof RegExp) {
    allowed.lastIndex = 0
    return allowed.test(origin)
  }
  if (Array.isArray(allowed)) {
    for (const entry of allowed) {
      if (typeof entry === 'string' && origin === entry) return true
      if (entry instanceof RegExp) {
        entry.lastIndex = 0
        if (entry.test(origin)) return true
      }
    }
    return false
  }
  if (typeof allowed === 'function') {
    // EC-8: fail-closed on any throw
    try {
      return allowed(origin) === true
    } catch {
      return false
    }
  }
  return false
}

export function createCorsHandler(config: CorsConfig): CorsHandler {
  const methods = (config.methods ?? DEFAULT_METHODS).slice()
  const allowedHeaders = (config.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS).slice()
  const maxAge = String(config.maxAge ?? DEFAULT_MAX_AGE)
  const credentials = config.credentials === true

  return {
    handlePreflight(req, res) {
      if (req.method !== 'OPTIONS') return false
      const acMethod = req.headers['access-control-request-method']
      if (!acMethod) return false
      const origin = readOrigin(req)
      if (!origin) return false

      if (!matchesOrigin(origin, config.origins)) {
        res.statusCode = 403
        res.end()
        return true
      }

      // Echo the matched origin (NEVER '*' when credentials are enabled —
      // browsers reject wildcard responses with credentials per CORS spec).
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Methods', methods.join(', '))
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '))
      res.setHeader('Access-Control-Max-Age', maxAge)
      // Mark the response as origin-varying so caches don't poison
      res.setHeader('Vary', 'Origin')
      if (credentials) res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.statusCode = 204
      res.end()
      return true
    },

    applyHeaders(req, res) {
      const origin = readOrigin(req)
      if (!origin) return
      if (!matchesOrigin(origin, config.origins)) return

      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      if (credentials) res.setHeader('Access-Control-Allow-Credentials', 'true')
      if (config.exposedHeaders && config.exposedHeaders.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
      }
    },
  }
}
