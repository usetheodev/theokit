import { describe, expect, expectTypeOf, it } from 'vitest'
import * as theokit from '../../packages/theo/src/server/index.js'
import type {
  PoolLike,
  StorageConfig,
  StorageAdapter,
} from '../../packages/theo/src/server/index.js'

describe('T1.3 — StorageManager re-exported from theokit/server barrel', () => {
  it('exports getStorageManager as a value', () => {
    expect(typeof theokit.getStorageManager).toBe('function')
  })

  it('exports StorageManager class', () => {
    expect(typeof theokit.StorageManager).toBe('function')
    const m = new theokit.StorageManager()
    expect(m).toBeInstanceOf(theokit.StorageManager)
  })

  it('StorageConfig type is importable', () => {
    const sample: StorageConfig = { servers: {} }
    expectTypeOf(sample).toExtend<StorageConfig>()
    expect(sample.servers).toBeDefined()
  })

  it('StorageAdapter type is importable (intersection-friendly)', () => {
    const sample: StorageAdapter = {
      name: 'in-mem',
      dispose: () => Promise.resolve(),
    }
    expect(sample.name).toBe('in-mem')
  })

  it('PoolLike type still importable from server barrel (BC)', () => {
    const sample: PoolLike = {
      query: () => Promise.resolve({ rows: [] }),
    }
    expect(typeof sample.query).toBe('function')
  })

  it('singleton returned across calls', () => {
    const a = theokit.getStorageManager()
    const b = theokit.getStorageManager()
    expect(a).toBe(b)
  })
})
