# 0010. Adopt `db0` for SQL non-Postgres backends; preserve `usePostgres` for Postgres

* Status: accepted
* Date: 2026-05-27
* Deciders: [TheoKit team]
* Tags: [architecture, storage, sql, sqlite, libsql, turso, mysql, d1, edge-runtime, unjs]

## Context and Problem Statement

`StorageManager` (ADR-0007) ships `usePostgres(dbName, factory)` for Postgres — TheoCloud's primary database. But TheoKit users targeting non-Postgres SQL today have no first-class path:

- **libSQL / Turso** (edge-deployed SQLite-compatible) — increasingly popular for edge AI agent apps
- **Cloudflare D1** — required for Cloudflare Workers deployment
- **MySQL / PlanetScale** — common existing infrastructure
- **SQLite (better-sqlite3 / bun:sqlite)** — embedded apps, dev environments
- **In-memory SQLite** — fast deterministic tests

Forcing users to wrap each driver manually via `StorageManager.useStorage<T>(...)` works but lacks a unified `Database` API that abstracts over the connector — exactly the gap `db0` (UnJS lib) fills.

We considered three paths:

1. **Replace `usePostgres` with a generic `useDatabase('postgres', ...)`.** Breaking change; loses direct `pg.Pool` API access (Drizzle/raw SQL users care). TheoCloud target degrades.
2. **Ship a TheoKit-native multi-SQL driver layer.** Reinventing `db0`'s wheel; ~150 LOC + 6 connectors to maintain.
3. **Adopt `db0` as the path for non-Postgres SQL; preserve `usePostgres` as the Postgres-specific shortcut.** Two APIs coexist; decision tree clear.

Nitro uses `db0` directly (`src/runtime/internal/database.ts:1-17` imports `createDatabase` from `db0`). `db0` connectors today: `pg` (Postgres), `postgres.js`, `better-sqlite3`, `bun:sqlite`, `mysql2`, `libsql` (Turso), `cloudflare-d1`.

## Decision Drivers

- **TheoCloud target is Postgres** — `usePostgres` returning `PoolLike` directly is optimal for that case
- **Edge runtimes need libSQL/D1** — Workers + Vercel Edge can't use `pg`
- **CLAUDE.md Principle 9** — `db0` exists, well-maintained; don't reinvent
- **CLAUDE.md R0.6.1 + R0.6.2** — pluggable storage interfaces benefit from the same delegation strategy as KV (ADR-0009 D2)
- **Optional peer-dep model (ADR-0007 D2)** — keeps base lean

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Replace `usePostgres` with `useDatabase('postgres', ...)` | Breaking change; loses `pg.Pool` direct API (Drizzle integration matters); TheoCloud degraded |
| Build TheoKit-native multi-SQL driver layer | Reinventing `db0`; ~150 LOC + 6 connectors to own forever |
| Ignore non-Postgres SQL — keep TheoKit Postgres-only | Edge runtimes (Workers/D1, Vercel Edge/libSQL) blocked; framework positioned as Node-only |
| Wrap `pg` ourselves to fit a uniform `Database` interface | Duplicates `db0`'s `pg` connector; same maintenance trap as path 2 |

## Decision

### D3 — Delegate non-Postgres SQL to `db0`; keep `usePostgres` for Postgres

Ship `useDatabase(name, connector)` as a helper returning `db0`'s `Database` instance. `usePostgres(dbName, factory)` continues unchanged.

**Decision tree:**

| Backend | Use this |
|---|---|
| **PostgreSQL** (TheoCloud, Supabase, Neon, RDS) | `usePostgres(dbName, factory)` — returns `PoolLike` (raw `pg.Pool`) |
| **libSQL / Turso** | `useDatabase(name, libsqlConnector({ url, authToken }))` |
| **Cloudflare D1** | `useDatabase(name, d1Connector({ binding: env.DB }))` |
| **MySQL / PlanetScale** | `useDatabase(name, mysqlConnector({...}))` |
| **SQLite (file / `:memory:`)** | `useDatabase(name, sqliteConnector({ name: ':memory:' }))` |
| **Bun runtime SQLite** | `useDatabase(name, bunSqliteConnector({...}))` |

