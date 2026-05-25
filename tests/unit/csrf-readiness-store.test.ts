import { describe, it, expect, beforeEach } from 'vitest'

import {
  CsrfReadinessStore,
  type CsrfWarnRecord,
} from '../../packages/theo/src/server/security/csrf-readiness-store.js'

/**
 * T2.2 — In-memory bounded counter for CSRF warn events.
 *
 * Aggregates `csrf.warn` payloads by `(method, path, reason)` triple,
 * tracks count + first/last seen timestamp. Bounded at 1000 distinct
 * keys (EC-22 documented limit). Eviction is LRU-by-insertion.
 *
 * Used by the `/__theo/csrf-readiness` endpoint (dev + opt-in prod) to
 * answer "what would break in 0.3.0?" without users having to grep logs.
 */

describe('CsrfReadinessStore — record + summary', () => {
  let store: CsrfReadinessStore
  beforeEach(() => {
    store = new CsrfReadinessStore()
  })

  it('Given an empty store, When summary() is called, Then totalEvents === 0 and routes is empty', () => {
    const s = store.summary()
    expect(s.totalEvents).toBe(0)
    expect(s.routes).toEqual([])
  })

  it('Given 3 records on /api/chat + 2 on /api/checkout, When summary(), Then both routes appear with correct counts', () => {
    const base: Omit<CsrfWarnRecord, 'path'> = {
      method: 'POST',
      reason: 'Missing X-Theo-Action header',
    }
    for (let i = 0; i < 3; i++) store.record({ ...base, path: '/api/chat' })
    for (let i = 0; i < 2; i++) store.record({ ...base, path: '/api/checkout' })
    const s = store.summary()
    expect(s.totalEvents).toBe(5)
    expect(s.routes).toHaveLength(2)
    const chat = s.routes.find((r) => r.path === '/api/chat')
    expect(chat?.count).toBe(3)
    const checkout = s.routes.find((r) => r.path === '/api/checkout')
    expect(checkout?.count).toBe(2)
  })

  it('Given 1001 distinct routes, When summary(), Then the oldest is evicted (bounded to 1000)', () => {
    for (let i = 0; i < 1001; i++) {
      store.record({
        method: 'POST',
        path: `/api/route-${String(i)}`,
        reason: 'Missing X-Theo-Action header',
      })
    }
    const s = store.summary()
    expect(s.routes).toHaveLength(1000)
    // First-inserted route (route-0) must be evicted.
    expect(s.routes.find((r) => r.path === '/api/route-0')).toBeUndefined()
    // Last-inserted route (route-1000) must remain.
    expect(s.routes.find((r) => r.path === '/api/route-1000')).toBeDefined()
  })

  it('Given a route is re-recorded after eviction, When summary(), Then it appears fresh with count 1', () => {
    for (let i = 0; i < 1001; i++) {
      store.record({
        method: 'POST',
        path: `/api/route-${String(i)}`,
        reason: 'Missing X-Theo-Action header',
      })
    }
    // Re-record route-0 — must come back as fresh entry
    store.record({
      method: 'POST',
      path: '/api/route-0',
      reason: 'Missing X-Theo-Action header',
    })
    const s = store.summary()
    const route0 = s.routes.find((r) => r.path === '/api/route-0')
    expect(route0?.count).toBe(1)
  })
})

describe('CsrfReadinessStore — reset', () => {
  it('Given a store with records, When reset() is called, Then summary is empty', () => {
    const store = new CsrfReadinessStore()
    store.record({ method: 'POST', path: '/api/x', reason: 'r' })
    store.record({ method: 'POST', path: '/api/y', reason: 'r' })
    store.reset()
    const s = store.summary()
    expect(s.totalEvents).toBe(0)
    expect(s.routes).toEqual([])
  })
})

describe('CsrfReadinessStore — key uniqueness', () => {
  it('Given same path but different reasons, When summary(), Then they are separate entries', () => {
    const store = new CsrfReadinessStore()
    store.record({
      method: 'POST',
      path: '/api/x',
      reason: 'Missing X-Theo-Action header',
    })
    store.record({
      method: 'POST',
      path: '/api/x',
      reason: 'Origin mismatch',
    })
    const s = store.summary()
    expect(s.routes).toHaveLength(2)
  })
})
