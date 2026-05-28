# 0009. Adopt `unstorage` as the KV driver delegation layer

* Status: accepted
* Date: 2026-05-27
* Deciders: [TheoKit team]
* Tags: [architecture, storage, kv, redis, edge-runtime, unjs, peer-dependency]

## Context and Problem Statement

TheoKit's `StorageManager` (ADR-0007) provides lifecycle coordination for storage adapters, but the framework today bakes in only Postgres + Redis specifics (`usePostgres`/`useRedis`). For KV-style storage — caching, sessions, rate-limit state, feature flags, distributed counters — users currently choose between:

- Hardcoded `useRedis` for Redis-only deployments (TheoCloud target)
- Roll-your-own client wrapping (DynamoDB, Cloudflare KV, Vercel KV, Upstash, S3, R2, …)

This is limiting for edge runtimes (Cloudflare Workers can't run Node Redis; needs CF KV) and for serverless apps with Vercel KV / Upstash / Redis-compatible APIs.

We considered building a TheoKit-native driver registry: `KvDriver { kind, configSchema, create, dispose }` + `registerKvDriver()` + community ships `@theokit/kv-driver-redis`. That path means:

- ~200 LOC of registry + discovery + config validation
- Maintenance burden as drivers proliferate
- Community would need to learn TheoKit-specific contracts
- We'd be reinventing what `unstorage` already provides

`unstorage` is an UnJS library (same org as Nitro/Nuxt) that defines a `Storage<T>` interface plus 20+ official drivers: `memory`, `fs`, `redis`, `cloudflare-kv`, `vercel-kv`, `upstash-redis`, `s3`, `r2`, `memcached`, `mongodb`, `azure-storage`, and more. Used by Nitro (`runtime/internal/storage.ts:1-8` imports `import { createStorage } from 'unstorage'`).

## Decision Drivers

- **CLAUDE.md Principle 9 (não reinventar a roda)** — `unstorage` exists, maintained, battle-tested
- **Edge runtime parity** — Cloudflare Workers / Vercel Edge need non-Node KV drivers
- **TheoCloud strategy** — Redis remains primary; this opens the door without diverting it
- **Zero TheoKit maintenance for drivers** — every driver bug becomes an `unstorage` bug
- **Optional peer-dep model (ADR-0007 D2 precedent)** — keeps base bundle lean

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Invent TheoKit `KvDriver` registry + `@theokit/kv-driver-*` packages | Reinventing `unstorage`; ~200 LOC + ecosystem investment we'd own; community would learn yet another contract |
| Stay Redis-only (`useRedis` is the only KV path) | Cloudflare Workers / edge users blocked; TheoKit perceived as "Node-only framework" |
| Bundle `unstorage` as a hard dependency | Bundle inflation for apps that don't use KV (e.g., pure dev with in-memory only); ADR-0007 D2 precedent for optional peer-deps |
| Use a different KV abstraction (e.g., `keyv`) | `keyv` smaller surface but fewer drivers (no Cloudflare KV / Vercel KV); UnJS ecosystem cohesion preferred |

## Decision

### D2 — Delegate KV drivers to `unstorage`; ship `useUnstorage(name, driver?)` helper

`useUnstorage(name, driver?)` is a wrapper around `unstorage.createStorage({ driver })` that:

1. Lazy-imports `unstorage` (peer-dep optional — throws actionable error if missing)
2. Caches the `Storage<T>` instance per `name` via `StorageManager.useStorage`
3. Auto-registers a dispose hook via `StorageManager.register()` so SIGTERM drains it
4. Defaults to memory driver when no driver is passed (dev-friendly)

```ts
import { useUnstorage } from 'theokit/server'
import redisDriver from 'unstorage/drivers/redis'

const cache = await useUnstorage<string>('cache', redisDriver({ url: process.env.REDIS_URL }))
await cache.setItem('user:1', JSON.stringify({...}))
```

- **Rationale:** Nitro `src/runtime/internal/storage.ts` proves this exact pattern. UnJS maintains the driver layer; we maintain only the manager bridge.
- **Consequences:**
  - ✅ 20+ drivers immediately available to TheoKit users without core changes.
  - ✅ Bundle stays lean for non-KV apps (peer-dep optional).
  - ✅ Edge runtime parity (Cloudflare KV, Vercel KV drivers).
  - ⚠️ Users learn `unstorage`'s `getItem`/`setItem` API (one extra concept).
  - ⚠️ Peer-dep version mismatch is silent (documented as EC-11 in concept doc).

### Peer-dep model

```json
{
  "peerDependencies": {
    "unstorage": "^1.10.0"
  },
  "peerDependenciesMeta": {
    "unstorage": { "optional": true }
  }
}
```

Apps installing TheoKit without `unstorage` pay zero bundle cost. `useUnstorage` lazy-imports at first call; throws actionable error if not installed.

## Consequences

### Positive

- **Driver-by-config** — users compose driver+options at call site, no plugin registration.
- **Zero maintenance for drivers** — bugs go upstream to `unstorage`.
- **Edge-ready** — `unstorage/drivers/cloudflare-kv-binding`, `vercel-kv`, etc. just work.
- **Test-mode swap** — `unstorage/drivers/memory` for tests; same API as prod.

### Negative

- **External API surface (`Storage<T>`)** — `unstorage`'s `getItem`/`setItem`/`removeItem`/`keys` semantics leak into TheoKit user code. If `unstorage` redesigns its API, TheoKit users feel it.
- **One more dependency to keep current** — peer-dep version bumps require coordination.

### Neutral

- **No replacement for `useRedis`** — `useRedis` returns raw `RedisLike` (e.g., ioredis instance) for users who want direct Redis API access. `useUnstorage` is the abstracted path. Both coexist (decision tree in concept doc).
- **`StorageManager.register()` lifecycle** — `useUnstorage` calls `register()` internally so generic dispose works.

## Related ADRs

- [ADR-0007](./0007-storage-manager-singleton.md) — `StorageManager` (consumer of `useUnstorage`)
- [ADR-0008](./0008-theoplugin-is-the-canonical-sdk.md) — `TheoPlugin` remains separate from storage helpers
- [ADR-0010](./0010-db0-adoption-for-sql-non-postgres.md) — companion: SQL drivers via `db0`

## References

- `unstorage` — https://unstorage.unjs.io (UnJS — same org as Nitro/Nuxt/H3)
- Nitro `src/runtime/internal/storage.ts:1-8` — `import { createStorage } from 'unstorage'` reference implementation
- Nitro `src/build/virtual/storage.ts:9-39` — virtual module for storage mounts
- 20+ drivers list — https://unstorage.unjs.io/drivers
- Plan: [`docs/plans/storage-modules-sdk-delegation-plan.md`](../plans/storage-modules-sdk-delegation-plan.md)
