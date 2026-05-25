import { defineConfig } from 'theokit'

/**
 * Dev mode → `report-only` so Vite's React Refresh inline script (which lacks
 * a nonce attribute) doesn't get blocked by enforce CSP, breaking HMR + first
 * hydration. Production build → `enforce` (matches the 0.3.0 default).
 *
 * Tracked: making the framework auto-relax CSP in dev is a separate cutover
 * item — until then, every demo needs this env switch.
 */
const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  ssr: true,
  security: {
    headers: {
      // Production → enforce strict CSP. Dev → OFF (Vite's React Refresh
      // inline preamble lacks a nonce and would be blocked even by
      // report-only, breaking HMR + first hydration in some browsers).
      cspMode: isProduction ? 'enforce' : 'off',
    },
  },
  // Cache demo at /cache page. The engine is initialized at module load
  // via server/lib/cache.ts (initCacheEngine call). These defaults inform
  // route handlers that don't pass per-route overrides.
  cache: {
    enabled: true,
    storage: 'memory',
    maxEntries: 500,
    defaults: { maxAge: 5, cacheErrors: false },
  },
})
