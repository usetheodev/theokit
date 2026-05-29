# Reference: Pluggable Storage for Managed Postgres + Redis (TheoCloud target)

**Date:** 2026-05-26
**Depth:** exhaustive
**Frameworks analyzed:** Encore (TS + Go runtimes), Nitro (db0 + unstorage), Rails (ActiveRecord + ActiveJob), Fastify (plugin pattern), Juno (IC stable structures), Next.js (turbo-tasks KV backing)
**TheoKit package affected:** `packages/theo/src/server/{jobs,cost,rate-limit,agent}/` + new `packages/theo/src/server/storage/`
**Related references:** [`jobs-primitives.md`](./jobs-primitives.md), [`caching-and-revalidation.md`](./caching-and-revalidation.md), [`webhook-signing.md`](./webhook-signing.md)

---

## 1. Problem statement

- **What:** TheoKit has four pluggable storage interfaces already shipped — `ConversationStorageLike` (SDK), `JobBackend` (ADR-0002), `UsageStorageAdapter` (R0.5.11), `RateLimitStorageAdapter` (security-hardening). What's missing is a **unified architectural pattern** so TheoCloud (the principal deploy target — managed Postgres + Redis cluster + audit log + secret rotation in Go) can slot in as a single backend without coupling the framework to a single provider. The framework also needs: connection pool lifecycle, graceful shutdown, multi-tenancy isolation, dev/prod parity (local memory → staging real PG → prod managed cloud), and a configuration surface that doesn't leak credentials into source.
- **Current state:** four ADAPTER INTERFACES exist independently with consistent shapes (`record()` for stats, get/set patterns for storage). No central **Storage Manager** that owns lifecycle. No graceful-drain on SIGTERM coordinated across all adapters. No "server config vs database config" separation. Each adapter is wired piecemeal in chat.ts / job-runner / api-middleware.
- **Why now:** TheoCloud milestone is next after 0.4.0. Without the unified pattern, each new TheoCloud-side feature (managed Redis cache, audit log persistence, secret rotation) requires a one-off integration. The four existing interfaces are a foundation; this doc designs the **fifth piece** — the lifecycle/manager that ties them together.

---

## 2. Inventário completo de arquivos

### Encore — inventário (Go runtime is the gold standard)

| File | Category | LOC | Read in full? | Anchored in |
|------|----------|----:|:------------:|-------------|
| `runtimes/go/storage/sqldb/manager_internal.go` | core | 134 | ✅ | §3.1 (Manager pattern), §4 (convergent), §7 (DCL algorithm) |
| `runtimes/go/storage/sqldb/sqldb.go` | core | 270 | ✅ | §3.1 (Tx/Rows/Row API surface) |
| `runtimes/go/storage/cache/manager_internal.go` | core | 187 | ✅ | §3.1 (Redis client lifecycle), §5 (test-mode miniredis) |
| `runtimes/go/storage/cache/cache.go` | core | 200+ | seletivo | §3.1 (ClusterConfig + EvictionPolicy enum) |
| `runtimes/go/storage/sqldb/stdlib.go` | support | — | seletivo | §3.1 (database/sql interop) |
| `runtimes/go/storage/sqldb/test_db.go` | support | — | seletivo | §6 (NewTestDatabase pattern) |
| `runtimes/go/storage/sqldb/errors.go` | support | — | seletivo | §3.1 (ErrNoRows alias) |
| `runtimes/go/storage/sqldb/pgx_tracer_internal.go` | support | — | seletivo | §3.1 (request tracing hook) |
| `runtimes/go/storage/sqldb/zzz_singleton_internal.go` | support | — | seletivo | §3.1 (singleton package-level Manager) |
| `runtimes/go/et/sqldb.go` | support | 11 | ✅ | §6 (NewTestDatabase test seam) |
| `runtimes/go/et/pubsub.go` | support | 25 | ✅ | §6 (test seam) |
| `docs/ts/primitives/databases.md` | doc | — | ✅ | §3.1 (TS API: `new SQLDatabase(name, {migrations})`), §4 |
| `docs/ts/primitives/pubsub.md` | doc | — | seletivo | §3.1 (Topic + Subscription API) |
| `docs/ts/runtime/storage-sqldb.mdx` | doc | — | ✅ | §3.1 (Connection class API) |
| `docs/ts/runtime/storage-cache.mdx` | doc | — | ✅ | §3.1 (CacheCluster + KeyspaceConfig API) |
| `docs/go/primitives/databases.md` | doc | — | ✅ | §3.1 (Go-side same shape) |
| `docs/go/primitives/database-troubleshooting.md` | doc | — | seletivo | §8 (edge cases) |
| `cli/daemon/redis/redis.go` | core | — | seletivo | §3.1 (daemon Redis bootstrap) |
| `v2/app/validate_databases.go` | core | — | seletivo | §3.1 (parser validates db decl) |
| `v2/app/validate_pubsub.go` | core | — | seletivo | §3.1 (parser validates pubsub decl) |

### Nitro — inventário (unstorage + db0)

| File | Category | LOC | Read in full? | Anchored in |
|------|----------|----:|:------------:|-------------|
| `src/runtime/internal/database.ts` | core | 17 | ✅ | §3.2 (`useDatabase(name)` cached singleton), §4, §7 |
| `src/runtime/internal/storage.ts` | core | 8 | ✅ | §3.2 (`useStorage()` from unstorage) |
| `src/runtime/database.ts` | support | 1 | ✅ | §3.2 (barrel re-export) |
| `src/runtime/storage.ts` | support | 1 | ✅ | §3.2 (barrel re-export) |
| `src/runtime/virtual/database.ts` | core | 9 | ✅ | §3.2 (connector factory pattern) |
| `src/runtime/virtual/storage.ts` | core | — | seletivo | §3.2 (virtual module shape) |
| `src/config/resolvers/database.ts` | core | 28 | ✅ | §3.2 (config resolver — defaults + dev override) |
| `src/config/resolvers/storage.ts` | core | 5 | ✅ | §3.2 (config resolver) |
| `docs/1.docs/50.database.md` | doc | — | ✅ | §3.2 (full database API: `useDatabase`, `db.sql`, `db.exec`, `db.prepare`) |
| `docs/1.docs/8.storage.md` | doc | — | seletivo | §3.2 (unstorage layer) |
| `docs/4.examples/database.md` | doc | — | seletivo | §3.2 (PG connection example) |

### Rails — inventário (ActiveJob queue_adapter is the gold standard for "swappable backends")

| File | Category | LOC | Read in full? | Anchored in |
|------|----------|----:|:------------:|-------------|
| `activejob/lib/active_job/queue_adapter.rb` | core | 78 | ✅ | §3.3 (class_attribute + lookup by symbol/name) |
| `activejob/lib/active_job/queue_adapters.rb` | core | 136 | ✅ | §3.3 (adapter feature matrix doc), §4 (convergent: lookup by name) |
| `activejob/lib/active_job/queue_adapters/abstract_adapter.rb` | core | 24 | ✅ | §3.3 (AbstractAdapter contract: enqueue + enqueue_at + stopping?) |
| `activejob/lib/active_job/queue_adapters/inline_adapter.rb` | support | — | seletivo | §3.3 (synchronous default) |
| `activejob/lib/active_job/queue_adapters/async_adapter.rb` | support | — | seletivo | §3.3 (in-process thread pool default) |
| `activejob/lib/active_job/queue_adapters/resque_adapter.rb` | support | — | seletivo | §3.3 (Resque integration pattern) |
| `activejob/lib/active_job/queue_adapters/delayed_job_adapter.rb` | support | — | seletivo | §3.3 (DJ pattern) |
| `activejob/lib/active_job/queue_adapters/queue_classic_adapter.rb` | support | — | seletivo | §3.3 (PG-based queue) |
| `activerecord/lib/active_record/connection_adapters.rb` | core | — | seletivo | §3.3 (DB connection adapter) |
| `activerecord/lib/active_record/database_configurations.rb` | core | — | seletivo | §3.3 (config per env: dev/test/prod) |
| `guides/source/active_record_multiple_databases.md` | doc | — | seletivo | §3.3 (multi-DB pattern) |

