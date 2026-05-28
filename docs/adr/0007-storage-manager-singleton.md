# 0007. `StorageManager` is a per-process singleton with factory-based drivers

* Status: accepted
* Date: 2026-05-26
* Deciders: [TheoKit team]
* Tags: [architecture, storage, lifecycle, postgres, redis, theocloud]

## Context and Problem Statement

TheoKit ships four pluggable storage interfaces today:

- `ConversationStorageLike` (SDK-side) — agent message history
- `JobBackend` (ADR-0002) — async job persistence
- `UsageStorageAdapter` (R0.5.11) — per-user cost/token accounting
- `RateLimitStorageAdapter` (security-hardening) — distributed limiter state

Each is wired piecemeal in the consumer (`chat.ts`, `job-runner`, `api-middleware`). There is **no central lifecycle manager**: connection pools are user-owned, dispose is per-adapter, dev/prod parity is each app's problem, and TheoCloud — the principal deploy target (CLAUDE.md Ecosystem) — has no single config surface to plug in managed Postgres + Redis.

The deep-dive reference (`.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md`) audited six frameworks (Encore Go/TS, Nitro, Rails, Fastify, Juno, Next.js turbo-tasks). Six convergent patterns emerge:

1. **Per-process singleton manager** holding cached pools/clients (Encore `manager_internal.go:21-31`, Nitro `runtime/internal/database.ts:1-17`, Fastify decoration).
2. **Server-vs-database config separation** — credentials defined once per server; databases reference servers by name (Encore `databases.md`, Rails `config/database.yml`).
3. **Factory pattern for drivers** — manager calls a user-provided factory to create pools/clients, never hard-imports the driver (Nitro `virtual/database.ts:1-9`).
4. **Lazy + cached** — first call creates, subsequent calls return cached (Encore DCL, Nitro singleton, Rails connection_pool).
5. **Graceful drain on shutdown** — Encore waits for outstanding tasks; Nitro/Rails close pools at lifecycle hooks.
6. **Test-mode swap** — `NewTestDatabase` / `miniredis` for deterministic tests (Encore `et/sqldb.go`).

## Decision Drivers

- **TheoCloud target**: a single `theo.config.ts > storage` block should configure all four adapters without coupling to a single provider.
- **Driver optionality**: not every TheoKit app uses Postgres or Redis. Hard-importing `pg`/`ioredis` would inflate bundles and force installs on in-memory-only apps.
- **Graceful shutdown coordination**: SIGTERM today only evicts agents (`start.ts:425-446`). Pools leak.
- **DRY**: `PoolLike` interface is duplicated between `server/jobs/job-backend-postgres.ts:30` and `tests/fixtures/conversation-postgres/storage.ts:26`.
- **Single-maintainer constraint**: prefer one composable primitive over four bespoke wirings.

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Per-adapter lifecycle (current) | No coordinated drain; user code re-implements connection management per backend |
| Hard-imported `pg`/`ioredis` peer deps | Forces drivers on apps that never use them; inflates bundle |
| Module-level pool variables (`let pool = ...`) | No reset for tests; can't be swapped per environment |
| Full Inversion-of-Control container | Over-engineering — KISS prevails; framework only needs lifecycle, not dispatch |
| Per-request manager | Pool creation is too expensive to amortize across requests (~50-200 ms TCP+TLS) |

## Decision

Introduce a `StorageManager` class with a process-wide singleton (`getStorageManager()`), driven by `theo.config.ts > storage` (Zod-validated), with the following architectural commitments:

### D1 — Singleton per process, NOT per request

`getStorageManager()` returns one instance per Node.js process. Pools and Redis clients are cached on the instance.

- **Rationale**: pool warming amortizes only across requests; per-request would defeat the purpose. Encore, Nitro, Fastify all use singletons.
- **Consequences**: ✅ Throughput stability. ⚠️ State shared between tests — exposes `__resetForTests()` for isolation. ⚠️ No per-request multi-tenancy (out of scope; TheoCloud handles tenancy at pod level).

### D2 — Factory pattern for drivers (NOT hard-imported)

`usePostgres(dbName, factory)` and `useRedis(serverName, factory)` accept a user-provided factory function. The manager never imports `pg` or `ioredis`.

- **Rationale**: keeps drivers optional. Nitro uses connector factory. Cost: ~5 LOC factory boilerplate at userland, covered by recipe fixture.
- **Consequences**: ✅ Core bundle stays lean. ✅ Drivers opt-in. ⚠️ Small DX cost mitigated via `tests/fixtures/storage-manager-recipe/`.

### D3 — `configure()` honored once per process

The second call to `configure()` emits a warning and is ignored. Reset only via `__resetForTests()`.

