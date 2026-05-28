import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// pg-mem is an in-memory Postgres for tests — avoids docker/testcontainers.
// Real-Postgres CI tests can extend this fixture with a connection string.
import { DataType, newDb, type IBackup, type IMemoryDb } from 'pg-mem'

import {
  PostgresJobBackend,
  type PoolLike as ProdPoolLike,
} from '../../packages/theo/src/server/jobs/job-backend-postgres.js'

// Test pool shape matches the production interface (generic query<R>).
type PoolLike = ProdPoolLike & { end?: () => Promise<void> }

let db: IMemoryDb
let backup: IBackup
let pool: PoolLike
let backend: PostgresJobBackend

beforeEach(async () => {
  // noAstCoverageCheck: pg-mem treats unknown AST nodes (PRIMARY KEY,
  // FOR UPDATE SKIP LOCKED) as fatal by default. We don't need those
  // features executed correctly in pg-mem — the real-Postgres CI run
  // verifies SKIP LOCKED behavior. For unit tests, suppressing the
  // strict check lets us exercise the SQL shape end-to-end.
  db = newDb({ noAstCoverageCheck: true } as never)
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.text,
    implementation: () =>
      `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 14)}`,
  })
  const adapters = db.adapters.createPg() as { Pool: new () => PoolLike }
  pool = new adapters.Pool()
  backend = new PostgresJobBackend({ pool })
  await backend.migrate()
  backup = db.backup()
})

afterEach(() => {
  backup.restore()
})

describe('PostgresJobBackend (T3.1)', () => {
  it('enqueue inserts a row', async () => {
    const { jobId } = await backend.enqueue({ name: 'test', input: { a: 1 } })
    expect(typeof jobId).toBe('string')

    const r = await pool.query('SELECT * FROM theokit_jobs WHERE id = $1', [jobId])
    expect(r.rows.length).toBe(1)
  })

  it('dequeue marks lease as locked', async () => {
    await backend.enqueue({ name: 'test', input: {} })
    const leases = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    expect(leases.length).toBe(1)
    expect(leases[0].lockExpiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  // pg-mem does not fully implement SKIP LOCKED — it ignores the directive
  // and lets concurrent SELECTs see the same row before either commits.
  // Real Postgres serializes properly. Here we verify the SEQUENTIAL
  // contract: after one dequeue locks a row, the next dequeue sees it
  // as locked and skips it. Real concurrent safety is covered by the
  // CI integration test against a live Postgres (deferred per ADR-0002 / T3.1).
  it('sequential dequeue respects locked_until (real Postgres adds SKIP LOCKED safety)', async () => {
    await backend.enqueue({ name: 'test', input: {} })
    const a = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    const b = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    expect(a.length).toBe(1)
    expect(b.length).toBe(0)
  })

  it('idempotency UNIQUE index dedups same (name, key)', async () => {
    const first = await backend.enqueue({
      name: 'test',
      input: {},
      idempotencyKey: 'unique-1',
    })
    const dup = await backend.enqueue({
      name: 'test',
      input: {},
      idempotencyKey: 'unique-1',
    })
    expect(dup.jobId).toBe(first.jobId)
  })

  it('ack removes the row', async () => {
    const { jobId } = await backend.enqueue({ name: 'test', input: {} })
    await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    await backend.ack(jobId)
    const r = await pool.query('SELECT * FROM theokit_jobs WHERE id = $1', [jobId])
    expect(r.rows.length).toBe(0)
  })

  it('nack with nonRetryable deletes the row', async () => {
    const { jobId } = await backend.enqueue({ name: 'test', input: {} })
    await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    await backend.nack(jobId, { error: 'fatal', nonRetryable: true })
    const r = await pool.query('SELECT * FROM theokit_jobs WHERE id = $1', [jobId])
    expect(r.rows.length).toBe(0)
  })

  it('nack without nonRetryable releases lock (re-dequeueable)', async () => {
    const { jobId } = await backend.enqueue({
      name: 'test',
      input: {},
      maxAttempts: 3,
    })
    await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    await backend.nack(jobId, { error: 'transient' })

    const r = await pool.query<{ locked_until: unknown }>(
      'SELECT locked_until FROM theokit_jobs WHERE id = $1',
      [jobId],
    )
    expect((r.rows[0] as { locked_until: unknown }).locked_until).toBeNull()
  })

  it('backend.name === "postgres"', () => {
    expect(backend.name).toBe('postgres')
  })

  it('migrate() is idempotent (safe to call repeatedly)', async () => {
    await backend.migrate()
    await backend.migrate()
    // Schema still works
    const r = await pool.query('SELECT COUNT(*) as c FROM theokit_jobs')
    expect(r.rows.length).toBe(1)
  })
})

describe('PostgresJobBackend missing pg (T3.1)', () => {
  it('throws actionable error when pool is undefined', () => {
    expect(() => new PostgresJobBackend({ pool: undefined as never })).toThrow(/pg/i)
  })
})
