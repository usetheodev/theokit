import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

import { InMemoryStore, type RateLimitStore } from './rate-limit-store.js'
import type { RateLimitConfig, RateLimitResult } from './rate-limit.js'

/**
 * T2.2 — Per-route + per-user rate limiting.
 *
 * Layered on top of `rate-limit-store.ts`. The route map allows
 * declarative policies ("strict /api/login, loose everything else")
 * driven by config, not handler-decorated. `keyBy` selects what
 * identifier the limiter buckets on.
 *
 * ADR D2: per-route via path matching, NOT per-handler decorator.
 * Operators can tune policies without touching route definitions.
 */

export type KeyByMode = 'ip' | 'session' | 'user' | ((req: IncomingMessage) => string)

export interface RouteRateLimitConfig {
  /** Fallback config used when no per-route entry matches. */
  default?: RateLimitConfig
  /** Map of path pattern → config. Exact-string keys (RegExp via API). */
  routes?: Record<string, RateLimitConfig>
  /** Same as `routes` but each entry is a [pattern, config] tuple, RegExp allowed. */
  routePatterns?: readonly [string | RegExp, RateLimitConfig][]
  /** Bucket identifier strategy. Default 'ip'. */
  keyBy?: KeyByMode
  /** Cookie name used by keyBy='session'. Defaults to 'theo_session'. */
  cookieName?: string
  /** Optional shared store (for multi-route correlation). Default per-limiter InMemoryStore. */
  store?: RateLimitStore
}

/**
 * Normalize a path for matching: strip query string, drop trailing slash
 * unless root. EC-5: `/api/login` and `/api/login/` collapse to the same
 * canonical form so attackers can't bypass strict limits.
 */
function normalizePath(input: string): string {
  const noQuery = input.split('?')[0]
  if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1)
  return noQuery
}

/**
 * Test whether `path` matches `pattern`. String patterns are compared
 * after trailing-slash normalization (EC-5). RegExp uses `.test` after
 * resetting `lastIndex` (defensive against `/g` flag).
 */
export function matchRoutePattern(path: string, pattern: string | RegExp): boolean {
  const canonical = normalizePath(path)
  if (typeof pattern === 'string') {
    return canonical === normalizePath(pattern)
  }
  pattern.lastIndex = 0
  return pattern.test(canonical)
}

/**
 * Hash a string with SHA-256 and return the first 16 base64url chars.
 * Used by `keyBy='session'` so the raw cookie value never lands in a
 * rate-limit key (which may flow into audit logs).
 */
function hashFragment(input: string): string {
  return createHash('sha256').update(input).digest('base64url').slice(0, 16)
}

/**
 * Read a cookie value by name from the `Cookie` header. Returns undefined
 * if absent. We do this inline (instead of importing from cookies.ts) to
 * keep rate-limit-per-route free of incidental deps.
 */
function readCookie(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie
  if (!raw || typeof raw !== 'string') return undefined
  for (const pair of raw.split(';')) {
    const [k, ...rest] = pair.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return undefined
}

/**
 * Build the rate-limit bucket key for the request based on `keyBy`.
 *
 * EC-6: session mode reads the configured `cookieName`. With the wrong
 * cookie name (e.g., default 'theo_session' but app uses 'app_session'),
 * we fall back to IP so anonymous users still get rate-limited rather
 * than sharing an empty bucket.
 */
export function deriveKey(req: IncomingMessage, keyBy: KeyByMode, cookieName: string): string {
  if (typeof keyBy === 'function') return keyBy(req)
  // `req.socket` is typed as always-present in Node typings, but in test
  // doubles (object literals without `socket`) it can be missing — the
  // optional chain keeps the fallback path reachable.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive for test doubles
  const ip = req.socket?.remoteAddress ?? 'unknown'
  switch (keyBy) {
    case 'session': {
      const cookie = readCookie(req, cookieName)
      return cookie ? `session:${hashFragment(cookie)}` : `ip:${ip}`
    }
    case 'user': {
      const userId = (req as unknown as { user?: { id?: string } }).user?.id
      return userId ? `user:${userId}` : `ip:${ip}`
    }
    case 'ip':
    default:
      return `ip:${ip}`
  }
}

/**
 * Per-route rate limiter factory. Returns a sync checker compatible with
 * the existing api-middleware shape.
 *
 * Backwards-compatibility (ADR D2): a flat `{ windowMs, max }` config is
 * accepted and treated as `default` (no per-route variants).
 */
export function createRouteRateLimiter(config: RouteRateLimitConfig | RateLimitConfig) {
  // Detect legacy flat shape
  const isFlat =
    'windowMs' in config && 'max' in config && !('default' in config) && !('routes' in config)
  const cfg: RouteRateLimitConfig = isFlat ? { default: config } : config

  const store = cfg.store ?? new InMemoryStore()
  // CR-005: validate store shape ONCE at construction. The previous
  // implementation ran `instanceof InMemoryStore` on every request and
  // threw at request-time if a non-InMemoryStore was passed — which
  // turned a clear config error into a runtime 500 on the first request.
  if (!(store instanceof InMemoryStore)) {
    throw new Error(
      'createRouteRateLimiter: async RateLimitStore implementations require a dedicated async middleware path. ' +
        'Use the InMemoryStore default for the sync façade.',
    )
  }
  const inMemoryStore = store
  const keyBy = cfg.keyBy ?? 'ip'
  const cookieName = cfg.cookieName ?? 'theo_session'

  // Build a pre-compiled list of (pattern, config) tuples for matching.
  const patternList: [string | RegExp, RateLimitConfig][] = []
  if (cfg.routes) {
    for (const [pattern, c] of Object.entries(cfg.routes)) patternList.push([pattern, c])
  }
  if (cfg.routePatterns) {
    for (const tuple of cfg.routePatterns) patternList.push(tuple)
  }

  return function checkRouteRateLimit(req: IncomingMessage): RateLimitResult {
    const url = req.url ?? ''
    let matched: RateLimitConfig | undefined
    for (const [pattern, c] of patternList) {
      if (matchRoutePattern(url, pattern)) {
        matched = c
        break
      }
    }
    const effective = matched ?? cfg.default
    if (!effective) {
      // No route match + no default → not limited.
      return { limited: false, headers: {} }
    }

    // Bucket key includes normalized path so /api/login and /api/login/
    // collapse to the same bucket (EC-5).
    const bucketSuffix = typeof matched === 'undefined' ? '*default*' : normalizePath(url)
    const key = `${deriveKey(req, keyBy, cookieName)}|${bucketSuffix}`
    const state = inMemoryStore.incrSync(key, effective.windowMs)

    if (state.count > effective.max) {
      const retryAfter = Math.ceil((state.resetAt - Date.now()) / 1000)
      return {
        limited: true,
        headers: {
          'X-RateLimit-Limit': String(effective.max),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(retryAfter),
        },
      }
    }
    return {
      limited: false,
      headers: {
        'X-RateLimit-Limit': String(effective.max),
        'X-RateLimit-Remaining': String(Math.max(0, effective.max - state.count)),
      },
    }
  }
}
