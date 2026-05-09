import type { IncomingMessage } from 'node:http'

export interface RateLimitConfig {
  windowMs: number
  max: number
}

export interface RateLimitResult {
  limited: boolean
  headers: Record<string, string>
}

interface StoreEntry {
  count: number
  resetAt: number
}

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, StoreEntry>()
  let checkCount = 0

  return function checkRateLimit(req: IncomingMessage): RateLimitResult {
    const key = req.socket?.remoteAddress ?? 'unknown'
    const now = Date.now()

    // Periodic cleanup (EC-1): every 1000 checks, remove expired entries
    if (++checkCount % 1000 === 0) {
      for (const [k, v] of store) {
        if (v.resetAt < now) store.delete(k)
      }
    }

    const entry = store.get(key)

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + config.windowMs })
      return {
        limited: false,
        headers: {
          'X-RateLimit-Limit': String(config.max),
          'X-RateLimit-Remaining': String(config.max - 1),
        },
      }
    }

    entry.count++

    if (entry.count > config.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      return {
        limited: true,
        headers: {
          'X-RateLimit-Limit': String(config.max),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(retryAfter),
        },
      }
    }

    return {
      limited: false,
      headers: {
        'X-RateLimit-Limit': String(config.max),
        'X-RateLimit-Remaining': String(config.max - entry.count),
      },
    }
  }
}
