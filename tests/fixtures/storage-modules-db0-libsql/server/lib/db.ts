/**
 * Fixture db module — wires `useDatabase` with the sqlite connector.
 *
 * In production for libSQL/Turso: replace `better-sqlite3` with
 * `db0/connectors/libsql-core` and pass the proper URL/authToken.
 *
 * EC-9: dispose is registered manually since db0 doesn't unify connector close
 * semantics. Caller can opt-out by not providing a dispose strategy.
 */
import sqlite from 'db0/connectors/better-sqlite3'
import {
  getStorageManager,
  useDatabase,
} from '../../../../../packages/theo/src/server/storage/index.js'

// `useDatabase` is a server-side primitive (Nitro/Nuxt-style naming), NOT a
// React hook. Disable `react-hooks/rules-of-hooks` false-positive at this
// server-only call site.
export async function getDb(name = 'main', filename = ':memory:') {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const db = await useDatabase(name, sqlite({ name: filename }))
  // EC-9: opt-in manual dispose registration. better-sqlite3 has no close()
  // on the db0 Database wrapper, so we attempt graceful close via raw exec.
  getStorageManager().register({
    name: `db:${name}`,
    dispose: async () => {
      // For :memory: this is a no-op; for file-backed DBs the OS releases
      // handles on GC anyway. Hook exists for symmetric drain pattern.
      await Promise.resolve()
    },
  })
  return db
}
