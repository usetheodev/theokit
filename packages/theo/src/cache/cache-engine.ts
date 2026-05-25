import { THEO_T_PREFIX } from './constants.js'
import type { CacheEntry, CacheStorageAdapter } from './storage-adapter.js'

export type CacheStatus = 'hit' | 'stale' | 'miss'

export interface CacheEngineOptions {
  storage: CacheStorageAdapter
  defaults?: {
    maxAge?: number
    swr?: number
    cacheVersion?: string
  }
  onError?: (err: unknown, ctx: { phase: 'get' | 'set' | 'revalidate'; key: string }) => void
}

export interface GetOrComputeOptions<T> {
  maxAge: number
  swr?: number
  tags?: string[]
  cacheVersion?: string
  transform?: (raw: T) => T
  validate?: (raw: T) => boolean
  /**
   * When `true`, the value is returned but NOT written to cache.
   * Used by route middleware to bypass cache for uncacheable responses
   * (Set-Cookie, oversized body, status >= 400 with cacheErrors=false).
   */
  skipCacheWhen?: (raw: T) => boolean
}

export interface CacheEngine {
  getOrCompute<T>(
    key: string,
    fn: () => Promise<T>,
    opts: GetOrComputeOptions<T>,
  ): Promise<{ value: T; status: CacheStatus }>

  /**
   * Public canonical cache read (T4.2 of architecture-review-remediation-plan,
   * PV-5 DRY consolidation). Returns the parsed value + status (`hit` | `stale`)
   * for callers that DON'T want to bind a loader function (e.g., HTTP route
   * middleware that may want to bypass on miss instead of running a loader).
   *
   * Returns undefined when:
   * - Entry not present in storage
   * - `opts.cacheVersion` mismatch with entry
   * - Body is not a JSON string (parse failed)
   * - `opts.validate` returns false (or throws — caller's onError invoked)
   * - Entry is fully expired (past maxAge + swr)
   */
  tryReadCached<T>(
    key: string,
    opts: { cacheVersion?: string; validate?: (v: T) => boolean },
  ): Promise<{ value: T; status: 'hit' | 'stale' } | undefined>

  set(key: string, entry: CacheEntry): Promise<void>
  invalidate(key: string): Promise<boolean>
  invalidateTag(tag: string): Promise<number>
  revalidatePath(path: string, type?: 'layout' | 'page'): Promise<number>

  /** Storage adapter passthrough (read-only access for diagnostics). */
  readonly storage: CacheStorageAdapter
}

/**
 * Build a cache engine wrapping a storage adapter.
 *
 * Implements:
 * - SWR (fresh / stale / expired branching) — Astro `memory-provider.ts:423`-style.
 * - In-flight dedupe via `Map<key, Promise>` — Next.js `pendingRevalidates` pattern.
 * - Tag-based invalidation via adapter's deleteByTag.
 * - Path-as-tag encoding (revalidatePath sugar) — Next.js `revalidate.ts:105`.
 *
 * EC-8: Math.max(0, age) guards clock skew.
 * EC-9: validate callback wrapped in try/catch.
 * EC-10: loader returning undefined skips cache write + warns once.
 *
 * NOTE on max-lines-per-function disable below: createCacheEngine is a factory
 * closure that owns the in-flight/bg/warned maps. Splitting would force the
 * helpers across modules and re-introduce the shared mutable state through
 * parameter lists.
 */
