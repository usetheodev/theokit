import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PoolLike as PoolLikeFromStorage } from '../../packages/theo/src/server/storage/storage-types.js'
import type { PoolLike as PoolLikeFromJobs } from '../../packages/theo/src/server/jobs/job-backend-postgres.js'

describe('T0.2 — PoolLike extracted to storage-types.ts (D7)', () => {
  it('PoolLike resolves from server/storage/storage-types', () => {
    // Structural identity check — if the type lookup compiled, the import resolves
    const sentinel: PoolLikeFromStorage = {
      query: () => Promise.resolve({ rows: [] }),
    }
    expect(typeof sentinel.query).toBe('function')
  })

  it('PoolLike still re-exported from server/jobs/job-backend-postgres (BC)', () => {
    const sentinel: PoolLikeFromJobs = {
      query: () => Promise.resolve({ rows: [] }),
    }
    expect(typeof sentinel.query).toBe('function')
  })

  it('both imports refer to the same structural type', () => {
    // Structural equivalence — assignable both directions
    expectTypeOf<PoolLikeFromStorage>().toExtend<PoolLikeFromJobs>()
    expectTypeOf<PoolLikeFromJobs>().toExtend<PoolLikeFromStorage>()
  })

  it('PoolLike preserves the optional end() method (used by manager dispose)', () => {
    type EndType = PoolLikeFromStorage['end']
    expectTypeOf<EndType>().toEqualTypeOf<(() => Promise<void>) | undefined>()
  })
})
