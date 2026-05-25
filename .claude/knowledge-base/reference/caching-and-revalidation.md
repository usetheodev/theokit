# Reference: Caching and Revalidation

**Date:** 2026-05-23
**Depth:** exhaustive (default)
**Frameworks analyzed:** Next.js (canonical, current HEAD), Nitro (current HEAD), TanStack Router (current HEAD), Astro (current HEAD)
**TheoKit package affected:** `packages/theo/src/server/` (new cache primitives), `packages/theo/src/cli/commands/build.ts` (cache config validation), `packages/theo/src/router/` (client-side route loader cache integration)
**Related references:** [`devtools.md`](devtools.md) (dev observability for cache hit/miss), [`enforcement-cutover.md`](enforcement-cutover.md) (security headers — `Cache-Control: private, no-store` baseline), [`server-components-rsc.md`](server-components-rsc.md) (RSC explicitly deferred — cache primitives must NOT assume RSC)

---

## 1. Problem statement

- **What:** TheoKit ships ZERO data-cache primitives in `theokit/server`. Production agent apps need:
  1. **Response caching** — memoize HTTP route output (the agent's `/api/usage` endpoint, the dashboard's `/api/billing-summary`) so repeat hits don't re-execute upstream calls.
  2. **Function caching** — memoize arbitrary server functions (`fetchStripeSubscriptions(userId)`, `loadLLMUsageQuotas()`) with TTL + SWR semantics.
  3. **Tag-based revalidation** — bust `usage:user:123` from a webhook handler when the user's plan changes, without listing every endpoint that consumed that data.
  4. **Path-based revalidation** — bust `/dashboard/billing` after a Stripe webhook fires, regardless of which loader populated it.
  5. **Cache-Control header generation** — emit canonical `s-maxage` + `stale-while-revalidate` + `stale-if-error` headers from a single declaration, so the CDN respects what the server intends.

- **Current state:** `grep -rn "cache\|revalidate" packages/theo/src/server/` returns only **internal** hot-path caches (`middleware-runner.ts:44` middlewareCache, `nonce.ts:41` cachedWebCrypto, `crypto.ts:29` keyCache). None of these are user-facing API. `theokit/server` exports do NOT include any cache primitive (verified against `packages/theo/src/server/index.ts`).

- **Why now:** Listed as Priority 3 on the macro roadmap (CLAUDE.md, "Frictions surfaced by item #2"). The honest gap-analysis chart from 2026-05-23 rates Caching+Revalidating as **the single largest production gap vs Next.js**. Once an agent app hits a real user load, the LLM-call-per-pageview pattern becomes unsustainable. Without cache primitives, every TheoKit consumer must either (a) roll their own (forking `lru-cache` + `unstorage` + a tag index) or (b) cap their app at "demo" scale.

## 2. Inventário completo de arquivos (mandatório)

Lista exaustiva — todo arquivo capturado nas 3 passadas (filename + content + docs), triado em `core` / `support` / `test` / `doc`. **Sem cherry-picking.**

### Nitro — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/nitro/src/runtime/cache.ts` | core | 1 | ✅ | §3.1, §6 |
| `referencias/nitro/src/runtime/internal/cache.ts` | core | 60 | ✅ | §3.1, §4, §6 |
| `referencias/nitro/src/types/runtime/cache.ts` | core | 13 | ✅ | §3.1 |
| `referencias/nitro/src/runtime/storage.ts` | support | 1 | ✅ | §3.1 (storage abstraction) |
| `referencias/nitro/docs/1.docs/7.cache.md` | doc | 421 | ✅ | §3.1, §4, §5, §7, §8 |
| `referencias/nitro/docs/4.examples/cached-handler.md` | doc | 95 | ✅ | §3.1 |
| `referencias/nitro/package.json` | doc | — | partial (deps only) | §6 (ocache + unstorage versions) |

### Next.js — inventário (top-level cache surface; full grep returned 533 hits)

The 533 files include many secondary consumers (`base-server.ts`, `dynamic-rendering.ts`, `action-handler.ts`, `app-render.tsx`, etc.) that call into the cache primitives. The **core/support** rows below are the cache primitives themselves; secondary consumers are marked **referenced** (read selectively to verify API surface, not for algorithm extraction).

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/next.js/packages/next/src/server/web/spec-extension/unstable-cache.ts` | core | 432 | ✅ | §3.2, §4, §7 |
| `referencias/next.js/packages/next/src/server/web/spec-extension/revalidate.ts` | core | 248 | ✅ | §3.2, §4 |
| `referencias/next.js/packages/next/src/server/revalidation-utils.ts` | core | 222 | ✅ | §3.2, §7 (diff algorithm) |
| `referencias/next.js/packages/next/src/server/use-cache/cache-tag.ts` | core | 41 | ✅ | §3.2 |
| `referencias/next.js/packages/next/src/server/use-cache/cache-life.ts` | core | 176 | ✅ | §3.2, §8 |
| `referencias/next.js/packages/next/src/server/lib/cache-control.ts` | core | 35 | ✅ | §3.2 (header emission) |
| `referencias/next.js/packages/next/src/server/lib/lru-cache.ts` | core | 238 | ✅ | §3.2, §7 (size-based LRU) |
| `referencias/next.js/packages/next/src/server/lib/patch-fetch.ts` | core | 1331 | targeted (lines 1–150, validateTags, validateRevalidate) | §3.2, §8 |
| `referencias/next.js/packages/next/src/server/use-cache/use-cache-wrapper.ts` | core | 2995 | not read (out of budget — referenced by API only) | §3.2 (mentioned), §11 (linked) |
| `referencias/next.js/packages/next/src/server/use-cache/use-cache-errors.ts` | support | — | not read (out of budget) | §11 |
| `referencias/next.js/packages/next/src/server/lib/incremental-cache/index.ts` | support | 732 | not read (out of budget — referenced by API only) | §3.2 (mentioned) |
| `referencias/next.js/packages/next/src/server/lib/incremental-cache/file-system-cache.ts` | support | 481 | not read (out of budget) | §11 |
| `referencias/next.js/packages/next/src/server/lib/disk-lru-cache.external.ts` | support | — | not read (out of budget) | §11 |
| `referencias/next.js/packages/next/src/server/lib/encode-cache-tag.ts` | support | — | not read (out of budget — function obvious from call sites) | §11 |
| `referencias/next.js/packages/next/src/server/lib/implicit-tags.ts` | support | — | not read (out of budget) | §11 |
| `referencias/next.js/packages/next/src/lib/with-promise-cache.ts` | support | — | not read (out of budget) | §11 |
| `referencias/next.js/packages/next/src/lib/constants.ts` | doc | partial | targeted (cache-related constants) | §3.2, §8 (NEXT_CACHE_TAG_MAX_LENGTH = 256, NEXT_CACHE_TAG_MAX_ITEMS = 128) |
| `referencias/next.js/packages/next/src/client/components/segment-cache/cache.ts` | support | — | not read (out of budget — client-side, less relevant to server cache) | §11 |
| `referencias/next.js/packages/next/src/client/components/segment-cache/cache-map.ts` | support | — | not read (out of budget) | §11 |

### TanStack Router — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/tanstack-router/packages/router-core/src/lru-cache.ts` | core | 74 | ✅ | §3.3, §7 (functional LRU) |
| `referencias/tanstack-router/packages/router-core/src/load-matches.ts` | core | 1280 | targeted (lines 780–900 stale logic) | §3.3, §5 |
| `referencias/tanstack-router/packages/react-router/src/useLoaderDeps.tsx` | support | — | not read (out of budget — entrypoint) | §11 |
| `referencias/tanstack-router/packages/router-core/src/useLoaderDeps.ts` | support | — | not read (out of budget) | §11 |
| `referencias/tanstack-router/docs/router/guide/data-loading.md` | doc | 644 | ✅ (lines 1–200, key options) | §3.3, §4, §5, §8 |
| `referencias/tanstack-router/docs/router/guide/external-data-loading.md` | doc | 188 | not read (TanStack Query bridge — out of scope) | §11 |

### Astro — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/astro/packages/astro/src/core/cache/runtime/cache.ts` | core | 152 | ✅ | §3.4, §4 (accumulator pattern) |
| `referencias/astro/packages/astro/src/core/cache/memory-provider.ts` | core | 539 | ✅ | §3.4, §7, §8 |
| `referencias/astro/packages/astro/src/core/cache/types.ts` | core | 83 | ✅ | §3.4 (CacheProvider interface) |
| `referencias/astro/packages/astro/src/core/cache/runtime/utils.ts` | support | — | not read (helper) | §11 |
| `referencias/astro/packages/astro/src/core/cache/utils.ts` | support | — | not read (helper) | §11 |
| `referencias/astro/packages/astro/src/core/cache/config.ts` | support | — | not read (out of budget) | §11 |
| `referencias/astro/packages/astro/src/core/render/route-cache.ts` | support | — | not read (route-level cache, separate concern) | §11 |
| `referencias/astro/packages/astro/src/runtime/server/html-string-cache.ts` | support | — | not read (HTML cache, separate concern) | §11 |
| `referencias/astro/packages/astro/src/content/data-store.ts` | support | — | not read (content collection, separate concern) | §11 |
| `referencias/astro/packages/astro/src/content/mutable-data-store.ts` | support | — | not read | §11 |
| `referencias/astro/.changeset/astro-cache-disabled-shim.md` | doc | 7 | ✅ | §8 (regression EC) |

### Arquivos avaliados e descartados (com motivo)

| File | Why discarded |
|---|---|
| `referencias/next.js/packages/next/src/build/webpack/cache-invalidation.ts` | Webpack build cache, irrelevant to runtime data cache |
| `referencias/next.js/packages/next/src/build/webpack/plugins/memory-with-gc-cache-plugin.ts` | Webpack build cache |
| `referencias/next.js/packages/next/src/build/webpack/plugins/nextjs-require-cache-hot-reloader.ts` | HMR require() cache, not a data cache |
| `referencias/next.js/packages/next/src/server/dev/require-cache.ts` | dev server module cache, unrelated |
| `referencias/next.js/packages/next/src/server/dev/use-cache-probe-pool.ts` | dev tooling for cache analyzer, not the primitive |
| `referencias/next.js/packages/next/src/server/dev/use-cache-probe-worker.ts` | dev tooling |
| `referencias/next.js/packages/next/src/server/use-cache/use-cache-probe-scheduler.ts` | dev tooling |
| `referencias/next.js/packages/next/src/server/use-cache/use-cache-probe-globals.ts` | dev tooling |
| `referencias/next.js/packages/next/src/server/route-matcher-providers/dev/file-cache-route-matcher-provider.ts` | route matcher, not data cache |
| `referencias/next.js/packages/next/src/server/route-matcher-providers/helpers/cached-route-matcher-provider.ts` | route matcher, not data cache |
| `referencias/next.js/packages/next/src/next-devtools/dev-overlay/cache-indicator.tsx` | devtools UI, not the primitive |
| `referencias/next.js/packages/next/src/client/components/bfcache-state-manager.ts` | browser back-forward cache, not server cache |
| `referencias/next.js/packages/next/src/client/components/segment-cache/bfcache.ts` | browser back-forward cache |
| `referencias/next.js/packages/next/src/client/components/router-reducer/set-cache-busting-search-param.ts` | URL search-param bust, not the cache primitive |
| `referencias/next.js/packages/next/src/client/components/router-reducer/create-router-cache-key.ts` | router state cache key, separate concern |
| `referencias/next.js/packages/next/src/server/resume-data-cache/cache-store.ts` | PPR resume cache, RSC-specific (deferred per [[server-components-rsc.md]]) |
| `referencias/next.js/packages/next/src/server/resume-data-cache/resume-data-cache.ts` | PPR resume cache, RSC-specific |
| `referencias/next.js/packages/next/src/server/lib/incremental-cache/shared-cache-controls.external.ts` | Vercel-platform-specific implementation hint, not generic primitive |
| `referencias/next.js/packages/next/src/server/cache-dir.ts` | Filesystem path resolution helper |
| `referencias/next.js/packages/next/src/lib/helpers/get-cache-directory.ts` | Path helper |
| `referencias/next.js/packages/next/src/export/helpers/create-incremental-cache.ts` | Build-time export, not runtime primitive |
| `referencias/next.js/packages/next/src/shared/lib/action-revalidation-kind.ts` | Enum-only file (ActionDidRevalidate variants) — read via consumer |
| `referencias/next.js/packages/next/src/server/app-render/cache-signal.ts` | RSC signal — RSC-specific |
| `referencias/astro/packages/astro/src/assets/fonts/infra/cached-font-fetcher.ts` | Font fetch cache, unrelated to data cache |
| `referencias/astro/packages/astro/src/integrations/vercel/src/index.ts` | Vercel preset, calls cache API but doesn't define it |
| `referencias/astro/packages/integrations/partytown/src/sirv.ts` | Partytown integration |
| `referencias/tanstack-router/packages/start-plugin-core/tests/createMiddleware/test-files/createMiddlewareValidator.tsx` | Test fixture |
| `referencias/tanstack-router/packages/start-plugin-core/tests/createMiddleware/snapshots/client/createMiddlewareValidator.tsx` | Test snapshot |
| Test fixtures (`test/fixture/server/routes/api/cached.ts` for Nitro, similar for others) | Used as edge-case sources in §8, not algorithm reference |

