# 0008. `TheoPlugin` is the canonical plugin SDK — no `defineTheokitModule`

* Status: accepted
* Date: 2026-05-27
* Deciders: [TheoKit team]
* Tags: [architecture, plugins, sdk, extensibility, fastify-pattern]

## Context and Problem Statement

While planning `useStorage<T>` + `unstorage`/`db0` adoption (storage-modules-sdk-delegation plan), we revisited "should TheoKit have its own module SDK?". Two patterns emerged in prior art:

- **Plugin pattern (Fastify, Astro, Vite, TanStack)** — `Plugin = { name, register|hooks }` passed to a config array. Fastify alone has 200+ community plugins with this 5-LOC contract.
- **Module pattern (Nuxt)** — `defineNuxtModule({ name, hooks, setup, configKey, defaults, schema, ... })` with `@nuxt/kit` as the SDK package, dependency resolution, Zod schema integration, lifecycle hooks. Powers 1500+ Nuxt modules but Nuxt has 4+ years of community demand and paid team.

Discovery: **TheoKit already has a plugin SDK** at `packages/theo/src/server/plugin-types.ts:46`:

```ts
export interface TheoPlugin {
  name: string
  register(app: TheoApp): void | Promise<void>
}
```

Used by 3 in-tree plugins (`web-shim`, `ws-shim`, `batching`). Pattern is **Fastify literal**. Not documented as the official SDK — community can't discover it.

The temptation was to ship a parallel `defineTheokitModule({ kind, configSchema, create, dispose, ... })` for storage/db/messaging modules. Three forces pushed against:

1. **Zero community demand.** CLAUDE.md R0.6.5 (Plugin ecosystem incubation) is explicit: *"bottom-up — needs community demand signal first."* Today no module from outside the core repo exists.
2. **`TheoPlugin` already covers HTTP-level extension.** Storage extension is covered by 4 domain interfaces (`JobBackend`, `ConversationStorageLike`, `UsageStorageAdapter`, `RateLimitStorageAdapter`) plus `StorageManager.register()` for lifecycle. The "missing piece" for new backends is generic caching — solved by `useStorage<T>` (this plan), not by a new SDK.
3. **YAGNI + ADR-0006 precedent.** ADR-0006 explicitly REJECTED `defineWorker` for the same reason: no demand, premature abstraction. Adding `defineTheokitModule` now repeats that mistake.

## Decision Drivers

- **CLAUDE.md R0.6.5 constraint** — community demand precedes ecosystem SDK
- **`TheoPlugin` is already battle-tested** — 3 in-tree consumers
- **Single-maintainer scope** — every API surface added is owed maintenance
- **DX ergonomics matter** — but `definePlugin()` identity helper gives 100% of the value of `defineNuxtModule` for our scope
- **Storage extension has its own primitives** — no need to overload plugins

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Ship `defineTheokitModule({ kind, configSchema, create, dispose })` Nuxt-style | Premature abstraction; no community demand; competes with existing `TheoPlugin`; ~200 LOC of registry + Zod composition we'd own forever |
| Global registry of "kinds" (`registerKind('storage', driver)`) | Encore-style closed system; out of fit for our open framework posture; doesn't address actual use cases (lifecycle covered by `register()`) |
| Inversion-of-Control container (`container.bind('cache').to(RedisCache)`) | Over-engineering; KISS prevails; framework needs lifecycle coordination, not full DI |
| Keep `TheoPlugin` undocumented (status quo) | Community can't discover it; adoption blocked |

## Decision

### D1 — `TheoPlugin` remains the SINGLE plugin SDK

`TheoPlugin { name, register(app) }` is the canonical SDK. We DO NOT ship a parallel `defineTheokitModule` or any module-system variation. Adding a second extension API would split the community, double maintenance, and signal indecision.

