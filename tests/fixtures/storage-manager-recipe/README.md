# Fixture — storage-manager-recipe

End-to-end proof of the `StorageManager` wire (ADR-0007 / T2.2).

## What this shows

A minimal TheoKit app declaring `storage: { servers, databases, redis }` in `theo.config.ts` and wiring the `StorageManager` through pure factory functions (no hard-imported drivers).

## Files

- `theo.config.ts` — full `storage` block with 1 server, 2 databases on it, 1 Redis server.
- `server/lib/storage-factories.ts` — Postgres + Redis factories. Loaded lazily so apps without those drivers don't pay the install cost.
- `server/lib/storage-init.ts` — `initStorage(config)` calls `getStorageManager().configure(config.storage)` once at boot.

## Validation

`tests/integration/storage-manager-fixture.test.ts` boots this fixture against `pg-mem` + an in-memory Redis stub and verifies:
- Pool cached across multiple `usePostgres(dbName)` calls
- Two databases on the same server use separate pools (one per dbName)
- `manager.dispose()` drains all registered adapters

## Why not real PG / Redis in CI

Real instances are gated behind environment variables in `tests/integration/job-backend-postgres-real.test.ts`. The fixture uses pg-mem for determinism.