### Fastify — inventário (plugin/decoration pattern)

| File | Category | LOC | Read in full? | Anchored in |
|------|----------|----:|:------------:|-------------|
| `docs/Guides/Database.md` | doc | — | ✅ | §3.4 (`fastify.register(plugin, opts)` → `fastify.<name>`) |

### Juno — inventário (IC stable-structures = different paradigm but informative)

| File | Category | LOC | Read in full? | Anchored in |
|------|----------|----:|:------------:|-------------|
| `src/libs/satellite/src/sdk/core/storage.rs` | core | 7 | ✅ | §3.5 (barrel re-export of asset store funcs) |
| `src/libs/satellite/src/assets/storage/impls.rs` | core | 40 | ✅ | §3.5 (Storable trait — bytes serialization) |
| `src/libs/satellite/src/assets/storage/strategy_impls.rs` | support | — | seletivo | §3.5 (strategy pattern for storage operations) |
| `src/libs/satellite/src/sdk/core/db.rs` | core | — | seletivo | §3.5 (datastore is separate from asset storage) |

### Next.js — inventário (turbo-tasks backing storage)

| File | Category | LOC | Read in full? | Anchored in |
|------|----------|----:|:------------:|-------------|
| `turbopack/crates/turbo-tasks-backend/src/backing_storage.rs` | core | — | seletivo | §3.6 (trait BackingStorage for KV) |
| `turbopack/crates/turbo-tasks-backend/src/kv_backing_storage.rs` | core | — | seletivo | §3.6 (KV-based implementation) |
| `turbopack/crates/turbo-tasks-backend/src/database/key_value_database.rs` | core | — | seletivo | §3.6 (KV database trait) |

### Arquivos avaliados e descartados (com motivo)

| File | Why discarded |
|------|---------------|
| `referencias/encore/runtimes/go/storage/cache/{basic,list,set,struct}.go` | Typed-key keyspace APIs (BasicKeyspace, ListKeyspace, etc.) — useful but TheoKit doesn't need typed-key abstractions; we operate at the adapter level only. |
| `referencias/encore/miniredis/*` | Encore's Rust port of miniredis — useful for Encore's local test env but TheoKit can use any in-memory Redis mock (we already have one in `tests/fixtures/conversation-redis/in-memory-redis.ts`). |
| `referencias/encore/cli/daemon/*` | CLI daemon code — Encore's local dev orchestration. Not applicable to TheoKit (Vite handles dev). |
| `referencias/encore/v2/app/validate_*.go` | Parser-level validation of resource declarations. Encore-specific (parses Go AST for `new SQLDatabase(...)` calls). TheoKit uses runtime config, not AST parsing. |
| `referencias/juno/src/frontend/**/*.svelte` | Juno dashboard UI components. Off-topic. |
| `referencias/juno/src/sputnik/**/*.rs` | Juno's sputnik (V8 isolate) for user-defined hooks. Different problem space. |
| `referencias/next.js/turbopack/crates/turbopack-node/src/pool_stats.rs` | Turbopack worker pool stats — internal build-time concern. |
| `referencias/next.js/examples/with-fingerprintjs-pro/providers/LocalStorageCache.tsx` | Example app, not framework code. |
| `referencias/next.js/examples/blog-with-comment/lib/redis.ts` | Example app, not framework code. |
| `referencias/next.js/packages/next/src/server/app-render/*-async-storage.external.ts` | `AsyncLocalStorage` (Node primitive) for request context — orthogonal to storage backend abstraction. |
| `referencias/next.js/docs/.../adapters/*` | Next.js "adapters" docs refer to deploy-target adapters (Vercel/CF), not storage adapters. Confusing name overlap; not applicable. |
| `referencias/rails/activestorage/**` | ActiveStorage = file uploads (S3/GCS). Different domain than DB/KV adapters. |

---

## 3. Prior art — deep dive por framework

### 3.1 Encore — version 1.x (Go runtime canonical)

#### API pública (TS surface)

```ts
// referencias/encore/docs/ts/primitives/databases.md:30-46
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("todo", {
  migrations: "./migrations",
});

// Tagged-template SQL with auto-parameterization
const { rows } = await db.query`SELECT * FROM todos WHERE id = ${id}`
await db.exec`DELETE FROM todos WHERE id = ${id}`
const row = await db.queryRow`SELECT * FROM todos WHERE id = ${id}` // single row or null
const all = await db.queryAll`SELECT * FROM todos`  // array
```

```ts
// referencias/encore/docs/ts/runtime/storage-cache.mdx:6-32
import { CacheCluster } from "encore.dev/storage/cache";

const myCache = new CacheCluster("my-cache", {
  evictionPolicy: "allkeys-lru",
});

// Reference existing cluster (vs creating new)
const existing = CacheCluster.named("my-cache");
```

#### Algoritmo interno (Go side)

1. **Resource declaration is top-level** (`runtimes/go/storage/sqldb/manager_internal.go:51-77`). The parser collects every `new SQLDatabase(...)` call at build time; runtime config map (`runtime.SQLDatabases`) is generated.
2. **Manager** owns a `map[string]*Database` cache with `sync.RWMutex`. `GetDB(dbName)` does double-checked locking (`manager_internal.go:51-77`).
3. **Pool creation** (`manager_internal.go:81-109`): looks up the database by `EncoreName`, finds the matching `SQLServers[ServerID]` (server config separate from database config), builds a `pgx` config with TLS + CA cert + client cert, attaches a tracer hook (`pgxTracer`) and an `AfterConnect` callback for hook list, then `pgxpool.NewWithConfig(ctx, cfg)`.
4. **Shutdown** (`manager_internal.go:111-130`): waits for both `ServicesShutdownCompleted` AND `OutstandingTasks` channels; then closes all pools in parallel via `sync.WaitGroup`.
5. **Cache cluster** (`runtimes/go/storage/cache/manager_internal.go:107-141`) mirrors the same shape — Redis `Options` built from `RedisServers[ServerID]` + `RedisDatabases[name]`, TLS optional via `EnableTLS || ServerCACert != "" || ClientCert != ""`.
6. **Test mode** (`runtimes/go/storage/cache/manager_internal.go:143-173`): `newMiniredisClient()` lazily boots a miniredis instance via `sync.Once`. In long-lived test processes, a `miniredisCleanup` goroutine sweeps every 15s.
7. **NewTestDatabase** (`runtimes/go/et/sqldb.go`): each test gets a clean DB clone — used as a test seam to isolate tests.

#### Estado mantido

