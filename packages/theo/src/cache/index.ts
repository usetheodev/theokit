/**
 * cache/ — Cache primitives (caching-and-revalidation-plan, Phase 1-7).
 *
 * T4.4 (architecture-cleanup) — barrel entrypoint enabling
 * `theokit/server` to re-export cache via `export *`.
 *
 * ADR-0001 v3 invariant #3: cross-module imports MUST flow through this barrel.
 */

export { defineCachedFunction } from './define-cached-function.js'
export type { CachedFunction, DefineCachedFunctionOptions } from './define-cached-function.js'

export {
  defineCachedRoute,
  DEFAULT_MAX_ENTRY_SIZE as CACHE_DEFAULT_MAX_ENTRY_SIZE,
} from './define-cached-route.js'
export type { CachedRouteConfig, RouteCacheOptions } from './define-cached-route.js'

export { revalidatePath, revalidateTag, updateTag } from './revalidate.js'
export type { RevalidateResult } from './revalidate.js'

export { createCacheEngine } from './cache-engine.js'
export type {
  CacheEngine,
  CacheEngineOptions,
  CacheStatus,
  GetOrComputeOptions,
} from './cache-engine.js'

export { InMemoryCacheAdapter } from './in-memory-adapter.js'
export type { InMemoryCacheAdapterOptions } from './in-memory-adapter.js'

export type {
  CacheEntry,
  CacheStorageAdapter,
  CacheStore,
  CacheStoreAdmin,
} from './storage-adapter.js'

export { _resetCacheEngine, getCacheEngine, initCacheEngine } from './engine-singleton.js'
export type { NormalizedCacheConfig } from './engine-singleton.js'

export { compileRouteRules, resolveRouteRule } from './route-rules.js'
export type { CompiledRouteRule, RouteRule, RouteRules } from './route-rules.js'

export { getCacheControlHeader } from './cache-control-header.js'
export type { CacheControlInput } from './cache-control-header.js'

export { DEFAULT_EXCLUDED_QUERY_PARAMS, deriveKey as deriveCacheKey } from './key-derivation.js'
export type { KeyDerivationOptions } from './key-derivation.js'

export {
  validateExpire as validateCacheExpire,
  validateMaxAge as validateCacheMaxAge,
  validateTags as validateCacheTags,
} from './validation.js'
export type { ValidationResult as CacheValidationResult } from './validation.js'

export {
  CACHE_TAG_MAX_ITEMS,
  CACHE_TAG_MAX_LENGTH,
  DEFAULT_MAX_AGE as CACHE_DEFAULT_MAX_AGE,
  DEFAULT_SWR_MULTIPLIER as CACHE_DEFAULT_SWR_MULTIPLIER,
  THEO_T_PREFIX,
} from './constants.js'
