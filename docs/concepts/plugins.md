# Plugins

> **Status:** stable since 0.5.0 (formalized as the canonical SDK)
> **ADR:** [ADR-0008 — TheoPlugin is the canonical plugin SDK](../adr/0008-theoplugin-is-the-canonical-sdk.md)

TheoKit's plugin SDK is a single interface — `TheoPlugin` — adopted from the Fastify ecosystem. Plugins are units of extension that participate in the HTTP request lifecycle via hooks. They are the **only** plugin pattern in TheoKit; there is no `defineTheokitModule`, no `@theokit/kit`, no separate module system (see ADR-0008 for the rationale).

## 1. What & Why

A plugin is a small unit that augments a TheoKit app — adding headers, logging, decorating requests, mounting middleware-style logic. The shape mirrors Fastify (`fastify.register(plugin)`):

```ts
import { definePlugin } from 'theokit/server'

export default definePlugin({
  name: 'my-plugin',
  register(app) {
    app.addHook('onRequest', (req) => {
      // mutate request, log, short-circuit, etc.
    })
  },
})
```

Plugins are loaded from `theo.config.ts > plugins: []`. The framework calls `plugin.register(app)` once at boot.

**Why this pattern over alternatives:**

- **Fastify proved it scales** — 200+ community plugins running in production with the same 5-LOC contract.
- **Smaller surface than Nuxt's `defineNuxtModule`** — Nuxt's module system has Zod schemas, dependency resolution, lifecycle hooks, `@nuxt/kit` SDK package. Powerful, but requires sustained community demand to justify the maintenance. TheoKit at 0.5.0 has zero community modules — premature.
- **Bottom-up adoption** — CLAUDE.md R0.6.5 gates full plugin-ecosystem work behind community demand; the existing `TheoPlugin` covers everything we need today.

## 2. API Surface

```ts
import type { TheoPlugin, TheoApp, HookName } from 'theokit/server'
import { definePlugin } from 'theokit/server'
```

| Symbol | Type | Purpose |
|---|---|---|
| `TheoPlugin` | interface | `{ name: string, register(app: TheoApp): void \| Promise<void> }` |
| `definePlugin(plugin)` | identity helper | Adds auto-completion to `theo.config.ts`; same behavior as `defineTheoPlugin` (legacy alias) |
| `app.addHook(name, fn)` | mutation API | Subscribes `fn` to the named hook |
| `app.decorateRequest(key, value)` | mutation API | Augments every request with a typed property |

Hook names (from `plugin-types.ts`): `onRequest`, `preHandler`, `onResponse`, `onError`.

## 3. Current state — 1 shipping plugin, 2 committed in roadmap

As of 2026-05-27, per [ADR-0011 — moderate plugin roadmap strategy](../adr/0011-moderate-plugin-roadmap-strategy.md):

