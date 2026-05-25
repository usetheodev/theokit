# Caching and Revalidation

Cache HTTP routes, memoize server functions, and bust stale data from webhooks — all with primitives that ship in `theokit/server`. Built for production agent apps where the per-pageview cost of an LLM call would otherwise be unsustainable.

## What you get

Five primitives, one storage layer, zero magic:

| Primitive | Use it when |
|---|---|
| `defineCachedRoute(engine, config)` | Cache the response of an HTTP route (the agent's `/api/usage` endpoint, the dashboard's `/api/billing-summary`). |
| `defineCachedFunction(engine, fn, opts)` | Memoize a server-side function (a Stripe API call, an LLM-side computation that can be deduped). |
| `revalidateTag(tag)` | Bust every cache entry tagged `tag`. Use from a webhook when the underlying data changed. |
| `revalidatePath(path)` | Bust every entry served from a specific URL path (sugar over `revalidateTag('_THEO_T_/path')`). |
| `updateTag(tag)` | Server-Action-safe immediate invalidation (same effect as `revalidateTag`; separate name for call-site clarity). |

All five live in `theokit/server` and respect the same storage adapter you configured in `theo.config.ts`.

## Quick start

`theo.config.ts`:

```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  cache: {
    enabled: true,
    storage: 'memory', // or pass a custom CacheStorageAdapter instance
    maxEntries: 1000,
    defaults: { maxAge: 1, cacheErrors: false },
    routeRules: {
      '/api/static/**': { maxAge: 300, swr: 600 },
    },
  },
})
```

`server/routes/quote.ts`:

```ts
import { defineCachedRoute } from 'theokit/server'
import { z } from 'zod'

export const GET = defineCachedRoute(engine, {
  query: z.object({ symbol: z.string() }),
  cache: {
    maxAge: 60,
    swr: 300,
    tags: ['quotes'],
  },
  async handler({ query }) {
    const data = await fetchUpstream(query.symbol)
    return Response.json(data)
  },
})
```

Hit it twice — second response carries `X-Theo-Cache: HIT` in dev. Bust it from a webhook:

```ts
import { revalidateTag } from 'theokit/server'

await revalidateTag('quotes')
```

## How it works

### Storage layer

A `CacheStorageAdapter` interface with one default implementation (`InMemoryCacheAdapter` — LRU + reverse tag index). The interface is narrow on purpose:

```ts
interface CacheStorageAdapter {
  readonly name: string
  get(key: string): Promise<CacheEntry | undefined>
  set(key: string, entry: CacheEntry): Promise<void>
  delete(key: string): Promise<boolean>
  deleteByTag(tag: string): Promise<number>
  size(): Promise<number>
  clear(): Promise<void>
  keys(prefix?: string): AsyncIterableIterator<string>
}
```

Want Redis? Implement those 7 methods and pass your instance as `cache.storage`. The framework doesn't ship a Redis adapter today; you write ~80 lines of glue code.

### Cache engine (SWR + dedupe)

`createCacheEngine({ storage })` wraps the adapter with:
- **Stale-while-revalidate** — if the entry is past `maxAge` but within `maxAge + swr`, return stale immediately and schedule a background refresh.
- **In-flight deduplication** — 10 concurrent first-misses to the same key run the loader EXACTLY once. The other 9 share the result.
- **`cacheVersion` mismatch** — bump the version stamp; any older entry is treated as missing without explicit invalidation.
- **`onError(err, ctx)` hook** — surfaces failures at the `get`/`set`/`revalidate` phase.

### Cache key derivation

Default key shape for routes:

```
route:${METHOD}:${protocol}//${lower(host)}${pathname}${sortedFilteredQuery}\0vary1=val\0vary2=val
```

Defaults that protect cache hit-rate:
- **Tracking params auto-stripped** — `utm_source`, `fbclid`, `gclid`, `_ga`, etc. (25-entry list from Astro). URLs differing only by tracking parameters share one entry.
- **Query sorted** — `?a=1&b=2` and `?b=2&a=1` yield the same key.
- **Host lowercased** — `EXAMPLE.COM` and `example.com` share one entry.

Override via `cache.getKey: (req) => string` for total control.

### Tag-based invalidation

`tags: ['users']` on a cached entry registers it in a reverse index. `revalidateTag('users')` is O(matched-keys), not O(all-keys).

Path invalidation is sugar:

```ts
revalidatePath('/dashboard', 'page')
// internally:
revalidateTag('_THEO_T_/dashboard/page')
```

User tags MUST NOT start with `_THEO_T_` — that prefix is reserved for framework use. `validateTags` drops user tags with this prefix and emits a warn.

