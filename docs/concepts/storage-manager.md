# Storage Manager

> **Status:** stable since 0.5.0
> **ADR:** [ADR-0007 — StorageManager singleton](../adr/0007-storage-manager-singleton.md)
> **Reference:** [pluggable-storage-managed-pg-redis.md](../../.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md)

TheoKit's `StorageManager` is the **per-process lifecycle owner** for pluggable storage adapters — Postgres pools, Redis clients, and any custom `StorageAdapter` that wants to participate in graceful shutdown. It is the bridge between `theo.config.ts > storage` and the four storage interfaces shipped today (`ConversationStorageLike`, `JobBackend`, `UsageStorageAdapter`, `RateLimitStorageAdapter`).

## 1. What & Why

Before the manager, every adapter was wired piecemeal — apps owned their own `pg.Pool`, no two apps drained the same way, and SIGTERM only evicted agents (leaking pools). The manager:

- **Caches pools per database name** so adapters share connections.
- **Separates server credentials from database config** (Encore pattern) — define the host/user/password once per server, reference it by name from each database.
- **Drains on SIGTERM** — `start.ts` calls `manager.dispose()` after `Agent.registry.evictAll()`, so pools close in order.
- **Keeps drivers optional** — TheoKit core never imports `pg` or `ioredis`. You provide a factory function; the manager calls it the first time a database is needed.

## 2. API Surface

```ts
import { getStorageManager } from 'theokit/server'

const manager = getStorageManager() // singleton per process

manager.configure(config.storage)               // once per process
const pool = manager.usePostgres('conv', factory) // cached on first call
const redis = manager.useRedis('cache', factory) // cached on first call
manager.register(myAdapter)                      // opt-in to drain
await manager.dispose()                          // idempotent, parallel drain
```

| Method | Purpose | Behavior |
|---|---|---|
| `getStorageManager()` | Get the process singleton | Same instance across imports |
| `configure(config)` | Apply `theo.config.ts > storage` | First call honored; second warns + ignored (D3) |
| `usePostgres(dbName, factory)` | Resolve a Postgres pool | Factory invoked once per `dbName` |
| `useRedis(serverName, factory)` | Resolve a Redis client | Same caching |
| `register(adapter)` | Opt-in to graceful shutdown | Throws if manager is disposed (EC-4) |
| `dispose()` | Drain everything | Idempotent; adapters → pools → Redis in parallel |

## 3. Config schema

Declare storage in `theo.config.ts`:

```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  storage: {
    servers: {
      primary: {
        host: process.env.PG_HOST,
        port: 5432,
        user: 'theo',
        password: process.env.PG_PASSWORD,
      },
    },
    databases: {
      conversations: { server: 'primary', database: 'theo_conv' },
      jobs: { server: 'primary', database: 'theo_jobs' },
    },
    redis: {
      cache: {
        host: process.env.REDIS_HOST,
        port: 6379,
        user: 'default',
        password: process.env.REDIS_PASSWORD,
      },
    },
  },
})
```

The Zod schema (`packages/theo/src/config/schema.ts`) validates structure; cross-field validation (does `databases.X.server` resolve?) happens at first `usePostgres()` call so the error appears next to the calling code, not at boot.

## 4. Deploy-target matrix

| Target | `servers` | `databases` | `redis` | `dispose()` lifecycle |
|---|---|---|---|---|
| **Node self-host** | manual (env vars) | manual | manual | `start.ts` SIGTERM trap |
| **TheoCloud** | provided by platform | provided | provided | `manager.dispose()` in `start.ts` |
| **Vercel** | per-region (Postgres serverless / Neon / Supabase) | per-region | per-region or Upstash | per-invocation (no SIGTERM) |
| **Cloudflare Workers** | use Hyperdrive / D1 instead | D1 | Cloudflare KV | no SIGTERM (worker lifecycle) |
| **K8s self-host** | K8s Secret refs | K8s Secret refs | K8s Secret refs | SIGTERM + preStop hook |

## 5. Cookbook

### 5.1 — `PostgresJobBackend` via the manager

```ts
import { PostgresJobBackend, getStorageManager } from 'theokit/server'
import { Pool } from 'pg'

const manager = getStorageManager()
const backend = PostgresJobBackend.fromStorageManager(
  manager,
  'jobs',
  (server, db) => new Pool({
    host: server.host, port: server.port,
    user: server.user, password: server.password,
    database: db.database,
    min: db.pool?.min ?? 1, max: db.pool?.max ?? 10,
  }),
)
```

### 5.2 — `PostgresConversationStorage` via the manager

Same pattern: build the pool through `manager.usePostgres('conversations', factory)`, then pass it to your storage adapter's constructor.

