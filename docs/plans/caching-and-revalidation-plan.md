# Plan: Caching + Revalidating — production-grade data cache primitives

> **Version 1.0** — Ship the largest production gap vs Next.js: a working data-cache layer in `theokit/server`. Five new primitives — `defineCachedRoute`, `defineCachedFunction`, `revalidateTag`, `revalidatePath`, `updateTag` — backed by a ~300 LOC in-house engine (no `ocache` dependency), an LRU in-memory store, and a `CacheStorageAdapter` interface for future Redis / Cloudflare KV swap. Outcome: a TheoKit consumer can decorate a route or a function with `cache: { maxAge: 60, swr: 300, tags: ['user:${id}'] }`, hit it from a webhook with `revalidateTag('user:42')`, and the next request returns fresh data while concurrent requests deduplicate to one upstream call.

## Context

**What exists today:**
- `theokit/server` exports ZERO data-cache primitives (verified: `grep -E "export.*cache|revalidate" packages/theo/src/server/index.ts` returns nothing user-facing — only internal hot-path caches in `middleware-runner.ts:44`, `nonce.ts:41`, `crypto.ts:29` which are NOT user API).
- Every consumer hitting a production agent app must roll their own (forking `lru-cache` + adding a tag index + wiring SSR cache-control) or accept zero-cache and pay the LLM-call-per-pageview cost.
- The honest-state table in [`.claude/knowledge-base/reference/caching-and-revalidation.md`](.claude/knowledge-base/reference/caching-and-revalidation.md) §1 documents 5 concrete needs: response caching, function caching, tag invalidation, path invalidation, Cache-Control emission. None met today.

**Evidence:**
- The 31-feature gap chart vs Next.js (CLAUDE.md macro roadmap context) rates Caching+Revalidating as 🟡 priority 3 with complexity 4 (~1 week) and "Maior gap real vs Next. SSE + cache = production-grade".
- The reference doc at `.claude/knowledge-base/reference/caching-and-revalidation.md` (90 KB, 1050 lines, 4 frameworks deep-read: Next.js, Nitro, TanStack Router, Astro) catalogues 14 edge cases with file:line anchors, 7 convergent patterns, 5 divergent trade-offs.

**Why now:** The macro roadmap (CLAUDE.md) just closed items #3 (canonical chat), #4 (defineAgentTool), #5 (conversation history), and the full-stack-agent example. The next item that ships agent-shipping power is caching — without it, items #7 (Vercel/CF SSE) and #8 (Playwright for 4 templates) reveal cache as the blocker for real workload validation.

## Objective

`npm create theokit my-app && cd my-app && pnpm add theokit@<next> && code app/server/routes/expensive.ts` → declare `cache: { maxAge: 60, tags: ['quote'] }` → `pnpm dev` → second hit within 60s returns cached body with `X-Theo-Cache: HIT`; hit from a webhook `revalidateTag('quote')` → next request returns fresh data.

Specific measurable goals:
1. `theokit/server` exports `defineCachedRoute`, `defineCachedFunction`, `revalidateTag`, `revalidatePath`, `updateTag`, `CacheStorageAdapter` (interface), `InMemoryCacheAdapter` (class), `CacheEntry` (type).
2. First HTTP request to a cached route returns `X-Theo-Cache: MISS` in dev; second within `maxAge` returns `X-Theo-Cache: HIT`; third after `maxAge` but within `maxAge + swr` returns `X-Theo-Cache: STALE` + triggers background refresh.
3. Concurrent first-miss to the same key triggers EXACTLY 1 loader execution (verified by integration test counting upstream calls).
4. `revalidateTag('foo')` from a Server Action or webhook removes all cache entries tagged `foo` within 1 request boundary.
5. `revalidatePath('/dashboard', 'page')` busts the dashboard cache.
6. Set-Cookie response is NOT cached + emits a warning log.
7. Status `>= 400` response is NOT cached by default.
8. `tag.length > 256` warns + drops the tag; `tags.length > 128` warns + truncates (matches Next.js limits).
9. Zero `tsc --noEmit` errors; zero lint warnings; all unit + integration tests green.
10. `fixtures/cache-basic/` is a reproducible app demonstrating all 5 primitives.
11. `docs/concepts/caching.md` published with all 4 patterns demonstrated.
12. Dogfood QA health ≥ 70/100, zero CRITICAL issues introduced.

## ADRs

### D1 — Build the cache engine ourselves (~300 LOC), don't adopt `ocache`

- **Decision:** Implement key derivation, SWR scheduling, in-flight deduplication, and tag invalidation in-house in `packages/theo/src/cache/`. Do not depend on `ocache`.
- **Rationale:**
  - `ocache` is `^0.1.4` (pre-1.0); coupling TheoKit's cache surface to its release cadence is risk.
  - The reference doc §3.1 shows Nitro's adapter is 60 lines and delegates 100% to ocache. Their wrapper exists because they have h3 + srvx; we don't.
  - Our requirements are smaller than Nitro's at MVP (no `event.waitUntil` machinery, no FastResponse, no h3 event shape).
  - Building ourselves gives full control over the 14 edge cases catalogued in the reference doc §8 and lets us version-stable our cache surface independently.
- **Consequences:** ~300 LOC to maintain forever; in exchange, no upstream breakage risk. We can re-evaluate at v1.0 when ocache stabilizes.

### D2 — `unstorage` IS adopted as storage abstraction, but only the interface

- **Decision:** Adopt `unstorage` (`^1.10.x`) as the storage abstraction at the type level. Ship `InMemoryCacheAdapter` (our own, ~60 LOC LRU) as the default. Document `unstorage` drivers (Redis, Cloudflare KV, deno-kv, fs) as user-installable recipes.
- **Rationale:**
  - The reference doc §6 shows `unstorage` has 20+ drivers, is unjs-maintained (MIT, ~75 KB minified), and is what Nitro uses.
  - Our `CacheStorageAdapter` interface (§9.3 of reference doc) is intentionally narrower than unstorage's full surface — fewer methods, plus `deleteByTag` which unstorage doesn't have. So we don't WRAP unstorage; we offer an interface that an unstorage-backed adapter can implement.
  - At MVP, in-memory is enough. Redis swap is a future plan (see CLAUDE.md macro roadmap — production scale is post-1.0).
- **Consequences:** No hard dep on unstorage in this plan. Users who want Redis at this stage can implement `CacheStorageAdapter` themselves following the documented contract.

### D3 — Imperative wrapper API; no `'use cache'` directive

- **Decision:** Expose `defineCachedRoute(config)` and `defineCachedFunction(fn, opts)` as explicit wrappers. Do NOT implement Next.js's `'use cache'` directive.
- **Rationale:**
  - Next.js's directive requires a compile-time SWC plugin (`use-cache-wrapper.ts` is 2995 LOC of complexity — reference doc §3.2). TheoKit philosophy is no-magic + small surface (CLAUDE.md voice rules forbid "opinionated" decoration-heavy APIs).
  - `'use cache'` only makes sense with RSC; RSC is explicitly deferred per [`server-components-rsc.md`](../.claude/knowledge-base/reference/server-components-rsc.md) decision (post-1.0).
  - Explicit wrappers also avoid AsyncLocalStorage requirement (see D11).
- **Consequences:** Slightly more verbose at call site, but mental model is "wrap fn = cache fn". One way to do it. No hidden behavior.

### D4 — `getKey(req)` / `getKey(...args)` user-supplied; smart default for URL+query

- **Decision:** Cache key for routes defaults to `lower(origin) + pathname + sortedFilteredQuery`. Cache key for functions defaults to `JSON.stringify(args)` (with documented limitations). User can override via `getKey` option.
- **Rationale:**
  - Astro's default URL+sorted-query (reference doc §3.4) is the industry convergent default.
  - Next.js's `cb.toString() + keyParts + JSON.stringify(args)` has KNOWN bugs (`unstable-cache.ts:91, 92, 93, 132` — 4 active `@TODO` comments). We avoid that trap.
  - Tracking params (utm_*, fbclid, gclid, _ga, etc.) fragment cache hit rate. Adopt Astro's `DEFAULT_EXCLUDED_PARAMS` list verbatim (25 entries).
- **Consequences:** Users with non-JSON args (functions, Buffers, Symbols) MUST supply `getKey`. Documented constraint.

### D5 — Default `maxAge: 1 second`, `swr: true`

- **Decision:** No `cache` field declared = behavior unchanged (no cache). With `cache: {}` declared (empty object opt-in), default to `maxAge: 1, swr: true, staleMaxAge: maxAge * 60`.
- **Rationale:**
  - Convergent SWR-default across all 4 frameworks (reference doc §4).
  - Nitro's posture: 1 second is "small cache helps, never hurts" — deduplicates concurrent requests + gives downstream services breathing room.
  - Forces explicit opt-in (the empty object): consumers can't accidentally enable caching by typo.
- **Consequences:** Predictable DX. Easy to reason about ("my route is cached for 1 second + serves stale for 60s while refreshing"). Users wanting strict freshness set `maxAge: 0` or omit `cache` entirely.

### D6 — Tag limits: `tag.length ≤ 256` chars, `tags.length ≤ 128` per scope

- **Decision:** Mirror Next.js's `NEXT_CACHE_TAG_MAX_LENGTH = 256` and `NEXT_CACHE_TAG_MAX_ITEMS = 128`. Overflow = warn + drop (not throw).
- **Rationale:**
  - These limits exist for a reason in Next.js: HTTP header serialization (some adapters carry tags in headers), Map iteration cost, storage backend key-size limits.
  - Throwing at runtime would break user code unexpectedly; warning is the documented Next.js posture (`patch-fetch.ts:106`).
- **Consequences:** Users hitting the limit see a clear warn log and a documented constraint.

### D7 — Set-Cookie response auto-bypasses cache + emits warning