## The 4 patterns

### 1. Cache a JSON response for 60s with SWR

```ts
import { defineCachedRoute } from 'theokit/server'

export const GET = defineCachedRoute(engine, {
  cache: { maxAge: 60, swr: 300, tags: ['usage'] },
  async handler() {
    const data = await fetchExpensiveData()
    return Response.json(data)
  },
})
```

First call: handler runs, response cached for 60s. Second call within 60s: cache hit (no handler invocation). Call at 90s: stale value served immediately, handler runs in background to refresh.

### 2. Cache a Stripe API call per-user

```ts
import { defineCachedFunction } from 'theokit/server'

export const fetchUserSubs = defineCachedFunction(
  engine,
  async (userId: string) => {
    return await stripe.subscriptions.list({ customer: userId })
  },
  {
    name: 'stripe-subs',
    maxAge: 60,
    tags: (userId) => [`stripe:user:${userId}`],
  },
)

// Usage anywhere
const subs = await fetchUserSubs('cust_abc')

// Targeted invalidation
await fetchUserSubs.invalidate('cust_abc')
```

`name` is the namespace prefix; cache keys become `fn:stripe-subs:<JSON args>`. The `.invalidate(...args)` method on the wrapped function uses the same key derivation.

### 3. Bust user data from a Stripe webhook

```ts
import { defineRoute, revalidateTag } from 'theokit/server'

export const POST = defineRoute({
  async handler({ request }) {
    const event = await verifyStripeWebhook(request)
    if (event.type === 'customer.subscription.updated') {
      await revalidateTag(`stripe:user:${event.data.object.customer}`)
    }
    return Response.json({ received: true })
  },
})
```

Next time `fetchUserSubs('cust_abc')` or `/api/dashboard?user=cust_abc` is called, the cache is fresh.

### 4. Bust by route path

```ts
import { revalidatePath } from 'theokit/server'

await revalidatePath('/dashboard', { type: 'page' })
```

Any cached entries served from `/dashboard/page` are invalidated.

## Cache-Control header behavior

The framework auto-emits `Cache-Control` on cached responses unless your handler already set one:

| Config | Emitted header |
|---|---|
| `{ maxAge: 60 }` (no swr) | `s-maxage=60` |
| `{ maxAge: 60, swr: 300 }` | `s-maxage=60, stale-while-revalidate=300` |
| `{ maxAge: 60, isPrivate: true }` (via `getCacheControlHeader`) | `private, s-maxage=60` |
| `{ maxAge: 0 }` | `private, no-cache, no-store, max-age=0, must-revalidate` |

If your handler emits `Cache-Control: no-store` explicitly, the framework respects it (your header wins).

## Storage adapter (custom backends)

The default `InMemoryCacheAdapter` is fine for single-instance servers. For multi-instance / multi-region, implement `CacheStorageAdapter`:

```ts
import type { CacheStorageAdapter, CacheEntry } from 'theokit/server'
import { Redis } from 'ioredis'

class RedisCacheAdapter implements CacheStorageAdapter {
  readonly name = 'redis'
  constructor(private redis: Redis) {}

  async get(key: string): Promise<CacheEntry | undefined> {
    const raw = await this.redis.get(`cache:${key}`)
    return raw ? JSON.parse(raw) : undefined
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    await this.redis.set(`cache:${key}`, JSON.stringify(entry), 'EX', entry.maxAge + entry.swr)
    for (const tag of entry.tags) {
      await this.redis.sadd(`tag:${tag}`, key)
    }
  }

  async delete(key: string): Promise<boolean> {
    return (await this.redis.del(`cache:${key}`)) > 0
  }

  async deleteByTag(tag: string): Promise<number> {
    const keys = await this.redis.smembers(`tag:${tag}`)
    if (keys.length === 0) return 0
    await this.redis.del(...keys.map((k) => `cache:${k}`), `tag:${tag}`)
    return keys.length
  }

  async size(): Promise<number> {
    return (await this.redis.keys('cache:*')).length
  }
  async clear(): Promise<void> { await this.redis.flushdb() }
  async *keys(prefix?: string): AsyncIterableIterator<string> {
    for (const k of await this.redis.keys(`cache:${prefix ?? ''}*`)) {
      yield k.replace(/^cache:/, '')
    }
  }
}
```

Pass it via `theo.config.ts`:

```ts
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!)

export default defineConfig({
  cache: { storage: new RedisCacheAdapter(redis) },
})
```

## Edge cases and gotchas (accepted constraints)

These are the trade-offs the framework makes consciously. If one of them bites you, follow the documented escape hatch.