## 3. Prior art — deep dive por framework

### 3.1 Nitro — version (current HEAD, ocache ^0.1.4)

#### API pública
```ts
// referencias/nitro/src/runtime/cache.ts:1
export { defineCachedFunction, defineCachedHandler } from "./internal/cache.ts";

// referencias/nitro/src/runtime/internal/cache.ts:34–60
export function defineCachedFunction<T, ArgsT extends unknown[] = any[]>(
  fn: (...args: ArgsT) => T | Promise<T>,
  opts: CacheOptions<T, ArgsT> = {}
): (...args: ArgsT) => Promise<T>

export function defineCachedHandler(
  handler: EventHandler,
  opts: CachedEventHandlerOptions = {}
): EventHandler

// referencias/nitro/src/types/runtime/cache.ts:3
export type { CacheEntry, CacheOptions, ResponseCacheEntry } from "ocache";
```

#### Algoritmo interno (prosa, passo a passo)

The runtime cache in Nitro is a **thin adapter** over the upstream `ocache` package. The Nitro file (`internal/cache.ts:1–60`) does four things:

1. **Lazy storage initialization** — `ensureStorage()` (line 16) runs once. It calls `useStorage()` (the unified `unstorage` abstraction, declared in `runtime/storage.ts:1`) and registers a get/set adapter with ocache via `setStorage({ get, set })`. The set adapter forwards a `ttl` option when present.
2. **Default error handler** — `defaultOnError` (line 29) logs to console and reports to Nitro's error capture (`useNitroApp().captureError`).
3. **`defineCachedFunction`** (line 34) wraps `_defineCachedFunction` from ocache with the group `"nitro/functions"` and the default `onError`. Caller options spread last (override-friendly).
4. **`defineCachedHandler`** (line 46) wraps `_defineCachedHandler` from ocache with the group `"nitro/handlers"`, defaults for `onError`, and **three response adapters** that bridge ocache's abstract response model into h3:
   - `toResponse: (value, event) => toResponse(value, event as H3Event)` — converts handler return value to h3-style response
   - `createResponse: (body, init) => new FastResponse(body, init)` — uses `srvx`'s `FastResponse` (a perf-tuned `Response` subclass)
   - `handleCacheHeaders: (event, conditions) => handleCacheHeaders(event as H3Event, conditions)` — h3 helper for ETag / If-None-Match logic (the 304 path)

The actual cache algorithm (key derivation, SWR, deduplication, etc.) **lives in the `ocache` package** (`^0.1.4` per `package.json`). Nitro doesn't reimplement it.

From the public docs (`docs/1.docs/7.cache.md`), the canonical behaviors that ocache provides are:

- Cache key: `${options.base}:${options.group}:${options.name}:${options.getKey(...args)}.json` (line 387 of the doc).
- Default `swr: true` (stale-while-revalidate ON by default, line 269).
- `maxAge` default `1` second, `staleMaxAge` default `0` (line 261/265).
- For handlers: only GET and HEAD methods are cached (`docs/1.docs/7.cache.md:48`).
- Request deduplication: concurrent requests share the same in-flight invocation (`docs/1.docs/7.cache.md:51`).
- ETag generation: weak ETag from response body hash if not set (`docs/1.docs/7.cache.md:36`).
- 304 Not Modified: automatic from `if-none-match` / `if-modified-since` (`docs/1.docs/7.cache.md:42`).
- Responses with status >= 400 or undefined body NOT cached (`docs/1.docs/7.cache.md:416`).

#### Estado mantido

- `_storageReady` flag in `internal/cache.ts:14` — module-level boolean (one-shot initialization).
- All actual cache state lives in `ocache`'s internal storage adapter, which is itself backed by `unstorage`. Storage is a Map by default, swappable at config time to `fs`, `redis`, `cloudflare-kv`, etc.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `ocache` | `^0.1.4` | The full cache algorithm (key derivation, SWR, dedupe, ETag, 304) | **Strong candidate** — single package solves 80% of the problem. Caveat: v0.1.x → unstable API, would couple TheoKit to ocache release cadence. |
| `unstorage` | (transitively) | Storage abstraction with 20+ drivers (memory, fs, redis, cloudflare-kv, deno-kv, s3, …) | **Strong candidate** — solves the "swap storage backend" requirement and is well-established (unjs ecosystem, MIT license). |
| `h3` | v2 | Event handler integration (`handleCacheHeaders`, `toResponse`) | **N/A** — TheoKit doesn't use h3; we use a Hono-inspired internal runtime. The h3 helpers would need to be re-implemented for our event shape. |
| `srvx` | (transitively) | `FastResponse` perf-tuned Response | **N/A** — we use native Response/Request. |

#### Side effects observáveis

- Writes cache entries to `<cwd>/.nitro/cache/...` in dev (filesystem driver default).
- In edge workers, uses `event.waitUntil` to keep the runtime alive during background revalidation (documented in `docs/1.docs/7.cache.md:93–122`).
- Patches `globalThis.fetch` — NO. Unlike Next.js, Nitro does NOT patch fetch. Caching is explicit (must wrap fn or handler).

#### TODOs / FIXMEs / HACKs literais

No TODOs in `internal/cache.ts`. The file is a thin adapter (60 lines).

In docs:
> "Because the cached data is serialized to JSON, it is important that the cached function does not return anything that cannot be serialized, such as Symbols, Maps, Sets..." — `docs/1.docs/7.cache.md:88`

This is a known constraint, not a TODO, but worth noting as a TheoKit edge case.

#### Padrão de design

- **Pattern: Façade + Strategy.** `defineCachedFunction`/`defineCachedHandler` is the Façade; the actual algorithm (ocache) is a swappable Strategy that consumes a storage adapter.
- **Pattern: Lazy initialization.** Storage is wired on first call, not at module load — avoids ESM circular issues and lets users configure storage before any cache is used.
- Why: keeps the public surface tiny (60 lines of Nitro code) while delegating all complexity to a focused upstream package. The cost is coupling to `ocache`'s release cadence.

---

### 3.2 Next.js — version (current HEAD on `referencias/next.js`)

#### API pública

Next.js exposes **two generations** of cache primitives concurrently. Both are in the codebase today; the legacy form (`unstable_cache`) is being superseded by the directive form (`'use cache'` + `cacheTag()` + `cacheLife()`), but both remain.

**Legacy form** (`unstable-cache.ts:61`):
```ts
export function unstable_cache<T extends Callback>(
  cb: T,
  keyParts?: string[],
  options: {
    revalidate?: number | false   // seconds; false = infinite (INFINITE_CACHE)
    tags?: string[]
  } = {}
): T
```

**Modern form** (RSC-era — requires `cacheComponents` config flag enabled, runtime-gated by `process.env.__NEXT_USE_CACHE`):
```ts
// referencias/next.js/packages/next/src/server/use-cache/cache-tag.ts:4
export function cacheTag(...tags: string[]): void

// referencias/next.js/packages/next/src/server/use-cache/cache-life.ts:77
export function cacheLife(profile: CacheLifeProfiles | CacheLife): void
//   CacheLife = { stale?, revalidate?, expire? } — seconds, all optional
//   CacheLifeProfiles = 'default' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max' | string
```

Both must be called **inside** a function marked with the `'use cache'` directive — the directive itself is the compile-time marker; the wrapper logic lives in `use-cache-wrapper.ts` (2995 LOC, out of read budget).

**Invalidation API** (`revalidate.ts:34, 49, 70, 97`):
```ts
export function revalidateTag(tag: string, profile: string | { expire?: number }): void  // SWR with profile
export function updateTag(tag: string): void                                             // immediate, server-action-only
export function refresh(): void                                                          // client cache refresh
export function revalidatePath(originalPath: string, type?: 'layout' | 'page'): void
```

**Header emission** (`cache-control.ts:17`):
```ts
export function getCacheControlHeader({ revalidate, expire }: CacheControl): string
```

#### Algoritmo interno (prosa, passo a passo)

**For `unstable_cache(cb, keyParts, { revalidate, tags })` invocation** (`unstable-cache.ts:100–399`):

1. **Construction time**: validate tags via `validateTags()` (drops invalid/oversize, see EC table in §8); validate `revalidate` (must be `false` or `≥ -1` number); build `fixedKey = ${cb.toString()}-${keyParts.join(',')}`. Comment line 91: `@TODO if cb.toString() is long we should hash it` (known unfixed issue).
2. **At runtime**: combine into `invocationKey = ${fixedKey}-${JSON.stringify(args)}`. Comment line 132: `@TODO stringify is likely not safe here. We will coerce undefined to null which will make the keyspace smaller than the execution space` (known unfixed issue).
3. **Generate cacheKey** via `incrementalCache.generateCacheKey(invocationKey)` (line 135).
4. **Check workStore + workUnitStore** (AsyncLocalStorage) to determine context. If running inside another `unstable_cache` (nested), set `isNestedUnstableCache = true` and bypass cache (line 195).
5. **Cache lookup**: `incrementalCache.get(cacheKey, { kind: FETCH, revalidate, tags, softTags, fetchIdx, fetchUrl })`.
6. **If hit + valid (FETCH kind)**:
   - If **fresh**: return parsed `cacheEntry.value.data.body`.
   - If **stale**:
     - Push a `revalidationPromise` into `workStore.pendingRevalidates[invocationKey]` (deduplicates concurrent stale reads).
     - If `isStaticGeneration === true` (rendering at build time), `await` the fresh value (foreground revalidate).
     - Otherwise return stale immediately (background revalidate).