- **Rationale**: mirrors `configureAgentRegistryOnce` (`packages/theo/src/server/agent/configure-agent-registry.ts:42-64`). Avoids conflict when user code and framework both call configure.
- **Consequences**: ✅ Predictability. ✅ Framework wins (theo.config.ts authoritative). ⚠️ Vite HMR in dev needs reset (out of this ADR's scope; doc'd as a runtime gotcha).

### D4 — `StorageConfig` lives in `theo.config.ts > storage`

The Zod schema is co-located with `cache`, `agents`, `security` in `packages/theo/src/config/schema.ts`.

- **Rationale**: consistency with existing patterns. Single loader (`loadConfig`). Schema ≤ 80 LOC — fits; revisit if it crosses 100.
- **Consequences**: ✅ One discoverable config surface. ⚠️ `theo.config.ts` grows.

### D5 — `dispose()` drains in PARALLEL; does NOT wait for in-flight queries

`Promise.all` over adapters + pools + Redis clients. In-flight queries are aborted by pool close.

- **Rationale**: the platform load balancer (K8s preStop, Vercel/CF/Render drain) has already removed the pod from rotation BEFORE SIGTERM arrives. Encore's `<-OutstandingTasks.Done()` requires framework-wide task tracking that TheoKit does not have. Same trade-off as the existing SIGTERM design in `start.ts:412-415`.
- **Consequences**: ✅ Shutdown completes inside the 25 s force-exit budget. ⚠️ In-flight queries cancelled (acceptable — LB drained traffic first).

### D6 — `register(adapter)` is opt-in for drain participation

Adapters declaring `{ name: string, dispose(): Promise<void> }` call `manager.register(this)` to be included in `dispose()`.

- **Rationale**: extensibility for in-memory adapters that want to flush state. Errors during each adapter's dispose are swallowed (log + continue), matching Encore.
- **Consequences**: ✅ Extensible. ⚠️ User forgets `register` → adapter is fully functional but does not drain. Documented in concept doc.

### D7 — `PoolLike` extracted to `server/storage/storage-types.ts`

The structural interface that today lives in `server/jobs/job-backend-postgres.ts:30` is moved to `server/storage/storage-types.ts` and re-exported from the jobs file for backward compatibility.

- **Rationale**: DRY — multiple adapters need the same shape. The move is non-breaking via re-export.
- **Consequences**: ✅ Single source of truth. ✅ BC preserved.

## Consequences

### Positive

- **TheoCloud integration is trivial**: one `theo.config.ts > storage` block + factory functions = all four adapters wired.
- **Graceful shutdown is unified**: SIGTERM in `start.ts` drains everything in order (agents → storage → server close).
- **Zero new framework dependencies**: pure TS in core; drivers stay user-owned.
- **Test isolation is explicit**: `__resetForTests()` documents the singleton seam.
- **Pluggable by design**: any user-defined adapter implementing `StorageAdapter` can participate in drain.

### Negative

- **+5 LOC boilerplate** per app to define the factory functions. Mitigated by recipe fixture.
- **Vite HMR singleton duplication** in dev (re-evaluating the module creates a new singleton). Documented as a gotcha; in dev users either use in-memory adapters or attach to `globalThis.__theoStorageManager` (Next.js pattern).
- **No internal `dispose()` timeout** outside the SIGTERM path. Callers wrap in `Promise.race` if they need a bound.

### Neutral

- **Schema cross-field validation** (`databases.X.server` referencing `servers`) is deferred to first `usePostgres()` call rather than Zod `.superRefine` — keeps the schema simple; the error is still actionable.
- **Adapters can have duplicate names** in the registered Set — by design (both still drained); not a bug.

## Related ADRs

- [ADR-0002](./0002-job-backend-interface-neutral-contract.md) — `JobBackend` interface (predecessor; `StorageManager` extends the same pluggability ethos).
- ADR-0001 — Module layout (`server/storage/` is a new subdir under `server/`; no cross-module edges added).

## References

- Reference doc: [.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md](../../.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md) — full 6-framework audit, §9 Implementation Guide.
- Plan: [docs/plans/pluggable-storage-storage-manager-plan.md](../plans/pluggable-storage-storage-manager-plan.md) — execution plan with TDD+BDD.
- Edge-case review: [docs/reviews/edge-case-plan/pluggable-storage-storage-manager-edge-cases-2026-05-26.md](../reviews/edge-case-plan/pluggable-storage-storage-manager-edge-cases-2026-05-26.md) — 9 ECs incorporated.
- Encore `runtimes/go/storage/sqldb/manager_internal.go:96-115` — DCL pattern reference.
- Nitro `src/runtime/internal/database.ts:1-17` — cached singleton + factory.