- **Rationale:** Fastify proves the minimal pattern scales (200+ plugins). TheoKit at 0.5.0 with 3 in-tree plugins has zero need for the heavier Nuxt-kit machinery. CLAUDE.md R0.6.5 explicitly gates ecosystem-SDK work behind community signal.
- **Consequences:**
  - ✅ Minimal surface area.
  - ✅ Bottom-up extension — community ships plugins that consume `TheoPlugin`.
  - ✅ Storage/db/messaging use the existing domain interfaces + `StorageManager`.
  - ⚠️ No built-in Zod schema validation per plugin — each plugin validates its own config (same as Fastify; intentional).
  - ⚠️ No dependency resolution between plugins — plugins are independent (same as Fastify scope encapsulation).

### D6 — `definePlugin()` is an identity function

Add `definePlugin(plugin: TheoPlugin): TheoPlugin` to `theokit/server`. This is an identity function — it returns the input unchanged. Its sole purpose is auto-completion and inference at the call site.

```ts
import { definePlugin } from 'theokit/server'

export default definePlugin({
  name: 'my-plugin',
  register(app) {
    app.addHook('onRequest', () => {})
  },
})
```

- **Rationale:** Pattern from TanStack/Vite/Astro. Zero runtime cost. Enables literal type narrowing without typing `: TheoPlugin` explicitly.
- **Consequences:**
  - ✅ Better DX (auto-complete) for new plugin authors.
  - ✅ No runtime semantics — pure type helper.
  - ✅ Pure additive — `as TheoPlugin` or explicit type annotation continue to work.

## Consequences

### Positive

- **Discovery** — `TheoPlugin` becomes officially documented (concept doc `docs/concepts/plugins.md`); community knows the contract.
- **Stable contract** — `TheoPlugin` shape doesn't change with this ADR; existing 3 plugins keep working.
- **Clear non-goals** — we explicitly do NOT promise schema validation, dependency resolution, or hot-reload at the plugin level. Plugins do their own thing.
- **Storage extension is orthogonal** — `useStorage<T>` + 4 domain interfaces cover the storage/db/messaging extension space WITHOUT touching `TheoPlugin`.

### Negative

- **Storage helpers (`useUnstorage`, `useDatabase`) are NOT plugins** — they're standalone helpers. Users wanting "plugin everything" syntax don't get it. Acceptable: the two concepts are different (HTTP hook plumbing vs. storage client lifecycle).
- **No first-class Zod schema for plugin config** — plugin author validates manually if they expose config. Same trade-off Fastify made; community didn't complain.

### Neutral

- **Plugin runner already exists** (`packages/theo/src/server/plugins/plugin-runner.ts`) — `register()` is called on boot, hooks fire per-request. No changes needed.
- **Existing 3 in-tree plugins** (`web-shim`, `ws-shim`, `batching`) may optionally migrate to `definePlugin({...})` syntax in a follow-up cleanup; no functional change.

## Related ADRs

- [ADR-0007](./0007-storage-manager-singleton.md) — `StorageManager` singleton (storage extension primitive)
- [ADR-0006](./0006-define-worker-rejected.md) — `defineWorker` rejected — same precedent (no demand → don't ship)
- [ADR-0009](./0009-unstorage-adoption-for-kv.md) — `unstorage` for KV drivers (companion)
- [ADR-0010](./0010-db0-adoption-for-sql-non-postgres.md) — `db0` for SQL drivers (companion)

## References

- CLAUDE.md macro roadmap R0.6.5 — "Plugin ecosystem incubation — bottom-up, needs community demand signal first"
- `packages/theo/src/server/plugin-types.ts:46` — `TheoPlugin` interface (existing)
- `packages/theo/src/server/plugins/{web-shim,ws-shim,batching}.ts` — in-tree consumers
- Fastify `lib/plugin-utils.js` — 169 LOC powering 200+ community plugins (`referencias/fastify/`)
- Nuxt `packages/kit/src/module/define.ts` — `defineNuxtModule` reference (counter-example: too heavy for our scope)
- Plan: [`docs/plans/storage-modules-sdk-delegation-plan.md`](../plans/storage-modules-sdk-delegation-plan.md)
- Edge-case review: [`docs/reviews/edge-case-plan/storage-modules-sdk-delegation-edge-cases-2026-05-27.md`](../reviews/edge-case-plan/storage-modules-sdk-delegation-edge-cases-2026-05-27.md)
