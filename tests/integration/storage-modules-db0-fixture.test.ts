/**
 * Integration test for `tests/fixtures/storage-modules-db0-libsql/`.
 *
 * Uses `better-sqlite3` :memory: connector as the deterministic stand-in for
 * libSQL/Turso. Same API; production swaps the connector.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import { getDb } from '../fixtures/storage-modules-db0-libsql/server/lib/db.js'

beforeEach(() => {
  __resetSingletonForTests()
})

describe('T4.2 — storage-modules-db0-libsql fixture', () => {
  it('boots with useDatabase + sqlite connector (happy path)', async () => {
    const db = await getDb()
    expect(db).toBeDefined()
    expect(typeof db.sql).toBe('function')
  })

  it('CREATE TABLE + INSERT + SELECT lifecycle (happy path)', async () => {
    const db = await getDb('lifecycle')
    await db.sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER DEFAULT 1)`
    await db.sql`INSERT INTO users (name) VALUES (${'alice'})`
    await db.sql`INSERT INTO users (name) VALUES (${'bob'})`
    const result = (await db.sql`SELECT id, name FROM users ORDER BY id`) as {
      rows: { id: number; name: string }[]
    }
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]?.name).toBe('alice')
    expect(result.rows[1]?.name).toBe('bob')
  })

  it('concurrent reads complete (edge case: concurrency)', async () => {
    const db = await getDb('concurrent')
    await db.sql`CREATE TABLE items (id INTEGER PRIMARY KEY, val TEXT)`
    await db.sql`INSERT INTO items (val) VALUES ('one')`
    const results = await Promise.all([
      db.sql`SELECT val FROM items WHERE id = 1`,
      db.sql`SELECT val FROM items WHERE id = 1`,
      db.sql`SELECT val FROM items WHERE id = 1`,
      db.sql`SELECT val FROM items WHERE id = 1`,
      db.sql`SELECT val FROM items WHERE id = 1`,
    ])
    expect(results.length).toBe(5)
    for (const r of results) {
      const typed = r as { rows: { val: string }[] }
      expect(typed.rows[0]?.val).toBe('one')
    }
  })

  it('invalid SQL throws (validation error)', async () => {
    const db = await getDb('invalid-sql')
    await expect(db.sql`SELECT * FROM nonexistent_table`).rejects.toThrow()
  })

  it('manual dispose hook registered + drains via manager.dispose() (lifecycle)', async () => {
    const m = getStorageManager()
    await getDb('drain-test')
    // EC-9 path — db doesn't auto-register, fixture registered manually
    await expect(m.dispose()).resolves.toBeUndefined()
  })

  it('cache hit on second getDb() call with same name', async () => {
    const a = await getDb('cached')
    const b = await getDb('cached')
    expect(a).toBe(b)
  })
})
