/**
 * Minimal in-memory Redis-shaped mock for testing.
 *
 * Implements only the methods `RedisConversationStorage` uses:
 *   - rpush / lrange / del / expire / keys
 *
 * Why hand-rolled instead of `ioredis-mock`: keeps the dependency surface
 * small and avoids the EC-12 fake-timer compatibility risk. Real production
 * code should use `ioredis` against actual Redis; this mock is test-only.
 *
 * TTL behaviour: time is controlled by `setTime()` for deterministic tests.
 */

interface ListEntry {
  values: string[]
  expiresAt: number | null
}

export class InMemoryRedis {
  #now = 0
  #data = new Map<string, ListEntry>()

  setTime(epochMs: number): void {
    this.#now = epochMs
  }

  advanceTime(deltaMs: number): void {
    this.#now += deltaMs
  }

  private getLive(key: string): ListEntry | undefined {
    const entry = this.#data.get(key)
    if (!entry) return undefined
    if (entry.expiresAt !== null && entry.expiresAt <= this.#now) {
      this.#data.delete(key)
      return undefined
    }
    return entry
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    let entry = this.getLive(key)
    if (!entry) {
      entry = { values: [], expiresAt: null }
      this.#data.set(key, entry)
    }
    entry.values.push(...values)
    return Promise.resolve(entry.values.length)
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this.getLive(key)
    if (!entry) return Promise.resolve([])
    const len = entry.values.length
    const s = start < 0 ? Math.max(0, len + start) : Math.min(start, len)
    const e = stop < 0 ? len + stop + 1 : Math.min(stop + 1, len)
    return Promise.resolve(entry.values.slice(s, e))
  }

  async del(key: string): Promise<number> {
    return Promise.resolve(this.#data.delete(key) ? 1 : 0)
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.getLive(key)
    if (!entry) return Promise.resolve(0)
    entry.expiresAt = this.#now + seconds * 1000
    return Promise.resolve(1)
  }

  async keys(pattern: string): Promise<string[]> {
    // Only support trailing-* glob (sufficient for our prefix scan)
    if (!pattern.endsWith('*')) {
      return Promise.resolve([...this.#data.keys()].filter((k) => k === pattern))
    }
    const prefix = pattern.slice(0, -1)
    const matches: string[] = []
    for (const k of this.#data.keys()) {
      if (k.startsWith(prefix)) matches.push(k)
    }
    return Promise.resolve(matches)
  }
}
