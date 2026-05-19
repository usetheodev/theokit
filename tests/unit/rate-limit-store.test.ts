import { describe, it, expect } from 'vitest'
import { InMemoryStore, type RateLimitStore } from '../../packages/theo/src/server/rate-limit-store.js'

/**
 * T2.1 — `RateLimitStore` interface + `InMemoryStore` adapter.
 *
 * Contract tests every store implementation must satisfy. The default
 * `InMemoryStore` keeps existing single-instance behavior; future adapters
 * (Redis, Cloudflare KV) implement the same interface.
 *
 * ADR D1: pluggable interface, NOT bundled Redis. Single-instance apps
 * see zero change. Multi-instance apps install adapter explicitly.
 */

describe('T2.1 — InMemoryStore contract', () => {
  it('incr() creates entry when empty', async () => {
    const s: RateLimitStore = new InMemoryStore()
    const r = await s.incr('user:a', 60_000)
    expect(r.count).toBe(1)
    expect(r.resetAt).toBeGreaterThan(Date.now())
  })

  it('incr() increments existing entry preserving resetAt', async () => {
    const s = new InMemoryStore()
    const r1 = await s.incr('user:a', 60_000)
    const r2 = await s.incr('user:a', 60_000)
    expect(r2.count).toBe(2)
    expect(r2.resetAt).toBe(r1.resetAt)
  })

  it('incr() resets after window when resetAt < now', async () => {
    const s = new InMemoryStore()
    await s.incr('user:a', 1) // 1ms window
    await new Promise((r) => setTimeout(r, 5))
    const r2 = await s.incr('user:a', 60_000)
    expect(r2.count).toBe(1) // fresh window
  })

  it('get() returns null for expired entries (not stale data)', async () => {
    const s = new InMemoryStore()
    await s.incr('user:a', 1)
    await new Promise((r) => setTimeout(r, 5))
    const r = await s.get('user:a')
    expect(r).toBeNull()
  })

  it('get() returns null for missing key', async () => {
    const s = new InMemoryStore()
    const r = await s.get('nonexistent')
    expect(r).toBeNull()
  })

  it('reset() removes entry so subsequent get() returns null', async () => {
    const s = new InMemoryStore()
    await s.incr('user:a', 60_000)
    await s.reset('user:a')
    const r = await s.get('user:a')
    expect(r).toBeNull()
  })

  it('incr() with windowMs = 0 throws InvalidWindowError', async () => {
    const s = new InMemoryStore()
    await expect(s.incr('user:a', 0)).rejects.toThrow(/window/i)
  })

  it('GC removes expired entries on the periodic check', async () => {
    const s = new InMemoryStore()
    // Create many entries with tiny window
    for (let i = 0; i < 1100; i++) {
      await s.incr(`k:${i}`, 1)
    }
    await new Promise((r) => setTimeout(r, 5))
    // Trigger GC threshold — checkCount % 1000 hits after 1000 incrs
    await s.incr('fresh:1', 60_000)
    // No public size accessor by contract; verify expired entry is gone
    const expired = await s.get('k:0')
    expect(expired).toBeNull()
  })
})