### 5.3 — `InMemoryUsageStorage` registered for drain

```ts
import { InMemoryUsageStorage, getStorageManager } from 'theokit/server'

const usage = new InMemoryUsageStorage()
getStorageManager().register(usage) // drained on SIGTERM
```

In-memory adapters have no real cleanup to do, but registering makes the lifecycle explicit — the next person reading your boot code sees exactly what runs at shutdown.

### 5.4 — `useStorage<T>` for any custom client (MongoDB, DynamoDB, Mongo, …)

For databases / clients not covered by `usePostgres`/`useRedis`/`useUnstorage`/`useDatabase`, use the generic primitive:

```ts
import { getStorageManager } from 'theokit/server'
import { MongoClient } from 'mongodb'

const manager = getStorageManager()
const mongo = manager.useStorage<MongoClient>('mongo-main', () => new MongoClient(process.env.MONGO_URL!))

// Lifecycle: register manually to participate in dispose()
manager.register({
  name: 'mongo:main',
  dispose: () => mongo.close(),
})
```

The factory runs **once** per `name`; subsequent calls return the cached client. See ADR-0007 D4 for the design rationale.

### 5.5 — `useUnstorage` for KV (Redis/S3/Cloudflare KV/Vercel KV/…)

`useUnstorage` delegates to the `unstorage` lib's 20+ drivers — install one, pass it at call site:

```ts
import { useUnstorage } from 'theokit/server'
import redisDriver from 'unstorage/drivers/redis'

const cache = await useUnstorage<string>('cache', redisDriver({ url: process.env.REDIS_URL! }))
await cache.setItem('user:1', JSON.stringify({ name: 'alice' }))
const value = await cache.getItem('user:1')
```

Dispose hook auto-registered. See [ADR-0009](../adr/0009-unstorage-adoption-for-kv.md).

### 5.6 — `useDatabase` for SQL non-Postgres (libSQL/Turso/D1/MySQL/SQLite)

```ts
import { useDatabase } from 'theokit/server'
import libsql from 'db0/connectors/libsql-core'

const db = await useDatabase('main', libsql({ url: process.env.TURSO_URL!, authToken: process.env.TURSO_AUTH! }))
const rows = await db.sql`SELECT id, name FROM users WHERE active = ${true}`
```

For Postgres prefer `usePostgres` (returns `pg.Pool` for direct Drizzle / raw SQL access). See [ADR-0010](../adr/0010-db0-adoption-for-sql-non-postgres.md).

## 6. Edge cases & gotchas

The decisions below are intentional. The reference doc and ADR-0007 cover why; this section is the user-facing summary so you don't hit them blind.

- **`configure-once` (D3)** — second call to `configure()` warns and is ignored. To swap config in tests, call `manager.__resetForTests()`. Vite HMR in dev does NOT automatically reset (see HMR note below).
- **Factory pattern (D2)** — `pg` and `ioredis` are **not** TheoKit dependencies. You install them and pass a factory. The 5 LOC of boilerplate is documented in the [storage-manager-recipe fixture](../../tests/fixtures/storage-manager-recipe/README.md).
- **Drain in parallel (D5)** — `dispose()` does NOT wait for in-flight queries. The platform load balancer is expected to have drained traffic BEFORE SIGTERM arrives. Same trade-off as the existing agent-eviction handler (`packages/theo/src/cli/commands/start.ts:412-415`).
- **[EC-1] Unknown keys silently dropped** — Zod's default mode silently strips unknown keys: `databasees: {...}` (typo) is dropped without error. **Use the exact key names:** `servers`, `databases`, `redis`. Runtime errors are still actionable (`Database "X" not configured`) but appear at first request, not boot.
- **[EC-7] `manager.dispose()` outside SIGTERM has no internal timeout.** In production, `start.ts` wraps the whole shutdown sequence in a 25 s force-exit timer. If you call `manager.dispose()` from custom scripts or tests where you need a bound, wrap it:
  ```ts
  await Promise.race([
    manager.dispose(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('dispose timeout')), 15_000)),
  ])
  ```
- **[EC-8] Vite HMR in dev can duplicate the singleton.** ESM modules re-evaluate on HMR — `let __singleton` is re-declared and old user code holds the prior instance. In dev, prefer in-memory adapters. If you must use PG/Redis in dev, attach to `globalThis`:
  ```ts
  // dev-only escape hatch (Next.js pattern)
  const g = globalThis as { __theoStorageManager?: StorageManager }
  const manager = g.__theoStorageManager ?? (g.__theoStorageManager = getStorageManager())
  ```
