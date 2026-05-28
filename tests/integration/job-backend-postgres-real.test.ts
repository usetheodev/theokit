import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

import { PostgresJobBackend } from '../../packages/theo/src/server/jobs/job-backend-postgres.js'

const POSTGRES_URL = process.env.POSTGRES_URL

// Dynamic pg import — keeps the test loadable even when pg isn't installed
// at the workspace root (resolved from packages/theo node_modules in CI).
interface PgQueryResult<R> {
  rows: R[]
  rowCount?: number | null
}
interface PgPoolLike {
  // The R generic IS used twice (call-site + return type) — eslint heuristic
  // misclassifies because the return type goes through PgQueryResult<R>.
  query<R>(sql: string, params?: unknown[]): Promise<PgQueryResult<R>>
  end: () => Promise<void>
}

describe.skipIf(!POSTGRES_URL)('PostgresJobBackend — real Postgres CI (T3.1)', () => {
  let pool: PgPoolLike
  let backend: PostgresJobBackend

  beforeAll(async () => {
    const pgModule = (await import(/* @vite-ignore */ 'pg' as string)) as {
      Pool?: unknown
      default?: { Pool?: unknown }
    }
    const PoolCtor = (pgModule.Pool ?? pgModule.default?.Pool) as
      | (new (config: unknown) => PgPoolLike)
      | undefined
    if (!PoolCtor) throw new Error('pg.Pool not found in module export')
    pool = new PoolCtor({
      connectionString: POSTGRES_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
    })
    backend = new PostgresJobBackend({ pool, tableName: 'theokit_jobs_ci' })
    await backend.migrate()
  })

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS theokit_jobs_ci`)
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query(`DELETE FROM theokit_jobs_ci`)
  })

  it('enqueue → row visible in DB', async () => {
    const { jobId } = await backend.enqueue({ name: 'test', input: { a: 1 } })
    const r = await pool.query<{ id: string }>(`SELECT id FROM theokit_jobs_ci WHERE id = $1`, [
      jobId,
    ])
    expect(r.rows.length).toBe(1)
  })

  // KEY test: SKIP LOCKED race-safety. 5 concurrent dequeues against 1 job
  // → exactly 1 lease total (others see locked row and skip via SKIP LOCKED).
  it('concurrent dequeue (5 workers, 1 job) → exactly 1 lease total', async () => {
    await backend.enqueue({ name: 'race-test', input: {} })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => backend.dequeue({ batchSize: 1, lockSeconds: 30 })),
    )
    const totalLeases = results.reduce((sum, leases) => sum + leases.length, 0)
    expect(totalLeases).toBe(1)
  })

  it('idempotency UNIQUE index — same (name, key) returns existing jobId', async () => {
    const a = await backend.enqueue({
      name: 'idem',
      input: {},
      idempotencyKey: 'dedup-1',
    })
    const b = await backend.enqueue({
      name: 'idem',
      input: {},
      idempotencyKey: 'dedup-1',
    })
    expect(b.jobId).toBe(a.jobId)
  })

  it('ack removes the row permanently', async () => {
    const { jobId } = await backend.enqueue({ name: 'ack-test', input: {} })
    await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    await backend.ack(jobId)
    const r = await pool.query<{ id: string }>(`SELECT id FROM theokit_jobs_ci WHERE id = $1`, [
      jobId,
    ])
    expect(r.rows.length).toBe(0)
  })

  it('nack with nonRetryable=true deletes row', async () => {
    const { jobId } = await backend.enqueue({ name: 'nr-test', input: {} })
    await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    await backend.nack(jobId, { error: 'fatal', nonRetryable: true })
    const r = await pool.query<{ id: string }>(`SELECT id FROM theokit_jobs_ci WHERE id = $1`, [
      jobId,
    ])
    expect(r.rows.length).toBe(0)
  })

  it('migrate() is idempotent (safe to re-run on every deploy)', async () => {
    await backend.migrate()
    await backend.migrate()
    const r = await pool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM theokit_jobs_ci`,
    )
    expect(r.rows.length).toBe(1)
  })
})
