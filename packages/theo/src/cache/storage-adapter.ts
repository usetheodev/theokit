/**
 * A cached value persisted by a CacheStorageAdapter.
 *
 * For function caches: `status`/`headers` carry no semantics (use 200 + []).
 * For route caches: `status` + `headers` reproduce the original Response.
 *
 * `body` is always a serialized payload (string or binary). The caller
 * (engine + middleware) owns serialization/deserialization.
 */
export interface CacheEntry {
  body: string | Uint8Array
  status: number
  headers: [string, string][]
  /** epoch ms when written */
  storedAt: number
  /** seconds; validity window from storedAt */
  maxAge: number
  /** seconds; stale window after maxAge expires */
  swr: number
  /** accumulated tags (user + path-derived) */
  tags: string[]
  /** header names that affect the key (informational; key already includes them) */
  vary?: string[]
  /** explicit version stamp; mismatch bypasses cache */
  cacheVersion?: string
}

/**
 * Hot-path storage contract — every request hits these 4 methods.
 *
 * ISP split (T4.4 of architecture-review-remediation-plan, PV-8): an adapter
 * author implementing a Redis/D1/KV backend can implement ONLY this surface
 * (admin methods are optional via `CacheStoreAdmin`).
 *
 * Invariants:
 * - `get(key)` returns `undefined` if missing — never throws.
 * - `set(key, entry)` is idempotent (last write wins).
 * - `delete(key)` is idempotent (returns false if missing, never throws).
 * - `deleteByTag(tag)` removes ALL entries carrying the tag and returns the count.
 * - Tag index invariant: `get(key)?.tags.includes(tag)` ↔ `deleteByTag(tag)` removes `key`.
 *
 * Complexity (in-memory reference impl):
 * - get/set/delete: O(1) amortized.
 * - deleteByTag: O(matched-keys) via reverse index.
 */
export interface CacheStore {
  readonly name: string

  get(key: string): Promise<CacheEntry | undefined>
  set(key: string, entry: CacheEntry): Promise<void>
  delete(key: string): Promise<boolean>

  /** Fan-out invalidation by tag. Returns # entries removed. */
  deleteByTag(tag: string): Promise<number>
}

/**
 * Admin surface — used by tests, devtools, debug introspection.
 *
 * Optional for third-party adapters. Engine guards admin calls with `typeof`
 * checks so a hot-only adapter works correctly in production.
 */
export interface CacheStoreAdmin {
  size(): Promise<number>
  clear(): Promise<void>
  keys(prefix?: string): AsyncIterableIterator<string>
}

/**
 * Full storage backend contract — Hot path + Admin combined.
 *
 * The framework's `InMemoryCacheAdapter` implements both. Public type
 * `CacheStorageAdapter = CacheStore & Partial<CacheStoreAdmin>` (backward
 * compatible: existing implementations declaring all 7 methods continue to
 * satisfy the type; new minimal implementations may omit admin).
 */
export type CacheStorageAdapter = CacheStore & Partial<CacheStoreAdmin>
