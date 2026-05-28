import type { CacheEntry, CacheStorageAdapter } from './storage-adapter.js'

export interface InMemoryCacheAdapterOptions {
  /** Maximum number of entries before LRU eviction. Default 1000. */
  maxEntries?: number
}

/**
 * In-memory cache adapter with LRU eviction + reverse tag index.
 *
 * Uses Map insertion-order for O(1) LRU (Astro LRUMap pattern).
 * Reverse index `tagIndex: Map<tag, Set<key>>` makes deleteByTag O(matched-keys).
 *
 * Invariants:
 * - `entries.size <= maxEntries` post-set.
 * - `tagIndex[tag].has(key)` ↔ `entries.get(key)?.tags.includes(tag)`.
 *
 * eslint-disable @typescript-eslint/require-await — the CacheStorageAdapter
 * interface is intentionally async so Redis/file/external adapters fit. The
 * in-memory variant returns immediately but keeps the async signature to
 * satisfy the contract.
 */
/* eslint-disable @typescript-eslint/require-await */
export class InMemoryCacheAdapter implements CacheStorageAdapter {
  readonly name = 'memory'
  readonly #entries = new Map<string, CacheEntry>()
  readonly #tagIndex = new Map<string, Set<string>>()
  readonly #maxEntries: number

  constructor(opts: InMemoryCacheAdapterOptions = {}) {
    this.#maxEntries = opts.maxEntries ?? 1000
  }

  async get(key: string): Promise<CacheEntry | undefined> {
    const entry = this.#entries.get(key)
    if (entry === undefined) return undefined
    // LRU bump
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    return entry
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    // Overwrite case: clean old tags first
    const existing = this.#entries.get(key)
    if (existing) {
      this.#removeKeyFromTagIndex(key, existing.tags)
      this.#entries.delete(key)
    } else if (this.#entries.size >= this.#maxEntries) {
      // LRU eviction
      const oldestIter = this.#entries.keys().next()
      if (!oldestIter.done) {
        const oldestKey = oldestIter.value
        const oldestEntry = this.#entries.get(oldestKey)
        if (oldestEntry) {
          this.#removeKeyFromTagIndex(oldestKey, oldestEntry.tags)
        }
        this.#entries.delete(oldestKey)
      }
    }
    this.#entries.set(key, entry)
    for (const tag of entry.tags) {
      let bucket = this.#tagIndex.get(tag)
      if (!bucket) {
        bucket = new Set()
        this.#tagIndex.set(tag, bucket)
      }
      bucket.add(key)
    }
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.#entries.get(key)
    if (!entry) return false
    this.#removeKeyFromTagIndex(key, entry.tags)
    this.#entries.delete(key)
    return true
  }

  async deleteByTag(tag: string): Promise<number> {
    const bucket = this.#tagIndex.get(tag)
    if (!bucket || bucket.size === 0) return 0
    const keys = [...bucket]
    for (const key of keys) {
      const entry = this.#entries.get(key)
      if (entry) {
        this.#unindexFromOtherTags(key, entry.tags, tag)
      }
      this.#entries.delete(key)
    }
    this.#tagIndex.delete(tag)
    return keys.length
  }

  async size(): Promise<number> {
    return this.#entries.size
  }

  async clear(): Promise<void> {
    this.#entries.clear()
    this.#tagIndex.clear()
  }

  async *keys(prefix?: string): AsyncIterableIterator<string> {
    for (const key of this.#entries.keys()) {
      if (prefix && !key.startsWith(prefix)) continue
      yield key
    }
  }

  #removeKeyFromTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      const bucket = this.#tagIndex.get(tag)
      if (!bucket) continue
      bucket.delete(key)
      if (bucket.size === 0) this.#tagIndex.delete(tag)
    }
  }

  #unindexFromOtherTags(key: string, tags: string[], skipTag: string): void {
    for (const otherTag of tags) {
      if (otherTag === skipTag) continue
      const otherBucket = this.#tagIndex.get(otherTag)
      if (!otherBucket) continue
      otherBucket.delete(key)
      if (otherBucket.size === 0) this.#tagIndex.delete(otherTag)
    }
  }
}
