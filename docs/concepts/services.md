# Polyglot Services — `services: {}`

> Wave 2 — opt-in. `services: {}` is empty by default. **90% of agent products live entirely in TheoKit's TS `server/` directory.** Sidecars enter only for specific cases (ML inference, OCR, legacy API integration, operational isolation).

This document covers when to use a sidecar service, how to declare one, and the runtime contract every service must honor. See [`docs/concepts/services-runtime-contract.md`](./services-runtime-contract.md) for the deeper invariants reference.

## What and when

A TheoKit user can ship an agent product **end-to-end** using only `server/`:

```
my-agent-app/
├── app/                          # Frontend (React + Vite)
└── server/                       # TS backend — covers everything
    ├── routes/auth/{login,register,logout}.ts
    ├── routes/users/{me,[id]}.ts
    ├── routes/chat.ts            # @usetheo/sdk agent endpoint
    ├── routes/billing/webhook.ts
    ├── actions/*.ts              # defineAction (CSRF)
    ├── middleware.ts
    ├── jobs/*.ts                 # defineJob
    └── crons/*.ts                # defineCron
```

A polyglot sidecar (Python or Node service, declared via `services: {}` in `theo.config.ts`) is **opt-in**.

## Decision matrix

| Scenario | Stays in TS `server/` | Sidecar makes sense |
|---|:---:|---|
| Login, sessions, encrypted cookies | ✅ | — |
| CRUD users + admin panel | ✅ | — |
| Agent chat via `@usetheo/sdk` | ✅ | — |
| Stripe billing + webhooks | ✅ | — |
| `defineJob` + `defineCron` | ✅ | Node sidecar **only** if you need workers scaled independently |
| Telegram / Discord bot (`@usetheo/gateway-*`) | ✅ | — |
| ML inference (sentence-transformers, scikit-learn, PyTorch) | painful in TS | ✅ Python sidecar |
| OCR / heavy PDF parsing | painful in TS | ✅ Python sidecar |
| Integrating an existing Node monolith / legacy API | ❌ | ✅ Node sidecar as reverse proxy |
| Microservice isolation (separate scaling, separate deploy) | depends | ✅ Node sidecar if isolation matters |

**The rule:** if the use case is comfortable in TS, use `server/`. If it needs another language's library ecosystem or operational isolation, add a sidecar. **Sidecars complement; they do not substitute.**

## Quick start

```bash
# TheoKit + Python FastAPI service:
npx create-theokit my-app --backend python

# TheoKit + Node Hono service:
npx create-theokit my-app --backend node

# Both:
npx create-theokit my-app --backend python --backend node

cd my-app
pnpm dev
```

The CLI scaffolds `services/agent/` (Python — service name `agent`) or `services/worker/` (Node — service name `worker`) and wires `services: {}` into `theo.config.ts` with sensible defaults. The directory name matches the service name in the config because `orchestrateDev` resolves the spawn cwd as `services/<name>/`.

## `services: {}` reference

```ts
// theo.config.ts
import { defineConfig } from 'theokit'

export default defineConfig({
  services: {
    agent: {
      runtime: 'python',                        // Wave 2: 'python' | 'node'
      port: 8001,                               // unique across services
      proxy: '/api/agent',                       // non-root path prefix
      dev: 'uvicorn main:app --reload --port 8001',
      start: 'uvicorn main:app --port 8001 --workers 4',
      build: undefined,                         // optional — most Python apps skip
      openapi: 'http://localhost:8001/openapi.json',  // for typed-client gen
      healthcheck: '/health',                   // GET — must return 200 when ready
      cors: false,                              // default — opt-in for browser access
      env: { MY_VAR: 'x' },                     // injected at spawn
      dependsOn: [],                            // service names that must boot first
      passSetCookie: false,                     // default strips upstream Set-Cookie
    },
  },
})
```

### Validation invariants (enforced by Zod)

