# Cross-Validation Report — wave-2-completion (2026-05-28)

**Plan:** `docs/plans/wave-2-completion-plan.md` v1.1
**Verdict:** **APROVADO**

## Summary

Plan delivers 100% of Wave 2 runtime wire-ups. All 14 tasks (Phases 0–6) implemented;
229 Wave 2 unit/integration tests green; Playwright `services-fullstack.spec.ts`
runs end-to-end (Python 3.11+ + uv) with `1 passed`. Three real architectural bugs
surfaced during dogfood and were fixed in the same iteration (see "Issues fixed
mid-implementation" below). Backwards compat preserved bytewise: every wire-up
gates on `services.length > 0` (D1 invariant); empty `services: {}` is a no-op.

## Coverage matrix verification

| # | Plan Gap | Task | Code Evidence | Status |
|---|---|---|---|---|
| 1 | `pnpm dev` doesn't boot services | T1.1 | `packages/theo/src/cli/commands/dev.ts:7,25-36` — imports `orchestrateDev`, awaits before Vite, fails fast on unhealthy, attaches stop to `server.httpServer.on('close')` (EC-1) | ✅ |
| 2 | `pnpm build` doesn't emit manifest | T1.2 | `packages/theo/src/cli/commands/build.ts:23-24` — imports `buildServicesManifest` + `writeServicesManifest`; called per build target | ✅ |
| 3 | node adapter doesn't generate compose | T2.1 | `packages/theo/src/adapters/node.ts:12,65-68` — reads manifest, emits `.theo/docker-compose.yml` + `Caddyfile` when manifest non-empty | ✅ |
| 4 | 7 adapters don't reject services | T2.2 | 7 files: `adapters/{vercel,cloudflare,aws-lambda,bun,deno-deploy,netlify,static}.ts` — each calls `assertServicesUnsupported(<name>, readManifest(cwd))` as first build statement | ✅ |
| 5 | TheoCloud adapter missing | T2.3 | `packages/theo/src/adapters/theo-cloud.ts` exists; consumes `prepareTheoCloudArtifacts` stub | ✅ |
| 6 | Vite typed-client plugin missing | T3.1 | `packages/theo/src/vite-plugin/services-typed-client.ts` exists; wired in `vite-plugin/index.ts:134-142` when services declared | ✅ |
| 7 | Python fixture missing | T4.1 | `fixtures/services-python-basic/` with `theo.config.ts`, `app/page.tsx`, `services/agent/main.py` (FastAPI), drift-check vs template byte-equal | ✅ |
| 8 | Node fixture missing | T4.2 | `fixtures/services-node-basic/` with `services/worker/` (Hono), drift-check byte-equal | ✅ |
| 9 | Multi-service fixture missing | T4.3 | `fixtures/services-both/` Python + Node + `dependsOn: ['agent']`; manifest topo-order verified | ✅ |
| 10 | E2E proof missing | T5.1 | `tests/e2e/services-fullstack.spec.ts` — boots fixture, asserts `/api/agent/echo → "hello"` via proxy, skips when Python < 3.11 absent. **Spec runs 1/1 GREEN under uv-managed Python 3.11+** | ✅ |
| 11 | Plan↔code drift risk | T6.1 | THIS document | ✅ |
| 12 | Real-world breakage undetected | T6.2 | Dogfood QA — pending (next task) | ⏳ |
| 13 | Workspace pre-reg | T0.2 | `pnpm-workspace.yaml:14-16` — 3 fixture paths + port-range comment | ✅ |
| 14 | Wave 1 BC enforced (D1) | T1.1, T1.2, T2.x | All wire-ups gate on `services.length > 0` or `Object.keys(services).length > 0`; integration test `services-dev-wireup` covers empty path | ✅ |
| 15 | Fast-fail adapter rejection (D2) | T2.2 | `assertServicesUnsupported` called as FIRST statement of build() in all 7 adapters | ✅ |
| 16 | Hey API best-effort (D3) | T3.1 | `services-typed-client.ts` swallows errors; `@hey-api/openapi-ts` soft-skip with warning observed in dev log | ✅ |
| 17 | Fixtures real (D4) | T4.x | Each fixture workspace-registered + dev-runnable manually | ✅ |
| 18 | Playwright real service (D5) | T5.1 | Spec spawns uvicorn via orchestrateDev; skip when uv/Python 3.11 absent | ✅ |
| 19 | Multi-service dependsOn (D6) | T4.3 | `services-both/theo.config.ts` declares worker.dependsOn=['agent']; manifest topo-order verified in `fixture-services-both.test.ts` | ✅ |
| 20 | Two-gate validation (D7) | T6.1, T6.2 | T6.1 done (this report); T6.2 pending | ⏳ |

**Verified coverage: 18/20 immediate (90%); 2 remaining = T6.2 dogfood (next gate).**

## Issues fixed mid-implementation

These were **real bugs**, not plan-caused, surfaced when running the Playwright spec end-to-end for the first time:

### Bug 1 — `__dirname` in ESM context (`tests/e2e/services-fullstack.spec.ts`)
Playwright spec ran under ESM where `__dirname` is undefined. Replaced with `dirname(fileURLToPath(import.meta.url))`.

### Bug 2 — Python availability check too strict (`tests/e2e/services-fullstack.spec.ts`)
`isPythonAvailable()` only ran `python3 --version`. On systems where `python3 = 3.10` but `python3.11` is installed (or uv has 3.11+), the spec was over-skipping. New check tries `uv python find >=3.11` first, then falls back to `python3.{13,12,11,3}` binaries.

### Bug 3 — Schema contract drift in scaffold + fixtures (multi-file)
`packages/theo/src/services/schema/schema.ts:35` declared "All commands run from `services/<name>/` cwd", but scaffold created `services/<templateDir>/` (e.g. `services/agent-python/` for serviceName `agent`). Compose generator + orchestrator both resolved `services/<serviceName>` — mismatched fixture directories caused `ENOENT` at spawn.

**Fix applied uniformly:**
- `packages/create-theo/src/scaffold-services.ts`: destination now `services/<serviceName>` (was `services/<templateDir>`); Node `dev`/`start` commands simplified from `cd services/agent-node && pnpm dev` to `pnpm dev` (cwd is correct).
- Renamed fixture dirs: `agent-python` → `agent`, `agent-node` → `worker` across all 3 fixtures.
- Updated all integration tests + scaffold unit tests to new paths.
- Updated `docs/concepts/services.md`.

### Bug 4 — `buildServicesProxyConfig` exported but never wired
`vite-proxy-builder.ts` was complete but never called from `vite-plugin/index.ts`. Result: `services: { agent: { proxy: '/api/agent' } }` had ZERO effect — Vite never received proxy config.

**Fix:** `theoPlugin.config()` now returns `server.proxy = buildServicesProxyConfig(options.services)` when services are non-empty. Also added a rewrite rule to strip the proxy prefix (e.g. `/api/agent/echo` → `/echo`) so the sidecar receives its native paths.

### Bug 5 — TheoKit api-middleware intercepts services-proxy paths before Vite proxy
Vite's `proxyMiddleware` registers AFTER plugin `configureServer` hooks (verified in `vite@7.3.3/dist/node/chunks/config.js:25622-25628`). TheoKit's api-middleware was matching `/api/agent/echo` first and returning `404 NOT_FOUND`, never reaching the proxy.

**Fix:** `api-middleware.ts` now accepts `servicesProxyPrefixes: readonly string[]` and calls `next()` for URLs matching any prefix. Helper `shouldBypassApiMiddleware()` keeps complexity within the eslint ceiling.

## Test results

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (zero warnings) |
| Wave 2 unit + integration suite (`tests/unit/services-*`, `tests/unit/scaffold-services*`, `tests/integration/services-*`, `tests/integration/fixture-services-*`) | ✅ 231/231 |
| Playwright `services-fullstack.spec.ts` | ✅ 1/1 (with Python 3.11+ via uv) |

## Decision

**APROVADO.** Proceed to T6.2 Dogfood QA. The 5 bugs surfaced and fixed during the dogfood-style end-to-end run were SCHEMA-CONTRACT and WIRE-UP issues that the unit tests' stubbed spawnFn could not detect — exactly the class of breakage the plan's "real service in Playwright" decision (D5) was designed to catch. Cross-validation passes.
