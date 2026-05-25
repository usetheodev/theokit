import { describe, it, expect } from 'vitest'

import { InMemoryUsageStorage } from '../../packages/theo/src/server/cost/usage-storage-memory.js'

describe('InMemoryUsageStorage (T5.1)', () => {
  it('record stores entry; getUsage aggregates totals', async () => {
    const store = new InMemoryUsageStorage()
    await store.record({
      userId: 'u1',
      model: 'claude-sonnet-4-5',
      tokens: { input: 100, output: 50 },
      costUsd: 0.001,
      timestamp: new Date('2026-05-24T10:00:00Z'),
    })
    const result = await store.getUsage({
      userId: 'u1',
      period: {
        from: new Date('2026-05-24T00:00:00Z'),
        to: new Date('2026-05-24T23:59:59Z'),
      },
    })
    expect(result.totalTokens).toBe(150)
    expect(result.totalCostUsd).toBeCloseTo(0.001)
    expect(result.runs).toBe(1)
  })

  it('getUsage filters by userId (does not mix users)', async () => {
    const store = new InMemoryUsageStorage()
    const now = new Date()
    await store.record({
      userId: 'u1',
      model: 'm',
      tokens: { input: 100, output: 50 },
      costUsd: 0.01,
      timestamp: now,
    })
    await store.record({
      userId: 'u2',
      model: 'm',
      tokens: { input: 200, output: 100 },
      costUsd: 0.02,
      timestamp: now,
    })
    const r = await store.getUsage({
      userId: 'u1',
      period: {
        from: new Date(now.getTime() - 1000),
        to: new Date(now.getTime() + 1000),
      },
    })
    expect(r.totalTokens).toBe(150)
    expect(r.runs).toBe(1)
  })

  it('getUsage filters by period', async () => {
    const store = new InMemoryUsageStorage()
    await store.record({
      userId: 'u',
      model: 'm',
      tokens: { input: 10, output: 5 },
      costUsd: 0.001,
      timestamp: new Date('2026-05-23T12:00:00Z'),
    })
    await store.record({
      userId: 'u',
      model: 'm',
      tokens: { input: 20, output: 10 },
      costUsd: 0.002,
      timestamp: new Date('2026-05-24T12:00:00Z'),
    })
    const r = await store.getUsage({
      userId: 'u',
      period: {
        from: new Date('2026-05-24T00:00:00Z'),
        to: new Date('2026-05-24T23:59:59Z'),
      },
    })
    expect(r.totalTokens).toBe(30)
    expect(r.runs).toBe(1)
  })

  it('empty query returns zeros', async () => {
    const store = new InMemoryUsageStorage()
    const r = await store.getUsage({
      userId: 'nobody',
      period: { from: new Date(0), to: new Date() },
    })
    expect(r).toEqual({ totalTokens: 0, totalCostUsd: 0, runs: 0 })
  })

  it('concurrent records do not lose data', async () => {
    const store = new InMemoryUsageStorage()
    const now = new Date()
    const records = Array.from({ length: 100 }, () =>
      store.record({
        userId: 'u',
        model: 'm',
        tokens: { input: 1, output: 1 },
        costUsd: 0.0001,
        timestamp: now,
      }),
    )
    await Promise.all(records)
    const r = await store.getUsage({
      userId: 'u',
      period: {
        from: new Date(now.getTime() - 1000),
        to: new Date(now.getTime() + 1000),
      },
    })
    expect(r.runs).toBe(100)
    expect(r.totalTokens).toBe(200)
  })

  it('exposes name === "memory"', () => {
    const store = new InMemoryUsageStorage()
    expect(store.name).toBe('memory')
  })
})
