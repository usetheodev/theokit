import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  storageSchema,
  theoConfigSchema,
  type StorageConfig,
} from '../../packages/theo/src/config/schema.js'

describe('T1.1 — storageSchema (ADR-0007 D4)', () => {
  it('accepts a fully populated valid config (happy path)', () => {
    const result = storageSchema.safeParse({
      servers: {
        // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- intentional test stub
        primary: { host: 'pg.example.com', port: 5432, user: 'theo', password: 'test-only-stub' },
      },
      databases: {
        conv: { server: 'primary', database: 'theo_conv', pool: { min: 1, max: 10 } },
        jobs: { server: 'primary', database: 'theo_jobs' },
      },
      redis: {
        cache: { host: 'redis.example.com', port: 6379, user: 'default', password: '' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid port > 65535 (validation error)', () => {
    const result = storageSchema.safeParse({
      servers: { p: { host: 'h', port: 99999, user: 'u', password: '' } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = JSON.stringify(result.error.format())
      expect(flat).toContain('port')
    }
  })

  it('accepts the empty object — all sections optional (edge case)', () => {
    expect(storageSchema.safeParse({}).success).toBe(true)
  })

  it('rejects negative pool.min (error scenario)', () => {
    const result = storageSchema.safeParse({
      databases: {
        conv: { server: 'p', database: 'd', pool: { min: -1 } },
      },
    })
    expect(result.success).toBe(false)
  })

  it('exposes StorageConfig type assignable from defineConfig usage (type test)', () => {
    const sample: StorageConfig = {
      servers: { p: { host: 'h', user: 'u', password: '' } },
      databases: { d: { server: 'p', database: 'theo' } },
    }
    expectTypeOf(sample).toExtend<StorageConfig>()
    expect(sample.servers).toBeDefined()
  })

  it('[EC-1] silently drops unknown keys (default Zod strip-unknown)', () => {
    // Documents the default-mode behavior — user typo `databasees` is
    // silently dropped; concept doc T4.1 warns to use exact keys.
    const result = storageSchema.safeParse({
      databasees: { conv: { server: 'p', database: 'd' } }, // typo
      redys: { cache: { host: 'h', user: 'u', password: '' } }, // typo
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.databases).toBeUndefined()
      expect(result.data.redis).toBeUndefined()
    }
  })

  it('[EC-2] schema accepts dangling server reference — validation deferred to usePostgres()', () => {
    // Documents intentional deferral — `databases.X.server='ghost'` is fine
    // at parse time. StorageManager.usePostgres('X') throws actionable error
    // on first call.
    const result = storageSchema.safeParse({
      servers: {}, // no servers defined
      databases: {
        conv: { server: 'ghost', database: 'theo' }, // dangling reference
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.databases?.conv.server).toBe('ghost')
    }
  })

  it('integrates into theoConfigSchema as optional root key', () => {
    const result = theoConfigSchema.safeParse({
      storage: {
        servers: { p: { host: 'h', user: 'u', password: '' } },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty server.host (`host` requires min 1)', () => {
    const result = storageSchema.safeParse({
      servers: { p: { host: '', user: 'u', password: '' } },
    })
    expect(result.success).toBe(false)
  })
})