```ts
import { useDatabase } from 'theokit/server'
import sqlite from 'db0/connectors/better-sqlite3'

const db = await useDatabase('main', sqlite({ name: 'app.db' }))
const rows = await db.sql`SELECT id, name FROM users WHERE active = ${true}`
```

- **Rationale:** Nitro proves the pattern. `db0` connectors cover every SQL backend TheoKit users plausibly need. `usePostgres` preserved because direct `pg.Pool` access is what Drizzle/raw-SQL users want for the Postgres case.
- **Consequences:**
  - ✅ Edge runtimes get first-class SQL (libSQL/D1)
  - ✅ TheoCloud Postgres path unchanged (BC)
  - ✅ Test parity (`:memory:` SQLite in CI mirrors `libsql` in prod)
  - ⚠️ Two APIs coexist — docs must clarify decision tree (covered in concept doc T5.1)
  - ⚠️ db0 doesn't auto-close connections — user calls `register({ name, dispose })` manually (EC-9 documented)

### Peer-dep model (same shape as ADR-0009)

```json
{
  "peerDependencies": { "db0": "^0.3.0" },
  "peerDependenciesMeta": { "db0": { "optional": true } }
}
```

`useDatabase` lazy-imports `db0`; throws actionable error if not installed.

### Runtime guard for un-invoked connector factory (EC-5)

Connectors in `db0` are factories: `sqlite({...})` returns a `Connector`. Common mistake: passing the factory (`sqlite`) instead of invoking it (`sqlite({...})`). `useDatabase` uses a runtime heuristic (`typeof connector === 'function' && connector.length > 0`) to throw an actionable error: *"Did you forget to call the factory? Pass `sqlite({...})` not `sqlite`."*

## Consequences

### Positive

- **Edge SQL parity** — libSQL/D1 first-class
- **Test ergonomics** — `:memory:` SQLite via `db0/connectors/better-sqlite3` for deterministic tests
- **Zero connector maintenance** — bugs go upstream to `db0`
- **TheoCloud unaffected** — `usePostgres` unchanged

### Negative

- **Two SQL APIs** — `usePostgres` (Postgres) vs `useDatabase` (rest). Docs must explain when to pick which (decision tree above).
- **Native module dependency for SQLite** — `better-sqlite3` requires native build; documented in concept doc §6 (EC-10).
- **No auto-dispose** — db0 connector close semantics vary; user registers manually (EC-9 documented).

### Neutral

- **`db0` is younger than `unstorage`** (~0.3.x vs 1.10.x) — API may evolve; peer-dep range constraints this.
- **Both `unstorage` (KV) and `db0` (SQL) are UnJS** — ecosystem cohesion; same release cadence/quality.

## Related ADRs

- [ADR-0007](./0007-storage-manager-singleton.md) — `StorageManager` (consumer of `useDatabase`)
- [ADR-0008](./0008-theoplugin-is-the-canonical-sdk.md) — `TheoPlugin` separate from storage helpers
- [ADR-0009](./0009-unstorage-adoption-for-kv.md) — companion: KV drivers via `unstorage`

## References

- `db0` — https://db0.unjs.io (UnJS — same org as Nitro/Nuxt/H3)
- Nitro `src/runtime/internal/database.ts:1-17` — `import { createDatabase } from 'db0'`
- Nitro `src/runtime/virtual/database.ts:1-9` — connector factory pattern
- 6+ connectors — https://db0.unjs.io/connectors
- Plan: [`docs/plans/storage-modules-sdk-delegation-plan.md`](../plans/storage-modules-sdk-delegation-plan.md)