- **1 shipping:** `@theokit/plugin-cors@0.1.0` — CORS middleware. Real gap in core (no CORS primitive); ~80 LOC; W3C-compliant; published from the [`theokit-plugins`](https://github.com/usetheodev/theokit-plugins) first-party monorepo.
- **2 committed (proposed ADRs):**
  - `@theokit/plugin-sentry` ([ADR-0012, proposed](https://github.com/usetheodev/theokit-plugins/blob/main/docs/adr/0012-plugin-sentry-proposed.md)) — error tracking bridge; target start ≤ 2 weeks after cors release.
  - `@theokit/plugin-i18n` ([ADR-0013, proposed](https://github.com/usetheodev/theokit-plugins/blob/main/docs/adr/0013-plugin-i18n-proposed.md)) — internationalization; target start ≤ 6 weeks after cors release.
- **6 demand-gated** (won't ship without 1+ production app + 3+ requests, per ADR-0008 / R0.6.5): otel, resend, stripe-webhooks, clerk/auth0/workos, feature-flags, inngest/trigger-dev. Full list in [`theokit-plugins/ROADMAP.md`](https://github.com/usetheodev/theokit-plugins/blob/main/ROADMAP.md).

The bootstrap with 1 plugin + 2 committed is the moderate path between "wait for any demand signal" (R0.6.5 literal) and "ship N speculative plugins". CLAUDE.md macro-roadmap R0.6.5 is honored for the 6 demand-gated plugins; the 3 committed ones are documented exceptions justified in ADR-0011.

Things that became Fastify plugins are **built into the TheoKit core** as direct primitives — the SDK exists for **what the core intentionally doesn't ship**:

| Common need | Fastify equivalent | TheoKit |
|---|---|---|
| Security headers | `@fastify/helmet` | ✅ Built-in (CSP/HSTS/X-Frame, ADR-aligned) |
| Cookies | `@fastify/cookie` | ✅ `getCookie`/`setCookie`/`deleteCookie` |
| Rate limit | `@fastify/rate-limit` | ✅ `createRateLimiter` + pluggable store |
| Multipart | `@fastify/multipart` | ✅ `parseRequestBody` + busboy |
| Postgres | `@fastify/postgres` | ✅ `usePostgres` + `StorageManager` |
| Redis | `@fastify/redis` | ✅ `useRedis` + `StorageManager` |
| WebSocket | `@fastify/websocket` | ✅ `defineWebSocket` |
| OpenAPI | `@fastify/swagger` | ✅ Generated from `defineRoute` + Zod |
| JWT/Auth | `@fastify/jwt` | ✅ Session + RFC primitives (PKCE / OAuth state / TOTP) |
| KV store | `@fastify/redis` adapters | ✅ `useUnstorage` (20+ drivers) |
| SQL non-PG | `@fastify/postgres` variants | ✅ `useDatabase` (libSQL/D1/MySQL/SQLite) |

TheoKit takes the "framework with batteries" stance (closer to Next.js/Nuxt) rather than "minimal core + plugins everywhere" (Fastify). The SDK exists for **what the core intentionally doesn't ship** — like CORS (the first shipping plugin).

### How to consume the shipping plugin

```bash
pnpm add @theokit/plugin-cors
```

```ts
// theo.config.ts
import { defineConfig } from 'theokit'
import cors from '@theokit/plugin-cors'

export default defineConfig({
  plugins: [
    cors({
      origin: ['https://app.example.com'],
      credentials: true,
    }),
  ],
})
```

Full options reference + security notes in the [package README](https://github.com/usetheodev/theokit-plugins/tree/main/packages/plugin-cors#readme).

## 4. Lifecycle

```
theo.config.ts > plugins: [pluginA, pluginB, pluginC]
                                │
                                ▼
                      Boot — PluginRunner.register(p) for each
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
       p.register(app) runs               (one-time)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
  app.addHook(...)    app.decorateRequest(...)
        │                   │
        ▼                   ▼
  Stored in PluginRunner.hooks{onRequest, preHandler, onResponse, onError}
                                │
                                ▼
                      Per-request — hooks fire in registration order
```

Plugins register at boot, hooks fire on every matching request. `register()` can be `async`; the runner awaits.

## 5. Cookbook

### 5.1 — Add a global HTTP header

```ts
import { definePlugin } from 'theokit/server'

export default definePlugin({
  name: 'global-header',
  register(app) {
    app.addHook('onResponse', (_req, res) => {
      res.headers.set('X-Powered-By', 'TheoKit')
    })
  },
})
```

### 5.2 — Log every incoming request with timing

```ts
import { definePlugin } from 'theokit/server'

export default definePlugin({
  name: 'request-timing',
  register(app) {
    app.decorateRequest<number>('startedAt', 0)
    app.addHook('onRequest', (req) => {
      ;(req as unknown as { startedAt: number }).startedAt = performance.now()
    })
    app.addHook('onResponse', (req, res) => {
      const elapsed = performance.now() - (req as unknown as { startedAt: number }).startedAt
      console.log(`${req.method} ${req.url} ${res.status} ${elapsed.toFixed(1)}ms`)
    })
  },
})
```

### 5.3 — Augment request context with auth user

```ts
import { definePlugin } from 'theokit/server'

interface AuthedRequest {
  user?: { id: string; email: string }
}

export default definePlugin({
  name: 'auth-context',
  register(app) {
    app.decorateRequest<AuthedRequest['user']>('user', undefined)
    app.addHook('preHandler', async (req) => {
      const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
      if (token === undefined) return
      const user = await verifyToken(token) // your verify fn
      ;(req as unknown as AuthedRequest).user = user
    })
  },
})

declare function verifyToken(t: string): Promise<{ id: string; email: string }>
```

## 6. Limitations & non-goals

What TheoKit's plugin SDK **does NOT do** (intentional — see ADR-0008):

- **No Zod schema validation per plugin.** Plugins that accept config validate it manually. Same as Fastify; community didn't ask.
- **No dependency resolution between plugins.** Plugins are independent. If A needs to run before B, the user orders them in `theo.config.ts > plugins`.
- **No hot-reload of plugins.** Boot-time only. HMR would require non-trivial state-resetting machinery.
- **No `@theokit/kit` companion package.** Nuxt's pattern; appropriate when an ecosystem exists. TheoKit at 0.5.0 doesn't.
- **No `defineTheokitModule` parallel SDK for storage/db/messaging.** Those use their own primitives: `useStorage<T>`, `useUnstorage`, `useDatabase`, plus the 4 domain interfaces (`JobBackend`, `ConversationStorageLike`, `UsageStorageAdapter`, `RateLimitStorageAdapter`). See [`storage-manager.md`](./storage-manager.md).

If demand emerges (2+ community plugins published, real pain points reported), the surface can grow. Until then: KISS.

## 7. Want to ship a plugin?

Two paths exist depending on whether the plugin is **first-party** (maintained by the TheoKit team) or **community** (anyone).

### 7.1 — Naming convention

| Scope | When to use | Example |
|---|---|---|
| `@theokit/plugin-<name>` | First-party only. Reserved for plugins in the [`theokit-plugins`](https://github.com/usetheodev/theokit-plugins) monorepo. | `@theokit/plugin-cors`, `@theokit/plugin-otel` |
| `@<your-scope>/theokit-plugin-<name>` | Community plugins under any npm scope. The `theokit-plugin-` infix is the convention so users can search. | `@acme/theokit-plugin-stripe`, `@bigco/theokit-plugin-honeycomb` |
| `theokit-plugin-<name>` (unscoped) | Allowed but discouraged — risk of name squatting. Prefer scoped. | `theokit-plugin-i18n` |

### 7.2 — Package shape

Minimum viable plugin (one `index.ts` file):

```ts
// src/index.ts
import { definePlugin, type TheoPlugin } from 'theokit/server'

export interface CorsOptions {
  origin?: string | string[]
  credentials?: boolean
}

export default function corsPlugin(options: CorsOptions = {}): TheoPlugin {
  return definePlugin({
    name: '@theokit/plugin-cors',
    register(app) {
      app.addHook('onResponse', (req, res) => {
        const origin = req.headers.get('origin')
        if (origin === undefined) return
        // ... CORS logic
        res.headers.set('Access-Control-Allow-Origin', origin)
      })
    },
  })
}
```

```json
// package.json
{
  "name": "@theokit/plugin-cors",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "peerDependencies": {
    "theokit": ">=0.5.0"
  }
}
```

User installs and wires:

```ts
// theo.config.ts
import { defineConfig } from 'theokit'
import corsPlugin from '@theokit/plugin-cors'

export default defineConfig({
  plugins: [corsPlugin({ origin: ['https://app.example.com'] })],
})
```

### 7.3 — First-party criteria (`@theokit/plugin-*`)

A plugin gets promoted to first-party only when ALL of these hold:

| Gate | Why |
|---|---|
| 1+ app in production already using it | Proves it works under load |
| 3+ GitHub issues/discussions requesting it | Proves it's not just one person's need |
| Doesn't duplicate a core primitive | Avoids confusion (e.g., no `@theokit/plugin-cookies` — already in core) |
| <100 LOC OR <1 week of maintenance/year | Realistic for single-maintainer scope |
| Has tests + fixture project | Matches TheoKit's quality bar |

If your community plugin hits these gates, open a discussion at [`theokit-plugins`](https://github.com/usetheodev/theokit-plugins) requesting promotion. No PR — just the discussion.

### 7.4 — Where to publish

- **Community plugin** — anywhere on npm under your scope. Open a PR to TheoKit docs adding your plugin to a future "community plugins" page (TBD when 5+ exist).
- **First-party plugin** — only via [`theokit-plugins`](https://github.com/usetheodev/theokit-plugins) PR after promotion discussion.

## See also

- [ADR-0008 — TheoPlugin is the canonical SDK](../adr/0008-theoplugin-is-the-canonical-sdk.md)
- [Storage Manager concept](./storage-manager.md) — orthogonal extension surface for storage/db/cache
- [`theokit-plugins`](https://github.com/usetheodev/theokit-plugins) — official first-party plugin monorepo (empty until first plugin lands per ADR-0008 + R0.6.5)
- `packages/theo/src/server/plugin-types.ts` — `TheoPlugin` interface source of truth
- `packages/theo/src/server/plugins/plugin-runner.ts` — runtime semantics
- `packages/theo/src/adapters/web-shim.ts` / `ws-shim.ts` — utility bridges (NOT plugins — they don't construct `TheoPlugin` instances)