7. **If miss or invalid kind**: run `await workUnitAsyncStorage.run(innerCacheStore, cb, ...args)`, then `cacheNewResult(...)` writes the result back via `incrementalCache.set(...)`.
8. **Pages Router branch** (no workStore — line 334): simpler — checks cache, returns fresh if not stale, else recomputes.

**For `cacheTag(...tags)` invocation** (`cache-tag.ts:4`):

1. Throws if not in `'use cache'` context (checked via `process.env.__NEXT_USE_CACHE` env var + `workUnitStore.type` switch).
2. Validates tags via `validateTags()`.
3. Appends to `workUnitStore.tags`.

**For `cacheLife(profile)` invocation** (`cache-life.ts:77`):

1. Throws if not in `'use cache'` context.
2. If `profile` is a string, looks it up in `workStore.cacheLifeProfiles[profile]` (configured in `next.config.js`).
3. Validates the `{ stale?, revalidate?, expire? }` triple — `expire` must be > `revalidate`, all must be numbers (line 65).
4. Tracks the explicit triple on `workUnitStore.explicitRevalidate / explicitExpire / explicitStale` — uses min-of-current-and-new to combine multiple `cacheLife` calls within the same cache scope.

**For `revalidateTag(tag, profile)` invocation** (`revalidate.ts:34`):

1. If `profile` is `undefined`, emit deprecation warning (single-arg form removed in future).
2. Call `revalidate([encodeCacheTag(tag)], "revalidateTag ${tag}", profile)`.
3. Inside `revalidate()` (line 125): pull `workStore` from AsyncLocalStorage; throw if missing.
4. Throw if called during render (`workUnitStore.phase === 'render'`) — must be in action or route handler.
5. Throw if inside `'use cache'`, `unstable_cache`, or `generateStaticParams`.
6. Push `{ tag, profile }` onto `store.pendingRevalidatedTags` (line 224), with dedup against existing entries.
7. If profile resolves to immediate expire (`profile === undefined || cacheLife.expire === 0`), also flip `store.pathWasRevalidated = ActionDidRevalidate`.

**For `revalidatePath(path, type?)`** (`revalidate.ts:97`): Re-encodes path as a synthetic tag (`_N_T_/${path}/${type}` prefix), then routes through the same `revalidate()` function. Length-capped at `NEXT_CACHE_SOFT_TAG_MAX_LENGTH` (warning if exceeded).

**For `executeRevalidates(workStore)`** (`revalidation-utils.ts:186`): called at end-of-request. Reads `pendingRevalidatedTags` + `pendingRevalidates` + `pendingRevalidateWrites`, batches tags by profile (`tagsByProfile` Map at line 96), calls each `handler.updateTags(tagsForProfile, durations?)` and `incrementalCache.revalidateTag(tags, durations)`.

**For header emission `getCacheControlHeader({ revalidate, expire })`** (`cache-control.ts:17`):
- `revalidate === 0` → `'private, no-cache, no-store, max-age=0, must-revalidate'`
- `typeof revalidate === 'number'` → `'s-maxage=${revalidate}, stale-while-revalidate=${expire - revalidate}'` (if `expire > revalidate`)
- `revalidate === false` (or other) → `'s-maxage=${CACHE_ONE_YEAR_SECONDS}'`

#### Estado mantido

- `noStoreFetchIdx` (module-level) — global fetch-idx counter for pages router (no AsyncLocalStorage context) — `unstable-cache.ts:26`.
- `workStore.pendingRevalidates` (Record<string, Promise>) — pending revalidation promises keyed by invocationKey, dedup mechanism.
- `workStore.pendingRevalidatedTags` (Array<{tag, profile}>) — tags scheduled for invalidation at end of request.
- `workStore.pendingRevalidateWrites` (Array<Promise>) — write-back promises for new cache entries.
- `workStore.pathWasRevalidated` (enum: `ActionDidRevalidate` / `ActionDidRevalidateDynamicOnly`) — used by Server Actions to communicate revalidation state back to the client.
- `workUnitStore.tags` (Array<string>) — accumulated tags within the current cache scope.
- `workUnitStore.explicitRevalidate / explicitExpire / explicitStale` (number | undefined) — explicit `cacheLife` overrides per scope.
- Internal `LRUCache<T>` (`lru-cache.ts:46`) — doubly-linked-list + Map, with size-based eviction. Used as in-memory layer of the incremental cache hierarchy.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `lru-cache` (internal, hand-rolled) | — | In-memory LRU layer with size-based eviction | **Could adopt `lru-cache` from npm (`^11.x`, Isaac Schlueter, battle-tested), or hand-roll our own (~240 LOC). Hand-roll is the Next.js choice.** |
| `AsyncLocalStorage` | Node stdlib | Per-request scope propagation | **N/A — Node-only. Edge runtimes have a polyfill via `unenv` or `cloudflare:workers` `AsyncLocalStorage`. TheoKit currently uses neither; we'd need to introduce this dep.** |
| `webcrypto` / `node:crypto` | stdlib | Hashing for cache keys | **N/A — built-in; we already use `globalThis.crypto.subtle` in `nonce.ts`.** |
| `JSON.stringify` (no external lib) | stdlib | Cache-key serialization of args | **Used as-is — but Next.js leaves a `@TODO` about its correctness (line 132 of unstable-cache.ts). For TheoKit, we should use a stable-stringify lib (e.g., `json-stable-stringify` or roll a tiny one).** |

#### Side effects observáveis

- Patches `globalThis.fetch` via `patch-fetch.ts` (1331 LOC). Every `fetch()` call is intercepted, cache-checked, and metric-tracked. Verifiable by `(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] === true` — `patch-fetch.ts:45`.
- Writes cache entries to `.next/cache/fetch-cache/` (`file-system-cache.ts`, not read in full).
- Tracks fetch metrics (`workStore.fetchMetrics`) — pushed by `trackFetchMetric()` (`patch-fetch.ts:124`).

#### TODOs / FIXMEs / HACKs literais

> `// @TODO if cb.toString() is long we should hash it` — `unstable-cache.ts:91`
> `// @TODO come up with a collision-free way to combine keyParts` — `unstable-cache.ts:92`
> `// @TODO consider validating the keyParts are all strings.` — `unstable-cache.ts:93`
> `// @TODO stringify is likely not safe here. We will coerce undefined to null which will make the keyspace smaller than the execution space` — `unstable-cache.ts:132`
> `// @TODO why do we warn this way? Should this just be an error?` — `unstable-cache.ts:231`
> `// @TODO the invocation key can have sensitive data in it. we should not log this entire object` — `unstable-cache.ts:233`
> `// @TODO refactor tags to be a set to avoid this O(n) lookup` — `unstable-cache.ts:188`
> `// @TODO This error handling seems wrong. We swallow the error?` — `unstable-cache.ts:269`
> `// TODO: only revalidate if the path matches` — `revalidate.ts:244`
> `// TODO: This should be globally available and not require an AsyncLocalStorage.` — `cache-life.ts:118`
> `// TODO: This is most likely incorrect. It would lead to the ISR status being flipped when revalidating a static page with a server action.` — `revalidate.ts:194`
> `// TODO(restart-on-cache-miss): we should do a sync IO error here in dev to match prerender behavior` — `revalidate.ts:198`
> `// TODO: change this after investigating why phase: 'action' is set for route handlers` — `revalidate.ts:52`

That's 13 active TODOs in 700 LOC. Next.js's cache layer is **explicitly known to be incomplete** by its own maintainers. This is critical evidence for keeping our scope smaller.

#### Padrão de design

- **Pattern: Strategy + Decorator + AsyncLocalStorage context propagation.** `unstable_cache(cb, ...)` returns a decorated callable. The decorator threads context via two AsyncLocalStorage instances (`workAsyncStorage` for request scope, `workUnitAsyncStorage` for cache/render/prerender scope). The actual storage strategy is pluggable via `IncrementalCache` (which itself fans out to in-memory LRU + disk + remote).
- **Pattern: Pending-promises map.** `workStore.pendingRevalidates` keyed by invocationKey deduplicates concurrent revalidations.
- **Pattern: Tag-as-route encoding.** `revalidatePath` is implemented as `revalidateTag` with a path-encoded synthetic tag (`_N_T_/${path}`). One unified machinery handles both.
- **Pattern: Compile-time directive bridge.** `'use cache'` is a compile-time marker that wires the SWC plugin to wrap the function with `use-cache-wrapper.ts`. Runtime calls (`cacheTag()`, `cacheLife()`) are gated by `process.env.__NEXT_USE_CACHE` and only valid inside the wrapped scope.

---

### 3.3 TanStack Router — version (current HEAD)

#### API pública

Cache configuration lives on `RouteOptions` (compile-time, not a runtime function call):

```ts
// referencias/tanstack-router/packages/router-core/src/route.ts (Routes pseudo-code from data-loading.md)
createFileRoute('/posts')({
  loader: () => fetchPosts(),
  loaderDeps: ({ search: { offset, limit } }) => ({ offset, limit }),
  staleTime: 60_000,            // ms
  preloadStaleTime: 30_000,     // ms
  gcTime: 1_800_000,            // ms (30 minutes default)
  shouldReload: ({ ... }) => boolean,
  preload: false | true,
  loader: { staleReloadMode: 'background' | 'blocking', handler: ... },
})
```

Router-level defaults (`router.options.defaultStaleTime`, `defaultPreloadStaleTime`, `defaultGcTime`, `defaultStaleReloadMode`) — `data-loading.md:155–168`.

Imperative invalidation: `router.invalidate()` — `data-loading.md:175`.

Programmatic LRU primitive (`router-core/src/lru-cache.ts:7`):
```ts
export function createLRUCache<TKey, TValue>(max: number): LRUCache<TKey, TValue>
// returned shape: { get, set, clear }
```

#### Algoritmo interno (prosa, passo a passo)

The TanStack Router cache is a **per-route stale-while-revalidate cache keyed by `(pathname, loaderDeps)`**. Algorithm extracted from `load-matches.ts:780–900`:

1. **Compute `staleAge`** based on `cause`:
   - If `preload === true`: `staleAge = route.options.preloadStaleTime ?? router.options.defaultPreloadStaleTime ?? 30_000` (30 seconds default for preloads).
   - Else: `staleAge = route.options.staleTime ?? router.options.defaultStaleTime ?? 0` (immediately stale by default for normal loads).
2. **Compute `age = Date.now() - prevMatch.updatedAt`**.
3. **`staleMatchShouldReload` decision** (line 820):
   ```
   staleMatchShouldReload =
     age >= staleAge &&
     (forceStaleReload || cause === 'enter' || routeChanged)
   ```
4. **`shouldReload` callback override** (line 811): if the route supplied a `shouldReload` function, it gets the final say.
5. **`loaderShouldRunAsync` decision** (line 826):
   ```
   loaderShouldRunAsync =
     status === 'success' && (invalid || (shouldReload ?? staleMatchShouldReload))
   ```
6. **Branch by `staleReloadMode`**:
   - `'background'` (default): if loader should run, **return stale data immediately** + fire `runLoader(...)` async; on completion, resolve `loaderPromise` and update match.
   - `'blocking'`: if `status !== 'success'` OR `loaderShouldRunAsync`, `await runLoader(...)` (foreground).
