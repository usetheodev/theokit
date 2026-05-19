/**
 * T2.1 — RateLimitStore interface.
 *
 * Pluggable backend for the rate limiter. The default `InMemoryStore`
 * preserves current single-instance behavior. Multi-instance deployments
 * (TheoCloud canary, K8s replicas) opt in to a distributed adapter
 * (Redis, Cloudflare KV) without bloating single-instance apps.
 *
 * Contract per ADR D1:
 *   - `incr` is atomic — concurrent calls for the same key both observe
 *     the same `resetAt` and increment count by 1.
 *   - `get` returns `null` for expired entries (not just absent — checks
 *     `now > resetAt`).
 *   - `reset` removes the key entirely; next `incr` creates fresh.
 *
 * Async signature is honest about Redis adapters even though in-memory
 * implementation is synchronous. Callers MUST await.
 */

export interface RateLimitState {
  /** Number of requests counted in the current window. */
  count: number
  /** Absolute timestamp (ms since epoch) when this window expires. */
  resetAt: number
}

export interface RateLimitStore {
  /**
   * Atomic increment-and-get. If the key is missing OR the previous
   * window expired (`now >= resetAt`), create with `count=1, resetAt=now+windowMs`.
   * Otherwise increment count by 1, preserving the original resetAt.
   */
  incr(key: string, windowMs: number): Promise<RateLimitState>

  /** Read current state. Returns `null` for missing or expired entries. */
  get(key: string): Promise<RateLimitState | null>

  /** Remove a key. Used by login throttling on success (T6.1). */
  reset(key: string): Promise<void>
}

/**
 * Default in-memory store. Backed by `Map<string, RateLimitState>`.
 *
 * GC: every 1000 `incr` calls, expired entries are removed. Pathological
 * key explosion is bounded by `MAX_ENTRIES` (LRU-evict oldest insertion).
 *
 * Single-thread by virtue of Node's event loop — `incr` is atomic at the
 * JavaScript level (no preemption between Map.get and Map.set).
 */
export class InMemoryStore implements RateLimitStore {
  private store = new Map<string, RateLimitState>()
  private checkCount = 0
  /** Bound the map to prevent unbounded growth from pathological inputs. */
  static readonly MAX_ENTRIES = 100_000

  /**
   * Synchronous fast-path used by the legacy sync `createRateLimiter`
   * surface (`api-middleware.ts` is sync). The async `incr` delegates to
   * this for in-memory; external adapters override `incr` directly.
   */
  incrSync(key: string, windowMs: number): RateLimitState {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error(`InMemoryStore.incr: windowMs must be a positive finite number (got ${windowMs})`)
    }
    const now = Date.now()

    // Periodic GC of expired entries
    if (++this.checkCount % 1000 === 0) {
      for (const [k, v] of this.store) {
        if (v.resetAt <= now) this.store.delete(k)
      }
    }

    // Bounded LRU-ish: when over cap, drop oldest insertion (Map keeps insertion order)
    if (this.store.size >= InMemoryStore.MAX_ENTRIES) {
      const first = this.store.keys().next().value as string | undefined
      if (first !== undefined) this.store.delete(first)
    }

    const entry = this.store.get(key)
    if (!entry || now >= entry.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs }
      this.store.set(key, fresh)
      return { ...fresh }
    }
    entry.count++
    return { count: entry.count, resetAt: entry.resetAt }
  }

  async incr(key: string, windowMs: number): Promise<RateLimitState> {
    return this.incrSync(key, windowMs)
  }

  async get(key: string): Promise<RateLimitState | null> {
    const now = Date.now()
    const entry = this.store.get(key)
    if (!entry) return null
    if (now >= entry.resetAt) return null
    return { count: entry.count, resetAt: entry.resetAt }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }
}
