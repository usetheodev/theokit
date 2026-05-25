import { describe, it, expect, vi } from 'vitest'

import { trackAgentRun } from '../../packages/theo/src/server/cost/track-agent-run.js'
import { InMemoryUsageStorage } from '../../packages/theo/src/server/cost/usage-storage-memory.js'

describe('trackAgentRun (T5.2)', () => {
  it('calls adapter.record with provided input', async () => {
    const store = new InMemoryUsageStorage()
    const spy = vi.spyOn(store, 'record')
    await trackAgentRun(
      {
        userId: 'u1',
        model: 'claude-sonnet-4-5',
        tokens: { input: 100, output: 50 },
        costUsd: 0.001,
        timestamp: new Date(),
      },
      { storage: store },
    )
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('no-op when storage is undefined (does not throw)', async () => {
    await expect(
      trackAgentRun(
        {
          userId: 'u1',
          model: 'm',
          tokens: { input: 1, output: 1 },
          costUsd: 0,
          timestamp: new Date(),
        },
        { storage: undefined },
      ),
    ).resolves.toBeUndefined()
  })

  it('EC-14: adapter throw is logged via console.warn and does NOT bubble', async () => {
    const failingStore = {
      name: 'fail',
      record: async () => {
        throw new Error('adapter exploded')
      },
      getUsage: async () => ({ totalTokens: 0, totalCostUsd: 0, runs: 0 }),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      trackAgentRun(
        {
          userId: 'u',
          model: 'm',
          tokens: { input: 1, output: 1 },
          costUsd: 0,
          timestamp: new Date(),
        },
        { storage: failingStore },
      ),
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls[0]?.[0]).toContain('adapter exploded')
    warnSpy.mockRestore()
  })

  it('timestamp defaults to "now" when omitted', async () => {
    const store = new InMemoryUsageStorage()
    const spy = vi.spyOn(store, 'record')
    const before = Date.now()
    await trackAgentRun(
      {
        userId: 'u',
        model: 'm',
        tokens: { input: 1, output: 1 },
        costUsd: 0,
      },
      { storage: store },
    )
    const after = Date.now()
    const call = spy.mock.calls[0][0]
    expect(call.timestamp.getTime()).toBeGreaterThanOrEqual(before)
    expect(call.timestamp.getTime()).toBeLessThanOrEqual(after)
  })

  it('roundtrip: trackAgentRun → getUsage reflects the record', async () => {
    const store = new InMemoryUsageStorage()
    const now = new Date()
    await trackAgentRun(
      {
        userId: 'u',
        model: 'm',
        tokens: { input: 100, output: 50 },
        costUsd: 0.005,
        timestamp: now,
      },
      { storage: store },
    )
    const r = await store.getUsage({
      userId: 'u',
      period: {
        from: new Date(now.getTime() - 1000),
        to: new Date(now.getTime() + 1000),
      },
    })
    expect(r.totalTokens).toBe(150)
    expect(r.runs).toBe(1)
  })
})