- `Manager.dbs map[string]*Database` (`manager_internal.go:25`) — cache per-name with DCL.
- `Manager.mu sync.RWMutex` (`manager_internal.go:24`) — protects dbs map.
- Cache `Manager.clients map[string]*redis.Client` (`manager_internal.go`) — same pattern.
- `initTestSrv sync.Once` for miniredis singleton init.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|-----|--------|----------|----------------------|
| `github.com/jackc/pgx/v5` | v5.x | PostgreSQL driver with native pool | Não (Go-side). TS-side equivalent: `pg` (node-postgres) — already in TheoKit |
| `github.com/jackc/pgx/v5/pgxpool` | v5.x | Pool over pgx | TS equivalent: `pg` Pool — already in TheoKit |
| `github.com/go-redis/redis/v8` | v8.x | Redis client | TS equivalent: `ioredis` — must adopt (3M+ weekly DLs) |
| `github.com/rs/zerolog` | v1.x | Structured logging | TS equivalent: `pino` (we have `createLogger`) |

#### Side effects observáveis

- `pgxpool.NewWithConfig` opens connections lazily (first use).
- `AfterConnect` hook runs user-defined callbacks on every new pool connection (`manager_internal.go:100-102`).
- Shutdown waits for both services AND outstanding tasks (`manager_internal.go:113-114`) — no premature pool close.
- Miniredis spawns a background goroutine for cleanup in dev (`manager_internal.go:151`).

#### TODOs / FIXMEs / HACKs literais

> No literal FIXMEs in the inspected files. Encore's storage layer is mature.

#### Padrão de design

- Pattern: **Manager + DCL + Singleton (per-process)** for `Manager` instance, then **Map<name, Instance>** with config-driven lookup. Strategy split: `Server` (connection config — host/credentials/TLS) and `Database` (logical instance — server_id + db_name + pool sizing). Test seam via `NewTestDatabase`.

---

### 3.2 Nitro — version 3.x (`db0` unstorage)

#### API pública

```ts
// referencias/nitro/docs/1.docs/50.database.md:38-58
import { defineHandler } from "nitro";
import { useDatabase } from "nitro/database";

export default defineHandler(async () => {
  const db = useDatabase();              // default connection
  // or: useDatabase("users")            // named connection
  await db.sql`CREATE TABLE ...`         // tagged template (parameterized)
  await db.exec("raw SQL")               // raw string
  const stmt = db.prepare("SELECT ...")  // prepared statement
})
```

```ts
// referencias/nitro/docs/1.docs/50.database.md:128-150
// nitro.config.ts
export default defineConfig({
  database: {
    default: {
      connector: "sqlite",
      options: { name: "db" }
    },
    users: {
      connector: "postgresql",
      options: { url: "postgresql://..." }
    },
  },
  devDatabase: {
    // dev-mode override — sqlite locally, real PG in prod
    default: { connector: "sqlite", options: { name: "dev-db" } }
  }
});
```

#### Algoritmo interno

1. **Connector factory pattern** (`src/runtime/virtual/database.ts:4-9`): `connectionConfigs[name] = { connector: (options) => Connector, options }`. The connector function is a thin wrapper around the chosen DB driver (sqlite/pg/mysql2/d1/etc.).
2. **Lazy singleton cache** (`src/runtime/internal/database.ts:5-17`): `instances: Record<string, Database>` lookup first; on miss, call `createDatabase(connector(options))` from `db0` lib and cache.
3. **Throws if not configured** (`src/runtime/internal/database.ts:11-13`): explicit error rather than silent fallback.
4. **Build-time virtual module** (`src/runtime/virtual/database.ts`): the virtual `#nitro/virtual/database` is generated from config by the build pipeline, materializing `connectionConfigs` from user-provided values + dev-mode overrides.
5. **Config resolver** (`src/config/resolvers/database.ts:3-28`): if `experimental.database` is enabled, registers auto-import for `useDatabase`. In dev with no user config: defaults to `{default: {connector: "sqlite", options: {cwd}}}`. In Node prod with no user config: same SQLite default.

#### Estado mantido

- `instances` module-level Record (`src/runtime/internal/database.ts:5`) — singleton cache.
- `connectionConfigs` virtual-module Record (`src/runtime/virtual/database.ts:4-9`).

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|-----|--------|----------|----------------------|
| `db0` | unjs/db0 latest | Unified DB abstraction for 14+ drivers (sqlite/postgresql/mysql2/d1/libsql/pglite/planetscale/...) | **Avaliar** — adds a layer over raw `pg`/`ioredis` but matches our adapter pattern philosophy |
| `unstorage` | unjs latest | Unified KV abstraction (memory/fs/redis/cloudflare-kv/upstash/...) | **Avaliar** — strong fit for `RateLimitStorageAdapter` and `UsageStorageAdapter` |

#### Side effects observáveis

- `connectionConfigs` is set at module evaluation by the virtual import — depends on bundler producing the right output.
- `createDatabase()` may eagerly open a connection (driver-dependent).

#### TODOs / FIXMEs / HACKs literais

> No literal FIXMEs in the inspected files. Nitro's storage layer is small and well-factored.

#### Padrão de design

- Pattern: **Connector factory + lazy singleton cache** (Nitro). The `connector(options) → Connector` shape decouples driver choice from API surface. Combined with **dev-mode override** (`devDatabase`) for transparent local→prod switching.

---

### 3.3 Rails — version 8.x (ActiveRecord + ActiveJob)

#### API pública

```ruby
# referencias/rails/activejob/lib/active_job/queue_adapter.rb:34-44
# Lookup by symbol/string
ActiveJob.queue_adapter = :async        # uses AsyncAdapter
ActiveJob.queue_adapter = :inline       # uses InlineAdapter
ActiveJob.queue_adapter = :resque       # uses ResqueAdapter
# Or assign instance directly:
ActiveJob.queue_adapter = MyCustomAdapter.new
```

```ruby
# referencias/rails/activejob/lib/active_job/queue_adapters/abstract_adapter.rb:9-23
class AbstractAdapter
  attr_accessor :stopping
  def enqueue(job);     raise NotImplementedError; end
  def enqueue_at(job, timestamp); raise NotImplementedError; end
  def stopping?; !!@stopping; end
end
```

#### Algoritmo interno

1. **Lookup by name** (`queue_adapters.rb:131-133`): `lookup(:async) → const_get("AsyncAdapter")` — string-based dynamic dispatch.
2. **Adapter assignment** (`queue_adapter.rb:49-63`) accepts either a Symbol/String (lookup + instantiate) or a duck-typed instance (must respond to `enqueue` + `enqueue_at`).
3. **Duck typing check** (`queue_adapter.rb:73-75`): `QUEUE_ADAPTER_METHODS = [:enqueue, :enqueue_at]; meth.all? { |m| object.respond_to?(m) }` — any object with those two methods qualifies.
4. **Class attribute** (`queue_adapter.rb:24-25`): `class_attribute :_queue_adapter` — per-class override (different ActiveJob subclasses can use different adapters).
5. **Adapter loaded lazily** (`queue_adapters.rb:113-121`): `autoload` — adapter classes load only when first referenced. Decoupled from boot time.

#### Estado mantido

- `_queue_adapter` class_attribute per ActiveJob subclass.
- Adapter instances are typically singletons (1 per app), but the framework doesn't enforce.

#### Dependências externas usadas

