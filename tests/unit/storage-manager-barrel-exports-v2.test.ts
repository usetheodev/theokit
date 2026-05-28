import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as theokit from '../../packages/theo/src/server/index.js'
import type { GenericFactory } from '../../packages/theo/src/server/index.js'
import { __resetSingletonForTests } from '../../packages/theo/src/server/storage/storage-manager.js'

beforeEach(() => {
  __resetSingletonForTests()
  vi.restoreAllMocks()
})

describe('T1.2 — useStorage + GenericFactory barrel exports', () => {
  it('useStorage callable via getStorageManager() (happy path)', () => {
    const m = theokit.getStorageManager()
    const result = m.useStorage('x', () => 42)
    expect(result).toBe(42)
  })

  it('GenericFactory<T> type exported and usable (type test)', () => {
    const factory: GenericFactory<string> = () => 'hello'
    const m = theokit.getStorageManager()
    const result = m.useStorage('greet', factory)
    expect(result).toBe('hello')
  })

  it('useStorage signature visible in StorageManager class (validation error)', () => {
    expect(typeof theokit.StorageManager.prototype.useStorage).toBe('function')
  })

  it('BC: existing barrel exports intact (edge case)', () => {
    expect(typeof theokit.getStorageManager).toBe('function')
    expect(typeof theokit.StorageManager).toBe('function')
  })
})