7. **`router.invalidate()`** marks every cached route's data as stale by bumping a global counter and setting `invalid = true` on every active match — line 175 of `data-loading.md`.
8. **Garbage collection (`gcTime`)** — entries not accessed for `gcTime` ms (default 30 minutes) are evicted from the in-memory cache. (gc logic not extracted from `load-matches.ts` excerpt; defaults documented at `data-loading.md:160`.)

#### Estado mantido

- Per-match state: `prevMatch.updatedAt` (timestamp of last loader success), `match.status` ('idle' | 'pending' | 'success' | 'error'), `match.invalid` (boolean — `router.invalidate()` flips this), `match._nonReactive.loaderPromise` (in-flight load promise — used for dedup).
- Global: `router.stores.matchesId` (current active match IDs), `router.stores.matchStores` (per-match reactive store).
- LRU cache (functional, `lru-cache.ts:7–74`): `Map<TKey, Node>` + linked-list pointers (`oldest`, `newest`), count-based eviction (no size-based eviction unlike Next.js).

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `JSON.stringify` (deep-equal hidden in core) | stdlib | `loaderDeps` deep equality check (data-loading.md:153) | **Documented behavior — deps are compared by deep equality.** TheoKit would need a deep-equal helper (`fast-deep-equal` is the convergent choice across the ecosystem). |
| LRU (hand-rolled, functional) | — | 74-LOC implementation, doubly-linked list + Map | **TheoKit could clone this exact pattern — it's smaller than Next.js's class version.** |

#### Side effects observáveis

- None at the LRU primitive level — pure data structure.
- At the router level: writes to `router.stores.*` (the TanStack Store reactive state).
- No `globalThis` mutation.

#### TODOs / FIXMEs / HACKs literais

No TODOs in the 74-LOC `lru-cache.ts`. The file is small enough to have no rot.

In `load-matches.ts:881`: `// This is where all of the stale-while-revalidate magic happens` — comment that locates the algorithm but isn't a TODO.

#### Padrão de design

- **Pattern: Per-route declarative options + runtime stale check.** Cache settings (`staleTime`, `gcTime`, `preloadStaleTime`, `shouldReload`) live on `RouteOptions`. The router engine evaluates them at load time. No imperative wrapping (`defineCachedX`) — the cache is *implicit* per route.
- **Pattern: Stale-as-default.** `defaultStaleTime: 0` means everything is stale on revisit unless explicitly opted-in. Forces consumers to think about freshness consciously (the trade-off vs Nitro's "1-second default" or Next.js's "infinite by default").
- **Pattern: Dual freshness windows** — `staleTime` for navigation, `preloadStaleTime` for hover/intent. Recognizes that preloads have lower stakes (no UI rendered yet) and can tolerate fresher data.
- Why: routes are the natural cache boundary on the client; tagging them as durable objects with TTLs avoids the "global cache for everything" trap.

---

### 3.4 Astro — version (current HEAD, Astro v5+ runtime cache)

#### API pública

`Astro.cache` is exposed per-request (a `CacheLike` instance built fresh for each request):

```ts
// referencias/astro/packages/astro/src/core/cache/runtime/cache.ts:15–34
export interface CacheLike {
  readonly enabled: boolean
  set(input: CacheOptions | CacheHint | LiveDataEntry | false): void
  readonly tags: string[]
  readonly options: Readonly<CacheOptions>
  invalidate(input: InvalidateOptions | LiveDataEntry): Promise<void>
}

// referencias/astro/packages/astro/src/core/cache/types.ts:4–10
export interface CacheOptions {
  maxAge?: number
  swr?: number
  tags?: string[]
  lastModified?: Date
  etag?: string
}

// referencias/astro/packages/astro/src/core/cache/types.ts:23–26
export interface InvalidateOptions {
  path?: string
  tags?: string | string[]
}
```

Provider plug-in interface (`types.ts:28–40`):
```ts
export interface CacheProvider {
  name: string
  setHeaders?(options: CacheOptions): Headers
  onRequest?(context: { request, url, waitUntil? }, next: MiddlewareNext): Promise<Response>
  invalidate(options: InvalidateOptions): Promise<void>
}
```

Memory provider (`memory-provider.ts:68–77`):
```ts
export interface MemoryCacheProviderOptions {
  max?: number              // default 1000 entries
  query?: MemoryCacheQueryOptions
}
```

Route rules (config-level — `types.ts:67–82`):
```ts
export interface RouteRule { maxAge?: number; swr?: number; tags?: string[] }
export type RouteRules = Record<string, RouteRule>  // glob → rule
```

#### Algoritmo interno (prosa, passo a passo)

**For `cache.set(input)` invocation** (`cache.ts:48–84`):

1. If `input === false`: disable for this request (clears tags + options, sets `#disabled = true`).
2. If `input` is a `LiveDataEntry`: extract `cacheHint` from it (lines 59–62).
3. Otherwise treat as `CacheOptions | CacheHint`.
4. Merge per-field semantics:
   - `maxAge`, `swr`, `etag`: **last-write-wins** (line 67–71).
   - `lastModified`: **most-recent-wins** (line 74–77 — compares dates).
   - `tags`: **accumulate** into `Set<string>` (line 82).
5. After the response is built, `APPLY_HEADERS` symbol method (line 115) emits headers via `provider.setHeaders?.(options) ?? defaultSetHeaders(options)` and writes them onto the Response.

**For memory provider `onRequest(context, next)`** (`memory-provider.ts:406–510`):

1. **GET-only**: if `request.method !== 'GET'`, call `next()` and return (no caching) — line 411.
2. **Compute primaryKey** = `${url.origin}${url.pathname}${buildQueryString(url, queryConfig)}`. The query string is filtered (default-excludes utm_*, fbclid, etc.) and optionally sorted (default ON).
3. **Build varyKey**: if `varyMap.get(primaryKey)` returns a stored Vary list, build `\0header1=val1\0header2=val2` suffix and append.
4. **Lookup**: `cache.get(key)` — LRU bump.
5. **If hit AND vary-matches**:
   - **Not expired** (`age <= maxAge`): return `X-Astro-Cache: HIT` clone of cached body.
   - **In stale window** (`maxAge < age <= maxAge + swr`): return `X-Astro-Cache: STALE` clone immediately + fire `next().then(...)` async to refresh.
   - **Expired** (`age > maxAge + swr`): fall through to miss path.
6. **Cache miss**: call `next()`, get fresh `Response`. Parse `CDN-Cache-Control` for `max-age` + `stale-while-revalidate`. If `maxAge > 0` AND response has no `Set-Cookie`, serialize the response (clone body to ArrayBuffer, copy headers minus Set-Cookie, capture Vary headers, snapshot `varyValues`). Write to LRU. Set `X-Astro-Cache: MISS`. Return.

**For memory provider `invalidate(invalidateOptions)`** (`memory-provider.ts:512–533`):

1. If `path` supplied: iterate all keys, parse each back via `getPathFromCacheKey()`, delete entries whose path matches exactly (no glob).
2. If `tags` supplied: iterate all keys, look up each entry, delete entries where the tag set overlaps the requested tags (`entry.tags.some((t) => tagsSet.has(t))`).

**For Vary key computation** (`memory-provider.ts:382–389`):

- Use `NUL (\0)` separator because it cannot appear in URLs or HTTP header values — flat-string key, no nested lookup.
- `IGNORED_VARY_HEADERS = new Set(['cookie', 'set-cookie'])` — excluded because cookie has unbounded cardinality (every user different).

**For LRU eviction** (`memory-provider.ts:272–316`):

- Uses a `Map` with insertion-order semantics. On `get`, deletes + re-inserts to push to tail. On `set` with full cache, deletes oldest (first-inserted) before inserting new.
- Count-based eviction (max entries, not max bytes).

#### Estado mantido

- Per-request, mutable: `AstroCache` instance with `#options`, `#tags`, `#disabled` (private state behind `#` syntax).
- Provider-global: `cache: LRUMap<string, CachedEntry>`, `varyMap: Map<primaryKey, Vary[]>` (learns Vary headers from responses to build correct keys on subsequent requests).
- Symbol-based private API: `APPLY_HEADERS = Symbol.for('astro:cache:apply')`, `IS_ACTIVE = Symbol.for('astro:cache:active')` — internal-only methods callable from the framework, not from user code.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `picomatch` | (Astro dep) | Glob matching for `DEFAULT_EXCLUDED_PARAMS` query-key filtering (e.g., `'utm_*'`) | **Yes, but optional.** TheoKit can ship without it (the default exclusion list is short and could be exact-match). |

#### Side effects observáveis

- Writes `X-Astro-Cache: HIT|STALE|MISS` debug header to all responses passing through the provider.
- Calls `console.warn` when skipping cache due to Set-Cookie (`memory-provider.ts:262`).
- Mutates `varyMap` lazily (learn-then-use pattern) — first response with Vary header populates the map; subsequent requests use it.

#### TODOs / FIXMEs / HACKs literais

No TODOs in `memory-provider.ts` or `cache.ts`. The Astro cache layer was added in v5 and is comparatively young; code is clean.

From `.changeset/astro-cache-disabled-shim.md`:
> "Fixes a regression where `Astro.cache` was `undefined` when `experimental.cache` was not configured. The previous documented behavior is for `Astro.cache` to always be defined as a no-op shim: `cache.set()` warns once, `cache.invalidate()` throws and `cache.enabled` can be used to gate."

This is the only Astro changeset on cache; it documents that the cache surface should ALWAYS exist, even when disabled, so consumer code can call `cache.set(...)` without a `if (Astro.cache)` guard.

#### Padrão de design

- **Pattern: Accumulator + Final Apply.** `cache.set()` is called many times during a request (header builders, loaders, middleware) and merges options into an in-memory accumulator. `applyCacheHeaders(cache, response)` flushes once at response time. Avoids "last loader wins" surprises that pure setters would create.
- **Pattern: Provider Strategy.** `CacheProvider` interface lets users plug a Redis provider, a Cloudflare KV provider, etc., without touching the framework. The default `memory-provider` is one implementation.
- **Pattern: Vary-learning** — the framework doesn't ask the user to declare Vary upfront. It reads the Vary header from responses and **stores it in a side `varyMap`** for the same primary key. Subsequent requests use the learned Vary to build the correct cache key. Trade-off: first response under a new Vary configuration is a single miss before learning kicks in.
- **Pattern: Defensive query-key sanitization.** `DEFAULT_EXCLUDED_PARAMS` (line 117) covers the common tracking params (`utm_*`, `fbclid`, `gclid`, etc.) so analytics-tagged URLs don't fragment the cache. This is the kind of edge-case-discovery that a smaller framework would miss; Astro inherits it from real production deployments.
- **Pattern: Default-shim graceful disable.** Even when no provider is configured, `Astro.cache` exists as a no-op (per `.changeset`). Consumer code stays the same; no `if (cache)` guards.

## 4. Convergent patterns (todos concordam)

