# Fixture — storage-modules-db0-libsql

End-to-end proof of `useDatabase(name, connector)` with `better-sqlite3` connector (T4.2, ADR-0010).

## What this shows

A minimal TheoKit app using `useDatabase` with a SQLite `:memory:` connector. The fixture mirrors how production code would use libSQL/Turso/D1 (same API, swap connector).

## Files

- `theo.config.ts` — TheoKit config
- `server/lib/db.ts` — `getDb()` wraps `useDatabase('main', sqlite({...}))`

## Validation

`tests/integration/storage-modules-db0-fixture.test.ts` boots this fixture and verifies:
- Database instance returned
- CREATE TABLE + INSERT + SELECT lifecycle
- Concurrent reads
- Invalid SQL throws
- Manual dispose hook registered + drains via manager.dispose()

## Native module note

`better-sqlite3` requires native binaries. If `pnpm install` fails with `node-gyp` errors on Alpine/ARM, install `python3 make g++` or use the `libsql` connector instead.