Rails adapters are integration points — each adapter lib (`resque`, `delayed_job`, `que`, `sneakers`, `backburner`) is its own gem. Rails core only ships `:async` + `:inline` + `:test`.

| Lib | Versão | Para quê | TheoKit pode adotar? |
|-----|--------|----------|----------------------|
| (none in core) | — | Rails delegates to third-party adapter gems | TheoKit equivalent: keep core in-memory + Postgres adapters in-tree; ship Redis/SQS as community `@theokit/jobs-*` packages |

#### Side effects observáveis

- Adapter `lookup()` (`queue_adapters.rb:131-133`) calls `const_get` — autoload triggers `require`.
- `check_adapter` (`queue_adapter.rb:53`) is called on every assignment — adapter can refuse to start if config is invalid.

#### Padrão de design

- Pattern: **Symbol-based lookup + AbstractAdapter NotImplementedError + duck typing fallback**. Per-class overrides via `class_attribute`. Lazy autoload of adapter implementations.

---

### 3.4 Fastify — plugin/decoration pattern

#### API pública

```js
// referencias/fastify/docs/Guides/Database.md
const fastify = require('fastify')()
fastify.register(require('@fastify/postgres'), {
  connectionString: 'postgres://...'
})

// After register: fastify.pg is decorated
fastify.get('/user/:id', (req, reply) => {
  fastify.pg.query('SELECT ...', [req.params.id], cb)
})
```

#### Algoritmo interno

1. **Plugin function signature**: `(fastify, options, done) => { fastify.decorate('pg', client); done() }`. Each plugin owns the lifecycle of one resource.
2. **Decoration adds top-level property** to the `fastify` instance — `fastify.pg`, `fastify.redis`, `fastify.mysql`, etc.
3. **Encapsulation**: plugins are scoped to the current Fastify instance — `fastify.register(...)` creates a child scope by default. Override via `fastify-plugin` package for global scope.

#### Padrão de design

- Pattern: **Decoration + Encapsulation**. Each adapter is a separate plugin, attached to the framework instance. Simple but tight coupling between adapter and framework instance.

---

### 3.5 Juno — IC stable structures (Rust + datastore + asset storage)

#### API pública

```rust
// referencias/juno/src/libs/satellite/src/sdk/core/storage.rs:1-7
pub use crate::assets::storage::store::{
    count_assets_store, get_asset_store, list_assets_store,
    set_asset_token_store, delete_asset_store, delete_assets_store,
};
```

#### Algoritmo interno

1. **`Storable` trait** (`impls.rs:9-23`): every storage value implements `Storable` with `to_bytes()`, `into_bytes()`, `from_bytes()`, and `BOUND: Bound = Bound::Unbounded`. The IC runtime calls these for persistence.
2. **Two storage types**: `Datastore` (logical KV — like Firestore) and `AssetStorage` (binary blobs — like S3). Separate but use same trait.
3. **Strategy implementations** (`strategy_impls.rs`): operations are split into strategy traits with multiple impls per environment (e.g., `MockStrategy` for tests).

#### Padrão de design

- Pattern: **Trait-based serialization (`Storable`) + strategy-pattern impls**. Rust-specific but the strategy-impls pattern translates: define an interface, ship multiple impls, swap via DI.

---

### 3.6 Next.js — turbo-tasks backing storage (Rust internal)

#### API pública

```rust
// referencias/next.js/turbopack/crates/turbo-tasks-backend/src/backing_storage.rs
pub trait BackingStorage: 'static + Send + Sync {
    fn read_data(&self, ...) -> Result<Vec<u8>>;
    fn write_data(&self, ...) -> Result<()>;
    // ...
}
```

#### Algoritmo interno

1. **`BackingStorage` trait** — abstract KV interface.
2. **`KvBackingStorage`** — concrete impl over a `KeyValueDatabase` trait.
3. **Multiple `KeyValueDatabase` impls**: in-memory, on-disk (`lmdb`-based), in-process.

#### Padrão de design

- Pattern: **Trait-based KV abstraction + concrete impls per environment**. Same shape as Juno — Rust traits as DI surface.

---

## 4. Convergent patterns (todos concordam)

1. **Lazy singleton cache by name** — adopted by:
   - Encore (`manager_internal.go:51-77` — DCL with `map[string]*Database`)
   - Nitro (`internal/database.ts:5-17` — `instances: Record<string, Database>`)
   - Both Rails ActiveRecord connections + ActiveJob adapters (per-class `_queue_adapter`)
   
   **Funciona porque** instance creation is expensive (TCP handshake, TLS, pool init); cache amortizes across requests. **TheoKit deve adotar.**

2. **Server config separate from database/instance config** — Encore (`SQLServers[ServerID]` + `SQLDatabases[name]`). 
   
   **Funciona porque** the SAME Postgres server hosts MULTIPLE logical databases (e.g., `theo_conversations` + `theo_jobs` + `theo_usage` all on one managed instance). Reusing the server config (credentials, TLS, CA cert) across N databases cuts secret duplication.
   
   **TheoKit deve adotar:** `theo.config.ts > storage: { servers: {...}, databases: {...} }`.

3. **Strategy pattern for adapter implementations** — Encore (Manager → Database), Rails (AbstractAdapter → ResqueAdapter), Nitro (connector → Connector), Juno (strategy_impls), Next.js (BackingStorage trait).
   
   **Funciona porque** the interface defines the contract; implementations vary by deploy target. **TheoKit já adotou** (ConversationStorageLike, JobBackend, etc.).

4. **Graceful shutdown waits for in-flight requests** — Encore (`manager_internal.go:113-114` — `<-p.ServicesShutdownCompleted.Done()` AND `<-p.OutstandingTasks.Done()` BEFORE closing pools).
   
   **Funciona porque** killing pool while requests are mid-query → SQL errors. Wait first, then close.
   
   **TheoKit deve adotar:** SIGTERM handler in `start.ts` already calls `Agent.registry.evictAll()`; extend to call `storage.dispose()` on every storage adapter via a central registry.

5. **Test mode swap to in-process backend** — Encore (miniredis singleton), Rails (`:test` adapter + ActiveRecord test pool), Nitro (sqlite default in dev). All frameworks ship at least ONE in-memory/in-process adapter for tests.
   
   **Funciona porque** test isolation > test fidelity for unit tests. Integration tests get a real backend via env-gated config.
   
   **TheoKit já adotou:** `InMemoryConversationStorage`, `InMemoryJobBackend`, `InMemoryUsageStorage`, `InMemoryRedis` mock.

6. **Connector factory pattern (function returning client)** — Nitro `connector(options) → Connector`, Encore `dbConf(srv, db) → pgxpool.Config → pool`.
   
   **Funciona porque** decouples "what kind of backend" from "what connection params" — easy to swap drivers without changing config shape.

---

## 5. Divergent patterns (trade-off real)

1. **Lookup mechanism: symbol vs instance**
   - Rails: `queue_adapter = :async` — symbol lookup via `const_get`. Trade-off: dynamic, scriptable, but typo-prone (no compile check).
   - Encore: `new SQLDatabase("name", config)` at top-level. Trade-off: compile-time visible (parser knows about it), but requires AST parsing.
   - Nitro: `useDatabase("name")` — string-keyed map. Trade-off: ergonomic, but typo gives runtime error.
   - **TheoKit choice:** `useStorage('conversations')` / `useStorage('jobs')` — string-keyed map with typed string-literal union to give autocomplete + compile-time safety. Match Nitro's ergonomics; avoid Encore's parser complexity; avoid Rails' symbol typo trap.