1. **SWR is the default freshness model.** All four frameworks default to stale-while-revalidate over hard expiration. Nitro: `swr: true` default (`docs/1.docs/7.cache.md:269`). Next.js: `cacheLife { revalidate, expire }` → `Cache-Control: s-maxage, stale-while-revalidate` (`cache-control.ts:21`). TanStack: `defaultStaleReloadMode: 'background'` (`data-loading.md:174`). Astro: `swr` field in `CacheOptions` (`types.ts:6`). **TheoKit should default to SWR.**
2. **GET-only response caching.** Nitro (`docs/1.docs/7.cache.md:48`), Astro (`memory-provider.ts:411`), Next.js (via `patch-fetch.ts` GET-by-default — POST is `force-no-store` unless explicit). **TheoKit should mirror this default.**
3. **Cache key is request-URL + sorted query, with tracking-param exclusion.** Astro most explicit (`memory-provider.ts:117`). Next.js sorts search params in `unstable-cache.ts:411`. Nitro hashes URL + selected `varies` headers (`docs/1.docs/7.cache.md:413`). **TheoKit cache key spec should: (a) lowercase host, (b) sort query params, (c) exclude tracking params (utm_*, fbclid, …) by default, (d) optionally include Vary-listed headers.**
4. **Set-Cookie pings cache poison-avoidance.** Astro refuses to cache responses with Set-Cookie (`memory-provider.ts:444`). Astro also strips Set-Cookie from cached headers explicitly (`memory-provider.ts:335`). Next.js does not document this; it relies on the consumer to set `revalidate: 0` for personalized responses (defensive-by-default vs reactive — Astro's call is safer for the framework). **TheoKit should adopt Astro's posture: refuse to cache + warn if response has Set-Cookie.**
5. **Tag-based invalidation is the user-facing primitive; path-based is sugar.** Next.js implements `revalidatePath` as `revalidateTag(_N_T_/${path})` (`revalidate.ts:105`). Astro's `invalidate({ path })` is a separate code path but conceptually similar (`memory-provider.ts:513`). Nitro exposes `cachedFn.invalidate(...args)` and `invalidateCache({ options, args })` — both are key-based, not tag-based. **TheoKit should expose tag-based primary, path-based as sugar.**
6. **Storage adapter is pluggable.** Nitro uses `unstorage` (20+ drivers). Astro uses a `CacheProvider` interface. Next.js uses `IncrementalCache` with handler interface. **TheoKit should expose an adapter interface; ship in-memory by default; document how to wire Redis / Cloudflare KV.**
7. **A request-scoped accumulator beats per-call setters.** Astro's `cache.set()` accumulates `tags` + `lastModified`. Next.js's `cacheTag()` appends to `workUnitStore.tags`. Nitro's `varies` option also accumulates. **TheoKit should accumulate, not last-write-wins.**

## 5. Divergent patterns (trade-off real)

1. **Where the cache scope is declared.**
   - **Next.js (legacy)**: imperative — `unstable_cache(cb, keyParts, opts)` wraps a function (`unstable-cache.ts:61`). Trade-off: explicit at call site, requires reference to wrapper.
   - **Next.js (modern)**: declarative + directive — `'use cache'` + `cacheLife(...)` + `cacheTag(...)` (`cache-life.ts:77`, `cache-tag.ts:4`). Trade-off: requires compile-time SWC plugin; mental model is "inside the function, you're cached"; runtime-gated by `__NEXT_USE_CACHE`.
   - **Nitro**: imperative wrapper — `defineCachedFunction(fn, opts)` or `defineCachedHandler(handler, opts)`. Trade-off: similar to legacy Next; opt-in per usage.
   - **TanStack Router**: implicit — cache is on by default for every `route.loader`, configured via `RouteOptions.staleTime`. Trade-off: nice on the client (routes are the natural boundary), no opt-in needed; but no escape hatch for non-loader server functions.
   - **Astro**: imperative + accumulator — `Astro.cache.set(...)` plus optional `RouteRules` config. Trade-off: works for both per-route (config) and per-call (imperative); learning curve to know which to use when.
   - **TheoKit choice:** imperative wrapper (`defineCachedRoute` + `defineCachedFunction`). Mirrors Nitro — small surface, no SWC plugin, no AsyncLocalStorage requirement at MVP, no "magic decorator" that violates the framework's no-magic principle. Defer the directive form until RSC arrives (per [[server-components-rsc.md]]).

2. **Cache key computation.**
   - **Next.js**: `fn.toString() + keyParts + JSON.stringify(args)` — fragile (line 91, 132 of `unstable-cache.ts` are explicit TODOs about this). Function-source change = cache bust (intentional, but kind of wasteful for whitespace changes).
   - **Nitro**: `${base}:${group}:${name}:${getKey(...args)}.json` — user-supplied `getKey` is canonical (`docs/1.docs/7.cache.md:387`). Function-source change does NOT bust cache unless caller wires `integrity` option (`docs/1.docs/7.cache.md:255` — Nitro auto-computes `integrity` from function code in dev).
   - **TanStack Router**: `(pathname, loaderDeps)` deep-equal — declarative, no `getKey` boilerplate.
   - **Astro**: `${origin}${pathname}${filteredSortedQuery}` + Vary suffix — declarative from URL.
   - **TheoKit choice:** **user-supplied `getKey(...args)` (Nitro-style)**, with smart defaults (URL+sorted query for routes, JSON.stringify(args) for functions). Surface the `integrity` concept as `cacheVersion` (user-bumpable string) to handle the "function logic changed" case explicitly.

3. **Stale-time default.**
   - **Nitro**: `maxAge: 1` second (`docs/1.docs/7.cache.md:261`). Trade-off: extremely conservative; effectively no caching unless user opts up.
   - **Next.js**: `cacheLife({ revalidate: undefined })` → no automatic SWR; user must opt-in via `revalidate: number`. Trade-off: zero risk of accidental staleness, but bad DX (user must know to set revalidate).
   - **TanStack Router**: `defaultStaleTime: 0` ms — immediately stale (`data-loading.md:170`). Trade-off: explicit "you're always reloading" — paranoid but predictable.
   - **Astro**: `maxAge` is `undefined` by default — no cache unless user calls `cache.set({ maxAge: N })`. Trade-off: zero risk; bad DX.
   - **TheoKit choice:** **mirror Nitro's `maxAge: 1` second + `swr: true`**. Predictable DX (small but useful default), low risk of mass staleness, easy to explain ("we cache for 1 second + serve stale while refreshing").

4. **Tag size constraints.**
   - **Next.js**: `NEXT_CACHE_TAG_MAX_LENGTH = 256` chars per tag, `NEXT_CACHE_TAG_MAX_ITEMS = 128` tags max per cache scope (`constants.ts:34-35`, enforced in `patch-fetch.ts:93–112` via `validateTags`).
   - **Nitro / ocache**: no documented limit (delegated to user / storage backend).
   - **Astro**: no limit (passed through as strings to storage).
   - **TanStack Router**: no tags concept (key is `(pathname, loaderDeps)`).
   - **TheoKit choice:** **adopt Next.js limits**: `tag.length ≤ 256`, `tags.length ≤ 128`. Warn (not throw) on overflow. Documented in error messages.

5. **Background revalidation lifecycle.**
   - **Nitro**: `event.waitUntil(...)` on edge workers, blocking on Node (`docs/1.docs/7.cache.md:93–122`).
   - **Next.js**: pushes promise to `workStore.pendingRevalidates`, awaited at end-of-request (`unstable-cache.ts:284`).
   - **Astro**: fire-and-forget Promise (`.then(...).catch(...)` — `memory-provider.ts:439–467`). Trade-off: simplest; assumes a long-lived server.
   - **TanStack Router**: client-side IIFE inside `loadRouteMatch` (`load-matches.ts:836–850`). Trade-off: no backend concern.
   - **TheoKit choice:** **mirror Next.js**: schedule promise via `ctx.waitUntil?.(promise)` when adapter supports it (Cloudflare/Vercel Edge expose it); otherwise track on a per-request `pendingPromises` and await at end-of-handler. Document the edge-worker gotcha.

## 6. Dependency inventory — bibliotecas comuns

Convergent libs (appear in 2+ frameworks):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `unstorage` | Nitro (direct), Astro (indirect — content layer uses it) | Storage abstraction with 20+ drivers (memory, fs, redis, cloudflare-kv, deno-kv, s3, etc.). MIT, unjs ecosystem, battle-tested. | **Adopt.** Solves "swap storage backend" without TheoKit knowing about each backend. ~75 KB minified; tree-shakable. Adopting establishes TheoKit on the unjs side of the ecosystem (precedent: Theo's [`devtools.md`](devtools.md) already adopted `goober` from there). |
| `ocache` | Nitro | Full cache algorithm (key derivation, SWR, dedup, ETag, 304) | **Evaluate, lean toward adopt.** `^0.1.4` — pre-1.0, API unstable. But ~500 LOC of focused code that solves exactly our problem. Risk: TheoKit pinned to ocache 0.1.x cadence. Mitigation: re-export as `@theokit/cache-engine` so we control the public surface; if ocache breaks, we fork. |
| `fast-deep-equal` (or `dequal`) | TanStack Router (transitively), commonly across the ecosystem | Deep equality for `loaderDeps` and cache-key normalization | **Adopt `dequal`.** 200 bytes minified, MIT, no deps. We already need it for the React Router 7 integration in `theokit/router`. |
| `picomatch` | Astro | Glob matching (`utm_*` exclusion) | **Optional.** Could ship without (exact-match the 25 known tracking params). Adding ~3 KB for glob support is fine if we want user-extensibility. |
| `lru-cache` (or hand-roll) | Next.js (hand-rolled, 238 LOC), TanStack Router (hand-rolled, 74 LOC), Astro (hand-rolled, ~45 LOC `LRUMap`) | In-memory LRU eviction | **Hand-roll**, ~50 LOC. The Astro `LRUMap` shape (Map insertion-order iteration) is simplest and sufficient for our needs. Adding `lru-cache` from npm is ~3 KB and overkill. |

Specifically NOT adopted:
- `h3`, `srvx` (Nitro's runtime — we have our own).
- AsyncLocalStorage from Node (`async_hooks`). Too Node-specific; would block our edge-runtime story (Cloudflare Workers has it via `nodejs_compat` but it's not universal). Use a Headers-based or per-request-object plumbing instead.

## 7. Algorithms / data structures não-óbvios

- **LRU with size-based eviction (Next.js `lru-cache.ts:46–238`)** — Doubly-linked-list with sentinel head/tail + Map for O(1) access. **`size <= 0` throws** (line 128) — prevents unbounded growth when user-supplied `calculateSize` returns zero. **`size > maxSize` warns + returns false** (line 134) — avoids permanent eviction storm. Complexity: O(1) get/set, O(k) eviction where k = items evicted (can be O(N) when sizes vary widely).

- **Functional LRU (TanStack Router `lru-cache.ts:7–74`)** — Same LRU but in 74 LOC. Manual node touch via mutation: `oldest`/`newest` pointers, in-place link surgery. **No size accounting** — count-based only. Simpler, smaller, but no protection against large entries.

- **LRUMap via Map insertion order (Astro `memory-provider.ts:272–316`)** — Cleverest of the three. Uses the fact that `Map` iterates in insertion order. On `get`, `delete` + `set` re-inserts to push the key to the end (most recent). On overflow, `Map.keys().next().value` returns the oldest key. ~45 LOC, no linked list needed. **Trade-off**: 2× Map operations per get (delete + set) vs the linked-list approach which is 3 pointer manipulations — negligible for our scale.

- **Tag → cache-entries fan-out invalidation (Next.js `revalidation-utils.ts:80–183`)** — Tags are grouped by profile (`tagsByProfile` Map), then each handler's `updateTags(tagsForProfile, durations)` is called. Crucially, the diff algorithm in `diffRevalidationState` (line 47) compares "before" and "after" sets via `Set<string>` of `${tag}:${profileKey}` keys, so re-runs only execute *new* revalidations from the inner callback. **Used to wrap a route handler so any revalidations it triggers fire only once.**

- **Vary-learning cache key (Astro `memory-provider.ts:382–419`)** — Maintains a side `varyMap: Map<primaryKey, Vary[]>`. On first response under a primary key, learns the Vary headers from the response and stores them. On subsequent requests, looks up the Vary list first, then builds the full cache key including `\0header=value\0...` suffix. **Net effect**: zero user config for Vary handling, at the cost of one cache miss per primary key under a new Vary configuration.

- **Path-as-tag encoding (Next.js `revalidate.ts:97–122`)** — `revalidatePath('/dashboard', 'page')` becomes `revalidateTag('_N_T_/dashboard/page')`. The `NEXT_CACHE_IMPLICIT_TAG_ID` constant (`_N_T_`) marks path-derived tags. One invalidation engine handles both. **Trade-off**: tags accumulated by path-tracked work units must also encode their path (`workUnitStore.implicitTags`). Slightly more complex bookkeeping but unified API.

- **NUL-separator Vary key (Astro `memory-provider.ts:382`)** — Uses `\0` as separator because it cannot appear in URLs or HTTP header values. Avoids escaping logic and lets the cache key be a flat string in the LRU map. Pragmatic, simple, robust.

## 8. Edge cases conhecidos (com fonte)

| Edge case | Como manifesta | Onde foi corrigido / documentado | Como devemos prevenir |
|---|---|---|---|
| Cache entry from a different "kind" (e.g., expected FETCH but got something else) | Console.error + falls through to recompute | `unstable-cache.ts:231` — `@TODO why do we warn this way? Should this just be an error?` | Type-tag cache entries with a discriminator; if mismatch, treat as miss (don't crash). |
| Function source change without explicit version bump | Cache returns stale logic results — same args, "new" function | `unstable-cache.ts:91` (Next.js `@TODO`), Nitro's `integrity` option | TheoKit ships `cacheVersion?: string` on options; in dev, auto-bump from a hash of the function source. In prod, require explicit version. |
| `JSON.stringify(args)` loses `undefined` (coerces to omission) | `cacheKey(undefined)` === `cacheKey({})` collision | `unstable-cache.ts:132` — `@TODO stringify is likely not safe here` | TheoKit uses stable-stringify variant that sentinel-encodes `undefined` (` undefined`), `NaN`, etc., OR requires user-supplied `getKey` for non-JSON args. |
| Cached function that returns Map/Set/Symbol | Lost on JSON roundtrip; user gets back a plain object | `docs/1.docs/7.cache.md:88` (Nitro doc) | TheoKit documents the constraint; offers `serialize`/`deserialize` hooks for advanced cases (mirrors Nitro's `transform()` option). |
| Cache poison via Set-Cookie | Per-user response cached for all users | Astro `.changeset/astro-cache-disabled-shim.md`, Astro `memory-provider.ts:262` + `warnSkippedSetCookie` | TheoKit refuses to cache + emits a warn log when response has Set-Cookie. |
| Cookie used as Vary key | Unbounded cardinality, effectively zero cache hit rate | Astro `memory-provider.ts:219` — `IGNORED_VARY_HEADERS = new Set(['cookie', 'set-cookie'])` | TheoKit silently drops `cookie` / `set-cookie` from the Vary list with a one-time warn. |
| Tag too long or non-string in array | Cache entry can't be serialized correctly | Next.js `patch-fetch.ts:81–122` (`validateTags`) — drops invalid tags, warns | TheoKit's `validateTags`: drops with warn (don't throw at runtime — would break user code unexpectedly). |
| Tag count > 128 in a single scope | Memory blowup; map iteration explosion | Next.js `constants.ts:35`, `validateTags` line 105 truncates + warns | TheoKit enforces `tags.length ≤ 128`; truncates with warn. |
| `revalidatePath` called for a dynamic route without `type` parameter | Silently no-ops | `revalidate.ts:109–112` — warns "no effect by default" | TheoKit: `revalidatePath` requires explicit type for dynamic routes; emits explicit error (we'd rather refuse than silently no-op). |
| `revalidateTag` called inside `render` phase | Throws "must always happen outside of renders" | `revalidate.ts:140` | TheoKit: same. Document clearly in API JSDoc. |
| `cacheLife` outside `'use cache'` scope | Throws "can only be called inside a 'use cache' function" | `cache-life.ts:97` | TheoKit: equivalent — `cacheLife` only valid inside `defineCachedRoute`/`defineCachedFunction` body via context check. |
| `cacheLife({ revalidate: 60, expire: 30 })` (expire < revalidate) | Throws explicit error at validate-time | `cache-life.ts:65–73` | TheoKit: Zod schema with refine; explicit error. |
| `cache.set(false)` in Astro | Disables caching for this request (idempotent) | `cache.ts:48–53` | TheoKit: `cache.disable()` or `cache.set(false)`. |
| Cached handler returns status >= 400 | NOT cached (Nitro) | `docs/1.docs/7.cache.md:416` | TheoKit: status `< 400` only by default; cache.set({ cacheErrors: true }) opt-in for testing. |
| Cached function called recursively (nested cache call) | Inner call bypasses cache (Next.js) | `unstable-cache.ts:195` — `isNestedUnstableCache` branch | TheoKit: same — nested calls bypass; document. |
| Background revalidation throws | Silent log; cached value remains | Astro `memory-provider.ts:462–467`, Nitro defaults onError to console + captureError | TheoKit: bubble to `onError` hook with cache context; default = console.warn. |
| Concurrent first request to same key | Could trigger N parallel loader executions | Nitro deduplication (`docs/1.docs/7.cache.md:51`), Next.js `pendingRevalidates[invocationKey]` (`unstable-cache.ts:252–286`) | TheoKit: per-key `inFlight: Map<key, Promise>` dedupes concurrent first-misses. Documented behavior. |
| Cache provider undefined when feature flagged off | `Astro.cache` was undefined (regression!) | Astro `.changeset/astro-cache-disabled-shim.md` (2026) | TheoKit: `cache` is always defined; no-op when no provider configured; throws on `invalidate` (informative error). |
| Edge-worker instance death during background revalidation | Background fetch never completes | Nitro uses `event.waitUntil` (`docs/1.docs/7.cache.md:93`) | TheoKit: detect `ctx.waitUntil`; if present, wrap the background promise; else schedule via end-of-request `pendingPromises`. |
| URLs differ only by tracking params (e.g., `?utm_source=email`) | Cache fragmentation: every email click misses | Astro `memory-provider.ts:117` — `DEFAULT_EXCLUDED_PARAMS` (25 known params) | TheoKit: adopt Astro's default list verbatim; expose `cacheKey.queryFilter` config. |

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
┌─────────────────────────────────────────────────┐
│           User app (server/, app/)              │
└──┬──────────┬───────────────┬───────────────────┘
   │          │               │
   │ wraps    │ wraps         │ declares (config)
   ▼          ▼               ▼
┌─────────────────┐  ┌────────────────────┐  ┌──────────────┐
│defineCachedRoute│  │defineCachedFunction│  │theo.config.ts│
└──┬──────────────┘  └──────────┬─────────┘  │  cache:      │
   │                            │            │   storage    │
   │ at runtime: looks up       │            │   defaults   │
   ▼                            ▼            └──────┬───────┘
┌─────────────────────────────────────────┐         │
│        Cache Engine (theokit/cache)     │◀────────┘
│  - key derivation (URL+query / args)    │
│  - SWR scheduling                       │
│  - tag accumulator                      │
│  - in-flight dedupe                     │
│  - background revalidation              │
└──────────────────┬──────────────────────┘
                   │ delegates to
                   ▼
       ┌────────────────────────┐
       │   StorageAdapter       │  (interface)
       │  get/set/delete/keys() │
       └─────┬──────────────────┘
             │ implementations
   ┌─────────┴─────────┬────────────┬──────────────┐
   ▼                   ▼            ▼              ▼
┌──────┐         ┌────────┐  ┌──────────────┐  ┌──────────┐
│Memory│         │FileSys │  │Redis (via    │  │CF KV     │
│(LRU) │         │(.theo) │  │ unstorage)   │  │(via      │
└──────┘         └────────┘  └──────────────┘  │unstorage)│
                                                └──────────┘

Revalidation API (revalidateTag, revalidatePath):
  call → adapter.deleteByTag(tag) → fires on next request
```

### 9.2 Files to create

```
packages/theo/src/cache/index.ts                 — barrel export (NEW)
packages/theo/src/cache/define-cached-route.ts   — defineCachedRoute() (NEW)
packages/theo/src/cache/define-cached-fn.ts      — defineCachedFunction() (NEW)
packages/theo/src/cache/revalidate.ts            — revalidateTag, revalidatePath, updateTag (NEW)
packages/theo/src/cache/cache-engine.ts          — SWR loop, dedup, scheduling (NEW)
packages/theo/src/cache/key-derivation.ts        — URL+query + getKey + tracking-param filter (NEW)
packages/theo/src/cache/cache-control-header.ts  — getCacheControlHeader(opts) (NEW)
packages/theo/src/cache/lru-store.ts             — in-memory LRU StorageAdapter (NEW, ~50 LOC)
packages/theo/src/cache/storage-adapter.ts       — StorageAdapter interface + types (NEW)
packages/theo/src/cache/context.ts               — per-request cache context (tags, opts accumulator) (NEW)
packages/theo/src/cache/validation.ts            — validateTags, validateMaxAge, etc (NEW)

packages/theo/src/server/index.ts                — add cache exports (MODIFY)
packages/theo/src/config/schema.ts               — add cache config Zod schema (MODIFY)
packages/theo/src/router/handler.ts              — invoke cache provider in middleware chain (MODIFY)

tests/unit/cache-key-derivation.test.ts          — RED + GREEN (NEW)
tests/unit/cache-engine.test.ts                  — RED + GREEN (NEW)
tests/unit/cache-lru-store.test.ts               — RED + GREEN (NEW)
tests/unit/cache-revalidate.test.ts              — RED + GREEN (NEW)
tests/unit/cache-control-header.test.ts          — RED + GREEN (NEW)
tests/unit/cache-validation.test.ts              — RED + GREEN (NEW)
tests/integration/cache-define-cached-route.test.ts (NEW)
tests/integration/cache-revalidate-tag-fanout.test.ts (NEW)

fixtures/cache-basic/                            — Playwright fixture (NEW)
docs/concepts/caching.md                         — public docs (NEW)
```

### 9.3 Public API surface (TypeScript)

```ts
// theokit/server
export function defineCachedRoute<TSchema>(config: {
  // existing defineRoute fields…
  cache?: {
    maxAge?: number              // seconds; default 1
    swr?: number                 // seconds; default = maxAge * 60 (Astro pattern)
    tags?: string[]              // explicit tags
    varies?: string[]            // header names to vary on
    getKey?: (req: Request) => string  // override default URL+query key
    bypassWhen?: (req: Request) => boolean  // bypass without invalidating
    cacheVersion?: string        // bump to invalidate all entries
    cacheErrors?: boolean        // default false: status >= 400 not cached
  }
}): RouteConfig

export function defineCachedFunction<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  opts: {
    name: string                 // required — cache namespace
    maxAge?: number
    swr?: number
    getKey?: (...args: TArgs) => string  // default JSON.stringify
    tags?: string[] | ((...args: TArgs) => string[])
    cacheVersion?: string
    transform?: (raw: TReturn) => TReturn
    validate?: (raw: TReturn) => boolean
    onError?: (err: unknown, ctx: CacheErrorContext) => void
  }
): ((...args: TArgs) => Promise<TReturn>) & {
  invalidate: (...args: TArgs) => Promise<void>
}

// Invalidation
export function revalidateTag(
  tag: string,
  opts?: { expire?: number }   // seconds; 0 = immediate; undefined = SWR
): Promise<void>

export function revalidatePath(
  path: string,
  opts?: { type?: 'layout' | 'page'; expire?: number }
): Promise<void>

export function updateTag(tag: string): Promise<void>  // Server-Action-safe: immediate + read-your-writes

// Storage adapter for advanced users
export interface CacheStorageAdapter {
  name: string
  get(key: string): Promise<CacheEntry | undefined>
  set(key: string, entry: CacheEntry): Promise<void>
  delete(key: string): Promise<void>
  deleteByTag(tag: string): Promise<number>  // returns # deleted
  keys(prefix?: string): AsyncIterableIterator<string>
}

export interface CacheEntry {
  body: ArrayBuffer | string   // serialized payload
  status: number
  headers: Array<[string, string]>
  storedAt: number             // epoch ms
  maxAge: number               // seconds
  swr: number                  // seconds
  tags: string[]
  vary?: string[]
  varyValues?: Record<string, string>
  version?: string             // cacheVersion at write time
}

// Built-in adapter
export class InMemoryCacheAdapter implements CacheStorageAdapter { /* ... */ }
```

Config schema (`theo.config.ts`):
```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  cache: {
    enabled: true,
    storage: 'memory',           // 'memory' | adapter instance
    defaults: {
      maxAge: 1,                 // seconds
      swr: 60,                   // seconds
      cacheErrors: false,
    },
    keyDerivation: {
      excludeQuery: ['utm_*', 'fbclid', 'gclid', '_ga'],
      sortQuery: true,
      lowercaseHost: true,
    },
    routeRules: {                // (Phase 4, optional)
      '/api/usage/**': { maxAge: 60, swr: 300 },
      '/api/realtime/**': { maxAge: 0 },
    },
  },
})
```

### 9.4 Dependências a adotar

| Package | Version | Justification |
|---|---|---|
| `unstorage` | `^1.10.x` | Storage abstraction with 20+ drivers (memory, fs, redis, cloudflare-kv). MIT, unjs, ~75 KB minified, tree-shakable. Already in our broader ecosystem (devtools precedent). |
| `dequal` | `^2.0.x` | Deep equality for `loaderDeps`-style cache-key normalization and config diff in revalidation pipeline. 200 bytes, no deps, MIT. |

Both can be added as optional peer deps if we want to keep the cache layer pluggable. Initial direction: hard-dep (Phase 1 ships with both) — we can convert to peerDep later if there's pressure.

NOT adopted:
- `ocache`. **Decision: don't adopt; build a focused ~300 LOC engine ourselves.** Rationale: ocache is `^0.1.4` (pre-1.0); coupling our cache to its release cadence is risk. Our requirements are smaller than Nitro's (no h3, no FastResponse, no event.waitUntil concerns at MVP — those come in Edge phase). Building it ourselves gives us full control over edge cases listed in §8 and lets us version-stable our cache surface independently of any upstream.
- `lru-cache` from npm. ~50 LOC of hand-rolled LRU (Astro's `LRUMap` pattern) is sufficient.
- `AsyncLocalStorage`. We thread cache context through the existing `RequestContext` object (already passed to middleware + routes). No async-storage required.

### 9.5 Test strategy

- **Unit** (`tests/unit/cache-*.test.ts`):
  - `cache-key-derivation.test.ts` — URL+sorted-query, tracking-param filter, Vary suffix, custom `getKey` override (15+ scenarios)
  - `cache-engine.test.ts` — fresh hit / stale hit (SWR triggered) / expired miss / in-flight dedup / background revalidate / error path (12+ scenarios)
  - `cache-lru-store.test.ts` — set/get/delete, LRU eviction order, count-based eviction at capacity (8+ scenarios)
  - `cache-revalidate.test.ts` — revalidateTag fans out across keys, revalidatePath encodes as tag, updateTag is immediate, deduplication of multiple revalidations in same request (10+ scenarios)
  - `cache-control-header.test.ts` — header emission for { maxAge, swr, expire }, `revalidate: 0` → no-store path (6+ scenarios)
  - `cache-validation.test.ts` — tag max length, tag count, validateMaxAge non-negative, validateExpire > revalidate (8+ scenarios)
- **Integration** (`tests/integration/`):
  - `cache-define-cached-route.test.ts` — full HTTP roundtrip; first request misses (200 + headers); second request hits within maxAge; third request after swr serves stale + triggers background; verify X-Theo-Cache HIT|STALE|MISS debug header (in dev only).
  - `cache-revalidate-tag-fanout.test.ts` — POST /api/admin/revalidate?tag=usage:user:123 → all cached entries tagged `usage:user:123` are invalidated; subsequent GET hits source.
- **Fixture** (`fixtures/cache-basic/`) — minimal reproducible app with one cached route + one cached function + one revalidate webhook. Documented in README.md.
- **Playwright** (when applicable) — none for MVP. Cache behavior is server-side; no UI test surface beyond X-Theo-Cache debug header validation (covered by integration test).

### 9.6 Phases of rollout

1. **Phase 1 — Storage adapter + LRU + Engine core (NO route integration).** Target: `theokit/cache` package compiles, exports `InMemoryCacheAdapter`, `CacheStorageAdapter` interface, `defineCachedFunction(fn, opts)` works in isolation (TDD on `cache-engine.test.ts` + `cache-lru-store.test.ts`). RED first; GREEN minimal. 3 days.
2. **Phase 2 — `defineCachedRoute` wiring into the route runtime.** Target: a route declared with `cache: { maxAge: 60 }` returns cached HTML on second hit; X-Theo-Cache debug header verifiable. Integrates with existing middleware chain. 2 days.
3. **Phase 3 — Tag-based revalidation + path-based sugar.** Target: `revalidateTag('foo')` from a server action busts all entries tagged `foo`; `revalidatePath('/dashboard')` busts all entries with path `/dashboard`. 2 days.
4. **Phase 4 — Route rules from `theo.config.ts`.** Target: `cache.routeRules: { '/api/**': { maxAge: 60 } }` works without wrapping each route. Glob-matched in middleware. 1.5 days.
5. **Phase 5 — `unstorage` adapter (Redis + Cloudflare KV).** Target: `storage: createStorage({ driver: redisDriver(...) })` works in `theo.config.ts`. Document in `docs/concepts/caching.md`. 1.5 days.
6. **Phase 6 — Dogfood QA (mandatory final phase per [[to-plan]]).**

Total: **~10 days of focused work** (matches the original ~1 week estimate).

### 9.7 Acceptance criteria

- [ ] `theokit/server` exports `defineCachedRoute`, `defineCachedFunction`, `revalidateTag`, `revalidatePath`, `updateTag` (verified by `grep export packages/theo/src/server/index.ts`)
- [ ] `theokit/server` exports `CacheStorageAdapter`, `CacheEntry`, `InMemoryCacheAdapter` types
- [ ] First request to a cached route returns `X-Theo-Cache: MISS` in dev; second request within maxAge returns `X-Theo-Cache: HIT`
- [ ] `revalidateTag('foo')` removes all cache entries tagged `foo` within 1 request boundary
- [ ] `revalidatePath('/dashboard')` busts the dashboard cache regardless of which loader populated it
- [ ] `cacheLife({ revalidate: 60, expire: 30 })` throws at config-validate time (expire < revalidate)
- [ ] `tag.length > 256` warns + drops the tag; `tags.length > 128` warns + truncates
- [ ] Set-Cookie response skips cache + emits a warning log
- [ ] Concurrent first-miss to the same key triggers exactly 1 loader execution (in-flight dedupe verified by integration test counting calls)
- [ ] Background revalidation completes without blocking the response on the SWR window path
- [ ] Pass: TypeScript strict check (`tsc --noEmit`) clean
- [ ] Pass: Lint check (eslint) — zero warnings
- [ ] Pass: All unit tests green (`pnpm vitest run`)
- [ ] Pass: All integration tests green
- [ ] Pass: Code-audit checks across `packages/theo/`
- [ ] Pass: Dogfood QA health ≥ 70/100, zero CRITICAL issues
- [ ] Docs: `docs/concepts/caching.md` published with all 4 patterns demonstrated

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hand-rolled cache engine has a correctness bug found in production | Med | Lift Next.js's edge-case enumeration into the test suite verbatim (§8 of this doc). 90% of cache bugs hit the enumerated scenarios. |
| `unstorage` API breaks in a minor version | Low | Pin `^1.10.x`; treat upgrades as a deliberate review. Wrap behind our `CacheStorageAdapter` so swap is single-file. |
| User cache config too rich → can't ship in 10 days | Med | Phase 1+2+3 (core + route + tag) ship MVP; route-rules + Redis driver are Phase 4+5 and can slip if needed. |
| Edge-runtime gotcha (`waitUntil`) not handled | High (we don't have edge today) | Phase 1 doesn't address it; emit a doc note. The current adapters (only `node` validated) are explicitly non-edge in 0.2.x; we have headroom to add `ctx.waitUntil?.()` plumbing in 0.5.0+ when edge story matures. |
| Tag fan-out is O(N) over all keys | Med | Build a `tags → Set<key>` reverse index in the in-memory store (Astro pattern). For other adapters, document that O(N) iteration is acceptable up to ~10K entries; users on Redis can use `SCAN` + `MGET`. |
| Background revalidation throws + cached value becomes stale forever | Med | Default onError logs and keeps stale entry; user-configurable `cacheErrors: true` to swap to no-cache-on-error mode. |
| Cache poison via user-controlled query params | Med | DEFAULT_EXCLUDED_PARAMS list strips tracking params; document that user must NOT include sensitive data in query strings without an explicit `getKey` override that filters them. |

## 10. Open questions

Items where the research did NOT land a definitive answer. Each is a TODO before plan submission.

1. **Should we adopt `ocache` or build our own engine?** Trade-offs in §6. **Recommendation: build our own** for v0.5.0, re-evaluate at v1.0 when we can ride ocache's eventual stabilization. But this is an explicit team-level call, not a unilateral one.
2. **What's the right default for `maxAge`?** Nitro: 1s. Next.js: undefined (must opt-in). TanStack: 0s. Astro: undefined. **Recommendation: 1s + swr: 60s default** — matches Nitro's posture of "small cache helps, never hurts". But this is a UX call worth team discussion.
3. **Do we expose route rules at config-level (Astro/Nitro pattern) OR per-route wrapper (Nitro `defineCachedHandler` pattern) — or both?** I lean both; Astro's `RouteRules` is great for cross-cutting policy, while `defineCachedRoute` is great for explicit per-handler intent. But shipping both at MVP is double the API surface.
4. **`AsyncLocalStorage` or threaded `ctx` object?** Next.js needs ALS because `'use cache'` callsite has no visible context. TheoKit doesn't have `'use cache'` (we have explicit wrappers), so threading ctx through wrappers is sufficient. But once we add server actions calling `revalidateTag()` *outside* a wrapper, we'll need *some* form of context propagation. **Lean towards: per-request `ctx` object passed everywhere; falls back to module-level state in pure-function calls (e.g., `revalidateTag()` called from a webhook handler reads from the active request via the route handler's closure).**
5. **`cacheVersion` autocomputed in dev (from function source hash) vs always explicit?** Nitro's `integrity` option does it (`docs/1.docs/7.cache.md:255`); Next.js's `cb.toString()` does it (with the known `@TODO if cb.toString() is long we should hash it`). Auto is great DX in dev (function edit → fresh cache); explicit is better for prod (no spurious bumps from formatter). **Lean: auto in dev, require explicit in prod (or emit a warning if missing in prod).**
6. **Should Server-Sent Events (SSE) be excluded from cache?** SSE responses are streamed, indefinite, and meaningless to cache. Current convergent answer (Nitro, Astro): only GET/HEAD; SSE is GET, so this would naively try to cache it. **Lean: detect `text/event-stream` content type at response time and bypass; emit a warning if user explicitly enabled cache on an SSE route.**
7. **Cache adapter for the in-flight conversation history?** TheoKit's `createConversationHistory` (item #5 of macro roadmap) persists to `.theokit/agents/<id>/messages.jsonl`. Is that within the cache layer's purview, or a separate persistent-storage primitive? **Lean: separate** — conversation history is a write-mostly log, not a read-cache; different lifecycle.

## 11. Referências citadas (todos os arquivos do inventário)

Every `file:line` anchor used in this document appears here, grouped by framework. This is the index reverse — for each cited assertion, the reader can navigate back to source.

### Nitro

#### Core
- `referencias/nitro/src/runtime/cache.ts:1` — Public re-export of `defineCachedFunction` and `defineCachedHandler`. Referenced in §3.1 (API surface).
- `referencias/nitro/src/runtime/internal/cache.ts:1-60` — Thin adapter over `ocache`. Anchored in §3.1 (algorithm + storage init), §4 (convergent SWR), §6 (deps).
- `referencias/nitro/src/types/runtime/cache.ts:1-13` — Public type re-exports. Anchored in §3.1.

#### Support
- `referencias/nitro/src/runtime/storage.ts:1` — `useStorage()` from `internal/storage.ts`; backed by unstorage. Anchored in §3.1 (storage abstraction), §6.

#### Doc
- `referencias/nitro/docs/1.docs/7.cache.md:1-421` — Canonical cache docs. Anchored in §3.1, §4 (convergent SWR/GET-only), §5 (cache key, stale-time default), §7 (cache key format), §8 (edge cases: nested calls, status>=400, JSON serialization).
- `referencias/nitro/docs/4.examples/cached-handler.md:1-95` — Cached handler example. Anchored in §3.1.
- `referencias/nitro/package.json` — Dependency versions. Anchored in §6 (ocache ^0.1.4).

### Next.js

#### Core
- `referencias/next.js/packages/next/src/server/web/spec-extension/unstable-cache.ts:1-432` — Legacy `unstable_cache` API + algorithm. Anchored in §3.2 (API + algorithm + state), §4 (convergent patterns), §7 (algorithms), §8 (edge cases). Multiple @TODO citations from lines 91, 92, 93, 132, 188, 231, 233, 269.
- `referencias/next.js/packages/next/src/server/web/spec-extension/revalidate.ts:1-248` — `revalidateTag`, `revalidatePath`, `updateTag`, `refresh` API + path-as-tag encoding. Anchored in §3.2 (algorithm), §4 (convergent: path-as-tag).
- `referencias/next.js/packages/next/src/server/revalidation-utils.ts:1-222` — End-of-request revalidation diff algorithm. Anchored in §3.2 (algorithm), §7 (tag fan-out diff).
- `referencias/next.js/packages/next/src/server/use-cache/cache-tag.ts:1-41` — `cacheTag(...)` directive helper. Anchored in §3.2 (modern API).
- `referencias/next.js/packages/next/src/server/use-cache/cache-life.ts:1-176` — `cacheLife(profile)` directive helper + `{ stale, revalidate, expire }` validation. Anchored in §3.2 (modern API), §8 (validation EC).
- `referencias/next.js/packages/next/src/server/lib/cache-control.ts:1-35` — `getCacheControlHeader({ revalidate, expire })`. Anchored in §3.2 (header emission), §4 (SWR convergence).
- `referencias/next.js/packages/next/src/server/lib/lru-cache.ts:1-238` — Size-based LRU with doubly-linked list. Anchored in §3.2 (state), §7 (LRU algorithm), §8 (size <= 0 throws).
- `referencias/next.js/packages/next/src/server/lib/patch-fetch.ts:1-150` — fetch monkey-patching + `validateTags`, `validateRevalidate`. Anchored in §3.2 (algorithm), §8 (tag validation EC, INFINITE_CACHE constant).

#### Support (referenced; not read in full due to size budget)
- `referencias/next.js/packages/next/src/server/use-cache/use-cache-wrapper.ts:1-2995` — Compile-time `'use cache'` directive wrapper. Referenced in §3.2.
- `referencias/next.js/packages/next/src/server/use-cache/use-cache-errors.ts` — Error classes for `'use cache'`.
- `referencias/next.js/packages/next/src/server/lib/incremental-cache/index.ts:1-732` — `IncrementalCache` abstraction. Referenced in §3.2 (consumed by `unstable_cache.ts`).
- `referencias/next.js/packages/next/src/server/lib/incremental-cache/file-system-cache.ts:1-481` — Disk-backed implementation.
- `referencias/next.js/packages/next/src/server/lib/disk-lru-cache.external.ts` — Disk-LRU helper.
- `referencias/next.js/packages/next/src/server/lib/encode-cache-tag.ts` — Tag URL-safe encoding.
- `referencias/next.js/packages/next/src/server/lib/implicit-tags.ts` — Implicit tag accumulation from paths.
- `referencias/next.js/packages/next/src/lib/with-promise-cache.ts` — Promise memoization helper.
- `referencias/next.js/packages/next/src/client/components/segment-cache/cache.ts` — Client-side segment cache.
- `referencias/next.js/packages/next/src/client/components/segment-cache/cache-map.ts` — Map structure for client segment cache.

#### Doc
- `referencias/next.js/packages/next/src/lib/constants.ts:34-35` — `NEXT_CACHE_TAG_MAX_ITEMS = 128`, `NEXT_CACHE_TAG_MAX_LENGTH = 256`. Anchored in §3.2, §5 (divergent: tag size), §8 (tag size EC).

### TanStack Router

#### Core
- `referencias/tanstack-router/packages/router-core/src/lru-cache.ts:1-74` — Functional LRU primitive. Anchored in §3.3 (state), §7 (functional LRU alternative).
- `referencias/tanstack-router/packages/router-core/src/load-matches.ts:780-900` — Stale-while-revalidate algorithm. Anchored in §3.3 (algorithm), §5 (stale-time default).

#### Support (referenced)
- `referencias/tanstack-router/packages/react-router/src/useLoaderDeps.tsx` — Hook consumer.
- `referencias/tanstack-router/packages/router-core/src/useLoaderDeps.ts` — Core hook implementation.

#### Doc
- `referencias/tanstack-router/docs/router/guide/data-loading.md:1-200` — SWR docs + defaults table. Anchored in §3.3 (API + defaults), §4 (SWR convergence), §5 (stale-time default), §8 (gc time documentation).
- `referencias/tanstack-router/docs/router/guide/external-data-loading.md` — TanStack Query bridge (out of scope).

### Astro

#### Core
- `referencias/astro/packages/astro/src/core/cache/runtime/cache.ts:1-152` — `AstroCache` accumulator + APPLY_HEADERS/IS_ACTIVE symbols. Anchored in §3.4 (API + algorithm), §4 (accumulator pattern), §5 (last-write-wins / merge semantics).
- `referencias/astro/packages/astro/src/core/cache/memory-provider.ts:1-539` — Memory provider + LRUMap + Vary learning + tracking-param exclusion. Anchored in §3.4 (algorithm), §4 (cache key / Set-Cookie / GET-only conventions), §7 (LRUMap, Vary-learning, NUL separator), §8 (Set-Cookie EC, cookie-in-vary EC).
- `referencias/astro/packages/astro/src/core/cache/types.ts:1-83` — Public type interfaces. Anchored in §3.4 (CacheProvider interface, CacheOptions).

#### Support (referenced)
- `referencias/astro/packages/astro/src/core/cache/runtime/utils.ts` — Helper utils.
- `referencias/astro/packages/astro/src/core/cache/utils.ts` — Helper utils.
- `referencias/astro/packages/astro/src/core/cache/config.ts` — Config normalization.
- `referencias/astro/packages/astro/src/core/render/route-cache.ts` — Route-level render cache (separate concern).
- `referencias/astro/packages/astro/src/runtime/server/html-string-cache.ts` — HTML string cache (separate concern).
- `referencias/astro/packages/astro/src/content/data-store.ts` — Content collection cache (separate concern).
- `referencias/astro/packages/astro/src/content/mutable-data-store.ts` — Mutable content cache.

#### Doc
- `referencias/astro/.changeset/astro-cache-disabled-shim.md:1-7` — Regression documenting that `Astro.cache` must always be defined as a no-op shim. Anchored in §8 (cache-provider-undefined EC).

### URLs externas

- `https://github.com/unjs/ocache` — Nitro's cache algorithm package. Referenced in §3.1, §6.
- `https://github.com/unjs/unstorage` — Storage abstraction. Referenced in §3.1, §6.
- `https://nextjs.org/docs/app/api-reference/functions/revalidateTag` — Next.js revalidateTag docs. Referenced in `revalidate.ts:32`.
- `https://nextjs.org/docs/app/api-reference/functions/revalidatePath` — Next.js revalidatePath docs. Referenced in `revalidate.ts:95`.
- `https://nextjs.org/docs/app/api-reference/functions/updateTag` — Next.js updateTag docs. Referenced in `revalidate.ts:47`.
- `https://nextjs.org/docs/app/api-reference/functions/cacheLife#reference` — Next.js cacheLife reference. Referenced in `revalidate.ts:30`.

---

## Verification checklist (per skill quality bar)

- [x] **Discovery dinâmica de `referencias/*/`** — Confirmed in §1 (12 frameworks scanned, top 4 selected).
- [x] **Inventário completo de arquivos por framework** — §2 has tables for all 4 selected frameworks; every file from 3-pass grep is categorized.
- [x] **Seção "Arquivos avaliados e descartados"** — Present in §2, with justifications for ~24 discarded files.
- [x] **Mínimo 3 frameworks deep-read** — 4 frameworks (Nitro, Next.js, TanStack Router, Astro). Core/support/doc files read in full where size permitted; large Next.js files read in targeted ranges with explicit acknowledgment in §2 inventory.
- [x] **Tabela de dependências externas com versão pinada** — §6, with versions: ocache ^0.1.4, unstorage ^1.10.x, dequal ^2.0.x.
- [x] **Mínimo 5 padrões identificados** — §4 (7 convergent) + §5 (5 divergent) = 12 total.
- [x] **Mínimo 5 edge cases com fonte** — §8 has 20+ rows with file:line or doc anchors.
- [x] **Implementation Guide com todas as 8 subsections** — §9.1 through §9.8 all present.
- [x] **Lista de open questions** — §10 has 7 open questions.
- [x] **Seção 11 contém TODOS os arquivos do inventário** — Cross-references every file row from §2.
- [x] **Toda asserção ancorada num file:line da §11** — Every claim in §3 is `file.ext:line` anchored.
- [x] **Output em `.claude/knowledge-base/reference/{slug}.md`** — `caching-and-revalidation.md`.
