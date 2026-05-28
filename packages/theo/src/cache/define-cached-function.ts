import type { CacheEngine } from './cache-engine.js'
import { validateExpire, validateMaxAge, validateTags } from './validation.js'

export interface DefineCachedFunctionOptions<TArgs extends unknown[], TReturn> {
  /** Required cache namespace; appears in keys as "fn:${name}:..." */
  name: string
  /** seconds; defaults to DEFAULT_MAX_AGE (1) */
  maxAge?: number
  /** seconds; stale-while-revalidate window */
  swr?: number
  /** Custom key derivation from args. Default: JSON.stringify(args). */
  getKey?: (...args: TArgs) => string
  /** Static or dynamic tags. */
  tags?: string[] | ((...args: TArgs) => string[])
  /** Version stamp; bump to invalidate all entries under this name. */
  cacheVersion?: string
  /** Transform returned value before caching. */
  transform?: (raw: TReturn) => TReturn
  /** Skip cache if validate returns false (treats existing entry as miss). */
  validate?: (raw: TReturn) => boolean
  /** Called on any error in the cache pipeline. */
  onError?: (err: unknown, ctx: { args: TArgs }) => void
}

export type CachedFunction<TArgs extends unknown[], TReturn> = ((
  ...args: TArgs
) => Promise<TReturn>) & {
  /** Bust the cache entry for these specific args. */
  invalidate: (...args: TArgs) => Promise<void>
}

/**
 * Wrap an async function with cache semantics.
 * Returns a callable that memoizes by `(name + args)` and exposes `.invalidate(args)`.
 *
 * The engine is supplied by the caller (avoids module-level singleton coupling
 * during testing; framework wiring provides it in production).
 */
export function defineCachedFunction<TArgs extends unknown[], TReturn>(
  engine: CacheEngine,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  opts: DefineCachedFunctionOptions<TArgs, TReturn>,
): CachedFunction<TArgs, TReturn> {
  if (typeof opts.name !== 'string' || opts.name.length === 0) {
    throw new Error('defineCachedFunction: opts.name is required (non-empty string)')
  }
  const maxAge = validateMaxAge(opts.maxAge, `defineCachedFunction(${opts.name})`)
  const swr = validateExpire(opts.swr, maxAge, `defineCachedFunction(${opts.name})`)

  const prefix = `fn:${opts.name}`

  function deriveCacheKey(args: TArgs): string {
    const tail = opts.getKey ? opts.getKey(...args) : JSON.stringify(args)
    return `${prefix}:${tail}`
  }

  function resolveTags(args: TArgs): string[] {
    const raw = typeof opts.tags === 'function' ? opts.tags(...args) : (opts.tags ?? [])
    const { valid } = validateTags(raw, `defineCachedFunction(${opts.name})`)
    return valid
  }

  const wrapped = (async (...args: TArgs) => {
    const key = deriveCacheKey(args)
    const tags = resolveTags(args)
    try {
      const { value } = await engine.getOrCompute<TReturn>(key, async () => fn(...args), {
        maxAge,
        swr: swr ?? maxAge * 60,
        tags,
        cacheVersion: opts.cacheVersion,
        transform: opts.transform,
        validate: opts.validate,
      })
      return value
    } catch (err) {
      opts.onError?.(err, { args })
      throw err
    }
  }) as CachedFunction<TArgs, TReturn>

  wrapped.invalidate = async (...args: TArgs) => {
    const key = deriveCacheKey(args)
    await engine.invalidate(key)
  }

  return wrapped
}