// eslint-disable-next-line max-lines-per-function
export function createCacheEngine(opts: CacheEngineOptions): CacheEngine {
  const { storage, onError } = opts
  const inFlight = new Map<string, Promise<unknown>>()
  const bgInFlight = new Set<string>()
  const undefinedLoaderWarned = new Set<string>()

  async function getOrCompute<T>(
    key: string,
    fn: () => Promise<T>,
    options: GetOrComputeOptions<T>,
  ): Promise<{ value: T; status: CacheStatus }> {
    // Dedupe: concurrent first-miss shares the loader promise
    const pending = inFlight.get(key)
    if (pending) {
      const value = (await pending) as T
      return { value, status: 'miss' }
    }

    // maxAge=0 → always miss, never cache
    if (options.maxAge === 0) {
      return claimAndRun(key, fn, options, /* skipWrite */ true)
    }

    // Atomically claim the in-flight slot BEFORE any await (dedupe race fix).
    return claimAndRun(key, fn, options, false)
  }

  /**
   * Claims the in-flight slot synchronously, then performs the get/loader work
   * inside. Concurrent callers awaiting the same key share this slot.
   */
  function claimAndRun<T>(
    key: string,
    fn: () => Promise<T>,
    options: GetOrComputeOptions<T>,
    skipWrite: boolean,
  ): Promise<{ value: T; status: CacheStatus }> {
    let resolveOuter!: (v: T) => void
    let rejectOuter!: (e: unknown) => void
    const outerPromise = new Promise<T>((resolve, reject) => {
      resolveOuter = resolve
      rejectOuter = reject
    })
    // Prevent unhandled-rejection when no concurrent awaiter exists
    void outerPromise.catch(() => {
      /* swallow — the leader handles via work promise */
    })
    inFlight.set(key, outerPromise)

    const work = (async (): Promise<{ value: T; status: CacheStatus }> => {
      try {
        if (!skipWrite) {
          const cached = await tryReadCached<T>(key, options)
          if (cached) {
            // HIT or STALE — value already resolved
            resolveOuter(cached.value)
            if (cached.status === 'stale') {
              scheduleBackgroundRevalidate(key, fn, options)
            }
            return cached
          }
        }
        // Miss path: run loader
        const value = await runLoader(key, fn, options, skipWrite)
        resolveOuter(value)
        return { value, status: 'miss' as const }
      } catch (err) {
        rejectOuter(err)
        throw err
      } finally {
        inFlight.delete(key)
      }
    })()

    return work
  }

  // One inline staleness machine; each guard (version check, parse, validate,
  // age, swr window) is one short branch. Extracting per-step would dilute,
  // not clarify.
  // eslint-disable-next-line complexity
  async function tryReadCached<T>(
    key: string,
    options: GetOrComputeOptions<T>,
  ): Promise<{ value: T; status: CacheStatus } | undefined> {
    let entry: CacheEntry | undefined
    try {
      entry = await storage.get(key)
    } catch (err) {
      onError?.(err, { phase: 'get', key })
      return undefined
    }
    if (!entry) return undefined
    if (options.cacheVersion !== undefined && entry.cacheVersion !== options.cacheVersion) {
      return undefined
    }
    if (typeof entry.body !== 'string') return undefined
    let parsed: T
    try {
      parsed = JSON.parse(entry.body) as T
    } catch (err) {
      onError?.(err, { phase: 'get', key })
      return undefined
    }
    // EC-9: validate wrapped in try/catch
    if (options.validate) {
      try {
        if (!options.validate(parsed)) return undefined
      } catch (err) {
        onError?.(err, { phase: 'get', key })
        return undefined
      }
    }
    // EC-8: clamp age to non-negative (clock skew)
    const age = Math.max(0, (Date.now() - entry.storedAt) / 1000)
    if (age <= entry.maxAge) {
      const value = options.transform ? options.transform(parsed) : parsed
      return { value, status: 'hit' }
    }
    if (age <= entry.maxAge + entry.swr) {
      const value = options.transform ? options.transform(parsed) : parsed
      return { value, status: 'stale' }
    }
    return undefined
  }

  // runLoader always returns `value` by design: loader output is the caller's
  // contract; every branch short-circuits a *write*, never the return path.
  // eslint-disable-next-line sonarjs/no-invariant-returns, complexity
  async function runLoader<T>(
    key: string,
    fn: () => Promise<T>,
    options: GetOrComputeOptions<T>,
    skipWrite = false,
  ): Promise<T> {
    const raw = await fn()
    const value = options.transform ? options.transform(raw) : raw

    if (skipWrite) return value

    // skipCacheWhen sentinel — caller-controlled skip-write
    if (options.skipCacheWhen?.(value)) return value

    // EC-9: validate during write
    if (options.validate) {
      let isValid = true
      try {
        isValid = options.validate(value)
      } catch (err) {
        onError?.(err, { phase: 'set', key })
        return value
      }
      if (!isValid) return value
    }

    // EC-10: undefined return → warn-once + skip cache
    if (value === undefined) {
      if (!undefinedLoaderWarned.has(key)) {
        undefinedLoaderWarned.add(key)
        console.warn(`[theokit:cache] loader returned undefined for key "${key}"; entry not cached`)
      }
      return value
    }

    try {
      const entry: CacheEntry = {
        body: JSON.stringify(value),
        status: 200,
        headers: [],
        storedAt: Date.now(),
        maxAge: options.maxAge,
        swr: options.swr ?? 0,
        tags: options.tags ?? [],
        cacheVersion: options.cacheVersion,
      }
      await storage.set(key, entry)
    } catch (err) {
      onError?.(err, { phase: 'set', key })
    }
    return value
  }

  function scheduleBackgroundRevalidate<T>(
    key: string,
    fn: () => Promise<T>,
    options: GetOrComputeOptions<T>,
  ): void {
    if (bgInFlight.has(key)) return
    bgInFlight.add(key)
    void runLoader(key, fn, options)
      .catch((err: unknown) => {
        onError?.(err, { phase: 'revalidate', key })
      })
      .finally(() => {
        bgInFlight.delete(key)
      })
  }

  return {
    storage,

    getOrCompute,

    async tryReadCached<T>(
      key: string,
      opts: { cacheVersion?: string; validate?: (v: T) => boolean },
    ): Promise<{ value: T; status: 'hit' | 'stale' } | undefined> {
      // Delegate to internal impl (which uses the broader GetOrComputeOptions
      // type). tryReadCached never returns status: 'miss' — that codepath
      // returns undefined. Narrow the type via assertion.
      const result = await tryReadCached<T>(key, {
        ...opts,
        maxAge: 0, // unused by tryReadCached
      })
      if (!result) return undefined
      return result as { value: T; status: 'hit' | 'stale' }
    },

    async set(key, entry) {
      await storage.set(key, entry)
    },

    async invalidate(key) {
      // Best-effort: clear in-flight too so next request starts fresh
      inFlight.delete(key)
      return storage.delete(key)
    },

    async invalidateTag(tag) {
      return storage.deleteByTag(tag)
    },

    async revalidatePath(path, type) {
      const tag = THEO_T_PREFIX + path + (type ? '/' + type : '')
      return storage.deleteByTag(tag)
    },
  }
}