- **Decision:** If response has `Set-Cookie` header, refuse to cache + emit a warning log (rate-limited).
- **Rationale:**
  - Astro's `memory-provider.ts:444` does this. Reference doc §8 catalogues "Cache poison via Set-Cookie" as a known edge case from Astro's `.changeset/astro-cache-disabled-shim.md`.
  - Caching a personalized response (e.g., a signed-in user's dashboard) and serving it to other users is a security incident, not a "cache miss". Refusing-by-default is the safe posture.
- **Consequences:** Routes that emit Set-Cookie must NOT be cached; if a user tries, they get a warn. Documented in JSDoc.

### D8 — GET-only caching at the route level by default

- **Decision:** `defineCachedRoute` only caches GET (and HEAD) requests by default. `POST/PUT/PATCH/DELETE` bypass without writing. Override via `cache.methods: ['POST', 'GET']`.
- **Rationale:**
  - Convergent across Nitro (`docs/1.docs/7.cache.md:48`), Astro (`memory-provider.ts:411`), Next.js (POST is `force-no-store` default).
  - Caching mutations is semantically wrong — they're not idempotent.
- **Consequences:** API routes that handle mutations don't need `revalidate: 0` workaround; they're just not cached.

### D9 — Status `>= 400` response NOT cached by default

- **Decision:** Cache only `200–399` responses by default. Override via `cache.cacheErrors: true`.
- **Rationale:**
  - Nitro: `docs/1.docs/7.cache.md:416` — "Responses with HTTP status codes >= 400 or with an undefined body are not cached."
  - Caching a transient 500 from a downstream service and serving it for 60 minutes is worse than just retrying.
- **Consequences:** Errors are always retried. Users wanting to cache 404s (e.g., "this user doesn't exist for 24h") opt in explicitly.

### D10 — Path invalidation is sugar over tag invalidation

- **Decision:** `revalidatePath('/dashboard', 'page')` is internally implemented as `revalidateTag('_THEO_T_/dashboard/page')`. The `_THEO_T_` prefix marks path-derived tags.
- **Rationale:**
  - Next.js does exactly this (reference doc §3.2, `revalidate.ts:105`).
  - Single invalidation engine; one code path to maintain.
  - Path-as-tag also auto-cleans when storage backends iterate (`deleteByTag` works uniformly).
- **Consequences:** Implicit tags (path tags) must be added to every cached route's entry at write time. Adapter must understand `_THEO_T_` prefix when iterating tags for `deleteByTag`.

### D11 — In-flight `Map<key, Promise>` for concurrent first-miss dedupe; no AsyncLocalStorage

- **Decision:** Maintain a module-level `inFlight: Map<string, Promise<CacheEntry>>` keyed by cache key. Concurrent calls to the same key share the same Promise. Cleared on Promise settle. NO AsyncLocalStorage at the cache layer.
- **Rationale:**
  - Convergent across Nitro (`docs/1.docs/7.cache.md:51` — request deduplication), Next.js (`unstable-cache.ts:252` — `pendingRevalidates`). Both use it.
  - AsyncLocalStorage is Node-specific and has unclear edge-worker semantics — using it would block our edge-runtime future story.
  - Per-request context is threaded explicitly through the `RouteContext` object (already passed to handlers). The cache engine reads `ctx.cache?.*` for tag accumulation, not from ALS.
- **Consequences:** `revalidateTag()` called outside any cache context just operates on the global adapter directly (no per-request batching at this stage — a future enhancement).

### D12 — `_THEO_T_` is the synthetic-tag prefix; user tags are forbidden from using it

- **Decision:** Internal path-derived tags use `_THEO_T_/${encodedPath}/${type}` format. User tags MUST NOT start with `_THEO_T_`. Validation throws if user passes a tag with the prefix.
- **Rationale:**
  - Reserved namespace prevents collisions and clarifies "who owns this tag".
  - Validation at write time means user errors are caught early, not as silent path collisions.
- **Consequences:** Documented constraint: "Tags starting with `_THEO_T_` are reserved." Single-line check in `validateTags`.

### D13 — Tag fan-out via a reverse index in the adapter

- **Decision:** Storage adapter maintains a side-index `Map<tag, Set<key>>`. `deleteByTag(tag)` reads the set, deletes each key, and deletes the tag entry. Single O(1) lookup + O(matched-keys) deletion.
- **Rationale:**
  - Without an index, `deleteByTag` would be O(N) over all keys (Astro's pattern, `memory-provider.ts:512–533`). Acceptable up to ~10K entries; degrades after.
  - Reverse index is a 30-line addition; cost is double-store-write on `set` but single-read on invalidate. Read-heavy is the cache workload.
- **Consequences:** Adapter must keep two maps in sync. Documented invariant: "If `entries.has(key)` then `tags[tag].has(key)` for every `entry.tags[tag]`".

## Dependency Graph

```
Phase 1 (Validators + Header + Key) ──▶ Phase 2 (LRU Adapter) ──▶ Phase 3 (Cache Engine)
                                                                          │
                                                                          ▼
                                                          Phase 4 (defineCachedFunction)
                                                                          │
                                                                          ▼
                                                          Phase 5 (defineCachedRoute)
                                                                          │
                                                                          ▼
                                                          Phase 6 (Revalidation API)
                                                                          │
                                                                          ▼
                                                          Phase 7 (Config schema + route rules)
                                                                          │
                                                                          ▼
                                                          Phase 8 (Fixture + docs)
                                                                          │
                                                                          ▼
                                                          Phase 9 (Dogfood QA — MANDATORY)
```

**Sequential blockers:** Phases 1→2→3 form the engine spine. Phase 4 + 5 depend on Phase 3. Phase 6 depends on Phase 3 + 4 + 5. Phase 7 depends on Phase 5. Phase 8 depends on all prior. Phase 9 is the gate.

**Parallel-eligible:** Within Phase 1, T1.1 + T1.2 + T1.3 are independent (pure functions). Phase 7's T7.1 + T7.2 can run in parallel.

---

## Phase 1: Pure foundations (validators + header emission + key derivation)

**Objective:** Land the side-effect-free building blocks. Each is a pure function with a Zod schema, fully testable without storage.

### T1.1 — `validateTags()` + `validateMaxAge()` + `validateExpire()`

#### Objective
Three pure validators that gatekeep all cache option inputs. Drop invalid + warn; never throw on user input from runtime call sites (only throw on config-time / schema-level validation).

#### Evidence
- Next.js's `patch-fetch.ts:81–122` shows the canonical `validateTags` shape: collect invalid + valid + emit warn, return only valid.
- Reference doc §8: 4 distinct edge cases (tag too long, tag count overflow, tag wrong type, tag reserved prefix) all gated here.

#### Files to edit
```
packages/theo/src/cache/validation.ts — NEW; exports validateTags, validateMaxAge, validateExpire
packages/theo/src/cache/constants.ts — NEW; exports CACHE_TAG_MAX_LENGTH, CACHE_TAG_MAX_ITEMS, THEO_T_PREFIX, DEFAULT_MAX_AGE, DEFAULT_SWR
tests/unit/cache-validation.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `validation.ts` (NEW): pure functions, no imports outside stdlib + the constants file. Consumed downstream by `cache-engine.ts` (Phase 3) and `define-cached-route.ts` (Phase 5).
- `constants.ts` (NEW): single file of named constants. Single source of truth — same file imported by validation, engine, and adapter.
- `tests/unit/cache-validation.test.ts` (NEW): unit tests with Vitest.

#### Deep Dives

**Data structures:**
```ts
export interface ValidationResult<T> {
  valid: T[]
  dropped: Array<{ value: unknown; reason: string }>
}

export const CACHE_TAG_MAX_LENGTH = 256
export const CACHE_TAG_MAX_ITEMS = 128
export const THEO_T_PREFIX = '_THEO_T_'
export const DEFAULT_MAX_AGE = 1
export const DEFAULT_SWR_MULTIPLIER = 60  // swr default = maxAge * 60

export function validateTags(tags: unknown[], description: string): ValidationResult<string>
export function validateMaxAge(maxAge: unknown, description: string): number
export function validateExpire(expire: unknown, revalidate: number | undefined, description: string): number | undefined
```

**Algorithms:**

`validateTags`:
1. Iterate tags up to `CACHE_TAG_MAX_ITEMS`; after that, slice + push to `dropped` with `'overflow'` reason.
2. For each tag: if `typeof !== 'string'` → drop with `'invalid type'`; if `.length > CACHE_TAG_MAX_LENGTH` → drop with `'exceeded max length'`; if `.startsWith(THEO_T_PREFIX)` → drop with `'reserved prefix'`; else push to valid.
3. If `dropped.length > 0`, `console.warn` with `description` + each `{value, reason}`.
4. Return `{ valid, dropped }`.

`validateMaxAge`:
1. If `undefined` → return `DEFAULT_MAX_AGE`.
2. If `typeof === 'number' && Number.isFinite(maxAge) && maxAge >= 0` → return as-is.
3. Else → throw `Error("Invalid maxAge \"${maxAge}\" in ${description}, must be a non-negative finite number")`.

`validateExpire`:
1. If `undefined` → return `undefined`.
2. If `typeof !== 'number' || !Number.isFinite(expire) || expire < 0` → throw.
3. If `revalidate !== undefined && expire < revalidate` → throw (matches Next.js `cache-life.ts:65–73`).
4. Return `expire`.

**Invariants:**
- `validateTags` NEVER throws (runtime safety). It only collects + warns.
- `validateMaxAge` and `validateExpire` throw at config-time (Zod schema); this is fine because schema validation is the contract layer.

**Edge cases:**
- Empty `tags` array → return `{ valid: [], dropped: [] }`, no warn.
- `tags = null` or `tags = undefined` → **EC-1 MUST FIX:** validator returns `{ valid: [], dropped: [{ value: tags, reason: 'expected array, got ' + typeof tags }] }` instead of crashing. Defensive guard at top: `if (!Array.isArray(tags)) return { valid: [], dropped: [...] }`.
- `tag = ""` (empty string) → valid (passes type check + length check + prefix check). User responsibility.
- `maxAge = 0` → valid (explicit "no caching"). NOT an error.
- `maxAge = -1` → throw. `Number.isFinite` is true for -1, but the `>= 0` clause catches.
- `maxAge = Infinity` → throw (Number.isFinite false).
- `maxAge = NaN` → throw.

#### Tasks
1. Create `packages/theo/src/cache/constants.ts` with the 5 exported constants.
2. Create `packages/theo/src/cache/validation.ts` with the 3 exported functions.
3. Write `tests/unit/cache-validation.test.ts` covering all BDD scenarios (RED).
4. Implement until tests GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     validateTags_happy_path() — Given ["foo","bar"], "test", When validateTags called, Then valid=["foo","bar"], dropped=[]
RED:     validateTags_drops_long_tag() — Given ["x".repeat(300)], "test", When validateTags called, Then valid=[], dropped=[{value: "xxx...", reason: "exceeded max length"}], console.warn called
RED:     validateTags_drops_non_string() — Given [42, "ok"], "test", When validateTags called, Then valid=["ok"], dropped=[{value: 42, reason: "invalid type"}]
RED:     validateTags_drops_reserved_prefix() — Given ["_THEO_T_foo"], "test", When validateTags called, Then valid=[], dropped=[{value: "_THEO_T_foo", reason: "reserved prefix"}]
RED:     validateTags_truncates_overflow() — Given 200 valid tags, "test", When validateTags called, Then valid.length=128, dropped.length=72
RED:     validateMaxAge_default() — Given undefined, When validateMaxAge called, Then returns DEFAULT_MAX_AGE
RED:     validateMaxAge_accepts_zero() — Given 0, When validateMaxAge called, Then returns 0
RED:     validateMaxAge_rejects_negative() — Given -1, When validateMaxAge called, Then throws "Invalid maxAge"
RED:     validateMaxAge_rejects_nan() — Given NaN, When validateMaxAge called, Then throws
RED:     validateMaxAge_rejects_string() — Given "60", When validateMaxAge called, Then throws
RED:     validateExpire_undefined_passthrough() — Given undefined, When validateExpire called, Then returns undefined
RED:     validateExpire_rejects_less_than_revalidate() — Given expire=30, revalidate=60, When validateExpire called, Then throws "expire must be > revalidate"
RED:     validateExpire_accepts_greater_than_revalidate() — Given expire=120, revalidate=60, When validateExpire called, Then returns 120
RED (EC-1): validateTags_non_array_returns_dropped() — Given undefined, "test", When validateTags called, Then returns { valid: [], dropped: [{ value: undefined, reason: 'expected array, got undefined' }] } and DOES NOT throw

GREEN:   Implement validation.ts + constants.ts with minimal code to pass all 14 RED tests.
REFACTOR: Extract common warn formatter if duplication appears across 3 validators.
VERIFY:  npx vitest run tests/unit/cache-validation.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** all tags valid + within limits → returns valid passthrough.
- **Validation error:** `validateExpire` with expire < revalidate → throws clear message.
- **Edge case:** tag with reserved `_THEO_T_` prefix → dropped + warned.
- **Error scenario:** `validateMaxAge(NaN)` → throws (must not silently default).

#### Acceptance Criteria
- [ ] 13 RED tests pass (GREEN)
- [ ] Zero TypeScript errors (tsc --noEmit on the new files)
- [ ] Zero ESLint warnings
- [ ] No `console.warn` triggered for empty tag arrays (no-op pathway)
- [ ] Constants exported with exact values from D6: `CACHE_TAG_MAX_LENGTH = 256`, `CACHE_TAG_MAX_ITEMS = 128`, `THEO_T_PREFIX = '_THEO_T_'`

#### DoD
- [ ] All tasks completed
- [ ] All unit tests green (vitest run)
- [ ] Zero TS errors
- [ ] Zero lint warnings
- [ ] Code-audit passes (`pnpm typecheck` clean)

---

### T1.2 — `getCacheControlHeader({ maxAge, swr, staleMaxAge })`

#### Objective
Pure function that emits a canonical `Cache-Control` header string from cache options. Mirrors Next.js `cache-control.ts:17` but adapted to our config shape.

#### Evidence
- Reference doc §3.2 — Next.js `cache-control.ts:17` emits `s-maxage=N, stale-while-revalidate=M`.
- Reference doc §4 — convergent SWR header emission across all 4 frameworks.

#### Files to edit
```
packages/theo/src/cache/cache-control-header.ts — NEW; exports getCacheControlHeader
tests/unit/cache-control-header.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `cache-control-header.ts` (NEW): pure function, no imports. Consumed by `cache-engine.ts` (Phase 3) when writing entries' `Cache-Control` header on the outgoing response.

#### Deep Dives

**Data structure:**
```ts
export interface CacheControlInput {
  maxAge: number              // seconds; 0 = no cache
  swr?: number                // stale-while-revalidate window in seconds
  isPrivate?: boolean         // emit `private,` prefix (skips shared CDN caching)
}

export function getCacheControlHeader(input: CacheControlInput): string
```

**Algorithm:**
1. If `maxAge === 0`: return `'private, no-cache, no-store, max-age=0, must-revalidate'` (matches Next.js `cache-control.ts:28`).
2. Else build parts array:
   - If `isPrivate`: push `'private'`.
   - Push `'s-maxage=${maxAge}'`.
   - If `swr !== undefined && swr > 0`: push `'stale-while-revalidate=${swr}'`.
3. Join with `', '`.

**Invariants:**
- Output is always a non-empty string.
- `maxAge === 0` always produces the no-cache directive (defensive).
- `isPrivate` ONLY affects output when `maxAge > 0`.

**Edge cases:**
- `maxAge = 0` + `swr = 60` → `'private, no-cache, ...'` (swr ignored; we don't cache at all).
- `swr = undefined` → `'s-maxage=${maxAge}'` (no swr directive).
- `swr = 0` → same as undefined (no swr directive).
- `maxAge = Infinity` → caller responsibility to clamp; we emit `'s-maxage=Infinity'` which is technically invalid HTTP. Document but don't validate (kept pure).

#### Tasks
1. Create `packages/theo/src/cache/cache-control-header.ts`.
2. Write `tests/unit/cache-control-header.test.ts` covering BDD scenarios (RED).
3. Implement until tests GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     getCacheControlHeader_happy_path() — Given {maxAge: 60, swr: 300}, When called, Then returns "s-maxage=60, stale-while-revalidate=300"
RED:     getCacheControlHeader_no_swr() — Given {maxAge: 60}, When called, Then returns "s-maxage=60"
RED:     getCacheControlHeader_zero_max_age() — Given {maxAge: 0, swr: 60}, When called, Then returns "private, no-cache, no-store, max-age=0, must-revalidate"
RED:     getCacheControlHeader_private_flag() — Given {maxAge: 60, isPrivate: true}, When called, Then returns "private, s-maxage=60"
RED:     getCacheControlHeader_swr_zero_treated_as_undefined() — Given {maxAge: 60, swr: 0}, When called, Then returns "s-maxage=60" (no swr directive)
RED:     getCacheControlHeader_private_and_zero_maxAge() — Given {maxAge: 0, isPrivate: true}, When called, Then returns "private, no-cache, no-store, max-age=0, must-revalidate" (zero wins)

GREEN:   Implement cache-control-header.ts with minimal code to pass all 6 RED tests.
REFACTOR: Extract no-cache constant if reused elsewhere.
VERIFY:  npx vitest run tests/unit/cache-control-header.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** standard `{maxAge: 60, swr: 300}` → canonical header.
- **Validation error:** Not applicable (pure function; no validation gate — caller-side).
- **Edge case:** `maxAge: 0` overrides everything including `isPrivate`.
- **Error scenario:** N/A — pure function; doesn't throw.

#### Acceptance Criteria
- [ ] 6 RED tests pass (GREEN)
- [ ] Zero TS errors
- [ ] Zero lint warnings
- [ ] Output strings exactly match RFC 7234 `Cache-Control` syntax

#### DoD
- [ ] All unit tests green
- [ ] Zero TS / lint issues
- [ ] Function is exported from `packages/theo/src/cache/index.ts`

---

### T1.3 — `deriveKey(req, opts)` — URL+query cache key with tracking-param filter

#### Objective
Pure function that derives a deterministic cache key from a `Request` object. Default behavior: lowercase host + pathname + sorted query (excluding tracking params). Override via `opts.getKey`.

#### Evidence
- Reference doc §4 (convergent): all 4 frameworks normalize URL+query for the cache key.
- Reference doc §3.4 — Astro's `DEFAULT_EXCLUDED_PARAMS` (25 entries) for tracking params.
- Reference doc §7 — Astro's NUL (`\0`) separator for Vary-aware suffixes.

#### Files to edit
```
packages/theo/src/cache/key-derivation.ts — NEW; exports deriveKey, DEFAULT_EXCLUDED_QUERY_PARAMS
tests/unit/cache-key-derivation.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `key-derivation.ts` (NEW): consumed by `cache-engine.ts` (Phase 3) when computing the storage key. Also consumed by `define-cached-route.ts` (Phase 5) which passes `req` to the engine.

#### Deep Dives

**Data structure:**
```ts
export interface KeyDerivationOptions {
  getKey?: (req: Request) => string | Promise<string>
  excludeQuery?: string[]      // exact-match query keys to drop
  sortQuery?: boolean          // default true
  varies?: string[]            // header names — appended as \0name=value suffix
  prefix?: string              // namespace prefix (e.g., route name)
}

export const DEFAULT_EXCLUDED_QUERY_PARAMS: string[]   // 25 known tracking params

export async function deriveKey(req: Request, opts?: KeyDerivationOptions): Promise<string>
```

**Algorithm:**
1. If `opts.getKey` provided: `return await opts.getKey(req)`. Skip everything else (full user override).
2. Parse URL: `const url = new URL(req.url)`.
3. Lowercase host: `url.hostname.toLowerCase()`.
4. Path: `url.pathname` as-is.
5. Build query string:
   - Take `url.searchParams`.
   - Drop entries whose name is in `excludeQuery ?? DEFAULT_EXCLUDED_QUERY_PARAMS`.
   - If `sortQuery !== false`: sort by key (locale-independent, ASCII).
   - Serialize as `key=value&key2=value2`.
6. Base key: `${prefix ? prefix + ':' : ''}${url.protocol}//${url.hostname.toLowerCase()}${url.pathname}${queryString ? '?' + queryString : ''}`.
7. Vary suffix: if `varies` non-empty: for each header name (lowercased), append `\0${name}=${req.headers.get(name) ?? ''}`.
8. Return base + varySuffix.

**Invariants:**
- Same `req` (same URL + same Vary'd headers) → same output. Deterministic.
- Different URL or different Vary'd header value → different output.
- `getKey` override is total: no internal logic runs.

**Edge cases:**
- `getKey` is async → awaited.
- `getKey` returns empty string → returned as-is (caller's choice, may collide but valid).
- URL has no query → no `?` suffix.
- URL has only excluded query → no `?` suffix (effectively `pathname`).
- Vary header missing on request → empty string substituted (matches Astro `memory-provider.ts:243`).
- Vary header `cookie` or `set-cookie` → caller responsibility to filter (we handle in the engine at config-validate time, not here).

**Default excluded query params (matching Astro list):**
```ts
['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
 'fbclid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'twclid',
 'li_fat_id', 'mc_cid', 'mc_eid', '_ga', '_gl', '_hsenc', '_hsmi', '_ke',
 'oly_anon_id', 'oly_enc_id', 'rb_clickid', 's_cid', 'vero_id', 'wickedid',
 'yclid', '__s', 'ref']
```

Note: we use exact-match (not Astro's `picomatch` glob). Simpler, fewer deps. Add glob support later if user demand.

#### Tasks
1. Create `packages/theo/src/cache/key-derivation.ts`.
2. Hard-code `DEFAULT_EXCLUDED_QUERY_PARAMS` (~30 entries).
3. Write `tests/unit/cache-key-derivation.test.ts` covering BDD scenarios (RED).
4. Implement until tests GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     deriveKey_happy_path() — Given new Request("https://example.com/api/users?id=1&sort=desc"), When deriveKey called, Then returns "https://example.com/api/users?id=1&sort=desc"
RED:     deriveKey_excludes_utm() — Given Request with ?utm_source=email&id=1, When deriveKey called, Then returns key WITHOUT utm_source
RED:     deriveKey_sorts_query() — Given Request with ?z=1&a=2, When deriveKey called, Then returns "...?a=2&z=1"
RED:     deriveKey_lowercases_host() — Given Request "https://EXAMPLE.COM/foo", When deriveKey called, Then returns "https://example.com/foo"
RED:     deriveKey_getKey_override() — Given opts.getKey returns "custom-key", When deriveKey called, Then returns "custom-key" (no internal logic)
RED:     deriveKey_vary_suffix() — Given Request with header "accept: application/json", opts.varies=["accept"], When deriveKey called, Then returns "...\0accept=application/json"
RED:     deriveKey_empty_query() — Given Request "https://example.com/foo", When deriveKey called, Then returns "https://example.com/foo" (no trailing ?)
RED:     deriveKey_only_tracking_params() — Given Request with only ?utm_source=x&fbclid=y, When deriveKey called, Then returns base URL without query
RED:     deriveKey_prefix() — Given opts.prefix="users", Request "...", When deriveKey called, Then returns "users:https://..."
RED:     deriveKey_missing_vary_header() — Given Request without "accept" header, opts.varies=["accept"], When deriveKey called, Then returns "...\0accept=" (empty value)
RED:     deriveKey_async_getKey() — Given opts.getKey returns Promise resolving to "key", When deriveKey awaited, Then returns "key"
RED (EC-6): deriveKey_malformed_url_throws_clear_error() — Given opts.getKey returns a syntactically invalid URL string passed through (impossible from native Request — only via getKey), When deriveKey called, Then throws with mention of the problematic URL (not raw TypeError from URL constructor)
RED (EC-7): deriveKey_getKey_returns_non_string_throws() — Given opts.getKey = () => 42 as any, When deriveKey called, Then throws Error('getKey must return a string, got number')

GREEN:   Implement key-derivation.ts to pass all 13 RED tests.
REFACTOR: Extract DEFAULT_EXCLUDED_QUERY_PARAMS to a constant; consider Set<string> for O(1) lookup if list grows.
VERIFY:  npx vitest run tests/unit/cache-key-derivation.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** standard request → URL+sorted-query key.
- **Validation error:** N/A — pure function; `opts.getKey` overrides everything.
- **Edge case:** request with only tracking params → key has no query suffix.
- **Error scenario:** `getKey` throws → exception propagates to caller (documented).

#### Acceptance Criteria
- [ ] 11 RED tests pass (GREEN)
- [ ] Zero TS errors
- [ ] Zero lint warnings
- [ ] `DEFAULT_EXCLUDED_QUERY_PARAMS` contains ≥ 25 entries matching Astro's list
- [ ] Function is async (returns `Promise<string>`) — even when `getKey` is sync

#### DoD
- [ ] All unit tests green
- [ ] Zero TS / lint issues
- [ ] Function exported from `packages/theo/src/cache/index.ts`

---

## Phase 2: Storage layer — `InMemoryCacheAdapter` + `CacheStorageAdapter` interface

### T2.1 — `CacheStorageAdapter` interface + `CacheEntry` type

#### Objective
Define the narrow storage contract that all adapters must implement. Single TypeScript interface; no implementation here.

#### Evidence
- Reference doc §9.3 — defined the contract; reused verbatim.
- Reference doc §6 — `unstorage` API doesn't have `deleteByTag`, so our interface is intentionally wider on that one method.

#### Files to edit
```
packages/theo/src/cache/storage-adapter.ts — NEW; exports CacheStorageAdapter interface + CacheEntry type
tests/unit/cache-storage-adapter-contract.test.ts — NEW; type-only tests using expectTypeOf
```

#### Deep file dependency analysis
- `storage-adapter.ts` (NEW): pure types file, no runtime code. Consumed by every other cache file.

#### Deep Dives

**Type definitions:**
```ts
export interface CacheEntry {
  body: string | Uint8Array     // serialized payload (caller's responsibility)
  status: number                // HTTP status; routes only
  headers: Array<[string, string]> // copied response headers (sans Set-Cookie); routes only
  storedAt: number              // epoch ms when written
  maxAge: number                // seconds, validity window from storedAt
  swr: number                   // seconds, stale window after maxAge expires
  tags: string[]                // accumulated tags (user-supplied + path-derived)
  vary?: string[]               // header names that affect the key (informational)
  cacheVersion?: string         // explicit version stamp
}

export interface CacheStorageAdapter {
  readonly name: string

  // Single-entry operations
  get(key: string): Promise<CacheEntry | undefined>
  set(key: string, entry: CacheEntry): Promise<void>
  delete(key: string): Promise<boolean>     // returns true if existed

  // Tag fan-out
  deleteByTag(tag: string): Promise<number> // returns # deleted

  // Maintenance / debug
  size(): Promise<number>
  clear(): Promise<void>
  keys(prefix?: string): AsyncIterableIterator<string>
}
```

**Invariants documented in JSDoc:**
- `get` returns `undefined` if key not present; never throws on missing key.
- `set` is idempotent — calling twice with the same key + entry is equivalent to once.
- `delete` is idempotent — calling on non-existent key returns false, no throw.
- `deleteByTag` removes ALL entries whose `tags` array contains the tag; the count is the number of distinct entries removed.
- Implementations MUST maintain the invariant: `get(key) !== undefined ↔ key ∈ tagsForKey(entry.tags) for every tag`.

**Edge cases:**
- Concurrent `set` calls for the same key → last-write-wins (implementation choice, documented).
- `deleteByTag('')` → no-op (empty string is not a valid tag).
- `keys()` iteration during concurrent mutation → implementation choice (snapshot vs live); InMemoryCacheAdapter uses snapshot.

#### Tasks
1. Create `packages/theo/src/cache/storage-adapter.ts` with the interface + type.
2. Write `tests/unit/cache-storage-adapter-contract.test.ts` with type-only tests via `expectTypeOf` to verify the contract.
3. (Type-only — no runtime impl yet; that's T2.2.)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     contract_has_get_method() — Given an implementation, When called with key, Then returns Promise<CacheEntry | undefined>
RED:     contract_has_set_method() — Given an implementation, When called with key + entry, Then returns Promise<void>
RED:     contract_has_delete_returns_boolean() — Given an implementation, When called with key, Then returns Promise<boolean>
RED:     contract_has_deleteByTag_returns_count() — Given an implementation, When called with tag, Then returns Promise<number>
RED:     CacheEntry_has_required_fields() — Given a CacheEntry, Then type checks: body, status, headers, storedAt, maxAge, swr, tags
RED:     CacheEntry_optional_fields_allowed() — Given CacheEntry without vary/cacheVersion, Then type check passes

GREEN:   Implement storage-adapter.ts (type definitions only).
REFACTOR: None expected (pure types).
VERIFY:  npx vitest run tests/unit/cache-storage-adapter-contract.test.ts (uses expectTypeOf)
```

**BDD scenarios obrigatórios:**
- **Happy path:** A class implementing all 7 methods passes the type check.
- **Validation error:** A class missing `deleteByTag` fails to satisfy the interface (compile-time check).
- **Edge case:** A `CacheEntry` with `tags: []` (empty array) is valid.
- **Error scenario:** A class with `get(key: string): CacheEntry` (sync) fails the type check (async required).

#### Acceptance Criteria
- [ ] Interface compiles
- [ ] All 6 type tests pass (`pnpm test:types` if configured)
- [ ] JSDoc explains every method + invariants
- [ ] No runtime code in this file (types only)

#### DoD
- [ ] All type tests green
- [ ] Zero TS errors
- [ ] File exported from `packages/theo/src/cache/index.ts`

---

### T2.2 — `InMemoryCacheAdapter` — LRU + reverse tag index

#### Objective
Implement the default in-memory adapter: LRU eviction with count-based capacity + reverse tag index (`Map<tag, Set<key>>`) for O(1) fan-out.

#### Evidence
- Reference doc §3.4 — Astro's LRUMap (Map insertion-order pattern) is the simplest, ~45 LOC.
- Reference doc §7 — LRU algorithm comparison (Next.js size-based 238 LOC vs TanStack functional 74 LOC vs Astro 45 LOC). Astro's wins on simplicity-for-purpose.
- Reference doc §9.7 — tag fan-out via reverse index is in acceptance criteria.

#### Files to edit
```
packages/theo/src/cache/in-memory-adapter.ts — NEW; exports InMemoryCacheAdapter class
tests/unit/cache-in-memory-adapter.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `in-memory-adapter.ts` (NEW): imports `CacheStorageAdapter`, `CacheEntry` from `storage-adapter.ts`. Implements the contract.
- Consumed by: default `cache.storage = new InMemoryCacheAdapter()` in `cache-engine.ts` (Phase 3).

#### Deep Dives

**Data structures:**
```ts
export class InMemoryCacheAdapter implements CacheStorageAdapter {
  readonly name = 'memory'
  #entries: Map<string, CacheEntry>          // ordered by insertion (LRU)
  #tagIndex: Map<string, Set<string>>        // tag → set of keys carrying that tag
  #maxEntries: number                        // default 1000

  constructor(opts?: { maxEntries?: number })

  async get(key: string): Promise<CacheEntry | undefined>
  async set(key: string, entry: CacheEntry): Promise<void>
  async delete(key: string): Promise<boolean>
  async deleteByTag(tag: string): Promise<number>
  async size(): Promise<number>
  async clear(): Promise<void>
  async *keys(prefix?: string): AsyncIterableIterator<string>
}
```

**Algorithms:**

`get(key)`:
1. `const entry = this.#entries.get(key)`.
2. If `entry === undefined` return undefined.
3. LRU bump: `this.#entries.delete(key); this.#entries.set(key, entry)`.
4. Return entry.

`set(key, entry)`:
1. If `this.#entries.has(key)`:
   - Remove old entry's tags from `#tagIndex` (so old tags don't pollute).
   - `this.#entries.delete(key)` (to re-insert at tail).
2. Else if `this.#entries.size >= this.#maxEntries`:
   - Get oldest key via `this.#entries.keys().next().value`.
   - Get oldest entry's tags and remove from `#tagIndex`.
   - `this.#entries.delete(oldestKey)`.
3. `this.#entries.set(key, entry)`.
4. For each `tag of entry.tags`: `this.#tagIndex.get(tag) ?? new Set()`; `.add(key)`; reassign.

`delete(key)`:
1. `const entry = this.#entries.get(key); if (!entry) return false`.
2. Remove tags from `#tagIndex`.
3. `this.#entries.delete(key); return true`.

`deleteByTag(tag)`:
1. `const keys = this.#tagIndex.get(tag); if (!keys) return 0`.
2. For each `key of keys`: `this.#entries.delete(key)` (don't recurse — direct delete).
3. `this.#tagIndex.delete(tag)`.
4. For each remaining tag of each deleted entry: remove `key` from `#tagIndex.get(otherTag)` (clean up the reverse index).
5. Return `keys.size`.

`keys(prefix?)`:
1. For each key of `#entries.keys()`:
2. If `prefix && !key.startsWith(prefix)` continue.
3. Yield key.

**Invariants (documented):**
- `entries.size <= maxEntries` always (post-set).
- `tagIndex[tag].has(key) ↔ entries.get(key)?.tags.includes(tag)`.
- `clear()` empties both `#entries` and `#tagIndex`.

**Edge cases:**
- `set` overwrite with different tag set → old tags must be cleaned from index.
- `deleteByTag` for tag that exists on N entries with M tags each → cleans `#tagIndex` for all M*N tag relationships (not just the requested tag).
- `maxEntries = 0` → every set immediately evicts; functional but degenerate.
- `keys(prefix = '_THEO_T_/...')` → enables prefix-scan for path invalidation if user wants it.

#### Tasks
1. Create `packages/theo/src/cache/in-memory-adapter.ts`.
2. Implement all 7 methods.
3. Write `tests/unit/cache-in-memory-adapter.test.ts` covering BDD scenarios (RED).
4. Run tests; iterate until GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     adapter_set_then_get_returns_entry() — Given adapter, When set("a", entry); get("a"), Then returns entry
RED:     adapter_get_missing_returns_undefined() — Given empty adapter, When get("nope"), Then returns undefined
RED:     adapter_delete_returns_true_when_existed() — Given adapter with key "a", When delete("a"), Then returns true; get("a") returns undefined
RED:     adapter_delete_returns_false_when_missing() — Given empty adapter, When delete("nope"), Then returns false
RED:     adapter_lru_evicts_oldest_at_capacity() — Given adapter with maxEntries=2, When set("a", e1); set("b", e2); set("c", e3), Then get("a") returns undefined, get("b"+"c") return entries
RED:     adapter_lru_bumps_on_get() — Given adapter maxEntries=2, set("a", e1); set("b", e2); get("a"); set("c", e3), Then get("b") is undefined, get("a"+"c") return entries
RED:     adapter_deleteByTag_removes_all_tagged() — Given adapter with entries e1(tags=['user:1','prod']), e2(tags=['user:1']), e3(tags=['prod']), When deleteByTag('user:1'), Then returns 2; get on e1/e2 undefined; get(e3) still works
RED:     adapter_deleteByTag_cleans_other_tags() — Given e1(tags=['x','y']), When deleteByTag('x'), Then tagIndex['y'] no longer contains e1's key
RED:     adapter_deleteByTag_unknown_returns_zero() — Given empty adapter, When deleteByTag('nope'), Then returns 0
RED:     adapter_set_overwrite_cleans_old_tags() — Given e1(tags=['old']), When set(same key, e1' with tags=['new']), Then tagIndex['old'] empty; tagIndex['new'].has(key)
RED:     adapter_size_reports_count() — Given adapter with 3 entries, When size(), Then returns 3
RED:     adapter_clear_empties_both() — Given populated adapter, When clear(), Then size()=0; deleteByTag returns 0 (after the population)
RED:     adapter_keys_iterator() — Given 3 entries, When for-await of keys(), Then yields all 3 keys
RED:     adapter_keys_prefix_filter() — Given keys ["foo:1","foo:2","bar:1"], When keys("foo:"), Then yields only foo:1, foo:2

GREEN:   Implement in-memory-adapter.ts with all algorithms above. Pass all 14 RED tests.
REFACTOR: Consider extracting LRU helper methods (touchKey, bumpToTail) for readability if class >150 LOC.
VERIFY:  npx vitest run tests/unit/cache-in-memory-adapter.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** set + get returns same entry.
- **Validation error:** N/A — adapter doesn't validate inputs (caller's responsibility).
- **Edge case:** LRU eviction at capacity removes oldest first.
- **Error scenario:** deleteByTag on unknown tag returns 0 (no throw).

#### Acceptance Criteria
- [ ] 14 RED tests pass (GREEN)
- [ ] Class implements `CacheStorageAdapter` interface (type check)
- [ ] No memory leak: `clear()` reclaims; tested via 1000-entry stress test
- [ ] LRU eviction order verified
- [ ] Tag invariant verified (`tagIndex[tag].has(key) ↔ entry.tags.includes(tag)`)
- [ ] Zero TS / lint warnings

#### DoD
- [ ] All unit tests green
- [ ] Class size < 200 LOC
- [ ] Implements full `CacheStorageAdapter` contract
- [ ] Exported from `packages/theo/src/cache/index.ts`

---

## Phase 3: Cache Engine — the heart of the layer

### T3.1 — `cacheEngine` factory + SWR + in-flight dedupe

#### Objective
The engine wraps a `CacheStorageAdapter` and implements SWR semantics + in-flight deduplication + tag accumulation. The actual `defineCachedX` wrappers (Phase 4+5) call into this engine.

#### Evidence
- Reference doc §3.1 — Nitro/ocache's SWR + dedupe pattern.
- Reference doc §3.2 — Next.js's pendingRevalidates map for dedupe.
- Reference doc §5 — divergent SWR-default analysis; we pick Nitro's posture.

#### Files to edit
```
packages/theo/src/cache/cache-engine.ts — NEW; exports createCacheEngine + types
tests/unit/cache-engine.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `cache-engine.ts` (NEW): imports `CacheStorageAdapter`, `CacheEntry` from `storage-adapter.ts`. Returns a `CacheEngine` object with `getOrCompute(key, fn, opts)` + `set(key, entry)` + `invalidate(key)` + `invalidateTag(tag)` + `revalidatePath(path, type)`.
- Consumed by: `define-cached-function.ts` (Phase 4) and `define-cached-route.ts` (Phase 5).

#### Deep Dives

**Data structures:**
```ts
export interface CacheEngineOptions {
  storage: CacheStorageAdapter
  defaults?: {
    maxAge?: number
    swr?: number
    cacheVersion?: string
  }
  onError?: (err: unknown, ctx: { phase: 'get' | 'set' | 'revalidate'; key: string }) => void
}

export interface CacheEngine {
  getOrCompute<T>(
    key: string,
    fn: () => Promise<T>,
    opts: {
      maxAge: number
      swr?: number
      tags?: string[]
      cacheVersion?: string
      transform?: (raw: T) => T
      validate?: (raw: T) => boolean
    }
  ): Promise<{ value: T; status: 'hit' | 'stale' | 'miss' }>

  set(key: string, entry: CacheEntry): Promise<void>
  invalidate(key: string): Promise<boolean>
  invalidateTag(tag: string): Promise<number>
  revalidatePath(path: string, type?: 'layout' | 'page'): Promise<number>

  // Internal: SSR can call directly when bypassing get-or-compute (e.g., explicit refresh).
  forceRevalidate(key: string, fn: () => Promise<unknown>, opts: { maxAge: number; swr?: number; tags?: string[] }): Promise<void>
}

export function createCacheEngine(opts: CacheEngineOptions): CacheEngine
```

**Algorithms:**

`getOrCompute(key, fn, opts)`:
1. Check `inFlight.get(key)`. If present, `await` it and return `{ value, status: 'miss' }` (dedupe — shares the loader).
2. Lookup `storage.get(key)`.
3. If `entry === undefined` (true miss):
   - Create `loaderPromise = (async () => { ... })()` — see step 5 below.
   - `inFlight.set(key, loaderPromise)`.
   - `try { return { value: await loaderPromise, status: 'miss' } } finally { inFlight.delete(key) }`.
4. If entry exists:
   - Compute `age = (Date.now() - entry.storedAt) / 1000` (seconds).
   - If `opts.cacheVersion !== undefined && entry.cacheVersion !== opts.cacheVersion` → treat as miss (cacheVersion bump bypasses cache).
   - If `opts.validate && !opts.validate(parsedValue)` → treat as miss.
   - If `age <= entry.maxAge`: FRESH HIT. Return `{ value: deserialize(entry.body), status: 'hit' }`. Apply `transform` if provided.
   - Else if `age <= entry.maxAge + entry.swr`: STALE. Return current value immediately. Schedule background revalidation: fire `loaderPromise` (with same dedupe via `inFlight`), don't await. Return `{ value, status: 'stale' }`.
   - Else: EXPIRED. Treat as miss; recompute.
5. **Loader path** (called from miss + stale):
   - `const raw = await fn()`.
   - If `opts.transform`: `raw = opts.transform(raw)`.
   - If `opts.validate && !opts.validate(raw)`: throw (loaders that produce invalid output are bugs).
   - Construct `entry: CacheEntry = { body: serialize(raw), status: 200, headers: [], storedAt: Date.now(), maxAge: opts.maxAge, swr: opts.swr ?? 0, tags: opts.tags ?? [], cacheVersion: opts.cacheVersion }`.
   - `await storage.set(key, entry)`.
   - Return raw.
   - On error: call `onError?.(err, { phase: 'set', key })`; rethrow.

`set(key, entry)`:
- Direct passthrough to `storage.set(key, entry)`.

`invalidate(key)`:
- Direct passthrough to `storage.delete(key)`.

`invalidateTag(tag)`:
- `await storage.deleteByTag(tag)`.

`revalidatePath(path, type)`:
- `const tag = THEO_T_PREFIX + path + (type ? '/' + type : '')`.
- `await storage.deleteByTag(tag)`.

**Invariants:**
- Concurrent calls to `getOrCompute(sameKey, ...)` execute the loader EXACTLY ONCE.
- Background revalidation in SWR path NEVER blocks the response.
- `cacheVersion` mismatch treats cache as missing (transparent rehash).

**Edge cases:**
- Loader throws → `inFlight.delete(key)` MUST happen in finally. Error propagates to all awaiters.
- `maxAge = 0` → always miss (every call hits loader). Useful for testing.
- `swr = 0` → no stale-while-revalidate window; expired entries are full misses.
- `entry.body` is binary (Uint8Array) → caller's responsibility for serialization (default: JSON.stringify, opt-out for non-JSON).
- Background revalidation throws → `onError` called; stale entry remains in store (acceptable — better than nothing).
- `invalidate` called on non-existent key → returns false; no throw.

#### Tasks
1. Create `packages/theo/src/cache/cache-engine.ts`.
2. Implement all engine methods.
3. Write `tests/unit/cache-engine.test.ts` with BDD scenarios (RED).
4. Iterate until GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     engine_miss_then_hit() — Given empty engine, When getOrCompute("k", () => "v1", {maxAge: 60}), Then status='miss', value='v1'; second call: status='hit', value='v1', loader called 1x total
RED:     engine_stale_returns_old_value() — Given entry with storedAt = (now - 10s), maxAge=5, swr=60, When getOrCompute, Then status='stale', value=old; background fires; loader called 1 extra time async
RED:     engine_expired_recomputes() — Given entry with storedAt = (now - 100s), maxAge=5, swr=60, When getOrCompute, Then status='miss', value=new; loader called fresh
RED:     engine_concurrent_first_miss_dedupes() — Given empty engine, When 10 simultaneous getOrCompute("k", slowLoader, ...), Then loader called EXACTLY 1 time; all 10 awaiters get same value
RED:     engine_invalidate_removes_entry() — Given entry "k", When invalidate("k"), Then returns true; next getOrCompute calls loader fresh
RED:     engine_invalidate_unknown_returns_false() — Given empty engine, When invalidate("nope"), Then returns false
RED:     engine_invalidateTag_removes_all() — Given e1(tags=['x']), e2(tags=['x','y']), e3(tags=['y']), When invalidateTag('x'), Then returns 2; e1+e2 are missing; e3 still cached
RED:     engine_revalidatePath_encodes_as_tag() — Given entry written with tag '_THEO_T_/dashboard/page', When revalidatePath('/dashboard', 'page'), Then returns count; subsequent get on dashboard returns miss
RED:     engine_cacheVersion_mismatch_bypasses() — Given entry stored with cacheVersion='v1', When getOrCompute called with cacheVersion='v2', Then status='miss', value=new; entry overwritten with cacheVersion='v2'
RED:     engine_validate_failure_treats_as_miss() — Given entry, When getOrCompute with validate=() => false, Then status='miss', loader called
RED:     engine_transform_applied() — Given loader returns {raw: 42}, transform = x => ({ ...x, doubled: x.raw * 2 }), When getOrCompute, Then value has doubled: 84
RED:     engine_loader_throws_propagates() — Given loader throws Error("oops"), When getOrCompute, Then rejects with Error("oops"); inFlight cleared (next call retries)
RED:     engine_background_revalidate_failure_keeps_stale() — Given stale entry, loader throws, When getOrCompute, Then returns stale value (status='stale'); onError called once; entry NOT deleted
RED:     engine_maxAge_zero_always_misses() — Given entry, When getOrCompute with maxAge=0, Then loader called every call
RED:     engine_set_direct_writes() — Given engine, When set('k', entry), Then storage.get('k') returns entry
RED (EC-8): engine_negative_age_treated_as_fresh() — Given entry with storedAt = Date.now() + 60000 (clock retrograde), When getOrCompute, Then status='hit' (does not crash; use Math.max(0, age))
RED (EC-9): engine_validate_throws_treated_as_miss_logs_onError() — Given validate=() => { throw new Error('boom') }, When getOrCompute, Then status='miss', loader called, onError called with phase: 'get'
RED (EC-10): engine_loader_undefined_warns_no_cache_write() — Given fn = async () => undefined, When getOrCompute, Then returns undefined, storage.size remains 0, console.warn emitted once

GREEN:   Implement cache-engine.ts to pass all 18 RED tests.
REFACTOR: Extract `decideAge(entry, now)` helper if branching becomes complex.
VERIFY:  npx vitest run tests/unit/cache-engine.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** miss → write → hit on second call.
- **Validation error:** `validate` returns false → treat as miss.
- **Edge case:** Concurrent first-miss → loader called once (dedupe).
- **Error scenario:** Background revalidation throws → stale value preserved; `onError` invoked; main response unaffected.

#### Acceptance Criteria
- [ ] 15 RED tests pass (GREEN)
- [ ] Concurrent dedupe verified with 10 parallel calls
- [ ] Background revalidation does NOT block returned promise
- [ ] `onError` invoked at exactly the expected phases (`'get' | 'set' | 'revalidate'`)
- [ ] `cacheVersion` mismatch transparently rewrites
- [ ] Zero TS / lint warnings
- [ ] Engine compiles without `any` (all types explicit)

#### DoD
- [ ] All 15 unit tests green
- [ ] Engine LOC < 350 (target ~300 per ADR D1)
- [ ] Engine + adapter combined LOC < 600
- [ ] All edge cases from §8 of reference doc tested OR documented as out-of-scope for v1

---

## Phase 4: `defineCachedFunction` — public API for function memoization

### T4.1 — `defineCachedFunction(fn, opts)` + `.invalidate(...args)` method

#### Objective
Public API for caching arbitrary server functions. Returns a wrapped function + an `.invalidate(...args)` method that uses the same key-derivation logic.

#### Evidence
- Reference doc §3.1 — Nitro's `defineCachedFunction` is the API shape to mirror.
- Reference doc §9.3 — public API surface defined.

#### Files to edit
```
packages/theo/src/cache/define-cached-function.ts — NEW
tests/unit/cache-define-cached-function.test.ts — NEW; RED-first
packages/theo/src/server/index.ts — MODIFY; export defineCachedFunction
```

#### Deep file dependency analysis
- `define-cached-function.ts` (NEW): imports cache-engine, validators, key-derivation. Consumes the engine to call `getOrCompute`.
- `server/index.ts` (MODIFY): one-line export addition.

#### Deep Dives

**Data structure:**
```ts
export interface DefineCachedFunctionOptions<TArgs extends unknown[], TReturn> {
  name: string                                            // required namespace
  maxAge?: number                                         // seconds
  swr?: number                                            // seconds
  getKey?: (...args: TArgs) => string                     // override JSON.stringify
  tags?: string[] | ((...args: TArgs) => string[])        // static or dynamic
  cacheVersion?: string
  transform?: (raw: TReturn) => TReturn
  validate?: (raw: TReturn) => boolean
  onError?: (err: unknown, ctx: { args: TArgs }) => void
}

export type CachedFunction<TArgs extends unknown[], TReturn> = ((...args: TArgs) => Promise<TReturn>) & {
  invalidate: (...args: TArgs) => Promise<void>
}

export function defineCachedFunction<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  opts: DefineCachedFunctionOptions<TArgs, TReturn>
): CachedFunction<TArgs, TReturn>
```

**Algorithm:**

`defineCachedFunction(fn, opts)`:
1. Validate opts at construction time:
   - `opts.name` must be non-empty string. Throw at construction if missing.
   - Use `validateMaxAge(opts.maxAge, "${opts.name}")` (defaults to `DEFAULT_MAX_AGE`).
   - Use `validateExpire(opts.swr, opts.maxAge, "${opts.name}")` if both provided.
2. Build closure-cached `prefix = "fn:" + opts.name`.
3. Return wrapped function:
   ```ts
   const wrapped = async (...args: TArgs) => {
     const key = prefix + ":" + (opts.getKey?.(...args) ?? JSON.stringify(args))
     const tags = typeof opts.tags === 'function' ? opts.tags(...args) : (opts.tags ?? [])
     const { valid: validTags } = validateTags(tags, opts.name)
     try {
       const { value } = await engine.getOrCompute(key, () => fn(...args), {
         maxAge, swr, tags: validTags, cacheVersion: opts.cacheVersion,
         transform: opts.transform, validate: opts.validate,
       })
       return value as TReturn
     } catch (err) {
       opts.onError?.(err, { args })
       throw err
     }
   }
   wrapped.invalidate = async (...args: TArgs) => {
     const key = prefix + ":" + (opts.getKey?.(...args) ?? JSON.stringify(args))
     await engine.invalidate(key)
   }
   return wrapped
   ```

**Invariants:**
- `wrapped(args)` and `wrapped.invalidate(args)` use IDENTICAL key derivation.
- `opts.name` is stable across server restarts; cache survives.
- `opts.tags` can be static (array) or dynamic (function); BOTH supported.

**Edge cases:**
- `opts.name = ""` → throw at construction time.
- `args` contains `undefined` → `JSON.stringify([undefined])` returns `[null]`; documented collision risk. Recommend `getKey` for non-JSON args.
- `args` contains Symbol/function → `JSON.stringify` skips them; documented constraint.
- `opts.tags` returns an array containing reserved `_THEO_T_*` → those tags dropped (warned via `validateTags`).
- Construction at module-load time (e.g., `export const cachedX = defineCachedFunction(...)`) MUST work with the singleton engine (resolved from a module-level reference set at runtime by Phase 7 wiring).

#### Tasks
1. Create `packages/theo/src/cache/define-cached-function.ts`.
2. Wire to the engine (resolved from a module-level resolver — for now, accept engine as second arg + provide a default factory in Phase 7).
3. Write `tests/unit/cache-define-cached-function.test.ts`.
4. Iterate until GREEN.
5. Add export to `packages/theo/src/server/index.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dcf_happy_path() — Given fn = async (id: number) => "user-" + id, defineCachedFunction(fn, {name: 'getUser'}), When wrapped(42); wrapped(42), Then both return "user-42"; fn called exactly 1x
RED:     dcf_invalidate_busts_cache() — Given cached entry for args=[42], When .invalidate(42), Then next call to wrapped(42) calls fn fresh
RED:     dcf_static_tags_propagate() — Given opts.tags=['users'], When wrapped(42), Then resulting entry's tags include 'users'
RED:     dcf_dynamic_tags() — Given opts.tags=(id) => [`user:${id}`], When wrapped(42), Then entry tags=['user:42']
RED:     dcf_throws_at_construction_on_missing_name() — When defineCachedFunction(fn, {}), Then throws "name is required"
RED:     dcf_throws_at_construction_on_invalid_maxAge() — When defineCachedFunction(fn, {name: 'x', maxAge: -1}), Then throws "Invalid maxAge"
RED:     dcf_getKey_override() — Given opts.getKey = (a, b) => `${a}-${b}`, When wrapped(1, 2), Then cache key contains "1-2"
RED:     dcf_propagates_loader_error() — Given fn throws Error('oops'), When wrapped(42), Then rejects with same error; onError called with {args: [42]}
RED:     dcf_validate_failure_recomputes() — Given fn returns "x"; validate returns false; When wrapped(42); wrapped(42), Then fn called both times (validate-false treats as miss)

GREEN:   Implement define-cached-function.ts to pass 9 tests.
REFACTOR: Move key-construction to a helper if reused in invalidate + main path.
VERIFY:  npx vitest run tests/unit/cache-define-cached-function.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** wrapped function called twice with same args → fn called once.
- **Validation error:** missing `opts.name` → construction throws.
- **Edge case:** dynamic tags via function → result entry carries computed tags.
- **Error scenario:** loader throws → error propagates + `onError` invoked.

#### Acceptance Criteria
- [ ] 9 RED tests pass (GREEN)
- [ ] Construction throws on bad config (fail-fast)
- [ ] `.invalidate(...args)` uses same key as `wrapped(...args)` (verified by integration test)
- [ ] `defineCachedFunction` exported from `theokit/server` (verified by `grep`)
- [ ] Zero TS / lint warnings

#### DoD
- [ ] All unit tests green
- [ ] Exported in `packages/theo/src/server/index.ts`
- [ ] LOC < 100 (thin wrapper over engine)

---

## Phase 5: `defineCachedRoute` — public API for HTTP route caching

### T5.1 — `defineCachedRoute(config)` + middleware integration

#### Objective
Public API for caching HTTP route responses. Wraps `defineRoute` config; adds cache-aware middleware that intercepts requests, looks up the cache, returns cached responses on hit, and stores responses on miss.

#### Evidence
- Reference doc §3.1 — Nitro's `defineCachedHandler` is the API shape to mirror.
- Reference doc §3.4 — Astro's onRequest pattern (intercept-or-passthrough).
- Reference doc §9.3 — public API surface defined.

#### Files to edit
```
packages/theo/src/cache/define-cached-route.ts — NEW
packages/theo/src/cache/cache-middleware.ts — NEW; intercepts at router level
packages/theo/src/router/handler.ts — MODIFY; insert cache middleware in chain
tests/unit/cache-define-cached-route.test.ts — NEW; RED-first
tests/integration/cache-define-cached-route-roundtrip.test.ts — NEW
packages/theo/src/server/index.ts — MODIFY; export defineCachedRoute
```

#### Deep file dependency analysis
- `define-cached-route.ts` (NEW): extends `defineRoute` config schema with optional `cache` field. Returns same shape; the cache config is consumed by middleware.
- `cache-middleware.ts` (NEW): the actual interception logic. Pure function `(req, ctx, next) => Promise<Response>`.
- `router/handler.ts` (MODIFY): wire middleware into the request handling chain — runs BEFORE user route handler.

#### Deep Dives

**Data structure:**
```ts
export interface CachedRouteConfig<TBody, TQuery, TParams, THeaders>
  extends RouteConfig<TBody, TQuery, TParams, THeaders> {
  cache?: {
    maxAge?: number              // default 1
    swr?: number                 // default = maxAge * DEFAULT_SWR_MULTIPLIER (60)
    tags?: string[]              // static tags
    varies?: string[]            // header names; included in cache key
    getKey?: (req: Request) => string | Promise<string>
    bypassWhen?: (req: Request) => boolean | Promise<boolean>
    cacheVersion?: string
    cacheErrors?: boolean        // default false: status >= 400 not cached
    methods?: string[]           // default ['GET', 'HEAD']
    cacheable?: (response: Response) => boolean  // custom predicate (overrides Set-Cookie check, etc.)
    maxEntrySize?: number        // EC-3: max body bytes; default 10 MB; oversized → skip cache + warn
  }
}

export function defineCachedRoute<TBody, TQuery, TParams, THeaders>(
  config: CachedRouteConfig<TBody, TQuery, TParams, THeaders>
): CachedRouteConfig<TBody, TQuery, TParams, THeaders>
```

**Algorithm — `defineCachedRoute(config)`:**
1. Validate at config time:
   - If `cache.maxAge` defined: `validateMaxAge`.
   - If `cache.swr` defined: `validateExpire(cache.swr, cache.maxAge, "defineCachedRoute")`.
   - If `cache.cacheVersion` defined: must be non-empty string.
   - **EC-19 fix:** If `cache.maxEntrySize` defined: must be finite non-negative number. Throw `Error("Invalid maxEntrySize ${val} in defineCachedRoute, must be a non-negative finite number")` otherwise. Special value `0` means "always bypass" (intentional opt-out, consistent with `maxAge: 0`).
2. Return config as-is (it's a type tag — the middleware reads `config.cache` later).

**Algorithm — `cacheMiddleware(req, ctx, next)`:**
1. Get route config (set by router during dispatch).
2. If no `config.cache` → `return next()` (no caching for this route).
3. If `req.method` not in `cache.methods ?? ['GET','HEAD']` → `return next()` (method bypass).
4. If `cache.bypassWhen?.(req)` returns truthy → `return next()` (user-requested bypass).
4.1. **EC-2 fix:** If `cache.varies` includes `'cookie'` or `'set-cookie'` (lowercased): filter them out + `console.warn` once per route (per process lifetime, tracked in a `WeakSet`). Cookies have unbounded cardinality and effectively kill cache hit rate. Mirrors Astro `memory-provider.ts:219` `IGNORED_VARY_HEADERS`.
5. Compute `key = await deriveKey(req, { prefix: 'route:' + routeName, varies: filteredVaries, getKey: cache.getKey })`.
6. Compute `pathTag = THEO_T_PREFIX + new URL(req.url).pathname`.
7. Compute `allTags = [...(cache.tags ?? []), pathTag]`. Run `validateTags`.
8. Lookup `engine.getOrCompute(key, async () => { ... }, { maxAge, swr, tags: validTags })`:
   - Loader body:
     - `const response = await next()` (run the user handler).
     - **Cacheability checks:**
       - If `cache.cacheable?.(response)` is defined: use its result.
       - Else default: `if (response.status < 400 || cache.cacheErrors) && !response.headers.has('Set-Cookie')`.
     - If NOT cacheable: don't write to engine; return the response (this requires a sentinel return from loader; see invariants).
     - Serialize response: `const body = await response.clone().arrayBuffer(); const headers = [...response.headers.entries()].filter(([k]) => k.toLowerCase() !== 'set-cookie')`.
     - **EC-3 fix:** If `body.byteLength > (cache.maxEntrySize ?? 10 * 1024 * 1024)`: `console.warn` once per route + return `{ value: response, doNotCache: true }` sentinel.
     - Return `{ body, status: response.status, headers } as CacheEntry`.
9. Based on `status` (hit | stale | miss), build outgoing Response:
   - Body = `cached.body` (ArrayBuffer or string).
   - Status = `cached.status`.
   - Headers = `[...cached.headers]`.
   - Emit `Cache-Control: getCacheControlHeader({maxAge, swr})` UNLESS the route handler already set Cache-Control (respect explicit setting).
   - Dev-only: emit `X-Theo-Cache: HIT | STALE | MISS`.
10. Return response.

**Cacheability shortcut for "don't cache":**
- Since `getOrCompute` writes the entry, we need a way to NOT write. Solution: `getOrCompute` accepts `{ skipCacheWrite?: boolean }` flag that the loader can set on result. OR: loader throws a special `DoNotCacheError` that the engine recognizes — handles by returning the value without writing.
- **Chosen approach:** loader returns `{ value, doNotCache?: true }` tuple; engine writes only if `doNotCache !== true`.

Edit to engine type:
```ts
getOrCompute<T>(key, fn: () => Promise<T | { value: T; doNotCache?: boolean }>, opts): Promise<...>
```

**Invariants:**
- A cached response replayed verbatim has the same status + body + non-Set-Cookie headers.
- Set-Cookie is NEVER cached (auto-stripped + warn-logged once per route per server lifetime).
- `X-Theo-Cache` header only present in dev (`process.env.NODE_ENV !== 'production'`).
- `bypassWhen` is checked before key computation (avoids work).
- **EC-4 SECURITY INVARIANT:** Cache middleware MUST run AFTER user-defined middleware in the router chain (`router/handler.ts` ordering: `[...userMiddleware, cacheMiddleware, routeHandler]`). Reason: if cache runs BEFORE auth, a cache hit serves a previously-authenticated response to an unauthenticated request → data leak. The router places cache middleware at the END of the user chain, ensuring auth/session/CSRF middleware all run first. **This invariant is structural and tested by integration test below.**

**Edge cases:**
- Streaming SSE response (`Content-Type: text/event-stream`) → `cache.cacheable` defaults to `false` for this content-type (auto-detect).
- Response with `Cache-Control: no-store` set by handler → respect; don't cache.
- Concurrent first request to same route → engine dedupe ensures handler runs once.
- Handler throws → `next()` rejects → loader rejects → engine propagates; no entry written.
- Response with `Content-Length` mismatch after body read → caller's bug; we serialize what we get.

#### Tasks
1. Create `packages/theo/src/cache/define-cached-route.ts` (config validator + return).
2. Create `packages/theo/src/cache/cache-middleware.ts` (interception logic).
3. Add hook into `packages/theo/src/router/handler.ts` to invoke cache middleware.
4. Write unit tests for `defineCachedRoute` config validation.
5. Write integration test for full HTTP round-trip (miss → hit → stale).
6. Add export to `packages/theo/src/server/index.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dcr_validates_at_config_time() — Given config.cache.maxAge = -1, When defineCachedRoute called, Then throws "Invalid maxAge"
RED:     dcr_validates_cacheVersion_empty() — Given config.cache.cacheVersion = "", When defineCachedRoute called, Then throws
RED:     dcr_default_methods_GET_HEAD() — Given no cache.methods, When middleware processes POST request, Then bypasses cache (next() called directly)
RED:     dcr_middleware_first_request_misses() — Given fresh engine, When GET /api/data, Then response status=200; X-Theo-Cache=MISS in dev; entry written to storage
RED:     dcr_middleware_second_request_hits() — Given prior entry within maxAge, When second GET /api/data, Then response status=200; X-Theo-Cache=HIT; handler NOT called
RED:     dcr_middleware_stale_serves_old_async_refresh() — Given entry within swr window, When GET /api/data, Then status=200 with old body; X-Theo-Cache=STALE; background revalidation fires
RED:     dcr_middleware_set_cookie_bypasses() — Given handler returns response with Set-Cookie, When GET /api/data, Then response returned uncached; warn log emitted once
RED:     dcr_middleware_status_400_not_cached() — Given handler returns 404, cache.cacheErrors=false, When GET /api/data, Then 404 returned uncached; second request also calls handler
RED:     dcr_middleware_cacheErrors_true_caches_400() — Given cacheErrors=true, handler returns 404, When second GET, Then X-Theo-Cache=HIT, 404 from cache
RED:     dcr_middleware_bypassWhen_skips() — Given bypassWhen=(req) => req.headers.get('x-no-cache')==='1', When GET with header, Then handler called every time
RED:     dcr_middleware_varies_in_key() — Given varies=['accept'], When GET with accept:html then accept:json, Then both miss (separate entries)
RED:     dcr_middleware_dev_header_only_in_dev() — Given NODE_ENV=production, When GET, Then NO X-Theo-Cache header in response
RED:     dcr_middleware_existing_cache_control_respected() — Given handler emits Cache-Control: no-store, When GET, Then response NOT cached (cacheable=false short-circuit OR handler's header wins)
RED:     dcr_middleware_sse_not_cached() — Given handler returns text/event-stream response, When GET, Then NOT cached (default cacheable=false)
RED:     dcr_middleware_streams_response_body_intact() — Given handler returns JSON {ok: true}, When GET; second GET, Then both bodies are identical (byte-equal)
RED:     dcr_middleware_concurrent_first_miss_dedupes() — Given handler with 100ms delay, When 10 parallel GET, Then handler called exactly 1x; all 10 get same response
RED (EC-2): dcr_varies_cookie_filtered_with_warn() — Given cache.varies=['accept','cookie'], When middleware processes request, Then deriveKey called with varies=['accept'] only; console.warn emitted once
RED (EC-3): dcr_oversized_response_bypasses_cache_with_warn() — Given handler returns 11MB body, cache.maxEntrySize=10*1024*1024, When GET twice, Then both requests call handler (no caching); console.warn emitted once
RED (EC-3): dcr_undersized_response_cached_normally() — Given handler returns 1KB body, default maxEntrySize, When GET twice, Then second is HIT
RED (EC-4): dcr_security_cache_runs_after_auth_in_default_chain() — Given router with [authMiddleware, cacheMiddleware], request 1 authenticated (auth sets ctx.user), request 2 unauthenticated, Then request 2 is REJECTED by auth (not served from cache); auth runs BEFORE cache lookup
RED (EC-11): dcr_chunked_stream_not_cached() — Given handler returns Response with body=ReadableStream and no content-length header, When middleware processes, Then NOT cached (skipped via response.body instanceof ReadableStream check)
RED (EC-19): dcr_validates_maxEntrySize_negative_throws() — Given defineCachedRoute({ cache: { maxEntrySize: -1 } }), When called, Then throws "Invalid maxEntrySize"
RED (EC-19): dcr_maxEntrySize_zero_disables_cache_explicitly() — Given cache.maxEntrySize=0, When GET twice, Then handler called every time; documented semantic ("0 = disable")

GREEN:   Implement define-cached-route.ts + cache-middleware.ts to pass all 23 RED tests.
REFACTOR: Extract response serialization helper if used elsewhere.
VERIFY:  npx vitest run tests/unit/cache-define-cached-route.test.ts tests/integration/cache-define-cached-route-roundtrip.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** GET → miss → handler runs → response cached → second GET hits cache.
- **Validation error:** `defineCachedRoute({ cache: { maxAge: -1 } })` throws.
- **Edge case:** SSE response (`text/event-stream`) automatically bypasses cache.
- **Error scenario:** Set-Cookie response bypasses cache + warn-logged.

#### Acceptance Criteria
- [ ] 16 RED tests pass (GREEN)
- [ ] `X-Theo-Cache` header only present when `NODE_ENV !== 'production'`
- [ ] Set-Cookie response NEVER cached (warn log emitted once)
- [ ] SSE response NEVER cached
- [ ] Concurrent first-miss verified by counter (call counter = 1)
- [ ] Zero TS / lint warnings
- [ ] `defineCachedRoute` exported from `theokit/server`

#### DoD
- [ ] All unit + integration tests green
- [ ] Middleware integrated into router handler chain
- [ ] Cache middleware adds < 1ms overhead on cache hit (measured by integration timing test, smoke not strict)
- [ ] LOC < 250 across define-cached-route.ts + cache-middleware.ts combined

---

## Phase 6: Revalidation API — `revalidateTag`, `revalidatePath`, `updateTag`

### T6.1 — Revalidation public API

#### Objective
Three public functions for invalidating cached entries. All write to the engine; no AsyncLocalStorage needed.

#### Evidence
- Reference doc §3.2 — Next.js's `revalidateTag` + `revalidatePath` + `updateTag` shape.
- Reference doc §9.3 — public API surface.

#### Files to edit
```
packages/theo/src/cache/revalidate.ts — NEW
tests/unit/cache-revalidate.test.ts — NEW; RED-first
tests/integration/cache-revalidate-fanout.test.ts — NEW
packages/theo/src/server/index.ts — MODIFY; export revalidateTag, revalidatePath, updateTag
```

#### Deep file dependency analysis
- `revalidate.ts` (NEW): imports `engine` from a module-level resolver (set during framework bootstrap). Exports 3 async functions.
- Consumed by: user code in server actions, webhook handlers, route handlers.

#### Deep Dives

**Data structure:**
```ts
export async function revalidateTag(
  tag: string,
  opts?: { expire?: number }
): Promise<{ deleted: number }>

export async function revalidatePath(
  path: string,
  opts?: { type?: 'layout' | 'page'; expire?: number }
): Promise<{ deleted: number }>

export async function updateTag(tag: string): Promise<{ deleted: number }>
```

**Algorithms:**

`revalidateTag(tag, opts)`:
1. `const { valid } = validateTags([tag], 'revalidateTag')`.
2. If `valid.length === 0`: warn + return `{ deleted: 0 }`.
3. `const deleted = await engine.invalidateTag(valid[0])`.
4. Return `{ deleted }`.

`updateTag(tag)`:
1. Same as `revalidateTag` but conceptually for "immediate, no SWR" semantics (Server Action context).
2. Identical implementation in our model (since we delete-on-invalidate, not refresh-on-invalidate).
3. Return `{ deleted }`.

`revalidatePath(path, opts)`:
1. Compute `tag = THEO_T_PREFIX + path + (opts?.type ? '/' + opts.type : '')`.
2. `const deleted = await engine.invalidateTag(tag)`.
3. Return `{ deleted }`.

**Notes on `opts.expire`:**
- Next.js uses `opts.expire` to convert a tag invalidation into a "set timestamp; respect from now" semantics for SWR. At MVP, we DELETE-on-invalidate. `opts.expire` is accepted in the signature but ignored (warn once if non-zero — sets expectation for future enhancement).

**Invariants:**
- `revalidatePath('/dashboard', 'page')` invalidates the same entries as a write to `_THEO_T_/dashboard/page`.
- `revalidateTag` is idempotent (calling twice has no extra effect).
- All 3 functions are safe to call outside any request context.

**Edge cases:**
- `revalidateTag('')` → validateTags drops it; returns `{ deleted: 0 }`.
- `revalidateTag('_THEO_T_foo')` → validateTags drops (reserved); returns `{ deleted: 0 }`.
- `revalidatePath('/')` → tag = `_THEO_T_/` (just the root). Matches entries written by the root route.
- `revalidatePath('')` → tag = `_THEO_T_`. Empty path; matches nothing (no entry would write this tag). Returns 0; documented.
- Called when engine not yet initialized (module-load time) → throw `Error("Cache engine not initialized — ensure theo.config.ts ran")`.

#### Tasks
1. Create `packages/theo/src/cache/revalidate.ts`.
2. Wire to engine via module-level resolver.
3. Write `tests/unit/cache-revalidate.test.ts`.
4. Write `tests/integration/cache-revalidate-fanout.test.ts` (covers full route → invalidate → re-request → fresh).
5. Add exports to `packages/theo/src/server/index.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     revalidateTag_happy_path() — Given entries with tag 'x', When revalidateTag('x'), Then returns {deleted: N}; entries are gone
RED:     revalidateTag_unknown_tag_returns_zero() — Given empty engine, When revalidateTag('nope'), Then returns {deleted: 0}
RED:     revalidateTag_empty_string_warns_returns_zero() — When revalidateTag(''), Then returns {deleted: 0}, console.warn called
RED:     revalidateTag_reserved_prefix_dropped() — When revalidateTag('_THEO_T_foo'), Then returns {deleted: 0}, dropped via validateTags
RED:     updateTag_behaves_like_revalidateTag() — Given entries with tag 'x', When updateTag('x'), Then same effect as revalidateTag('x')
RED:     revalidatePath_basic() — Given route emitted entry tag '_THEO_T_/dashboard', When revalidatePath('/dashboard'), Then deletes that entry
RED:     revalidatePath_with_type() — Given entry tag '_THEO_T_/dashboard/page', When revalidatePath('/dashboard','page'), Then deletes that entry
RED:     revalidatePath_root() — Given entry tag '_THEO_T_/', When revalidatePath('/'), Then deletes
RED:     integration_revalidate_route() — Given GET /api/users twice (second is HIT), POST /admin/revalidate calls revalidateTag('users'), Then third GET /api/users is MISS (handler called fresh)
RED:     integration_revalidatePath_route() — Given GET /dashboard cached, POST /admin/revalidatePath calls revalidatePath('/dashboard'), Then next GET is MISS

GREEN:   Implement revalidate.ts. Pass 10 RED tests.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/cache-revalidate.test.ts tests/integration/cache-revalidate-fanout.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** `revalidateTag('foo')` removes all entries tagged 'foo'.
- **Validation error:** `revalidateTag('')` → warn + zero (validate drops).
- **Edge case:** `revalidatePath('/')` invalidates the root entry.
- **Error scenario:** Calling before engine init → throws clear error.

#### Acceptance Criteria
- [ ] 10 RED tests pass (GREEN)
- [ ] `revalidateTag`, `revalidatePath`, `updateTag` exported from `theokit/server`
- [ ] Integration test demonstrates full route → invalidate → next-request-fresh flow
- [ ] Reserved-prefix protection enforced
- [ ] Zero TS / lint warnings

#### DoD
- [ ] All unit + integration tests green
- [ ] LOC < 80 (thin wrapper)
- [ ] Exports in `server/index.ts`

---

## Phase 7: `theo.config.ts` cache schema + framework wiring

### T7.1 — Cache config schema + engine bootstrap

#### Objective
Add `cache: { ... }` field to `theo.config.ts` schema. Initialize the singleton engine at framework bootstrap with the configured storage adapter + defaults.

#### Evidence
- Reference doc §9.3 — config schema design.
- Existing pattern: `packages/theo/src/config/schema.ts` already validates `logging`, `serialization`, etc. — cache fits the same pattern.

#### Files to edit
```
packages/theo/src/config/schema.ts — MODIFY; add CacheConfigSchema
packages/theo/src/cache/engine-singleton.ts — NEW; module-level engine resolver
packages/theo/src/cli/commands/dev.ts — MODIFY; call initCacheEngine(config.cache) before serving
packages/theo/src/cli/commands/start.ts — MODIFY; same as dev
tests/unit/cache-config-schema.test.ts — NEW; RED-first
tests/unit/cache-engine-singleton.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `config/schema.ts` (MODIFY): existing Zod schema; add new `cache` optional field. Backward compatible.
- `cache/engine-singleton.ts` (NEW): exports `initCacheEngine(config)` + `getCacheEngine()` resolver. Used by `revalidate.ts`, `define-cached-function.ts`, `cache-middleware.ts`.
- `cli/commands/dev.ts` + `start.ts` (MODIFY): call `initCacheEngine(config.cache)` after `loadConfig()`.

#### Deep Dives

**Zod schema:**
```ts
const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storage: z.union([z.literal('memory'), z.custom<CacheStorageAdapter>()]).default('memory'),
  defaults: z.object({
    maxAge: z.number().nonneg().finite().default(1),
    swr: z.number().nonneg().finite().optional(),
    cacheErrors: z.boolean().default(false),
  }).default({}),
  keyDerivation: z.object({
    excludeQuery: z.array(z.string()).optional(),
    sortQuery: z.boolean().default(true),
    lowercaseHost: z.boolean().default(true),
  }).default({}),
  routeRules: z.record(z.string(), z.object({
    maxAge: z.number().nonneg().finite().optional(),
    swr: z.number().nonneg().finite().optional(),
    tags: z.array(z.string()).optional(),
  })).optional(),
  maxEntries: z.number().int().positive().default(1000),
}).default({})
```

**Singleton resolver:**
```ts
let _engine: CacheEngine | undefined

export function initCacheEngine(config: NormalizedCacheConfig): CacheEngine {
  if (_engine) throw new Error("Cache engine already initialized — call once at bootstrap")
  const adapter = config.storage === 'memory'
    ? new InMemoryCacheAdapter({ maxEntries: config.maxEntries })
    : config.storage
  _engine = createCacheEngine({ storage: adapter, defaults: config.defaults })
  return _engine
}

export function getCacheEngine(): CacheEngine {
  if (!_engine) throw new Error("Cache engine not initialized — ensure theo.config.ts ran and config.cache.enabled=true")
  return _engine
}

export function _resetCacheEngine(): void {
  _engine = undefined
}
```

**Algorithm:**
1. At dev/start command bootstrap: `const config = await loadConfig()`.
2. If `config.cache.enabled === false`: skip `initCacheEngine` — `getCacheEngine` will throw on first cache call (user-friendly: "set `cache.enabled: true`").
3. Else: `initCacheEngine(config.cache)`.

**Invariants:**
- Only ONE engine per process. Calling `initCacheEngine` twice throws.
- `_resetCacheEngine` is test-only (no production code calls it).
- `cache.enabled: false` defaults to safe behavior: throws clear error.

**Edge cases:**
- `cache.storage` is a custom adapter → engine uses it directly.
- `cache.routeRules` glob doesn't match any route → no error; just no cache for that pattern.
- `cache.defaults.swr` undefined → computed at runtime as `maxAge * DEFAULT_SWR_MULTIPLIER`.

#### Tasks
1. Edit `packages/theo/src/config/schema.ts` to add `CacheConfigSchema`.
2. Create `packages/theo/src/cache/engine-singleton.ts`.
3. Edit `packages/theo/src/cli/commands/dev.ts` to call `initCacheEngine(config.cache)` after `loadConfig()`.
4. Edit `packages/theo/src/cli/commands/start.ts` — same.
5. Write `tests/unit/cache-config-schema.test.ts`.
6. Write `tests/unit/cache-engine-singleton.test.ts` (uses `_resetCacheEngine` between tests).
7. Update `define-cached-function.ts`, `cache-middleware.ts`, `revalidate.ts` to use `getCacheEngine()` lazily (on first call, not at module load).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     schema_accepts_minimal_cache_config() — Given config with cache:{}, When parsed, Then defaults applied (enabled=true, storage='memory', maxAge=1)
RED:     schema_rejects_negative_maxAge() — Given config.cache.defaults.maxAge=-1, When parsed, Then throws Zod error
RED:     schema_accepts_route_rules() — Given config.cache.routeRules={'/api/**': {maxAge: 60}}, When parsed, Then routeRules preserved
RED:     schema_custom_storage() — Given config.cache.storage = customAdapter, When parsed, Then preserves reference
RED:     singleton_init_returns_engine() — Given _resetCacheEngine(); initCacheEngine(config), Then getCacheEngine() returns same engine
RED:     singleton_init_twice_throws() — Given engine already initialized, When initCacheEngine again, Then throws "already initialized"
RED:     singleton_get_before_init_throws() — Given _resetCacheEngine(), When getCacheEngine, Then throws "not initialized"
RED:     singleton_uses_memory_default() — Given config.cache.storage='memory', When initCacheEngine, Then engine uses InMemoryCacheAdapter
RED:     singleton_uses_custom_adapter() — Given config.cache.storage = customAdapter, When initCacheEngine, Then engine uses customAdapter
RED (EC-12): singleton_isolated_per_test_file() — Given multiple test files each calling initCacheEngine, When run together, Then no cross-contamination (each file's beforeEach calls _resetCacheEngine; verify via documenting CI grep rule for "_resetCacheEngine in beforeEach")

GREEN:   Implement schema + singleton. Pass 10 RED tests.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/cache-config-schema.test.ts tests/unit/cache-engine-singleton.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** `cache: {}` in config → engine initializes with defaults.
- **Validation error:** `maxAge: -1` → Zod rejects.
- **Edge case:** Custom adapter passed via `cache.storage` → engine uses it.
- **Error scenario:** `getCacheEngine` before init → throws clear message.

#### Acceptance Criteria
- [ ] 9 RED tests pass (GREEN)
- [ ] `theo.config.ts` accepts the new `cache` field (backward compatible — optional)
- [ ] Singleton enforces single initialization
- [ ] `initCacheEngine` wired into `dev` + `start` CLI commands
- [ ] Existing tests for non-cache features still pass
- [ ] Zero TS / lint warnings

#### DoD
- [ ] All unit tests green
- [ ] Integration test from Phase 5 still passes (now via the singleton)
- [ ] No regression in existing config tests

---

### T7.2 — Route rules glob matching (config-level cache)

#### Objective
Apply `cache.routeRules: { '/api/**': { maxAge: 60 } }` from `theo.config.ts` to matching routes without per-route wrapping. Useful for cross-cutting policy.

#### Evidence
- Reference doc §3.1 — Nitro's route rules (`docs/1.docs/7.cache.md:127`).
- Reference doc §5 (divergent #3) — chose to support both per-route + config-level.

#### Files to edit
```
packages/theo/src/cache/route-rules.ts — NEW; glob matching
packages/theo/src/cache/cache-middleware.ts — MODIFY; resolve route rule when route has no `cache` config
tests/unit/cache-route-rules.test.ts — NEW; RED-first
```

#### Deep file dependency analysis
- `route-rules.ts` (NEW): exports `resolveRouteRule(path, rules)`. Uses minimatch-style glob (we have `picomatch` available transitively via Vite already).
- `cache-middleware.ts` (MODIFY): on each request, if route has no `cache` config, check `engine.routeRules` and apply if match.

#### Deep Dives

**Data structure:**
```ts
import picomatch from 'picomatch'

export interface RouteRule {
  maxAge?: number
  swr?: number
  tags?: string[]
}

export type RouteRules = Record<string, RouteRule>

export function compileRouteRules(rules: RouteRules): Array<{ matcher: (path: string) => boolean; rule: RouteRule }>

export function resolveRouteRule(path: string, compiled: ReturnType<typeof compileRouteRules>): RouteRule | undefined
```

**Algorithm:**
- `compileRouteRules`: returns array of `{ matcher, rule }`. Order preserved (FIRST match wins — same as Vite/Nuxt route rule semantics).
- `resolveRouteRule`: iterate compiled; return first match.

**Invariants:**
- Compiled at startup (once per process); not per-request.
- First match wins; document this in JSDoc.
- Route's own `cache` config overrides route rules (per-route is more specific).

**Edge cases:**
- `routeRules: { '/api/**': { maxAge: 60 } }` and route has its own `cache.maxAge: 30` → route's wins.
- `routeRules: { '/api/realtime/**': { maxAge: 0 } }` → matched routes don't cache.
- No match → `undefined` → middleware skips cache.
- Conflicting overlapping patterns → first defined wins (insertion order).

#### Tasks
1. **EC-5 fix:** Add `"picomatch": "^4.0.0"` to `dependencies` (NOT `devDependencies`) in `packages/theo/package.json`. Vite ships picomatch transitively but Vite is dev-only; production runtime won't have it via Vite. Verify via `pnpm why picomatch` that it appears under `dependencies` tree of the published `theokit` package.
2. Create `packages/theo/src/cache/route-rules.ts`.
3. Compile at engine init (in `engine-singleton.ts`).
4. Wire into `cache-middleware.ts`: if no per-route cache, check rules.
5. Write `tests/unit/cache-route-rules.test.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     route_rules_compile_matches_glob() — Given {'/api/**': {maxAge: 60}}, When resolveRouteRule('/api/users'), Then returns {maxAge: 60}
RED:     route_rules_no_match_returns_undefined() — Given rules above, When resolveRouteRule('/about'), Then returns undefined
RED:     route_rules_first_match_wins() — Given {'/api/**': {maxAge: 30}, '/api/users': {maxAge: 60}}, When resolveRouteRule('/api/users'), Then returns {maxAge: 30} (first match)
RED:     route_rules_per_route_overrides() — Given route has cache.maxAge=10, route rule says 60, When request, Then maxAge=10 applies
RED:     route_rules_maxAge_zero_disables() — Given rule {'/api/realtime/**': {maxAge: 0}}, When request hits, Then no cache attempted (skip)
RED (EC-5): picomatch_resolvable_in_published_package() — Smoke test that imports `picomatch` from the built `packages/theo/dist/`; fails if `picomatch` is only in devDependencies (proves production runtime safety)

GREEN:   Implement route-rules.ts + integrate in cache-middleware.ts. Pass 6 RED tests.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/cache-route-rules.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** glob `/api/**` matches `/api/users`.
- **Validation error:** Invalid glob → throws at compile time (picomatch's behavior).
- **Edge case:** `maxAge: 0` rule effectively disables cache.
- **Error scenario:** No matching rule → middleware passes through.

#### Acceptance Criteria
- [ ] 6 RED tests pass (GREEN)
- [ ] `picomatch` declared as `dependencies` (NOT devDependencies) in `packages/theo/package.json` — EC-5
- [ ] First-match-wins documented
- [ ] Per-route overrides take precedence
- [ ] Zero TS / lint warnings

#### DoD
- [ ] All unit tests green
- [ ] Compiled once per server lifetime
- [ ] Integration test for route rule scenario added to existing cache integration tests

---

## Phase 8: Fixture + docs

### T8.1 — `fixtures/cache-basic/` reproducible app

#### Objective
A minimal TheoKit app demonstrating all 5 cache primitives, importable as a Playwright fixture.

#### Evidence
- Plan template (skill mandate): "every framework feature MUST have a fixture project in tests/fixtures/".
- Existing pattern: `fixtures/template-default/`, `fixtures/full-stack-agent/` already exist.

#### Files to edit
```
fixtures/cache-basic/                — NEW (whole directory)
fixtures/cache-basic/package.json    — declares dep on theokit workspace
fixtures/cache-basic/theo.config.ts  — enables cache, configures route rule
fixtures/cache-basic/app/page.tsx    — entry page
fixtures/cache-basic/server/routes/users.ts — defineCachedRoute example
fixtures/cache-basic/server/routes/admin/revalidate.ts — revalidateTag webhook
fixtures/cache-basic/server/lib/stripe.ts — defineCachedFunction example
fixtures/cache-basic/README.md       — explains each example
```

#### Deep file dependency analysis
- All new files; workspace dep on `theokit:workspace:*` (or equivalent).

#### Deep Dives

**`theo.config.ts`:**
```ts
import { defineConfig } from 'theokit'
export default defineConfig({
  cache: {
    enabled: true,
    storage: 'memory',
    defaults: { maxAge: 1, cacheErrors: false },
    routeRules: { '/api/static/**': { maxAge: 300, swr: 600 } },
    maxEntries: 100,
  },
})
```

**`server/routes/users.ts`:**
```ts
import { defineCachedRoute } from 'theokit/server'
import { z } from 'zod'

let calls = 0
export const GET = defineCachedRoute({
  query: z.object({ id: z.string() }),
  cache: {
    maxAge: 5,
    swr: 30,
    tags: ['users'],
    bypassWhen: (req) => req.headers.get('x-no-cache') === '1',
  },
  handler({ query }) {
    calls++
    return Response.json({ id: query.id, name: 'User ' + query.id, calls })
  },
})
```

**`server/routes/admin/revalidate.ts`:**
```ts
import { defineRoute, revalidateTag, revalidatePath } from 'theokit/server'
import { z } from 'zod'

export const POST = defineRoute({
  body: z.object({ tag: z.string().optional(), path: z.string().optional() }),
  async handler({ body }) {
    if (body.tag) {
      const { deleted } = await revalidateTag(body.tag)
      return Response.json({ ok: true, deleted, kind: 'tag' })
    }
    if (body.path) {
      const { deleted } = await revalidatePath(body.path)
      return Response.json({ ok: true, deleted, kind: 'path' })
    }
    return Response.json({ ok: false, error: 'specify tag or path' }, { status: 400 })
  },
})
```

**`server/lib/stripe.ts`:**
```ts
import { defineCachedFunction } from 'theokit/server'

let fetchCount = 0
export const fetchStripeSubscriptions = defineCachedFunction(
  async (userId: string) => {
    fetchCount++
    await new Promise((r) => setTimeout(r, 50))   // simulate network
    return { userId, subs: ['monthly'], _debug_call_count: fetchCount }
  },
  {
    name: 'stripe-subs',
    maxAge: 60,
    tags: (userId) => [`stripe:user:${userId}`],
  },
)
```

**`README.md` outlines the 4 demonstrations:**
1. Hit `/api/users?id=42` → MISS. Repeat → HIT (5s window).
2. Hit `/api/static/anything` → cached for 5 minutes (route rule applies).
3. `curl -X POST /admin/revalidate -d '{"tag":"users"}'` → `/api/users` next hit is MISS.
4. Call `fetchStripeSubscriptions('alice')` from a route → second call same args = cached (no `_debug_call_count` bump).

#### Tasks
1. Create the fixture directory + files.
2. Write README.md with each scenario + `curl` reproduction.
3. Verify `pnpm dev` boots in the fixture.
4. Add fixture to the dogfood phase coverage list.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     fixture_boots() — Given fixtures/cache-basic, When pnpm dev, Then server listens (verified by spawn + port-check)
RED:     fixture_cached_route_miss_then_hit() — Given fresh boot, When curl /api/users?id=42 twice, Then second response has X-Theo-Cache: HIT
RED:     fixture_revalidate_busts() — Given cached entry, When POST /admin/revalidate with tag='users', Then next /api/users?id=42 is MISS
RED:     fixture_route_rule_applies() — Given config has routeRules /api/static/**, When curl /api/static/anything, Then maxAge resolved from rule (verify Cache-Control header value 's-maxage=300')
RED:     fixture_function_cache_dedupes() — Given fetchStripeSubscriptions('alice') called 2x in same process, Then upstream simulator called 1x

GREEN:   Build fixture files + verify each test scenario manually + via shell-script integration test.
REFACTOR: None (this is the fixture itself).
VERIFY:  bash tests/integration/cache-basic-fixture.sh (test runs the fixture via spawn + curl)
```

**BDD scenarios obrigatórios:**
- **Happy path:** Boot fixture → curl → see HIT/MISS as expected.
- **Validation error:** N/A for fixture (config validates at startup).
- **Edge case:** `?utm_source=email` query param doesn't fragment cache (tracking-param exclusion).
- **Error scenario:** Boot with `cache.enabled: false` in config → `revalidateTag` call returns 500 with clear message.

#### Acceptance Criteria
- [ ] Fixture directory has 8 files
- [ ] `pnpm dev` boots in the fixture without errors
- [ ] All 5 scenarios from README.md reproducible via curl
- [ ] X-Theo-Cache header present in dev responses
- [ ] Cache-Control header from route rule visible
- [ ] Fixture passes `tsc --noEmit` clean

#### DoD
- [ ] Fixture committed
- [ ] README explains every demo
- [ ] Integration test using fixture passes (spawn server + curl)
- [ ] Fixture works on a fresh clone (no manual setup steps beyond `pnpm install`)

---

### T8.2 — `docs/concepts/caching.md` published

#### Objective
Public documentation for cache primitives. Cover all 5 primitives + edge cases + storage adapter design + 3 worked examples.

#### Evidence
- Skill quality rule: documentation must reach the consumer.
- Existing pattern: `docs/concepts/zero-config.md` is the model.

#### Files to edit
```
docs/concepts/caching.md — NEW
README.md — MODIFY; add cache to features list with link to caching.md
```

#### Deep file dependency analysis
- `docs/concepts/caching.md` (NEW): Markdown; references the fixture from T8.1.
- `README.md` (MODIFY): one-line addition to features list under "How it works".

#### Deep Dives

**Outline:**
1. **Why TheoKit ships cache primitives** (2 paragraphs — the LLM-call-per-pageview cost).
2. **The 5 primitives, at a glance:**
   - `defineCachedRoute(config)` — HTTP route caching.
   - `defineCachedFunction(fn, opts)` — function memoization.
   - `revalidateTag(tag)` — invalidate by tag.
   - `revalidatePath(path)` — invalidate by path (sugar over tag).
   - `updateTag(tag)` — Server Action-safe immediate invalidation.
3. **Working examples** (each in a code-block):
   - "Cache a JSON response for 60s with SWR" (defineCachedRoute).
   - "Cache a Stripe API call per-user" (defineCachedFunction).
   - "Bust the user's data from a webhook" (revalidateTag).
4. **Storage adapters:**
   - Default: in-memory.
   - Custom: how to write a `CacheStorageAdapter` (Redis recipe link).
5. **Cache-Control header behavior** (table: maxAge + swr + isPrivate → output).
6. **Edge cases & gotchas (accepted constraints — from edge-case review 2026-05-23):**
   - Set-Cookie auto-bypass (security — EC-2 fix in middleware).
   - Status >= 400 not cached by default (use `cacheErrors: true` to opt-in).
   - GET/HEAD only by default (use `cache.methods` to opt-in).
   - JSON serialization constraints — args/return values that can't survive `JSON.stringify` need `getKey` + `transform` overrides. Specifically: Symbols, Functions, undefined args, **BigInt** (EC-14), recursive references, Dates (serialize as ISO string, semantically lossy), Maps, Sets.
   - Tag size limits: ≤ 256 chars per tag, ≤ 128 tags per scope. Overflow drops with warn.
   - Reserved tag prefix `_THEO_T_` — user tags with this prefix are dropped.
   - `varies: ['cookie']` is filtered with a warn (EC-2) — cookie cardinality kills cache.
   - Response > 10 MB body bypasses cache (EC-3) — configure via `cache.maxEntrySize`. `maxEntrySize: 0` explicitly disables cache for that route (EC-19, consistent with `maxAge: 0` semantics).
   - Cache middleware runs AFTER user-defined middleware (EC-4 invariant) — auth/session/CSRF always gate before cache lookup.
   - Background revalidation may not complete if loader hangs (EC-18) — caller responsibility to set upstream timeouts.
   - Concurrent `invalidate(key)` during in-flight loader may not prevent stale write (EC-15) — prefer `revalidateTag` from non-cached contexts.
   - `theo.config.ts cache` changes require dev server restart (EC-16) — no HMR re-init at MVP.
   - `deleteByTag` complexity is O(matched-keys) (EC-17) — default `maxEntries: 1000` caps worst case.
7. **Comparison vs Next.js / Astro / Nitro** (brief table — different shape, similar power).
8. **Migration from `unstable_cache`** (if relevant).

#### Tasks
1. Write `docs/concepts/caching.md` following the outline.
2. Edit `README.md` to add the link.
3. Verify code samples compile (copy-paste into a test file).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     docs_caching_file_exists() — Given repo, When stat docs/concepts/caching.md, Then file exists with >500 lines
RED:     docs_caching_covers_all_5_primitives() — Given file content, When grep for primitive names, Then defineCachedRoute, defineCachedFunction, revalidateTag, revalidatePath, updateTag all present
RED:     docs_caching_code_samples_compile() — Given each code block, When extracted + compiled, Then no TS errors (test extracts via regex, writes to a temp file, runs tsc)
RED:     docs_readme_links_to_caching() — Given README.md content, When grep "caching.md", Then link present

GREEN:   Write the doc following the outline.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/docs-caching.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** Doc exists, has all primitives, has code samples.
- **Validation error:** A code sample with type errors → test fails (forces real working examples).
- **Edge case:** Doc mentions Set-Cookie auto-bypass (cross-reference to ADR D7).
- **Error scenario:** Doc mentions "what happens when storage is missing" (links to engine-singleton error).

#### Acceptance Criteria
- [ ] `docs/concepts/caching.md` exists, ≥ 500 lines
- [ ] All 5 primitives documented with code samples
- [ ] All code samples compile cleanly (validated by test)
- [ ] README links to it
- [ ] At least one comparison table with other frameworks

#### DoD
- [ ] Doc reviewed for voice/tone (HERO/BODY/DEEP DIVE per CLAUDE.md)
- [ ] All code samples tested
- [ ] Link from README
- [ ] No vocabulary violations (no "blazing fast", "robust", "opinionated", etc. per CLAUDE.md voice rules)

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Response caching primitive missing | T5.1 | `defineCachedRoute` added |
| 2 | Function caching primitive missing | T4.1 | `defineCachedFunction` added |
| 3 | Tag invalidation missing | T6.1 | `revalidateTag` + reverse index in adapter |
| 4 | Path invalidation missing | T6.1 | `revalidatePath` sugar over tag |
| 5 | `updateTag` for Server Actions missing | T6.1 | `updateTag` added |
| 6 | Cache-Control header emission missing | T1.2 | `getCacheControlHeader` pure function |
| 7 | Storage adapter abstraction missing | T2.1 | `CacheStorageAdapter` interface |
| 8 | In-memory LRU implementation missing | T2.2 | `InMemoryCacheAdapter` |
| 9 | SWR + concurrent dedupe missing | T3.1 | Engine implements both |
| 10 | Config schema for cache missing | T7.1 | Zod schema + singleton bootstrap |
| 11 | Route rules glob matching missing | T7.2 | `route-rules.ts` + middleware integration |
| 12 | Tracking-param exclusion default missing | T1.3 | `DEFAULT_EXCLUDED_QUERY_PARAMS` |
| 13 | Set-Cookie auto-bypass missing | T5.1 | Middleware cacheability check |
| 14 | Status >= 400 auto-bypass missing | T5.1 | Middleware cacheability default |
| 15 | Tag size validation missing | T1.1 | `validateTags` (256/128 limits) |
| 16 | Reserved `_THEO_T_` prefix protection missing | T1.1 | `validateTags` drops + warns |
| 17 | Reproducible fixture missing | T8.1 | `fixtures/cache-basic/` |
| 18 | Public documentation missing | T8.2 | `docs/concepts/caching.md` |

**Coverage: 18/18 gaps covered (100%)**

## Global Definition of Done

- [ ] All 8 implementation phases completed (Phase 1–8)
- [ ] All RED → GREEN tests passing (~92 new tests across phases)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean across `packages/theo/`)
- [ ] Zero ESLint warnings
- [ ] Backward compatibility preserved (no existing tests break; existing routes without `cache` config behave as today)
- [ ] Code-audit checks passing across `packages/theo/`
- [ ] `packages/theo/CHANGELOG.md` updated with `[Unreleased]` entries under Added/Changed
- [ ] CLAUDE.md macro roadmap updated: caching marked ✅ Done with health score from dogfood
- [ ] **Fixture proof** — `fixtures/cache-basic/` is reproducible; integration test spawns it + verifies all primitives
- [ ] **Public docs** — `docs/concepts/caching.md` published; README links to it
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70, zero CRITICAL issues introduced by this plan

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all 8 implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the cache primitives work as a real user would experience them, not just as unit tests assert.

### Execution

```
/dogfood full
```

Always full. No shortcuts.

Plus a **manual smoke** specifically for this plan:

```bash
# Clean room
rm -rf /tmp/dogfood-caching && cd /tmp
npx --yes create-theokit dogfood-caching
cd dogfood-caching

# Add cache config
cat > theo.config.ts << 'EOF'
import { defineConfig } from 'theokit'
export default defineConfig({
  cache: { enabled: true },
})
EOF

# Create a cached route
mkdir -p server/routes
cat > server/routes/now.ts << 'EOF'
import { defineCachedRoute } from 'theokit/server'
export const GET = defineCachedRoute({
  cache: { maxAge: 5, tags: ['now'] },
  handler() {
    return Response.json({ now: new Date().toISOString() })
  },
})
EOF

# Create a revalidation route
cat > server/routes/bust.ts << 'EOF'
import { defineRoute, revalidateTag } from 'theokit/server'
export const POST = defineRoute({
  async handler() {
    const { deleted } = await revalidateTag('now')
    return Response.json({ ok: true, deleted })
  },
})
EOF

pnpm install
pnpm dev &
sleep 5

# First request
NOW1=$(curl -s http://localhost:3000/api/now | jq -r '.now')
echo "Miss: $NOW1"

# Immediate second request — should HIT (same timestamp)
NOW2=$(curl -s http://localhost:3000/api/now | jq -r '.now')
[ "$NOW1" = "$NOW2" ] && echo "✅ HIT: $NOW2" || echo "❌ Cache miss when should be HIT"

# Bust the tag
curl -s -X POST http://localhost:3000/api/bust -H "X-Theo-Action: 1"

# Third request — should be MISS (different timestamp)
NOW3=$(curl -s http://localhost:3000/api/now | jq -r '.now')
[ "$NOW1" != "$NOW3" ] && echo "✅ MISS after revalidate: $NOW3" || echo "❌ Cache still served after revalidate"

# Verify X-Theo-Cache header
curl -s -D - http://localhost:3000/api/now -o /dev/null | grep -i "x-theo-cache" && echo "✅ X-Theo-Cache header present" || echo "❌ X-Theo-Cache header missing in dev"
```

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in `defineCachedRoute`, `defineCachedFunction`, `revalidateTag`, `revalidatePath`, `updateTag`
- [ ] Manual smoke above passes (3-step: miss / hit / revalidate-bust)
- [ ] X-Theo-Cache header visible in dev responses
- [ ] No memory leak detected (1000-entry stress test)
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are caused by this plan vs pre-existing.
2. Fix all plan-caused CRITICAL and HIGH issues before declaring the plan complete.
3. Re-run `/dogfood full` to confirm fixes.
4. Pre-existing issues are logged but do NOT block plan completion.