- **EC-1:** No two services share the same `port`.
- **EC-2:** No service's `port` equals TheoKit's web port.
- **EC-3:** Service name must not be `web`, `caddy`, `postgres`, or `redis` (reserved for the generated docker-compose stack).
- **EC-4:** `proxy` must start with `/` and be NON-ROOT (`/` alone would catch everything).
- **EC-12:** Service name must match `^[a-z][a-z0-9-]*$` (docker-compose-safe).
- `dependsOn`: no self-deps, no cycles, references must exist.

## The Like-Vercel runtime contract

Every service (TheoKit TS app + polyglot sidecars) must satisfy 6 invariants — see [`services-runtime-contract.md`](./services-runtime-contract.md):

1. **Fetch handler universal entry** — `(Request) => Promise<Response>` shape
2. **File-system routing build-time** — manifest emitted at build, not scanned at request time
3. **Env vars at runtime** — `process.env` / `os.environ` read on cold start
4. **`GET /health` convention** — 200 / 503
5. **Structured JSON-line stdout logs** — one JSON object per line
6. **W3C `traceparent` propagation** — injected at proxy hop, echoed by services

## Adapter compatibility matrix (Wave 2 — TheoCloud-first focus)

Per owner decision 2026-05-27, Wave 2 channels **100% of polyglot energy into TheoCloud**. Other deploy adapters (Vercel, Cloudflare, AWS Lambda, Bun, Deno Deploy, Netlify, Static) continue to deploy your TheoKit TS app first-class, but **`services: {}` Wave 2 is wired through TWO targets only**:

| Target | `services: {}` support | TS app deploy |
|---|:---:|:---:|
| `node` (local docker-compose harness) | ✅ shipping | ✅ |
| `theo-cloud` (principal target) | 🟢 Wave 3 milestone | 🟡 adapter on roadmap |
| `vercel` | ❌ (loud rejection — `services: {}` non-empty fails build) | ✅ pre-existing |
| `cloudflare` | ❌ (loud rejection) | ✅ pre-existing |
| `aws-lambda` / `bun` / `deno-deploy` / `netlify` / `static` | ❌ (loud rejection) | ✅ pre-existing |

**The rule:** if you want polyglot services in production today, build for `node` (docker-compose) and host where Docker runs. When the TheoCloud adapter ships, it consumes the SAME `.theo/services.json` manifest — your `theo.config.ts` stays unchanged across local + TheoCloud (per the Like-Vercel runtime contract; see [`services-runtime-contract.md`](./services-runtime-contract.md)).

**Adding `services: {}` support to other adapters** requires a fresh ADR with demand evidence. The current decision concentrates engineering effort on the TheoCloud adapter rather than fragmenting across 7 platform-specific wire-ups.

## Migration from `theo-stacks`

If you previously used `npx create-theo` from the standalone `theo-stacks` repo, see [`docs/migration/from-theo-stacks-to-create-theokit.md`](../migration/from-theo-stacks-to-create-theokit.md).

Wave 2 supports **Python + Node only**. The 5 other languages from `theo-stacks` (Go, Rust, Java, Ruby, PHP) are archived in `theo-stacks` (read-only) — community can fork; a fresh ADR with demand evidence is required to re-include them in TheoKit.

## Troubleshooting

- **`Service agent failed to be healthy`** — service didn't respond on `/health` within 30s. Check: is the service binding to the configured port? Is `healthcheck` path correct?
- **`port collides with TheoKit web port`** — change `services.<name>.port` to a different value (e.g., 8001+).
- **`@hey-api/openapi-ts not installed; typed client not generated`** — install the dep: `pnpm add -D @hey-api/openapi-ts @hey-api/client-fetch`. Optional — services still work without it.
- **`Adapter '<x>' does not support polyglot services in Wave 2`** — Vercel/Cloudflare/AWS Lambda/Bun/Deno Deploy/Netlify/Static reject `services: {}` non-empty by design. Use `theokit build --target node` for local docker-compose (TheoCloud-shaped harness) or wait for the TheoCloud adapter (Wave 3).

## Related ADRs

- [ADR-0012](../adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) — mission expansion
- [ADR-0013](../adr/0013-theocreate-absorbed-into-create-theokit.md) — TheoCreate absorbed
- [ADR-0014](../adr/0014-services-as-external-processes.md) — external processes invariant
- [ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md) — Like-Vercel contract