- **[EC-9] SIGKILL skips the drain entirely.** Platforms send SIGKILL after `terminationGracePeriodSeconds` (K8s default 30 s) if the process didn't exit. Pools close orphan connections via idle timeout (PG/Redis ~5 min default). If your deploy needs longer-than-30s drain budgets, bump `terminationGracePeriodSeconds` in the manifest.
- **Reserved key prefixes in `useStorage<T>`.** Don't use `__pg:`, `__redis:`, `__unstorage:`, `__db0:` as `name` arguments to `manager.useStorage()` — these prefixes are reserved internally by the typed helpers (`usePostgres`/`useRedis`/`useUnstorage`/`useDatabase`). Use your own prefix (e.g., `myapp:`, `vector:`, `mongo:`) to avoid silent collisions.
- **`useDatabase` does NOT auto-register a dispose hook.** Unlike `useUnstorage`, db0 connectors vary widely in their close semantics — some have `.close()`, others don't. If you need deterministic cleanup (especially for sqlite-on-disk in parallel tests), register manually:
  ```ts
  const db = await useDatabase('main', sqliteConnector({ name: 'app.db' }))
  getStorageManager().register({
    name: 'db:main',
    dispose: async () => { /* connector-specific close */ },
  })
  ```
- **Native modules and architecture support (`better-sqlite3`).** `better-sqlite3` requires prebuilt binaries. If `pnpm install` fails with `node-gyp` errors on Alpine/ARM-custom platforms, install `python3 make g++` OR use `db0/connectors/libsql-core` (pure-JS) OR `bun:sqlite` connector under the Bun runtime. CI on x86_64 Linux/macOS/Win works out of the box.
- **Peer-dep version mismatch (`unstorage`/`db0`).** Peer-deps are declared `^1.10` / `^0.3` respectively. If a user installs a future major (e.g., `unstorage@2.0` hypothetical) pnpm warns but installs — TheoKit does NOT detect mismatches at runtime. UnJS libs historically maintain BC via deprecation paths, but read the upstream CHANGELOG before bumping. The fixture mock-driver test (`tests/integration/storage-modules-unstorage-fixture.test.ts`) pins to the installed `unstorage.Driver` interface and breaks loudly on incompatible bumps.

## 7. Extension model — 3 layers

TheoKit's extension surface has three orthogonal layers. Pick the one that fits the problem:

| Layer | API | When to use |
|---|---|---|
| **1. HTTP request lifecycle** | `TheoPlugin { name, register(app) }` via `definePlugin()` | Adding headers, request decoration, logging, auth context, custom hooks. See [plugins.md](./plugins.md). |
| **2. Domain primitive** | One of: `JobBackend`, `ConversationStorageLike`, `UsageStorageAdapter`, `RateLimitStorageAdapter` | Custom queue / conversation history / cost tracking / rate-limiter backend. Implement the interface, pass to the relevant primitive (`defineJob`, `createConversationHistory`, etc.) |
| **3. Storage helpers** | `useStorage<T>` / `useUnstorage` / `useDatabase` / `usePostgres` / `useRedis` | Caching, sessions, KV, SQL, vector stores. Lifecycle handled by `StorageManager`. |

**Decision tree:**

```
Is the problem about HTTP request handling?
  └─ YES → TheoPlugin (Layer 1)
  └─ NO ──┬─ Is it Job / Conversation / Usage / RateLimit?
          │   └─ YES → Domain primitive (Layer 2)
          │   └─ NO ──┬─ Postgres?       → usePostgres
          │           ├─ Redis?          → useRedis
          │           ├─ KV-ish?         → useUnstorage (Redis/S3/CF KV/...)
          │           ├─ Other SQL?      → useDatabase (libSQL/MySQL/D1/SQLite)
          │           └─ Other client?   → useStorage<T> (Mongo/DynamoDB/...)
```

Cross-link: see [plugins.md](./plugins.md) for Layer 1, [ADR-0007](../adr/0007-storage-manager-singleton.md) for Layer 3 design.

## See also

- [ADR-0007 — StorageManager singleton](../adr/0007-storage-manager-singleton.md) — 7 decisions D1..D7 with rationale.
- [ADR-0002 — JobBackend neutral interface](../adr/0002-job-backend-interface-neutral-contract.md) — predecessor pattern; `StorageManager` extends the same pluggability ethos.
- [Conversation history concept](./conversation-history.md) — how `ConversationStorageLike` plugs in.
- [Jobs concept](./jobs.md) — how `JobBackend` is wired.
- [Cost tracking concept](./cost-tracking.md) — `UsageStorageAdapter` lifecycle.
- [Reference deep-dive (`pluggable-storage-managed-pg-redis.md`)](../../.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md) — 6-framework audit (Encore, Nitro, Rails, Fastify, Juno, Next.js).