2. **Where lifecycle lives**
   - Encore: dedicated `Manager` class per resource type (sqldb.Manager, cache.Manager, pubsub.Manager). Trade-off: clear ownership but proliferation.
   - Nitro: module-level `instances` Map per resource. Trade-off: simple but no central drain hook.
   - Fastify: each plugin owns its own lifecycle, hooked into fastify's onClose. Trade-off: decentralized but consistent.
   - **TheoKit choice:** ONE central `StorageManager` per process owning all adapters (mirrors Encore but unified across resource types). Drain hook: `SIGTERM → storage.dispose()` calls each adapter's `dispose()` in parallel.

3. **Config source: typed object vs DSL vs env**
   - Encore: `new SQLDatabase("name", {migrations})` — declarative in code, parser collects at build.
   - Nitro: `defineConfig({database: {default: {connector, options}}})` — typed config object.
   - Rails: `config/database.yml` per environment + ENV var interpolation.
   - **TheoKit choice:** Nitro's pattern. `theo.config.ts > storage: { ... }` typed config + env-driven values (`process.env.DATABASE_URL`) interpolated by the user. No YAML, no AST parsing.

4. **Multi-tenant isolation**
   - Encore: each service has its own DB scope (`mgr.GetCurrentDB()` reads `req.Service()`).
   - Rails: `connected_to(role: :writing, shard: :default)` — manual.
   - Nitro: NOT addressed.
   - **TheoKit choice:** TheoCloud handles multi-tenancy at the platform level (pod-per-tenant or namespace isolation). Framework stays single-tenant. If a tenant-id is needed in storage queries, it's the consumer's responsibility — exposed via `ctx.user` or similar.

5. **Secret rotation**
   - Encore: `srv.Password` read at pool init — rotation requires pool restart.
   - Rails: same — pool restart needed.
   - Nitro: same — config is static after boot.
   - **TheoKit choice:** Pool restart on SIGHUP (Unix convention). TheoCloud's secret rotation cronjob signals SIGHUP → framework reloads `theo.config.ts` → rebuilds pools with new credentials. Documented as 0.6.0 R0.6.7 work.

---

## 6. Dependency inventory — bibliotecas comuns

Convergent libs (aparecem em 2+ frameworks):

