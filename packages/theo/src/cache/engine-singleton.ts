import type { CacheEngine, CacheEngineOptions } from './cache-engine.js'
import { createCacheEngine } from './cache-engine.js'
import { InMemoryCacheAdapter } from './in-memory-adapter.js'
import type { CacheStorageAdapter } from './storage-adapter.js'

export interface NormalizedCacheConfig {
  enabled: boolean
  storage: 'memory' | CacheStorageAdapter
  maxEntries: number
  defaults: {
    maxAge: number
    swr?: number
    cacheErrors: boolean
  }
}

let _engine: CacheEngine | undefined

/**
 * Initialize the singleton cache engine for this process.
 * Throws if called twice; tests should call `_resetCacheEngine()` between.
 */
export function initCacheEngine(
  config: NormalizedCacheConfig,
  hooks: Pick<CacheEngineOptions, 'onError'> = {},
): CacheEngine {
  if (_engine) {
    throw new Error(
      'Cache engine already initialized — call _resetCacheEngine() in tests, or check init order in production.',
    )
  }
  if (!config.enabled) {
    throw new Error(
      'initCacheEngine: config.enabled is false. Skip this call entirely when cache is disabled.',
    )
  }
  const adapter =
    config.storage === 'memory'
      ? new InMemoryCacheAdapter({ maxEntries: config.maxEntries })
      : config.storage
  _engine = createCacheEngine({
    storage: adapter,
    defaults: config.defaults,
    onError: hooks.onError,
  })
  return _engine
}

/**
 * Resolve the singleton cache engine.
 * Throws a clear error if not initialized — usually means the framework
 * bootstrap missed calling initCacheEngine, or cache.enabled is false.
 */
export function getCacheEngine(): CacheEngine {
  if (!_engine) {
    throw new Error(
      'Cache engine not initialized. Ensure theo.config.ts has `cache.enabled: true` and the framework bootstrap called initCacheEngine.',
    )
  }
  return _engine
}

/**
 * Test-only: clear the singleton so the next test can re-init.
 * Production code MUST NOT call this.
 */
export function _resetCacheEngine(): void {
  _engine = undefined
}