| Behavior | Escape hatch |
|---|---|
| **Set-Cookie response is auto-bypassed.** Caching a personalized response and serving it to other users is a security incident. The framework refuses and emits a warning once per route. | Strip Set-Cookie before returning, or don't cache the route. |
| **Status `>= 400` is NOT cached by default.** Caching a transient 500 for 60 minutes is worse than retrying. | `cache.cacheErrors: true` to opt in (useful for "user not found" 24h caching). |
| **Only GET/HEAD cached.** Mutations aren't idempotent. | `cache.methods: ['POST']` if you have a read-only POST endpoint (RPC pattern). |
| **JSON serialization constraints.** Function/Symbol/`undefined` arguments fail or collide. `BigInt` throws on `JSON.stringify`. Dates serialize as ISO string (semantically lossy on roundtrip). `Map` / `Set` lose their type. | Use `getKey(...args)` to derive a string key from non-JSON args. Use `transform` to reconstruct types on read. |
| **Tag size limits: ≤ 256 chars per tag, ≤ 128 tags per scope.** Mirrors Next.js limits — header serialization + Map iteration cost. Overflow drops with warn. | Shorten tags or group by parent entity. |
| **Reserved tag prefix `_THEO_T_`.** Framework uses it for path-derived tags. | Don't start your tags with `_THEO_T_`. |
| **`varies: ['cookie']` is filtered with a warn.** Cookie cardinality is unbounded — would kill hit-rate to 0%. | Use `cache.getKey(req)` to derive a specific session-scoped key explicitly. |
| **Response body > 10 MB bypasses cache (configurable via `cache.maxEntrySize`).** A single huge endpoint × 1000 cached entries = 10 GB RAM. | Increase `maxEntrySize`, or stream large responses without caching. |
| **`maxEntrySize: 0` explicitly disables cache for that route** (consistent with `maxAge: 0`). | Both mean "always bypass". |
| **Cache middleware runs AFTER user-defined middleware.** Auth/session/CSRF always gate before cache lookup — a cache hit cannot leak data past auth. | Structural invariant; no escape needed. |
| **Background revalidation may not complete if loader hangs.** The framework does not impose a loader timeout. | Configure upstream timeouts (e.g., `fetch(url, { signal: AbortSignal.timeout(5000) })`). |
| **Concurrent `invalidate(key)` during in-flight loader may not prevent the stale write.** Real but rare. | Prefer `revalidateTag` from a separate request/handler context. |
| **`theo.config.ts cache` changes require dev server restart.** Auto-reload would need config-diff + storage-invalidate logic. | Restart `pnpm dev` after config changes. |
| **`deleteByTag` is O(matched-keys).** Default `maxEntries: 1000` caps worst case. Custom Redis adapters use their own `SCAN`. | For tags that cover huge entry counts, partition tags more granularly. |

## How TheoKit compares

| Framework | Cache primitive | Storage abstraction | Tag invalidation | Defaults |
|---|---|---|---|---|
| **TheoKit** | `defineCachedRoute` + `defineCachedFunction` | `CacheStorageAdapter` | `revalidateTag` + `revalidatePath` | `maxAge: 1`, `swr: true` |
| Next.js | `unstable_cache` + `'use cache'` directive | `IncrementalCache` (Vercel-flavored) | `revalidateTag` + `revalidatePath` | No default (must opt-in via `revalidate: N`) |
| Nitro | `defineCachedHandler` + `defineCachedFunction` (via `ocache`) | `unstorage` (20+ drivers) | Per-function `.invalidate(args)` | `maxAge: 1`, `swr: true` |
| Astro | `Astro.cache.set({ maxAge, swr, tags })` | `CacheProvider` interface | `Astro.cache.invalidate({ tags })` | `maxAge: undefined` (must opt-in) |
| TanStack Router | `route.options.staleTime` / `gcTime` | (client-side only) | `router.invalidate()` (coarse) | `staleTime: 0` |

TheoKit borrows: Nitro's API shape (`defineCachedRoute`/`defineCachedFunction`), Astro's accumulator pattern + tracking-param exclusion, Next.js's tag-based invalidation + cacheLife semantics.

We do NOT have RSC's `'use cache'` directive (decision documented in `.claude/knowledge-base/reference/server-components-rsc.md`).

## See also

- Plan: `docs/plans/caching-and-revalidation-plan.md`
- Research: `.claude/knowledge-base/reference/caching-and-revalidation.md` (4 frameworks deep-read)
- Edge case review: `docs/reviews/edge-case-plan/caching-and-revalidation-edge-cases-2026-05-23.md`
- Fixture: `fixtures/cache-basic/`