| Lib | Frameworks que usam | Função | TheoKit decision |
|-----|---------------------|--------|------------------|
| `pg` (node-postgres) | TheoKit já adota, Fastify (`@fastify/postgres`), Next.js (`@vercel/postgres` wraps) | Node PostgreSQL driver with built-in pool | **Manter** — already in deps |
| `ioredis` | Fastify (`@fastify/redis`), TanStack (some integrations) | Node Redis client | **Adotar** for RateLimitStorageAdapter Redis recipe |
| `db0` (UnJS) | Nitro | Unified DB abstraction over `pg`/`mysql2`/`sqlite`/`d1`/`libsql` | **Avaliar** — adds 1 lib, gets 14 connectors free. Trade-off: thin layer, but adoption signal is Nuxt+Nitro ecosystem (large) |
| `unstorage` (UnJS) | Nitro, Nuxt | Unified KV (memory/fs/redis/cloudflare-kv/upstash/dynamodb/...) | **Avaliar** — same trade-off. Could replace our `RateLimitStorageAdapter` interface entirely (just use unstorage's `Storage` type directly) |
| `pgxpool` (Go) | Encore | PG pool with native pgx | Not applicable (Go-side) |
| `go-redis/redis` | Encore | Redis client | Not applicable (Go-side) |
| `miniredis` (Go) / `ioredis-mock` (Node) | Encore (Go), TheoKit (`InMemoryRedis` hand-rolled) | In-process Redis for tests | **Avaliar** `ioredis-mock` (3M+ DLs) — replace hand-rolled mock OR keep hand-rolled for zero deps |

**Recommendation:** stay with explicit `pg` + `ioredis` for the in-tree recipes (lower abstraction surface, more direct control). Document `db0`/`unstorage` as alternative adapter implementations users can adopt in their own recipes.

---

## 7. Algorithms / data structures não-óbvios

- **Double-checked locking for adapter cache** (Encore `manager_internal.go:51-77`). The standard Go pattern: `RLock → check map → RUnlock → if miss, Lock → check again → create → Unlock`. **Complexity:** O(1) hit, O(1) miss + driver init cost. Avoids both the slow "always-write-lock" and the wrong "first-read-no-lock" patterns. **Adopt in TheoKit's StorageManager.**

- **Lazy module-level singleton (`instances: Record<string, Database>`)** (Nitro `internal/database.ts:5`). Single-threaded JS — no locking needed. Module evaluation happens once. **Already convergent with TheoKit's approach.**

- **Server-vs-database config separation** (Encore `runtime.SQLServers` + `runtime.SQLDatabases`). A `Server` carries `host/user/password/TLS/ca_cert/client_cert`. A `Database` carries `server_id + database_name + pool_min + pool_max`. **N databases share 1 server config.** Reduces secret duplication; matches managed Postgres deployment patterns (one cluster, many logical DBs).

- **Adapter feature matrix table** (Rails `queue_adapters.rb:23-34`). Rails docs a feature matrix (Async / Queues / Delayed / Priorities / Timeout / Retries) per adapter. This is the canonical "interface comparison" pattern — TheoKit should ship a similar table in `docs/concepts/storage-adapters.md` (future).

---

## 8. Edge cases conhecidos (com fonte)

| Edge case | Como manifesta | Onde foi corrigido | Como devemos prevenir |
|-----------|----------------|---------------------|------------------------|
| Pool exhaustion under sustained load | Queries hang forever waiting for free conn | Encore `pgxpool` has `MaxConns` default 10 + `pool.AcquireTimeout` | Always set `connectionTimeoutMillis` + `max` in PostgresConversationStorage `Pool` config. Documented in recipe. |
| Concurrent insert race when inserting same key | UPSERT path can lose data with read-modify-write | Encore uses atomic `INSERT ... ON CONFLICT` (`docs/go/primitives/database-troubleshooting.md`) | TheoKit's `PostgresConversationStorage.appendMessage` already uses `||` JSONB concat — atomic. EC-11 (pg-mem fallback) documented. |
| TLS misconfiguration silently fails | Connection works without TLS where it shouldn't | Encore checks `srv.EnableTLS || srv.ServerCACert != "" || srv.ClientCert != ""` (`manager_internal.go:122`) | Document in recipe: `ssl: { rejectUnauthorized: true }` MUST be set for production. Add a test that asserts TLS-on in production config. |
| Shutdown drops in-flight queries | Connection cancelled mid-query → partial state | Encore waits for `OutstandingTasks.Done()` before closing pool (`manager_internal.go:113-114`) | Implement central `StorageManager.dispose()` that waits for in-flight requests THEN drains pools. SIGTERM hook in `start.ts` already does the wait pattern for `Agent.registry.evictAll()` — extend. |
| Redis client doesn't have graceful shutdown | `redis.Client.Close()` is instant | Encore documents this — just waits for user code first (`manager_internal.go:176-178`) | Same pattern: drain user code first, then close Redis. Don't expect graceful Redis-side. |
| Test pollution between test files | Shared Manager state leaks | Encore: `NewTestDatabase(ctx, name)` clones a fresh DB per test (`runtimes/go/et/sqldb.go`) | Use `beforeEach` to create fresh adapter instances + reset module-scoped state (already done in `__resetSdkForTests` pattern). |
| Connector throws on first use (lazy) | User sees error during request, not boot | Nitro throws explicit error if connection name not configured (`internal/database.ts:11-13`) | Lazy storage = lazy error. Mitigation: `theokit check` command pings every configured backend at startup (separate doc + plan). |
| Secret rotation requires restart | Old creds in pool → auth errors during rotation | Not solved by Encore/Nitro/Rails universally | Document SIGHUP-triggered reload (mentioned §5 #5). TheoCloud rotation cronjob sends SIGHUP. Doc + recipe in 0.6.0. |

---

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
┌──────────────────────────────────────────────────────────────────────┐
│                       theo.config.ts (typed)                         │
│  storage: {                                                          │
│    servers: { primary: { host, user, password, tls } },              │
│    databases: { conversations: { server: 'primary', db: 'theo_conv'},│
│                jobs: { server: 'primary', db: 'theo_jobs' } },       │
│    redis: { default: { host, port, tls } }                           │
│  }                                                                   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ loadConfig() at boot
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      StorageManager (NEW)                            │
│  - dbs: Map<string, PoolLike>     (cached pools by db name)          │
│  - redis: Map<string, RedisLike>  (cached clients by server name)    │
│  - mu: Mutex                       (DCL for thread safety)           │
│  - configure(config: StorageConfig)                                  │
│  - usePostgres(dbName): Pool                                         │
│  - useRedis(serverName): Redis                                       │
│  - register(adapter: { dispose(): Promise<void> })  ← new            │
│  - dispose(): Promise<void>       (drain + close all)                │
└─────────┬────────────────────────────────────────────────────────────┘
          │ injected into adapter factories
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ConversationStorageLike    JobBackend    UsageStorage    RateLimit  │
│       │                        │              │              │       │
│       ▼                        ▼              ▼              ▼       │
│  - InMemory  (dev)         InMemory       InMemory      InMemory     │
│  - Postgres  (prod)        Postgres       Postgres      Redis        │
│  - Redis     (recipe)      (SDK ships)    (R0.6.7)      (recipe)     │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.2 Files to create

```
packages/theo/src/server/storage/storage-manager.ts          — NEW: central manager
packages/theo/src/server/storage/storage-types.ts            — NEW: StorageConfig + StorageAdapter base types
packages/theo/src/server/storage/configure-storage-once.ts   — NEW: race-safe lazy boot (mirrors configure-agent-registry pattern)
packages/theo/src/server/storage/index.ts                    — NEW: barrel
packages/theo/src/config/schema.ts                           — EDIT: add `storage` Zod schema
packages/theo/src/cli/commands/start.ts                      — EDIT: SIGTERM → storageManager.dispose() alongside Agent.registry.evictAll()
docs/concepts/storage-manager.md                              — NEW: concept doc

tests/unit/storage-manager.test.ts                            — NEW: TDD
tests/unit/config-storage-schema.test.ts                      — NEW: Zod schema validation
tests/integration/storage-manager-lifecycle.test.ts           — NEW: boot + dispose + drain
tests/integration/storage-manager-multi-adapter.test.ts       — NEW: multiple adapters under one manager
```

### 9.3 Public API surface (TypeScript)

```ts
// packages/theo/src/server/storage/storage-types.ts

export interface ServerConfig {
  host: string
  port?: number
  user: string
  password: string
  tls?: TlsConfig
}

export interface TlsConfig {
  rejectUnauthorized?: boolean
  caCert?: string
  clientCert?: string
  clientKey?: string
}

export interface PostgresDatabaseConfig {
  server: string  // references ServerConfig key
  database: string
  pool?: {
    min?: number
    max?: number
    connectionTimeoutMillis?: number
    idleTimeoutMillis?: number
  }
}

export interface RedisServerConfig extends ServerConfig {
  db?: number
  maxRetriesPerRequest?: number
}

export interface StorageConfig {
  servers?: Record<string, ServerConfig>
  databases?: Record<string, PostgresDatabaseConfig>
  redis?: Record<string, RedisServerConfig>
}

/**
 * Adapter lifecycle — register with the manager to participate in graceful
 * shutdown. The manager calls `dispose()` in parallel on SIGTERM.
 */
export interface StorageAdapter {
  readonly name: string
  dispose(): Promise<void>
}
```

```ts
// packages/theo/src/server/storage/storage-manager.ts

import type { PoolLike } from '../jobs/job-backend-postgres.js' // already exists
import type { StorageConfig, StorageAdapter } from './storage-types.js'

interface RedisLike {
  // structural — duck-types ioredis or test mock
  quit(): Promise<unknown>
  disconnect(): void
}

export class StorageManager {
  #config: StorageConfig | undefined
  #dbPools = new Map<string, PoolLike>()
  #redisClients = new Map<string, RedisLike>()
  #adapters = new Set<StorageAdapter>()
  #disposed = false

  configure(config: StorageConfig): void {
    if (this.#config !== undefined) {
      console.warn('[theokit] StorageManager already configured; ignoring')
      return
    }
    this.#config = config
  }

  /**
   * Returns a Postgres pool for the named database. Creates lazily via the
   * user-provided factory (we don't hard-import `pg` to avoid forcing the
   * dep on apps that don't use Postgres at all).
   */
  usePostgres(
    dbName: string,
    factory: (server: ServerConfig, db: PostgresDatabaseConfig) => PoolLike,
  ): PoolLike {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    const cached = this.#dbPools.get(dbName)
    if (cached !== undefined) return cached
    const dbConfig = this.#config?.databases?.[dbName]
    if (dbConfig === undefined) throw new Error(`Database "${dbName}" not configured`)
    const server = this.#config?.servers?.[dbConfig.server]
    if (server === undefined) {
      throw new Error(
        `Server "${dbConfig.server}" referenced by database "${dbName}" not found`,
      )
    }
    const pool = factory(server, dbConfig)
    this.#dbPools.set(dbName, pool)
    return pool
  }

  useRedis(
    serverName: string,
    factory: (config: RedisServerConfig) => RedisLike,
  ): RedisLike {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    const cached = this.#redisClients.get(serverName)
    if (cached !== undefined) return cached
    const serverConfig = this.#config?.redis?.[serverName]
    if (serverConfig === undefined) {
      throw new Error(`Redis server "${serverName}" not configured`)
    }
    const client = factory(serverConfig)
    this.#redisClients.set(serverName, client)
    return client
  }

  /** Register an adapter for graceful shutdown coordination. */
  register(adapter: StorageAdapter): void {
    this.#adapters.add(adapter)
  }

  /**
   * Drain in parallel:
   *   1. Call dispose() on every registered adapter
   *   2. Close all PG pools
   *   3. Close all Redis clients
   *
   * Errors in individual adapters are logged but do NOT block shutdown.
   */
  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    const adapterDrains = Array.from(this.#adapters).map((a) =>
      a.dispose().catch((err) => {
        console.warn(`[theokit] adapter ${a.name} dispose failed: ${err}`)
      }),
    )
    await Promise.all(adapterDrains)

    const poolCloses = Array.from(this.#dbPools.values()).map((pool) => {
      // Duck-type: `pg.Pool` has `end()`. Wrap to swallow errors.
      const p = pool as { end?: () => Promise<void> }
      return p.end !== undefined
        ? p.end().catch((err: unknown) => {
            console.warn(`[theokit] PG pool close failed: ${err instanceof Error ? err.message : String(err)}`)
          })
        : Promise.resolve()
    })
    await Promise.all(poolCloses)

    const redisCloses = Array.from(this.#redisClients.values()).map((c) =>
      c.quit().catch((err: unknown) => {
        console.warn(`[theokit] Redis close failed: ${err instanceof Error ? err.message : String(err)}`)
        c.disconnect()
      }),
    )
    await Promise.all(redisCloses)

    this.#dbPools.clear()
    this.#redisClients.clear()
    this.#adapters.clear()
  }

  /** @internal — testing reset */
  __resetForTests(): void {
    this.#config = undefined
    this.#dbPools.clear()
    this.#redisClients.clear()
    this.#adapters.clear()
    this.#disposed = false
  }
}

// Singleton — one StorageManager per process (mirrors Encore's pkg-level singleton)
let __singleton: StorageManager | undefined
export function getStorageManager(): StorageManager {
  if (__singleton === undefined) __singleton = new StorageManager()
  return __singleton
}
```

### 9.4 Dependências a adotar

| Package | Version | Justification |
|---------|---------|---------------|
| `pg` | `^8.21.0` (already devDep) | PostgreSQL driver for `usePostgres()` factory — already in TheoKit |
| `ioredis` | `^5.4.0` | Node Redis client for `useRedis()` factory. 3M+ weekly DLs. Add to peer deps (optional). |
| (none new for core) | — | StorageManager is pure TS; only consumers (PostgresConversationStorage, RedisRateLimit) need driver deps |

### 9.5 Test strategy

- **Unit** `tests/unit/storage-manager.test.ts` — 8-10 scenarios:
  - Happy path: configure → usePostgres → cached on second call
  - Validation error: usePostgres for unknown db name → throws
  - Validation error: usePostgres for db whose server isn't configured → throws
  - Edge case: configure() called twice → warn, second config ignored
  - Edge case: usePostgres after dispose → throws
  - Concurrency: 5 parallel usePostgres calls → factory invoked exactly 1x
  - dispose() drains adapters + pools + redis in parallel
  - dispose() is idempotent
  - Adapter dispose throw doesn't block manager shutdown
  - Redis quit() failure falls back to disconnect()

- **Integration** `tests/integration/storage-manager-lifecycle.test.ts`:
  - Configure StorageManager → instantiate PostgresConversationStorage backed by it
  - Send SIGTERM in subprocess → assert dispose() runs + pool closed
  - Static check: start.ts wires storageManager.dispose() alongside Agent.registry.evictAll()

- **Integration** `tests/integration/storage-manager-multi-adapter.test.ts`:
  - Configure with 2 servers, 3 databases sharing pool config
  - Register PostgresConversationStorage + PostgresJobBackend + PostgresUsageStorage
  - All three reuse the same Pool (one per database)
  - dispose() called once → all three drained once

- **Fixture** `tests/fixtures/storage-manager-recipe/` (mini app showing the wire):
  - `theo.config.ts` with full storage config
  - `server/lib/storage.ts` factory functions
  - Smoke test showing typical app boot

### 9.6 Phases of rollout

1. **Phase 1 — StorageManager core + unit tests** (target: green TDD; ~3h)
   - Implement `StorageManager` class
   - Implement `getStorageManager()` singleton
   - Add `StorageConfig` Zod schema to `theo.config.ts > storage`
   - 8-10 unit tests

2. **Phase 2 — Integration with existing adapters** (target: existing adapters routed through manager; ~3h)
   - `PostgresConversationStorage` constructor accepts `(pool: PoolLike)` — manager provides it
   - `PostgresJobBackend` same
   - `InMemoryUsageStorage` adapts to register as StorageAdapter so dispose drains it
   - Update recipes in `tests/fixtures/` to use manager

3. **Phase 3 — start.ts SIGTERM integration** (target: graceful shutdown end-to-end; ~1h)
   - In `start.ts` (after existing `configureAgentRegistryFromConfig` call):
     ```ts
     const manager = getStorageManager()
     if (config.storage !== undefined) manager.configure(config.storage)
     ```
   - In SIGTERM handler (after `Agent.registry.evictAll()`):
     ```ts
     await manager.dispose()
     ```

4. **Phase 4 — Documentation + concept doc** (target: docs/concepts/storage-manager.md; ~2h)
   - Mirror `docs/concepts/conversation-history.md` structure
   - Per-deploy-target matrix (self-hosted vs TheoCloud)
   - Migration guide from per-adapter wiring to StorageManager

### 9.7 Acceptance criteria

- [ ] `getStorageManager()` returns singleton across imports
- [ ] `configure()` only honored once per process; second call warns
- [ ] `usePostgres()` caches pool per db name; concurrent first-call → factory invoked 1x
- [ ] `useRedis()` same caching for redis clients
- [ ] `dispose()` is idempotent + adapter errors don't block
- [ ] `theo.config.ts > storage` Zod schema validates server/database/redis sections
- [ ] `start.ts` wires SIGTERM → `manager.dispose()` after agent eviction
- [ ] PostgresConversationStorage refactored to receive pool from manager
- [ ] PostgresJobBackend refactored same
- [ ] `docs/concepts/storage-manager.md` exists with deploy-target matrix
- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint --max-warnings=0` exit 0
- [ ] `pnpm test` full suite green (≥ 2730 tests)
- [ ] `pnpm exec dependency-cruiser packages/theo/src` 0 violations
- [ ] Fixture project `tests/fixtures/storage-manager-recipe/` proves the wire end-to-end

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|------|:----------:|------------|
| Existing PostgresConversationStorage callers break when constructor changes | medium | Keep BC: accept either `(pool)` OR `(poolFactory)` — typeguards |
| Manager singleton state leaks between tests | medium | Expose `__resetForTests()`; require beforeEach in storage-touching tests |
| Pool drain hangs > K8s grace period | low | dispose() already has 25s force-exit timeout in start.ts pattern (mirror it) |
| User configures Redis without ioredis installed | medium | `useRedis` factory throws actionable error: "ioredis not found; pnpm add ioredis" |
| TLS misconfiguration silently weakens prod | high | Add a `theokit check` cmd that validates production storage config has TLS on (separate plan) |
| Adapter `dispose()` throws and partially closes pool | low | Wrap each in `.catch()`; log + continue (matches Encore pattern) |

---

## 10. Open questions

1. **Should `StorageManager.usePostgres()` accept the driver factory or hard-import `pg`?** Hard-import simplifies user code (no factory boilerplate) but forces `pg` as a peer dep. Factory keeps `pg` optional. **Lean: factory pattern.** Recipe in `tests/fixtures/storage-manager-recipe/` shows the 5-line factory boilerplate. Revisit if user feedback says "too much boilerplate".

2. **Should `StorageConfig` be part of `theo.config.ts` or a separate file?** Encore has resource declarations co-located with code; Rails uses `config/database.yml`. Putting it in `theo.config.ts` matches our existing pattern (cache/jobs/rate-limit all live there). But the schema grows. **Lean: stay in `theo.config.ts` for now; consider extracting to `theo.storage.config.ts` if schema exceeds 100 LOC.**

3. **How does StorageManager interact with `unstorage` if a user wants to use it for their own adapter?** unstorage's `Storage` type is structurally similar to our `RateLimitStorageAdapter`. We could either: (a) ignore — let users wire unstorage themselves; (b) ship an adapter `UnstorageRateLimit` that wraps any unstorage. **Lean: (a) — keep core minimal. Document unstorage as alternative in the concept doc.**

4. **Should `dispose()` cancel in-flight queries or wait for them?** Encore waits (`<-OutstandingTasks.Done()`). But we don't track outstanding tasks framework-wide. Options: (a) trust that platform LB drained the pod (matches EC-13 from Phase 6 plan); (b) implement an outstanding-tasks counter. **Lean: (a) — same trade-off as the existing SIGTERM design.**

5. **Multi-tenancy: should StorageManager support per-tenant connection isolation?** TheoCloud handles this at the platform level (pod-per-tenant). But what if a single pod serves multiple tenants? Need a tenant-id parameter on `usePostgres('conversations', { tenantId })`? **Lean: out of scope for v1 — single-tenant per process; revisit when TheoCloud SaaS multi-tenancy ships.**

6. **Secret rotation via SIGHUP — when?** Documented as "0.6.0 R0.6.7" but not scoped. Should it be in this plan? **Lean: no — separate plan, requires TheoCloud-side coordination (cronjob that signals SIGHUP). Track as open dependency.**

---

## 11. Referências citadas

### Encore

#### Core
- `referencias/encore/runtimes/go/storage/sqldb/manager_internal.go:1-134` — Manager + DCL pattern; §3.1, §4 #1+#2, §7 (DCL algorithm), §8 (shutdown wait pattern)
- `referencias/encore/runtimes/go/storage/sqldb/sqldb.go:1-270` — Tx/Rows/Row API surface; §3.1
- `referencias/encore/runtimes/go/storage/cache/manager_internal.go:1-187` — Redis Manager + miniredis test mode; §3.1, §5
- `referencias/encore/runtimes/go/storage/cache/cache.go:1-200` — ClusterConfig + EvictionPolicy enum; §3.1

#### Support
- `referencias/encore/runtimes/go/storage/sqldb/stdlib.go` — database/sql interop; §3.1
- `referencias/encore/runtimes/go/storage/sqldb/test_db.go` — NewTestDatabase pattern; §6, §8
- `referencias/encore/runtimes/go/storage/sqldb/errors.go` — ErrNoRows alias; §3.1
- `referencias/encore/runtimes/go/storage/sqldb/pgx_tracer_internal.go` — request tracing hook; §3.1
- `referencias/encore/runtimes/go/storage/sqldb/zzz_singleton_internal.go` — singleton; §3.1
- `referencias/encore/runtimes/go/et/sqldb.go:1-11` — NewTestDatabase test seam; §6
- `referencias/encore/runtimes/go/et/pubsub.go:1-25` — test seam; §6

#### Doc
- `referencias/encore/docs/ts/primitives/databases.md` — TS API (`new SQLDatabase`); §3.1, §4
- `referencias/encore/docs/ts/runtime/storage-sqldb.mdx` — Connection class API; §3.1
- `referencias/encore/docs/ts/runtime/storage-cache.mdx` — CacheCluster + KeyspaceConfig; §3.1
- `referencias/encore/docs/go/primitives/databases.md` — Go-side API; §3.1
- `referencias/encore/docs/go/primitives/database-troubleshooting.md` — edge cases; §8

### Nitro

#### Core
- `referencias/nitro/src/runtime/internal/database.ts:1-17` — `useDatabase(name)` cached singleton; §3.2, §4 #1, §7
- `referencias/nitro/src/runtime/internal/storage.ts:1-8` — `useStorage()` from unstorage; §3.2
- `referencias/nitro/src/runtime/virtual/database.ts:1-9` — connector factory pattern; §3.2
- `referencias/nitro/src/config/resolvers/database.ts:1-28` — config resolver + dev override; §3.2
- `referencias/nitro/src/config/resolvers/storage.ts:1-5` — storage config resolver; §3.2

#### Support
- `referencias/nitro/src/runtime/database.ts:1` — barrel re-export; §3.2
- `referencias/nitro/src/runtime/storage.ts:1` — barrel re-export; §3.2

#### Doc
- `referencias/nitro/docs/1.docs/50.database.md` — full database API; §3.2, §4
- `referencias/nitro/docs/1.docs/8.storage.md` — unstorage layer; §3.2
- `referencias/nitro/docs/4.examples/database.md` — PG example; §3.2
- `referencias/nitro/AGENTS.md` — design rules (unstorage adoption); §3.2 (referenced)

### Rails

#### Core
- `referencias/rails/activejob/lib/active_job/queue_adapter.rb:1-78` — class_attribute + lookup; §3.3
- `referencias/rails/activejob/lib/active_job/queue_adapters.rb:1-136` — adapter feature matrix; §3.3, §4
- `referencias/rails/activejob/lib/active_job/queue_adapters/abstract_adapter.rb:1-24` — AbstractAdapter contract; §3.3

#### Support
- `referencias/rails/activejob/lib/active_job/queue_adapters/{inline,async,resque,delayed_job,queue_classic,sneakers,backburner}_adapter.rb` — adapter impl patterns; §3.3
- `referencias/rails/activerecord/lib/active_record/connection_adapters.rb` — DB connection adapter; §3.3
- `referencias/rails/activerecord/lib/active_record/database_configurations.rb` — env-based config; §3.3

#### Doc
- `referencias/rails/guides/source/active_record_multiple_databases.md` — multi-DB; §3.3

### Fastify

#### Doc
- `referencias/fastify/docs/Guides/Database.md` — plugin/decoration; §3.4, §5 (Lifecycle divergence)

### Juno

#### Core
- `referencias/juno/src/libs/satellite/src/sdk/core/storage.rs:1-7` — barrel re-export; §3.5
- `referencias/juno/src/libs/satellite/src/assets/storage/impls.rs:1-40` — Storable trait; §3.5

#### Support
- `referencias/juno/src/libs/satellite/src/assets/storage/strategy_impls.rs` — strategy pattern; §3.5
- `referencias/juno/src/libs/satellite/src/sdk/core/db.rs` — datastore vs assets; §3.5

### Next.js

#### Core
- `referencias/next.js/turbopack/crates/turbo-tasks-backend/src/backing_storage.rs` — BackingStorage trait; §3.6
- `referencias/next.js/turbopack/crates/turbo-tasks-backend/src/kv_backing_storage.rs` — KV impl; §3.6
- `referencias/next.js/turbopack/crates/turbo-tasks-backend/src/database/key_value_database.rs` — KV database trait; §3.6

### URLs externas

- https://db0.unjs.io — unjs/db0 unified DB abstraction documentation; §6 (`db0` library evaluation)
- https://unstorage.unjs.io — unjs/unstorage KV abstraction; §6 (`unstorage` library evaluation)
- https://github.com/jackc/pgx — Go pgx PostgreSQL driver (canonical for Encore); §3.1
- https://github.com/redis/ioredis — Node Redis client recommended for TheoKit; §6
- https://encore.dev/docs/ts/primitives/databases — Encore TS database docs (live); §3.1
- https://api.rubyonrails.org/classes/ActiveJob/QueueAdapters.html — Rails QueueAdapters API docs (live); §3.3
