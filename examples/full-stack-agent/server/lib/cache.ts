/**
 * Shared cache engine for this example.
 *
 * We initialize the framework singleton at module load. Routes import either:
 * - `cacheEngine` (this exported reference) to pass to `defineCachedRoute` /
 *   `defineCachedFunction`, OR
 * - `revalidateTag` / `revalidatePath` / `updateTag` from `theokit/server`
 *   directly — they resolve to this same singleton.
 *
 * Production frameworks would call `initCacheEngine(config.cache)` from the
 * CLI bootstrap automatically. This example wires it explicitly so the demo
 * is self-contained.
 */
import { _resetCacheEngine, getCacheEngine, initCacheEngine } from 'theokit/server'

// HMR safety: dev re-imports may run this file twice; the singleton refuses
// double init. Reset first to make it idempotent during development.
_resetCacheEngine()

initCacheEngine({
  enabled: true,
  storage: 'memory',
  maxEntries: 500,
  defaults: {
    maxAge: 5, // generous default so cache demo is observable in the UI
    cacheErrors: false,
  },
})

export const cacheEngine = getCacheEngine()
