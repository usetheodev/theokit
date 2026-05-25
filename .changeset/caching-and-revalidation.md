---
'theokit': minor
---

Add cache primitives to `theokit/server` — closes the largest production gap vs Next.js.

Ships 5 new public primitives:

- **`defineCachedRoute(engine, config)`** — cache HTTP route responses with SWR + tag invalidation. Set-Cookie auto-bypasses, status `>= 400` not cached by default, GET/HEAD only (override via `cache.methods`).
- **`defineCachedFunction(engine, fn, opts)`** — memoize server functions. Built-in `.invalidate(...args)` method on the returned wrapper.
- **`revalidateTag(tag, opts?)`** — fan-out invalidation by tag.
- **`revalidatePath(path, opts?)`** — sugar over `revalidateTag('_THEO_T_/path')`.
- **`updateTag(tag)`** — Server-Action-safe immediate invalidation.

Plus the storage layer:

- **`CacheStorageAdapter`** interface with 7 methods (`get`, `set`, `delete`, `deleteByTag`, `size`, `clear`, `keys`).
- **`InMemoryCacheAdapter`** default implementation — LRU + reverse tag index, O(matched-keys) `deleteByTag`.
- **`createCacheEngine({ storage })`** factory exposing `getOrCompute`, `invalidate`, `invalidateTag`, `revalidatePath`.
- **`initCacheEngine(config)` / `getCacheEngine()` / `_resetCacheEngine()`** singleton resolver for framework wiring.

Helpers:

- **`getCacheControlHeader({ maxAge, swr, isPrivate? })`** — RFC 7234-compliant header builder.
- **`deriveCacheKey(req, opts?)`** — URL+sorted-query key derivation with `DEFAULT_EXCLUDED_QUERY_PARAMS` (25 tracking params auto-stripped, mirrors Astro list).
- **`compileRouteRules` / `resolveRouteRule`** — first-match-wins glob matching for `theo.config.ts cache.routeRules`.
- **`validateCacheTags` / `validateCacheMaxAge` / `validateCacheExpire`** — defensive validators.
- **Constants**: `CACHE_TAG_MAX_LENGTH = 256`, `CACHE_TAG_MAX_ITEMS = 128`, `THEO_T_PREFIX = '_THEO_T_'`, `CACHE_DEFAULT_MAX_AGE = 1`, `CACHE_DEFAULT_MAX_ENTRY_SIZE = 10 MB`.

Config schema (`theo.config.ts`):

```ts
cache: {
  enabled: true,
  storage: 'memory',                        // or custom CacheStorageAdapter
  maxEntries: 1000,
  defaults: { maxAge: 1, cacheErrors: false },
  routeRules: { '/api/static/**': { maxAge: 300, swr: 600 } },
}
```

Edge cases handled (catalogued in `docs/reviews/edge-case-plan/caching-and-revalidation-edge-cases-2026-05-23.md`):

- **EC-1**: `validateTags` defensive guard for non-array input.
- **EC-2**: `varies: ['cookie']` auto-filtered + warn-once (Astro `IGNORED_VARY_HEADERS` pattern).
- **EC-3**: Response body > 10 MB bypasses cache + warn-once (configurable via `cache.maxEntrySize`).
- **EC-4**: Cache middleware structurally runs AFTER user middleware — auth/session/CSRF always gate first (no data leak vector).
- **EC-5**: `picomatch` declared as direct production dependency (was relying on Vite transitive — broken in production runtime).
- **EC-8**: Clock-skew negative-age clamped via `Math.max(0, age)`.
- **EC-9**: `validate` callback throws → treated as miss + `onError` invoked.
- **EC-10**: Loader returning `undefined` warn-once + skipped from cache.
- **EC-11**: `Transfer-Encoding: chunked` responses NOT cached.
- **EC-19**: `cache.maxEntrySize` validated at config-time.

New dep: `picomatch ^4.0.0` (direct, production — was transitive via Vite which broke prod).

Documentation: `docs/concepts/caching.md` (full 5-pattern guide + Redis adapter recipe + comparison vs Next.js / Nitro / Astro / TanStack).

Reference research: `.claude/knowledge-base/reference/caching-and-revalidation.md` (4 frameworks deep-read, 14 edge cases catalogued).

Plan: `docs/plans/caching-and-revalidation-plan.md` (13 tasks across 8 phases, 13 ADRs, 138 RED tests, 100% coverage matrix).

Fixture: `fixtures/cache-basic/` (all 5 primitives exercised + integration test).

Backward compatibility: 100%. The `cache` config field is optional; existing apps without `cache:` in `theo.config.ts` see zero behavior change.
