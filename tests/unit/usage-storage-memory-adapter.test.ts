import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { InMemoryUsageStorage } from '../../packages/theo/src/server/cost/usage-storage-memory.js'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import type { StorageAdapter } from '../../packages/theo/src/server/storage/storage-types.js'
import type { UsageStorageAdapter } from '../../packages/theo/src/server/cost/cost-types.js'

beforeEach(() => {
  __resetSingletonForTests()
})

describe('T2.3 — InMemoryUsageStorage implements StorageAdapter (D6)', () => {
  it('class instance assigns to StorageAdapter (happy path)', () => {
    const s = new InMemoryUsageStorage()
    const asAdapter: StorageAdapter = s
    expect(asAdapter.name).toBe('memory')
    expect(typeof asAdapter.dispose).toBe('function')
  })

  it('[EC-6] type satisfies the intersection of both interfaces', () => {
    expectTypeOf<InMemoryUsageStorage>().toExtend<UsageStorageAdapter>()
    expectTypeOf<InMemoryUsageStorage>().toExtend<StorageAdapter>()
    expectTypeOf<InMemoryUsageStorage>().toExtend<UsageStorageAdapter & StorageAdapter>()
  })

  it('dispose() resolves without throw', async () => {
    const s = new InMemoryUsageStorage()
    await expect(s.dispose()).resolves.toBeUndefined()
  })

  it('dispose() does NOT clear stored records (edge case: dispose ≠ reset)', async () => {
    const s = new InMemoryUsageStorage()
    await s.record({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: { input: 10, output: 20 },
      costUsd: 0.05,
      timestamp: new Date('2026-05-26T12:00:00Z'),
    })
    await s.dispose()
    const usage = await s.getUsage({
      userId: 'u1',
      period: {
        from: new Date('2026-05-26T00:00:00Z'),
        to: new Date('2026-05-26T23:59:59Z'),
      },
    })
    expect(usage.runs).toBe(1)
    expect(usage.totalTokens).toBe(30)
  })

  it('participates in StorageManager.dispose() drain (integration scenario)', async () => {
    const manager = getStorageManager()
    manager.configure({})
    const usage = new InMemoryUsageStorage()
    manager.register(usage)
    // No throw, no leak — confirms registration accepted
    await expect(manager.dispose()).resolves.toBeUndefined()
  })

  it('dispose() is idempotent — calling twice is safe', async () => {
    const s = new InMemoryUsageStorage()
    await s.dispose()
    await expect(s.dispose()).resolves.toBeUndefined()
  })
})
