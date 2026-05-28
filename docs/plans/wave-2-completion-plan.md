# Plan: Wave 2 Completion — Runtime Wire-Ups + Validation

> **Version 1.1** — Updated 2026-05-27 after [edge-case review](../reviews/edge-case-plan/wave-2-completion-edge-cases-2026-05-27.md) folded 3 MUST FIX items (EC-1 server.httpServer.on('close'); EC-2 port-collision discipline + comment in pnpm-workspace.yaml; EC-3 fixture/template byte-equal drift checks). 5 SHOULD TEST items captured in TDD blocks; 4 DOCUMENT items captured as inline notes.
>
> **Version 1.0** — Closes Wave 2 polyglot services. The 16 building-block modules in `packages/theo/src/services/` and the scaffolder helper in `packages/create-theo/src/scaffold-services.ts` are **already shipped with 173 unit tests green**. This plan wires those building blocks into the actual runtime paths (`cli dev`, `cli build`, deploy adapters, Vite plugin), creates the 3 fixtures, ships the Playwright E2E spec, runs cross-validation, and passes Dogfood QA. Per owner decision 2026-05-27, **focus is 100% TheoCloud-first**: `services: {}` is wired through `node` adapter (local docker-compose harness) + `theo-cloud` stub (Wave 3 placeholder). All other adapters reject `services: {}` non-empty with a uniform actionable error. Expected outcome: `npx create-theokit my-app --backend python && cd my-app && pnpm dev` boots TheoKit + uvicorn end-to-end with traceparent propagation, the typed client is generated, the docker-compose harness is emitted by `pnpm build --target node`, and Dogfood QA reaches health ≥ 80.

## Context

### What exists today

- **16 helper modules** in `packages/theo/src/services/` + `packages/create-theo/src/scaffold-services.ts` — all with TDD/BDD strict, 173 unit tests green, lint clean, typecheck clean:
  - `schema.ts` (Zod) — 28 tests including all 10 MUST FIX edge cases
  - `path-scope.ts` — GHSA-5w89-w975-hf9q port from Nitro, 10 tests
  - `proxy.ts` — Web Standards proxy helper (Hono-style), 18 tests
  - `manifest.ts` — `.theo/services.json` reader/writer, 9 tests
  - `healthcheck-poller.ts` — 9 tests
  - `vite-proxy-builder.ts` — translates `services:` → Vite `server.proxy`, 5 tests
  - `process-spawn-helpers.ts` — env auto-inject + lifecycle, 9 tests
  - `log-merge.ts` — JSON-line stdout merger, 6 tests
  - `orchestrator.ts` — `orchestrateDev` ties spawn + healthcheck + logs, 5 tests
  - `adapter-support.ts` — `assertServicesUnsupported` (TheoCloud-first unified rejection), 6 tests
  - `caddy-generator.ts` + `compose-generator.ts` — docker-compose harness, 9 tests
  - `theo-cloud-adapter-stub.ts` — Wave 3 placeholder, 4 tests
  - `openapi-client-gen.ts` — Hey API soft-dep wrapper, 5 tests
  - `packages/create-theo/src/scaffold-services.ts` — `--backend python|node` scaffolder, 22 tests
- **2 service templates** scaffolded: `packages/create-theo/templates/services/agent-python/` (FastAPI + uv + Dockerfile) + `agent-node/` (Hono + tsx + Dockerfile), both wire all 6 Like-Vercel invariants (ADR-0015)
- **3 concept docs**: `docs/concepts/services.md`, `docs/concepts/services-runtime-contract.md`, `docs/migration/from-theo-stacks-to-create-theokit.md`
- **4 ADRs accepted** (0012-0015) — mission expansion, TheoCreate absorption, services as external processes, Like-Vercel contract
- **Full test suite**: 3069 passing / 7 skipped / 0 failing / lint clean / typecheck clean (all 3 theoui-autoinject baselines fixed)

### What is missing — the integration gap

The helpers are LIBRARY-COMPLETE but **NOT invoked from real runtime paths**. A user running `pnpm dev` or `pnpm build --target node` today gets ZERO of the Wave 2 behavior — the helpers are unreachable from the CLI surface.

Concrete gaps:

| Gap | Where it must wire | Evidence |
|---|---|---|
| `pnpm dev` doesn't boot polyglot services | `packages/theo/src/cli/commands/dev.ts` | `grep orchestrateDev packages/theo/src/cli/commands/dev.ts` → no match |
| `pnpm build` doesn't emit `.theo/services.json` | `packages/theo/src/cli/commands/build.ts` | `grep writeManifest packages/theo/src/services packages/theo/src/cli` shows only the helper, not its caller |
| Node adapter doesn't generate docker-compose | `packages/theo/src/adapters/node.ts` | `grep generateComposeYaml packages/theo/src/adapters` → no match |
| Other 7 adapters don't reject `services: {}` non-empty | All 7 `packages/theo/src/adapters/*.ts` (vercel, cloudflare, aws-lambda, bun, deno-deploy, netlify, static) | `grep assertServicesUnsupported packages/theo/src/adapters` → no match |
| Vite plugin doesn't run typed-client gen | `packages/theo/src/vite-plugin/` | No `services-typed-client.ts` file |
| `create-theokit --backend python` does NOT inject `services:` in `theo.config.ts` of any template that doesn't have the field already | template defaults | `packages/create-theo/templates/default/theo.config.ts.tmpl` does not have `services` slot |

### What evidence motivates this NOW

- Plan v1.2 of `wave-2-polyglot-services-plan.md` already lists these wire-ups as acceptance criteria (T1.4 acceptance + T2.4 acceptance + T3.1-T3.4 acceptance + T5.1 acceptance) — explicitly pending
- The owner explicitly directed (2026-05-27) refocus to TheoCloud-first; this plan executes that refocus at the runtime layer
- Without the wire-ups, the 173 unit-tested helpers ship as dead code from a user-facing perspective. The plan v1.1/v1.2 "Final Dogfood QA" cannot pass — there's nothing to dogfood

## Objective

**Done = `npx create-theokit my-app --backend python && cd my-app && pnpm install && pnpm dev` boots TheoKit + uvicorn FastAPI side-by-side, browser at `localhost:3000` reaches `/api/agent/echo` via Vite proxy, response has `traceparent` correlated in service logs, `pnpm build --target node` emits `.theo/services.json` + `docker-compose.yml` + `Caddyfile`, `pnpm build --target vercel` fails with the actionable rejection error, Dogfood QA health ≥ 80 with zero plan-caused CRITICAL/HIGH issues.**

Measurable goals:

1. `cli/commands/dev.ts` invokes `orchestrateDev` BEFORE starting Vite when `config.services` is non-empty; signals readiness AFTER all healthchecks pass
2. `cli/commands/build.ts` invokes `buildManifest` + `writeManifest` so every build emits `.theo/services.json` (empty array when `config.services` is empty — Wave 1 BC preserved)
3. `adapters/node.ts` reads the manifest and emits `<dist>/docker-compose.yml` + `Caddyfile`
4. 7 other adapters (`vercel`, `cloudflare`, `aws-lambda`, `bun`, `deno-deploy`, `netlify`, `static`) invoke `assertServicesUnsupported` early in their `build()` and throw with the uniform message
5. New `vite-plugin/services-typed-client.ts` wires `generateTypedClient` per service in dev mode (best-effort; warn-only on failure)
6. Default scaffold template gets a `services: {}` slot in its `theo.config.ts.tmpl` (empty default; Wave 1 BC). `--backend python|node` flag causes `scaffoldServices` to populate it
7. 3 fixtures committed: `tests/fixtures/services-python-basic/`, `tests/fixtures/services-node-basic/`, `tests/fixtures/services-both/`
8. 1 Playwright E2E spec `tests/e2e/services-fullstack.spec.ts` exercises the full path (spawn + proxy + traceparent + typed client) using a mocked-but-real-port FastAPI fixture
9. `/cross-validation wave-2-completion` APROVADO before Dogfood
10. `/dogfood full` health ≥ 80 with zero plan-caused CRITICAL/HIGH issues

## ADRs

### D1 — Wire-up via early-return guard pattern

- **Decision:** Each integration point (`dev.ts`, `build.ts`, every adapter) gates the new behavior on `manifest.services.length > 0` (or `config.services` non-empty in `dev.ts` which reads config not manifest). When zero, the new code path is a NO-OP that preserves Wave 1 BC exactly.
- **Rationale:** Wave 1 users have empty `services: {}` (default). Any new code that runs unconditionally has a chance to regress Wave 1 behavior. Early-return makes the guarantee bytewise observable in tests.
- **Consequences:** ✅ Wave 1 BC is enforceable via tests asserting "with empty services, behavior is identical". ✅ The hot path for TS-only users has zero added overhead. ⚠️ Every wire-up site needs the same guard idiom — extract a `hasServices(config | manifest)` helper to avoid drift.

### D2 — Adapter rejection happens at the START of `build()`, not at the end

- **Decision:** The 7 non-supported adapters call `assertServicesUnsupported(this.name, manifest)` as the FIRST statement in their `build()` method, BEFORE invoking `viteBuild` or any other side-effect. Build fails fast.
- **Rationale:** A user running `pnpm build --target vercel` with a non-empty `services: {}` should get the rejection IMMEDIATELY, not after a 30-second Vite client+SSR build. Saves time, avoids partial artifacts.
- **Consequences:** ✅ Fast feedback. ✅ No partial `.theo/` artifacts on failure. ⚠️ The pattern must be enforced uniformly — a lint rule or pattern test in `tests/unit/adapter-rejection-uniform.test.ts` (T2.5) checks all 7.

### D3 — Vite plugin services-typed-client is OPT-IN, best-effort, warn-only

- **Decision:** `vite-plugin/services-typed-client.ts` wires `generateTypedClient` for each service with an `openapi` URL declared in `config.services`. Generation runs at Vite plugin `configureServer` hook + on file watcher tick (or periodic poll). FAILURE never blocks dev — only warns.
- **Rationale:** Hey API is a soft dep (T5.1 already handles missing module gracefully). The typed client is a developer-experience nicety, not a correctness invariant. Blocking dev on it would be a foot-gun.
- **Consequences:** ✅ Dev never gets stuck waiting on a network request to `localhost:8001/openapi.json`. ✅ Adds zero overhead when no service has `openapi` URL. ⚠️ Users must learn to `pnpm add -D @hey-api/openapi-ts` to opt in — documented in T6.2 concept doc update.

### D4 — Fixtures are minimal real projects, NOT testing-only DSLs; ports use 8101+ baseline but tests should NOT depend on exact port

- **Decision:** The 3 fixtures (`services-python-basic/`, `services-node-basic/`, `services-both/`) are real TheoKit projects with `theo.config.ts`, `app/page.tsx`, `package.json`, and the appropriate `services/agent-python/` or `services/agent-node/`. They can be opened in VSCode and dev'd interactively. **EC-2 fix: fixture `theo.config.ts` declares concrete ports (8101–8104) for HUMAN-RUNNABLE dev, but integration tests that invoke `startDevServer(FIXTURE)` MUST tolerate port collisions by either: (a) using `port: 0` override at the test layer via `startDevServer(FIXTURE, { port: 0 })` for TheoKit's web port, AND (b) accepting that service ports stay fixed (CI runs serial; humans only run one fixture at a time).**
- **Rationale:** Test-only fixtures rot. Real fixtures are dogfooded by the test harness AND by humans validating manually. Same pattern as `fixtures/template-default/` and `fixtures/theoui-autoinject/`. Port `0` is reserved for the Vite web port (test-time); service ports are fixed for predictability — port collisions across fixtures are mitigated by SERIAL test execution (vitest default within a file) and unique port allotment per fixture.
- **Consequences:** ✅ Cross-validation can run them interactively. ✅ Bugs surface in realistic shapes. ✅ EC-2 mitigated by serial-test convention + port allotment. ⚠️ Each fixture needs `package.json` workspace registration in `pnpm-workspace.yaml` so the framework's `@theo` packages resolve (same pattern as the recently-fixed theoui-autoinject). ⚠️ If CI is configured to run fixture tests in parallel within a single Vitest pool, port collisions will resurface — document the constraint in T0.2.

### D5 — Playwright spec uses a Python service spawned by the test harness, NOT a long-running mock

- **Decision:** `tests/e2e/services-fullstack.spec.ts` uses the `services-python-basic` fixture. Playwright's `beforeAll` invokes `orchestrateDev` directly (or `startDevServer` which will then invoke orchestrateDev after T1.1 wire-up). Tests assert the full flow: spawn → healthcheck pass → request from page → proxy hop → service response → traceparent in service stdout.
- **Rationale:** Mocking the service defeats the purpose of E2E. The point IS to validate the spawn-and-proxy machinery against a real subprocess. The price is `python` must be in CI PATH; uvicorn must `pip install` — documented prerequisite.
- **Consequences:** ✅ Real validation. ✅ Catches race conditions, port collisions, healthcheck-poll edge cases. ⚠️ CI needs Python 3.11+ + uv (or pip + uvicorn directly). Test marked `.skipIf(noPython)` to allow local-dev skip when env doesn't have Python.

### D6 — `services-both` fixture validates dependsOn ordering empirically

- **Decision:** The `services-both` fixture declares Python + Node services where `node.dependsOn: ['agent']`. Test asserts `node` healthcheck starts polling AFTER `agent` is healthy (or after both have spawned — depending on orchestrator semantics).
- **Rationale:** Topological order is unit-tested in `manifest.ts` (T1.4), but the actual spawn ordering is integration behavior. The fixture catches drift.
- **Consequences:** ✅ Real ordering verified. ⚠️ Test execution time grows — the slowest of the two healthchecks gates the test.

### D7 — Cross-validation runs BEFORE Dogfood; Dogfood is the final gate

- **Decision:** Phase 6 has TWO sub-phases: cross-validation (line-by-line match plan ↔ code) THEN dogfood (real-world smoke). The plan is not done until BOTH pass.
- **Rationale:** Per `to-plan` skill instructions. Cross-validation catches plan drift; Dogfood catches user-facing breakage.
- **Consequences:** ✅ Two independent gates. ⚠️ Each can fail independently; both must pass.

## Dependency Graph

```
Phase 0 — Preflight + workspace pre-reqs
   │
   ├──▶ Phase 1 — CLI wire-up (dev.ts + build.ts)
   │       │
   │       ├──▶ Phase 2 — Adapter wire-up (node + 7 rejection)
   │       │       │
   │       │       └──▶ Phase 4 — Fixtures (depend on adapters emitting compose)
   │       │
   │       ├──▶ Phase 3 — Vite plugin typed-client (depends on dev wire-up)
   │       │
   │       └──▶ Phase 4 — Fixtures (start in parallel after Phase 1)
   │
   └──▶ (independent) Phase 4 fixture skeletons (initial scaffolding)


Phase 4 ──▶ Phase 5 — Playwright E2E (needs fixtures + dev wire-up)
                │
                └──▶ Phase 6 — Cross-validation + Dogfood QA (final gate)
```

**Parallel-safe:**
- Phase 2 and Phase 3 can run in parallel after Phase 1 lands
- Phase 4 fixture skeletons can start anytime; their final wiring waits on Phase 2 (adapters)

**Sequential blockers:**
- Phase 0 → Phase 1 (preflight green before any code)
- Phase 1 → Phase 2/3/4 (CLI integration is the foundation)
- Phase 4 → Phase 5 (fixtures must exist)
- All implementation → Phase 6 (validation)

---

## Phase 0: Preflight + Workspace Pre-Reqs

**Objective:** Confirm the 173-test Wave 2 baseline is intact, the full suite is at 3069 passing / 0 failing, and the 3 future fixtures' parent paths are workspace-registered so `@usetheo/sdk` and `theokit` resolve when fixtures are added.

### T0.1 — Verify Wave 2 baseline is green

#### Objective
Re-run unit tests + lint + typecheck and confirm 3069/0/7 (passing/failing/skipped).

#### Evidence
[`docs/audit/phase-0-typecheck-pre-flight-wave-2-2026-05-27.md`](../audit/phase-0-typecheck-pre-flight-wave-2-2026-05-27.md) recorded the baseline. We re-verify because the working tree has 96 uncommitted changes from the prior session.

#### Files to edit
```
docs/audit/phase-0-completion-preflight-{YYYY-MM-DD}.md  (NEW)
```

#### Deep file dependency analysis
- Audit doc is observation-only.
- Re-runs `pnpm typecheck`, `pnpm lint`, `pnpm test` and captures the result.

#### Deep Dives
- Expected: 3069 passing, 7 skipped, 0 failing (post theoui-autoinject fix).
- Pre-existing skips (7) are framework-zero-config polish + storage modules legacy markers — unrelated.

#### Tasks
1. Run `pnpm typecheck`
2. Run `pnpm lint`
3. Run `pnpm test`
4. Run `pnpm --filter theokit build`
5. Capture results in audit doc
6. If ANY check fails: STOP, fix, re-run

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     preflight_typecheck_clean() — Given current HEAD, When pnpm typecheck runs, Then exit 0
RED:     preflight_lint_clean() — Given current HEAD, When pnpm lint runs, Then exit 0
RED:     preflight_tests_zero_failing() — Given current HEAD, When pnpm test runs, Then 0 failing
RED:     preflight_baseline_documented() — Given preflight ran, When audit doc is opened, Then it lists pass/fail counts
GREEN:   Run all 4 checks. Write audit doc.
REFACTOR: None.
VERIFY:  test -f docs/audit/phase-0-completion-preflight-*.md
```

BDD scenarios:
- **Happy path:** all 4 green
- **Validation error:** N/A (observational)
- **Edge case:** flaky test → re-run once before flagging
- **Error scenario:** typecheck regressed → STOP, fix root cause, re-run

#### Acceptance Criteria
- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm test` 0 failing
- [ ] `pnpm --filter theokit build` exit 0
- [ ] Audit doc committed

#### DoD
- [ ] Green baseline documented
- [ ] Phase 1 unblocked

---

### T0.2 — Register fixture parents in `pnpm-workspace.yaml`

#### Objective
Add `fixtures/services-python-basic`, `fixtures/services-node-basic`, `fixtures/services-both` to `pnpm-workspace.yaml` so future `pnpm install` resolves their `theokit` / `@usetheo/sdk` references.

#### Evidence
Recent fix to `theoui-autoinject` — adding it to the workspace was the root cause of 3 pre-existing failures. Same precedent applies: fixtures need workspace registration.

#### Files to edit
```
pnpm-workspace.yaml — add 3 fixture paths under `packages:`
```

#### Deep file dependency analysis
- `pnpm-workspace.yaml` is the source of truth for which sub-projects pnpm resolves. Adding paths NOW prevents Phase 4 fixture creation from hitting "module not found" surprises.

#### Deep Dives
The fixtures will not exist on disk yet — pnpm tolerates missing workspace members (warns but proceeds). When Phase 4 creates them, pnpm install picks them up.

#### Tasks
1. Edit `pnpm-workspace.yaml` adding 3 lines under `packages:`
2. Add comment block reserving port range **8100–8199** for service-fixture use (EC-2): "Fixture service ports are 8101 (python-basic), 8102 (node-basic), 8103/8104 (both). Tests that spawn these MUST run serial within the same Vitest file."
3. Run `pnpm install` to confirm no resolution errors

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     workspace_yaml_registers_services_fixtures() — Given pnpm-workspace.yaml is read, Then it contains 'fixtures/services-python-basic', 'fixtures/services-node-basic', 'fixtures/services-both'
RED:     pnpm_install_succeeds_with_missing_fixtures() — Given the 3 fixtures don't exist yet, When pnpm install runs, Then exit 0 (pnpm warns but tolerates)
RED:     workspace_yaml_comment_explains_why() — Given the file is read, Then the entries have a comment block explaining "fixtures added pre-emptively for Wave 2 completion plan T0.2"
GREEN:   Edit YAML, add comment, run pnpm install.
REFACTOR: None.
VERIFY:  grep -q services-python-basic pnpm-workspace.yaml && pnpm install
```

BDD scenarios:
- **Happy path:** YAML edit + install = green
- **Validation error:** N/A
- **Edge case:** fixture directory exists from a previous abandoned attempt → pnpm install still works (will find it)
- **Error scenario:** pnpm version mismatch → upgrade pnpm, re-run

#### Acceptance Criteria
- [ ] `pnpm-workspace.yaml` lists the 3 fixture paths
- [ ] Comment explains the pre-emptive registration
- [ ] `pnpm install` exits 0

#### DoD
- [ ] Fixture paths registered; Phase 4 can scaffold without pnpm friction

---

## Phase 1: CLI Wire-Up

**Objective:** `theokit dev` boots polyglot services BEFORE Vite when `config.services` is non-empty. `theokit build` always emits `.theo/services.json` (empty array when services is empty — Wave 1 BC).

### T1.1 — Wire `orchestrateDev` into `cli/commands/dev.ts`

#### Objective
Modify `startDevServer` to invoke `orchestrateDev` after `loadConfig` and BEFORE `createServer` returns. Healthcheck poller blocks readiness. On any service unhealthy, exit with actionable error.

#### Evidence
Plan v1.1/v1.2 T2.4 acceptance criterion. `grep orchestrateDev packages/theo/src/cli/commands/dev.ts` shows zero matches today.

#### Files to edit
```
packages/theo/src/cli/commands/dev.ts — wire orchestrator (MODIFY)
tests/integration/services-dev-wireup.test.ts — assert wire-up works (NEW)
```

#### Deep file dependency analysis
- `dev.ts` imports `loadConfig`, `loadEnv`, `validateProjectStructure`, `theoPluginAsync`, `createServer`. Wave 2 wire-up adds: `orchestrateDev` from `../../services/orchestrator.js`.
- `orchestrateDev` already accepts `cwd`, `services`, `customFetch`, `spawnFn`, `installSignalHandlers`. We pass `cwd` + `config.services` + production defaults (no test injection).
- Downstream: any code that awaits `startDevServer(cwd, options)` now gets the same return value, just AFTER services healthchecks. Backward compatible when `services: {}` is empty (early-return).

#### Deep Dives

**Wire-up shape:**

```ts
// In startDevServer, after loadConfig + loadEnv + validateProjectStructure
const orchestration = await orchestrateDev({
  cwd,
  services: config.services,  // empty {} → returns immediately with allHealthy:true
  // no test injections in production
})
if (!orchestration.allHealthy) {
  // stop already-spawned services + actionable error
  await orchestration.stop()
  throw new Error(
    `[services] services failed healthcheck: ${orchestration.unhealthy.join(', ')}. ` +
      `Check that each declared service binds its port and responds 200 on its healthcheck path within 30s.`,
  )
}
// continue to createServer + return — also wire orchestration.stop() into the
// returned server's close() so SIGINT/process exit also stops services
```

**Invariants:**
- Empty `services: {}` → orchestrateDev returns `allHealthy: true, spawned: []` immediately → dev startup behavior is IDENTICAL to Wave 1.
- Non-empty `services: {}` → spawn → healthcheck → fail-fast if any unhealthy.
- The returned Vite server's lifecycle MUST also stop services on close. **EC-1 fix: use Node-native `server.httpServer?.on('close', () => { void orchestration.stop() })` — DO NOT mutate `server.close` (fragile across Vite upgrades).** The `httpServer` is `http.Server | null` per Vite's public API.

**Edge cases:**
- A service's `dev` command exits immediately (e.g., typo in command) → orchestrator's onExit callback fires → log warning; healthcheck times out → throw.
- User Ctrl+C during healthcheck poll → `installLifecycleHandlers` (already in orchestrator) handles SIGINT.
- Vite createServer throws AFTER services started → orchestration.stop() must still run; use try/finally in dev.ts.

#### Tasks
1. Import `orchestrateDev` from `services/orchestrator.js`
2. Add call after `loadConfig` + before `createServer`
3. Wrap the rest of dev startup in try/finally so failures stop services
4. Attach `orchestration.stop()` to the returned server's lifecycle via `server.httpServer?.on('close', ...)` (EC-1: do NOT mutate `server.close`)
5. Add integration test `services-dev-wireup.test.ts` asserting:
   - Empty services → wire is a no-op (no spawn, no healthcheck call observable)
   - Non-empty services → orchestrateDev is invoked
6. Update related types if needed

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dev_wireup_empty_services_no_spawn() — Given fixture without services config, When startDevServer runs, Then no child_process.spawn calls (verify via stub or absence of side-effect)
RED:     dev_wireup_non_empty_services_orchestrates() — Given fixture with services.agent (python), When startDevServer runs with stubbed orchestrator, Then orchestrateDev was called with that services config
RED:     dev_wireup_unhealthy_throws_actionable() — Given a service that never becomes healthy, When startDevServer runs with healthcheckTimeoutMs=200, Then throws with message naming the service AND mentions healthcheck path
RED:     dev_wireup_server_close_stops_services() — Given dev started 2 services, When the returned server's close() is invoked, Then orchestration.stop() is called (services killed) — VERIFIES via server.httpServer.on('close') hook, NOT server.close mutation
RED:     dev_wireup_does_not_mutate_server_close_EC1() — Given startDevServer returned, When typeof server.close is inspected, Then it is the SAME function reference as a freshly-created Vite server (no monkey-patch)
GREEN:   Wire orchestrateDev. Attach lifecycle via server.httpServer.on('close'). Write integration test.
REFACTOR: Extract any utility for stop-on-throw if duplicated.
VERIFY:  npx vitest run tests/integration/services-dev-wireup.test.ts
```

BDD scenarios:
- **Happy path:** healthy services → dev starts normally
- **Validation error:** invalid `services` config (caught upstream by Zod) → loadConfig throws first
- **Edge case:** empty `services: {}` → no-op (Wave 1 BC)
- **Error scenario:** unhealthy service → fail-fast with actionable error AND cleanup spawned children

#### Acceptance Criteria
- [ ] `cli/commands/dev.ts` imports and calls `orchestrateDev`
- [ ] Empty services preserves Wave 1 behavior (snapshot/golden test)
- [ ] Non-empty services blocks readiness on healthchecks
- [ ] Server.close also stops services
- [ ] All 4 RED tests green
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `pnpm lint` zero warnings

#### DoD
- [ ] `pnpm dev` boots services end-to-end (manual smoke OK; the Playwright spec in Phase 5 is the automated proof)
- [ ] Wave 1 fixture `template-default` still boots identically

---

### T1.2 — Wire `writeManifest` into `cli/commands/build.ts`

#### Objective
Modify `build.ts` to invoke `buildManifest(config.services)` and `writeManifest(cwd, manifest)` after `loadConfig` and BEFORE invoking the adapter. The adapter reads the manifest back via `readManifest`.

#### Evidence
Plan v1.1/v1.2 T1.4 acceptance criterion. `grep writeManifest packages/theo/src/cli/commands/build.ts` → no match.

#### Files to edit
```
packages/theo/src/cli/commands/build.ts — invoke buildManifest + writeManifest (MODIFY)
tests/integration/services-build-manifest-emit.test.ts — assert emission (NEW)
```

#### Deep file dependency analysis
- `build.ts` imports `loadConfig`, `generateManifest` (route manifest — different concept), `writeManifest` (also different — for route manifest). To avoid naming collision: import `buildManifest as buildServicesManifest` and `writeManifest as writeServicesManifest` from `../../services/manifest.js`.
- Downstream: adapters (T2.x) read `<cwd>/.theo/services.json` via `readManifest`. Without T1.2, adapters always read null.

#### Deep Dives

**Wire-up shape:**

```ts
import {
  buildManifest as buildServicesManifest,
  writeManifest as writeServicesManifest,
} from '../../services/manifest.js'

// In the build function, after loadConfig:
const servicesManifest = buildServicesManifest(config.services)
writeServicesManifest(cwd, servicesManifest)
```

**Invariants:**
- Always emit, even when `services: {}` is empty (manifest has `services: []` then). Keeps adapter logic simple — they always read; never special-case "manifest exists or not".
- Topological order preserved (handled inside `buildManifest`).
- File at `<cwd>/.theo/services.json`.

**Edge cases:**
- `.theo/` does not exist → `writeManifest` calls `mkdirSync(recursive: true)` (EC-6 covered in T1.4 unit tests).
- Concurrent builds (rare in CI; impossible locally) → last writer wins (acceptable; same as route manifest).

#### Tasks
1. Import the services manifest helpers
2. Add call after `loadConfig` + before adapter selection
3. Add integration test asserting the file is emitted

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     build_emits_empty_manifest_for_wave1_apps() — Given fixture with services: {} (empty), When pnpm build runs, Then <cwd>/.theo/services.json exists and { version: 1, services: [] }
RED:     build_emits_populated_manifest_for_wave2_apps() — Given fixture with services.agent (python), When pnpm build runs, Then services.json has one entry named 'agent'
RED:     build_creates_theo_dir_if_absent() — Given fresh project without .theo/, When build runs, Then .theo/ is created and services.json inside
RED:     build_manifest_topological_order() — Given services with dependsOn relations, When pnpm build runs, Then manifest array order matches topological sort
GREEN:   Wire buildServicesManifest + writeServicesManifest into build.ts.
REFACTOR: None.
VERIFY:  npx vitest run tests/integration/services-build-manifest-emit.test.ts
```

BDD scenarios:
- **Happy path:** services declared → manifest emitted with entries
- **Validation error:** N/A (validation happens in loadConfig via Zod)
- **Edge case:** empty services → manifest emitted with `services: []` (consistency)
- **Error scenario:** writeFile permission denied → propagate fs error with cwd path

#### Acceptance Criteria
- [ ] `cli/commands/build.ts` invokes services manifest emit
- [ ] All 4 RED tests green
- [ ] Wave 1 fixture build still produces the route manifest (no regression on the existing `generateManifest`)
- [ ] Pass: typecheck + lint

#### DoD
- [ ] `pnpm build` always emits `.theo/services.json` (empty array or populated)
- [ ] Phase 2 adapters have a manifest to consume

---

## Phase 2: Adapter Wire-Up

**Objective:** `node` adapter emits docker-compose + Caddyfile from manifest. All 7 other adapters reject `services: {}` non-empty with the uniform actionable message.

### T2.1 — Wire `generateComposeYaml` + `generateCaddyfile` into `adapters/node.ts`

#### Objective
After Vite build, if manifest has services, emit `<dist>/docker-compose.yml` + `<dist>/Caddyfile` using the existing generators.

#### Evidence
Plan v1.2 T3.3 acceptance. `grep generateComposeYaml packages/theo/src/adapters` → no match.

#### Files to edit
```
packages/theo/src/adapters/node.ts — emit compose + Caddyfile (MODIFY)
tests/integration/services-node-adapter-emit.test.ts — snapshot the emitted files (NEW)
```

#### Deep file dependency analysis
- `node.ts` builds the client + (optionally) SSR. Wave 2 wire-up appends: read manifest, generate compose + Caddyfile, write to `<dist>/`.
- The fixtures in Phase 4 will use this output.

#### Deep Dives

**Wire-up shape:**

```ts
import { readManifest } from '../services/manifest.js'
import { generateComposeYaml } from '../services/compose-generator.js'
import { generateCaddyfile } from '../services/caddy-generator.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// At the end of nodeAdapter.build():
const manifest = readManifest(cwd)
if (manifest && manifest.services.length > 0) {
  const yaml = generateComposeYaml(manifest, { webPort: config.port })
  const caddyfile = generateCaddyfile(manifest, { port: config.port, webHost: 'web' })
  writeFileSync(join(cwd, '.theo', 'docker-compose.yml'), yaml)
  writeFileSync(join(cwd, '.theo', 'Caddyfile'), caddyfile)
}
```

**Invariants:**
- Empty manifest → DO NOT emit compose/Caddyfile (preserves Wave 1 `theokit build --target node` output exactly).
- Non-empty manifest → emit BOTH files. They go together (compose references Caddyfile via volume mount).

**Edge cases:**
- Manifest is null (pre-T1.2 builds without the wire-up) → no-op.
- Existing `.theo/docker-compose.yml` from a prior build → overwrite (Wave 2 is the source of truth).

#### Tasks
1. Import the 2 generators + `readManifest`
2. Add the conditional emission at end of `nodeAdapter.build`
3. Snapshot tests asserting the emitted YAML and Caddyfile match expected shapes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     node_adapter_empty_services_no_compose() — Given fixture with services: {}, When nodeAdapter.build runs, Then .theo/docker-compose.yml does NOT exist (Wave 1 BC)
RED:     node_adapter_python_emits_compose() — Given fixture with python service, When build runs, Then .theo/docker-compose.yml exists AND contains 'caddy:' AND 'web:' AND 'agent:'
RED:     node_adapter_emits_caddyfile_with_tracing() — Given fixture with python service, When build runs, Then .theo/Caddyfile exists AND contains 'tracing'
RED:     node_adapter_multi_service_compose() — Given fixture with python+node services, When build runs, Then compose has 3 entries (caddy + web + 2 services)
GREEN:   Wire generators into nodeAdapter.build.
REFACTOR: Extract the emission to a helper if more adapters need it later (just node for Wave 2).
VERIFY:  npx vitest run tests/integration/services-node-adapter-emit.test.ts
```

BDD scenarios:
- **Happy path:** services → compose + Caddyfile emitted
- **Validation error:** N/A
- **Edge case:** empty services → no compose (Wave 1 BC)
- **Error scenario:** writeFile fails (disk full) → propagate fs error

#### Acceptance Criteria
- [ ] node adapter emits compose + Caddyfile when manifest non-empty
- [ ] Wave 1 builds unaffected (no compose file)
- [ ] 4 RED tests green
- [ ] Pass: typecheck + lint

#### DoD
- [ ] `pnpm build --target node` produces a runnable docker-compose stack (manual `docker compose up` validation in Phase 5 fixture / Phase 6 dogfood)

---

### T2.2 — Wire `assertServicesUnsupported` into 7 non-supported adapters

#### Objective
Each of `vercel`, `cloudflare`, `aws-lambda`, `bun`, `deno-deploy`, `netlify`, `static` calls `assertServicesUnsupported(this.name, readManifest(cwd))` as the FIRST statement in their `build()` method.

#### Evidence
Plan v1.2 T3.4 amplified. `grep assertServicesUnsupported packages/theo/src/adapters` → no match.

#### Files to edit
```
packages/theo/src/adapters/vercel.ts — call assertServicesUnsupported (MODIFY)
packages/theo/src/adapters/cloudflare.ts — same (MODIFY)
packages/theo/src/adapters/aws-lambda.ts — same (MODIFY)
packages/theo/src/adapters/bun.ts — same (MODIFY)
packages/theo/src/adapters/deno-deploy.ts — same (MODIFY)
packages/theo/src/adapters/netlify.ts — same (MODIFY)
packages/theo/src/adapters/static.ts — same (MODIFY)
tests/integration/services-other-adapters-reject.test.ts — pattern test (NEW)
```

#### Deep file dependency analysis
- Each adapter's `build()` method gains a 1-line guard. The function signature is unchanged. Downstream callers (CLI invoking adapter) see the throw and propagate.

#### Deep Dives

**Wire-up shape (identical in each adapter):**

```ts
import { assertServicesUnsupported } from '../services/adapter-support.js'
import { readManifest } from '../services/manifest.js'

export const vercelAdapter: DeployAdapter = {
  name: 'vercel',
  async build(config, cwd) {
    assertServicesUnsupported('vercel', readManifest(cwd))  // ← NEW first line
    // ... existing build code unchanged
  }
}
```

**Invariants (D2):**
- The call is the FIRST statement — no Vite build, no fs writes, no side effects before the throw.
- Manifest is null OR empty → no-op (Wave 1 BC: these adapters still build normally for TS-only apps).

**Edge cases:**
- Fresh project that never ran `pnpm build` before (no manifest file) → `readManifest` returns null → assert passes (no-op).
- T1.2 ran first → manifest exists with empty `services` → assert passes (no-op).
- T1.2 ran with non-empty services → assert throws → adapter exits early without Vite build.

#### Tasks
1. Edit each of 7 adapters: add import + add first-line call
2. Add pattern test that asserts ALL 7 adapters reject by importing each adapter, running it on a non-empty manifest, asserting throw

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     vercel_rejects_non_empty_services() — Given manifest with python service, When vercelAdapter.build, Then throws with 'vercel' in message
RED:     cloudflare_rejects_non_empty_services() — Same for cloudflare adapter
RED:     aws_lambda_rejects() — Same for aws-lambda
RED:     bun_rejects() — Same for bun
RED:     deno_deploy_rejects() — Same for deno-deploy
RED:     netlify_rejects() — Same for netlify
RED:     static_rejects() — Same for static
RED:     all_7_rejections_share_actionable_message() — Given non-empty manifest, When EACH of 7 adapters is built, Then the error message contains 'node (local)', 'theo-cloud', AND '--target node'
RED:     wave1_compatibility_preserved() — Given empty services manifest, When EACH of 7 adapters is built, Then NO throw (fall through to existing build code)
GREEN:   Edit 7 files. Add pattern test.
REFACTOR: Consider extracting a helper to avoid the 1-liner repetition, OR keep inline for grep-ability.
VERIFY:  npx vitest run tests/integration/services-other-adapters-reject.test.ts
```

BDD scenarios:
- **Happy path:** empty services → all 7 adapters build normally
- **Validation error:** N/A
- **Edge case:** manifest never emitted → null → no-op (handled in `assertServicesUnsupported`)
- **Error scenario:** non-empty services → uniform reject with adapter name + alternatives + `--target node` pointer

#### Acceptance Criteria
- [ ] All 7 adapters call `assertServicesUnsupported` as first statement of `build()`
- [ ] Pattern test asserts uniformity across all 7
- [ ] Wave 1 builds (empty services) unchanged
- [ ] Pass: typecheck + lint

#### DoD
- [ ] `pnpm build --target vercel` with non-empty services fails immediately with actionable error
- [ ] Every adapter has the gate

---

### T2.3 — Wire `prepareTheoCloudArtifacts` (stub) into a new `adapters/theo-cloud.ts`

#### Objective
Create `packages/theo/src/adapters/theo-cloud.ts` consuming the manifest via the Wave 2 stub. Register in `VALID_TARGETS`. Wave 3 will populate real K8s output; Wave 2 ships a noop that succeeds + logs "TheoCloud adapter Wave 3 deliverable".

#### Evidence
Plan v1.2 T3.5 (new). The stub `theo-cloud-adapter-stub.ts` already exists in `services/`; this task creates the adapter glue that registers it as a build target.

#### Files to edit
```
packages/theo/src/adapters/theo-cloud.ts — NEW
packages/theo/src/adapters/types.ts — add 'theo-cloud' to BuildTarget + VALID_TARGETS (MODIFY)
tests/integration/services-theo-cloud-adapter.test.ts — assert registration + stub behavior (NEW)
```

#### Deep file dependency analysis
- New adapter file follows the same `DeployAdapter` interface as the other 8.
- `types.ts` adds the new target to the union AND the runtime list.
- CLI build command (existing) reads `--target` and matches against `VALID_TARGETS`; adding the entry is sufficient for the flag to be accepted.

#### Deep Dives

**Wire-up shape:**

```ts
// packages/theo/src/adapters/theo-cloud.ts
import type { TheoConfig } from '../config/schema.js'
import { readManifest } from '../services/manifest.js'
import { prepareTheoCloudArtifacts } from '../services/theo-cloud-adapter-stub.js'
import type { DeployAdapter } from './types.js'

export const theoCloudAdapter: DeployAdapter = {
  name: 'theo-cloud',
  async build(_config: TheoConfig, cwd: string): Promise<void> {
    const manifest = readManifest(cwd)
    const artifacts = prepareTheoCloudArtifacts(manifest)
    // Wave 2 stub: log + exit. Wave 3 will populate K8s/Helm output here.
    console.log(  // eslint-disable-line no-console -- CLI build progress
      `[theo-cloud] Wave 2 stub: validated manifest schemaVersion=${String(artifacts.manifestVersion)}, ` +
      `services=${artifacts.services.length === 0 ? 'none' : artifacts.services.join(',')}. ` +
      `K8s emission ships in Wave 3.`,
    )
  }
}
```

**Invariants:**
- The stub never throws (except the schemaVersion guard already in `prepareTheoCloudArtifacts`).
- The adapter is registered in `VALID_TARGETS` so `--target theo-cloud` is accepted at CLI level.
- Wave 3 takes over the body; this task is scaffolding only.

**Edge cases:**
- Manifest absent → stub returns empty services list → adapter logs "none".
- Manifest with unsupported schemaVersion → stub throws (test covers this).

#### Tasks
1. Create `theo-cloud.ts` with the stub-using adapter
2. Modify `types.ts` to add `'theo-cloud'` to union + `VALID_TARGETS`
3. Wire it into the adapter registry in `cli/commands/build.ts` (`switch (target)` or similar)
4. Add integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     theo_cloud_adapter_registered_in_valid_targets() — Given the VALID_TARGETS array, Then 'theo-cloud' is included
RED:     theo_cloud_adapter_no_throw_on_empty_services() — Given empty services manifest, When theoCloudAdapter.build runs, Then no throw
RED:     theo_cloud_adapter_logs_wave3_marker() — Given any manifest, When build runs, Then stdout contains 'Wave 2 stub' or 'Wave 3' marker (proof this is the placeholder, not the final adapter)
RED:     theo_cloud_adapter_throws_on_bad_schema() — Given a manifest forged with version=99, When build runs, Then throws (forward-compat guard from prepareTheoCloudArtifacts)
RED:     cli_accepts_target_theo_cloud() — Given build.ts is invoked with --target theo-cloud, Then the adapter is selected and runs
GREEN:   Create adapter file, edit types.ts, wire into build.ts switch.
REFACTOR: None.
VERIFY:  npx vitest run tests/integration/services-theo-cloud-adapter.test.ts
```

BDD scenarios:
- **Happy path:** `--target theo-cloud` works, logs stub message
- **Validation error:** N/A (validation upstream in Zod / VALID_TARGETS)
- **Edge case:** empty services → stub logs "none"
- **Error scenario:** bad manifest schemaVersion → throws

#### Acceptance Criteria
- [ ] `adapters/theo-cloud.ts` exists with the stub-driven adapter
- [ ] `types.ts` lists `'theo-cloud'`
- [ ] CLI `--target theo-cloud` is accepted and invokes the adapter
- [ ] All 5 RED tests green
- [ ] Pass: typecheck + lint

#### DoD
- [ ] Wave 3 has a wire point ready
- [ ] The full adapter list is: node, vercel, cloudflare, aws-lambda, bun, deno-deploy, netlify, static, theo-cloud (9 total)

---

## Phase 3: Vite Plugin — Typed Client (Hey API)

**Objective:** `vite-plugin/services-typed-client.ts` runs `generateTypedClient` per declared service with `openapi` URL when dev starts. Best-effort, warn-only on failure.

### T3.1 — Create `services-typed-client.ts` Vite plugin

#### Objective
Implement a Vite plugin that, in dev mode, runs `generateTypedClient` for each service with an `openapi` URL. Writes generated TS to `<cwd>/clients/<service-name>.ts`. Failure NEVER blocks dev.

#### Evidence
Plan v1.1/v1.2 T5.1 acceptance. No `services-typed-client.ts` file exists in `vite-plugin/`.

#### Files to edit
```
packages/theo/src/vite-plugin/services-typed-client.ts — NEW
packages/theo/src/vite-plugin/index.ts — wire the new plugin (MODIFY)
tests/integration/services-typed-client-plugin.test.ts — assert plugin invokes generator (NEW)
```

#### Deep file dependency analysis
- New plugin reads `config.services` from a config-injection mechanism (theoPlugin already accepts config in its factory).
- Imports `generateTypedClient` from `services/openapi-client-gen.js`.
- Vite plugin lifecycle: `configureServer` hook runs once per dev session; we use this to fire-and-forget per service.

#### Deep Dives

**Plugin shape:**

```ts
import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import type { ServicesConfig } from '../services/types.js'
import { generateTypedClient } from '../services/openapi-client-gen.js'

export function servicesTypedClientPlugin(opts: {
  cwd: string
  services: ServicesConfig
}): Plugin {
  return {
    name: 'theokit:services-typed-client',
    apply: 'serve',  // dev-only
    configureServer(_server) {
      // Fire-and-forget per service — never blocks
      for (const [name, def] of Object.entries(opts.services)) {
        if (!def.openapi) continue
        // Re-shape ServiceDefinition into ManifestServiceEntry for the gen API
        const entry = { ...def, name }
        void generateTypedClient({
          service: entry,
          outputDir: resolve(opts.cwd, 'clients'),
          log: (level, msg) => {
            // eslint-disable-next-line no-console
            console[level === 'error' ? 'error' : 'log'](`[services-typed-client] ${msg}`)
          },
        })
      }
    },
  }
}
```

**Invariants:**
- Plugin runs ONLY in dev (`apply: 'serve'`).
- Empty services OR no service has `openapi` → no-op.
- generateTypedClient never throws (already guaranteed by T5.1 implementation).

**Edge cases:**
- Service not yet running when plugin fires → fetch fails → warn, skip.
- `@hey-api/openapi-ts` not installed → soft-skip with warning (already handled by generateTypedClient).

#### Tasks
1. Create the plugin
2. Wire into theoPlugin or theoPluginAsync (whichever is the entry point)
3. Add integration test using a stubbed customFetch + stubbed import that proves the generator was invoked

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     plugin_returns_vite_plugin_shape() — When servicesTypedClientPlugin({cwd, services:{}}) is called, Then the return has name 'theokit:services-typed-client' and apply 'serve'
RED:     plugin_no_op_when_services_empty() — Given services: {}, When configureServer fires, Then generateTypedClient is NOT called
RED:     plugin_skips_services_without_openapi() — Given services.agent without openapi URL, When configureServer fires, Then generateTypedClient was NOT called (or called with skip result)
RED:     plugin_invokes_generator_per_openapi_service() — Given services.agent with openapi URL, When configureServer fires, Then generateTypedClient is called exactly once with that service
RED:     plugin_does_not_throw_on_generator_failure() — Given generateTypedClient (stubbed) throws, When configureServer fires, Then no exception propagates out of the hook
GREEN:   Implement plugin + wire into theoPlugin.
REFACTOR: None.
VERIFY:  npx vitest run tests/integration/services-typed-client-plugin.test.ts
```

BDD scenarios:
- **Happy path:** service with openapi → generator runs
- **Validation error:** N/A
- **Edge case:** empty services OR service without openapi → no-op
- **Error scenario:** generator throws → swallowed; dev continues

#### Acceptance Criteria
- [ ] Plugin exists and is wired into the dev pipeline
- [ ] 5 RED tests green
- [ ] Plugin is dev-only (`apply: 'serve'`)
- [ ] Pass: typecheck + lint

#### DoD
- [ ] User running `pnpm dev` with a Python service that exposes OpenAPI gets `clients/agent.ts` written (manual smoke OK; Phase 5 Playwright covers automation)

---

## Phase 4: Fixtures

**Objective:** 3 fixtures — minimal real TheoKit apps — exercise the full Wave 2 surface. Each is workspace-registered (per T0.2), can be opened in VSCode, and runs dev/build manually.

### T4.1 — `tests/fixtures/services-python-basic/` fixture

#### Objective
Smallest possible TheoKit app + 1 Python FastAPI service. `theo.config.ts` declares it. `app/page.tsx` renders something. Used by Phase 5 Playwright spec.

#### Evidence
Plan v1.1/v1.2 mandates 3 fixtures. None exist today.

#### Files to edit
```
tests/fixtures/services-python-basic/package.json — NEW
tests/fixtures/services-python-basic/theo.config.ts — NEW
tests/fixtures/services-python-basic/index.html — NEW
tests/fixtures/services-python-basic/app/page.tsx — NEW
tests/fixtures/services-python-basic/services/agent-python/main.py — NEW (FastAPI)
tests/fixtures/services-python-basic/services/agent-python/pyproject.toml — NEW
tests/fixtures/services-python-basic/services/agent-python/README.md — NEW
tests/fixtures/services-python-basic/server/routes/health.ts — NEW (TheoKit /api/health)
tests/integration/fixture-services-python-basic.test.ts — NEW
```

#### Deep file dependency analysis
- Pattern follows `fixtures/template-default/` and `fixtures/theoui-autoinject/`.
- `package.json` lists `theokit` (workspace) — workspace already registered in T0.2.
- Python service: 1 healthcheck + 1 echo endpoint, JSON-line logs, traceparent middleware.

#### Deep Dives

**`theo.config.ts`:**

```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  services: {
    agent: {
      runtime: 'python',
      port: 8101,  // unique to avoid clashes with other fixtures
      proxy: '/api/agent',
      dev: 'uv run uvicorn main:app --reload --port 8101',
      start: 'uv run uvicorn main:app --port 8101 --workers 4',
      healthcheck: '/health',
      openapi: 'http://localhost:8101/openapi.json',
    },
  },
})
```

**Invariants:**
- Unique port per fixture to avoid CI clashes (8101 / 8102 / 8103-8104).
- FastAPI service uses the absorbed `templates/services/agent-python/main.py` shape (or imports it).

**Edge cases:**
- Python not in CI → test marks itself `.skipIf(noPython)`.
- uv not in PATH → degrade to `pip install + python -m uvicorn` (documented in README).

#### Tasks
1. Create the directory structure
2. **EC-3 fix: copy Python service from `packages/create-theo/templates/services/agent-python/main.py` — DO NOT re-implement**. Use a build-time copy script OR symlink (cross-platform — prefer copy + drift-check test).
3. Add minimal `app/page.tsx`
4. Add a structure-only assertion test (doesn't require Python at test time)
5. **EC-3 fix: add `tests/integration/fixture-services-drift-check.test.ts`** asserting fixture `main.py` is byte-equal to template `main.py` (catches drift if template evolves but fixture is forgotten)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     fixture_python_basic_files_exist() — Then theo.config.ts, app/page.tsx, services/agent-python/main.py all exist
RED:     fixture_declares_agent_service() — Given theo.config.ts is parsed by the schema, Then services.agent.runtime === 'python'
RED:     fixture_python_main_has_health_endpoint() — Given main.py is read, Then it contains '@app.get("/health")'
RED:     fixture_python_has_json_logging() — Given main.py is read, Then it contains 'JsonFormatter' or equivalent JSON-line logging
RED:     fixture_python_has_traceparent_middleware() — Given main.py is read, Then it contains 'traceparent' middleware
RED:     fixture_python_main_byte_equal_to_template_EC3() — Given the template's main.py at packages/create-theo/templates/services/agent-python/main.py AND the fixture's main.py, When read both, Then SHA-256 hashes match (drift check)
GREEN:   Scaffold the fixture files; ensure byte-equal copy.
REFACTOR: None.
VERIFY:  npx vitest run tests/integration/fixture-services-python-basic.test.ts
```

BDD scenarios:
- **Happy path:** structure intact, schema parses
- **Validation error:** schema rejection (caught upstream by T1.1)
- **Edge case:** N/A
- **Error scenario:** N/A (structural test)

#### Acceptance Criteria
- [ ] All files exist
- [ ] Schema parses the fixture's theo.config.ts without error
- [ ] Python service exposes /health + JSON logs + traceparent
- [ ] 5 RED tests green
- [ ] Pass: typecheck + lint

#### DoD
- [ ] Fixture can be `cd`-d into and `pnpm dev` would run it (manual)
- [ ] Phase 5 Playwright spec can target it

---

### T4.2 — `tests/fixtures/services-node-basic/` fixture

#### Objective
Mirror T4.1 but with a Node Hono sidecar instead of Python.

#### Evidence
Same as T4.1.

#### Files to edit
```
tests/fixtures/services-node-basic/package.json — NEW
tests/fixtures/services-node-basic/theo.config.ts — NEW
tests/fixtures/services-node-basic/index.html — NEW
tests/fixtures/services-node-basic/app/page.tsx — NEW
tests/fixtures/services-node-basic/services/agent-node/src/index.ts — NEW (Hono)
tests/fixtures/services-node-basic/services/agent-node/package.json — NEW
tests/fixtures/services-node-basic/services/agent-node/tsconfig.json — NEW
tests/fixtures/services-node-basic/services/agent-node/README.md — NEW
tests/fixtures/services-node-basic/server/routes/health.ts — NEW
tests/integration/fixture-services-node-basic.test.ts — NEW
```

#### Deep file dependency analysis
Same pattern as T4.1. Service uses Hono + tsx. Port 8102.

#### Deep Dives

**`theo.config.ts`:**

```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  services: {
    worker: {
      runtime: 'node',
      port: 8102,
      proxy: '/api/worker',
      dev: 'pnpm --filter ./services/agent-node dev',
      start: 'pnpm --filter ./services/agent-node start',
      healthcheck: '/health',
    },
  },
})
```

**Invariants:**
- Port 8102 (different from python fixture's 8101).
- Hono service uses `@hono/node-server`.

**Edge cases:**
- Hono dep not installed → test skips OR documents pnpm install step.

#### Tasks
1. Create directory + files
2. Copy Hono service template from `packages/create-theo/templates/services/agent-node/`
3. Add structural test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     fixture_node_basic_files_exist() — All required files present
RED:     fixture_declares_worker_service() — theo.config.ts has services.worker with runtime='node'
RED:     fixture_node_uses_hono() — src/index.ts contains "from 'hono'"
RED:     fixture_node_has_health_endpoint() — src/index.ts has app.get('/health', ...)
RED:     fixture_node_has_traceparent_middleware() — src/index.ts references 'traceparent'
RED:     fixture_node_byte_equal_to_template_EC3() — Given template src/index.ts at packages/create-theo/templates/services/agent-node/src/index.ts AND fixture src/index.ts, When read both, Then SHA-256 hashes match (drift check)
GREEN:   Scaffold fixture; ensure byte-equal copy from template.
REFACTOR: None.
VERIFY:  npx vitest run tests/integration/fixture-services-node-basic.test.ts
```

BDD scenarios:
- Happy: files exist, schema parses
- Validation error: N/A
- Edge case: N/A
- Error scenario: N/A

#### Acceptance Criteria
- [ ] All files exist
- [ ] Schema parses
- [ ] 5 RED tests green
- [ ] Pass: typecheck + lint

#### DoD
- [ ] Fixture is dev-runnable

---

### T4.3 — `tests/fixtures/services-both/` fixture (Python + Node with dependsOn)

#### Objective
Multi-service fixture. Both Python (port 8103) and Node (port 8104). Node `dependsOn: ['agent']` to exercise topological ordering through the orchestrator.

#### Evidence
Plan v1.1/v1.2 mandates a multi-service fixture. None exists today.

#### Files to edit
```
tests/fixtures/services-both/package.json — NEW
tests/fixtures/services-both/theo.config.ts — NEW
tests/fixtures/services-both/index.html — NEW
tests/fixtures/services-both/app/page.tsx — NEW
tests/fixtures/services-both/services/agent-python/ — NEW (mirrors T4.1)
tests/fixtures/services-both/services/agent-node/ — NEW (mirrors T4.2)
tests/fixtures/services-both/server/routes/health.ts — NEW
tests/integration/fixture-services-both.test.ts — NEW
```

#### Deep file dependency analysis
Two services side-by-side. Schema's topological ordering kicks in; manifest emission preserves the order.

#### Deep Dives

**`theo.config.ts`:**

```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  services: {
    agent: {
      runtime: 'python', port: 8103, proxy: '/api/agent',
      dev: '...', start: '...', healthcheck: '/health',
    },
    worker: {
      runtime: 'node', port: 8104, proxy: '/api/worker',
      dev: '...', start: '...', healthcheck: '/health',
      dependsOn: ['agent'],
    },
  },
})
```

**Invariants:**
- Ports unique across fixtures (8103/8104 vs 8101/8102).
- `dependsOn` is satisfied — `agent` is declared in the same map.

**Edge cases:**
- Topological order: manifest emits agent before worker (already unit-tested in T1.4; this fixture is the integration proof).

#### Tasks
1. Scaffold structure
2. Copy services from prior fixtures (or templates)
3. Structural test asserts both services declared + dependsOn shape

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     fixture_both_has_two_services() — theo.config parses, has both 'agent' and 'worker'
RED:     fixture_both_dependson_set() — worker.dependsOn === ['agent']
RED:     fixture_both_port_uniqueness() — agent.port !== worker.port AND neither === 3000 (TheoKit web)
RED:     fixture_both_manifest_topo_order() — When buildManifest is called on this config, agent appears BEFORE worker in services array
RED:     fixture_both_file_structure() — services/agent-python/main.py AND services/agent-node/src/index.ts both exist
RED:     fixture_both_byte_equal_to_templates_EC3() — Given the template main.py + index.ts AND the fixture copies, When read all, Then SHA-256 hashes match (drift check across both services)
GREEN:   Scaffold; ensure byte-equal copies.
REFACTOR: None.
VERIFY:  npx vitest run tests/integration/fixture-services-both.test.ts
```

BDD scenarios:
- Happy: both services declared, topological order verified
- Validation error: schema would reject (caught by T1.1)
- Edge case: depended-on service exists
- Error scenario: N/A structural

#### Acceptance Criteria
- [ ] All files exist
- [ ] Schema parses; topological order verified
- [ ] 5 RED tests green
- [ ] Pass: typecheck + lint

#### DoD
- [ ] Fixture is dev-runnable, both services boot in correct order

---

## Phase 5: Playwright E2E

**Objective:** 1 Playwright spec exercises the FULL Wave 2 flow against `services-python-basic` fixture: spawn → healthcheck → page → proxy hop → service response → traceparent in service logs.

### T5.1 — `services-fullstack.spec.ts` Playwright E2E

#### Objective
Boot `services-python-basic` via the same path users use (`startDevServer`), navigate to `/`, click a button that POSTs to `/api/agent/echo`, assert the response is the echoed body and that the service's stdout contains the traceparent header from the request.

#### Evidence
Plan v1.1/v1.2 T6 Playwright is mandatory. Today: no `tests/e2e/services-*.spec.ts` exists.

#### Files to edit
```
tests/e2e/services-fullstack.spec.ts — NEW
tests/fixtures/services-python-basic/app/page.tsx — MODIFY (add the test button)
```

#### Deep file dependency analysis
- Depends on: T1.1 (dev wire-up), T4.1 (fixture), all Phase 1 helpers (proxy, orchestrator, healthcheck).
- The spec uses Playwright's `test.beforeAll` to spawn `startDevServer(FIXTURE)` (returns ViteDevServer); `test.afterAll` calls `server.close()` which also stops services (per T1.1 acceptance).

#### Deep Dives

**Spec shape:**

```ts
import { test, expect } from '@playwright/test'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../fixtures/services-python-basic')

let server: Awaited<ReturnType<typeof startDevServer>>
let port: number
let serviceStdout: string[] = []

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  // capture service stdout via log-merger hook (passed via env or test helper)
  server = await startDevServer(FIXTURE, { port: 0 })
  const addr = server.httpServer?.address()
  if (addr && typeof addr === 'object') port = addr.port
})
test.afterAll(async () => { await server.close() })

test('services flow: page → proxy → python service → traceparent in logs', async ({ page }) => {
  await page.goto(`http://localhost:${port}/`)
  await page.click('[data-test=echo-button]')
  await expect(page.locator('[data-test=echo-result]')).toContainText('hello')
  // Assert service received traceparent — read its stdout
  expect(serviceStdout.some(line => line.includes('traceparent'))).toBe(true)
})
```

**Invariants:**
- Python must be in CI PATH. If not, test is `.skip()`-ed with explanation.
- The fixture's `page.tsx` must have a `[data-test=echo-button]` that posts to `/api/agent/echo`.

**Edge cases:**
- Service slow to boot → healthcheck poller (already in dev wire-up) blocks readiness up to 30s.
- Python not installed → skip with message.
- Port collision → fixture uses 8101 (unique).

#### Tasks
1. Add a button + result element to fixture's `page.tsx`
2. Write the spec
3. Ensure CI has Python/uv (document; add to CI matrix later if not present)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     e2e_services_dev_boots_when_python_present() — Given Python is available, When test starts, Then startDevServer returns within 60s
RED:     e2e_services_echo_flow() — When user clicks echo-button, Then echo-result shows 'hello'
RED:     e2e_services_traceparent_propagated() — Given a request via the proxy, Then the service stdout contains 'traceparent'
RED:     e2e_services_skipped_when_no_python() — Given Python is NOT in PATH, Then the test is skipped (not failed)
GREEN:   Write spec + adjust fixture page.
REFACTOR: Extract stdout capture helper if more E2E specs need it.
VERIFY:  npx playwright test tests/e2e/services-fullstack.spec.ts
```

BDD scenarios:
- Happy path: page → proxy → service → response works
- Validation error: N/A
- Edge case: Python missing → skip not fail
- Error scenario: service unhealthy → dev throws within healthcheck timeout (covered by T1.1)

#### Acceptance Criteria
- [ ] Spec exists and is wired in Playwright config (already exists; verify pattern matches)
- [ ] Spec runs end-to-end on a machine with Python+uv
- [ ] Spec skips cleanly on machines without Python
- [ ] Pass: spec exit 0 when Python is present

#### DoD
- [ ] E2E proof of the full Wave 2 flow
- [ ] CI is informed of Python requirement

---

## Phase 6: Cross-Validation + Dogfood QA

**Objective:** TWO independent gates — cross-validation (plan ↔ code line-by-line) and Dogfood (real-world smoke).

### T6.1 — Cross-validation gate

#### Objective
Run `/cross-validation wave-2-completion`. Address any divergences before Dogfood.

#### Evidence
`to-plan` skill mandates this gate.

#### Files to edit
```
docs/reviews/cross-validation/wave-2-completion-xval-{YYYY-MM-DD}.md — produced by the skill
```

#### Deep file dependency analysis
The skill reads this plan + scans implementation. Outputs APROVADO / REPROVADO / APROVADO COM RESSALVAS.

#### Deep Dives
- APROVADO → proceed to T6.2
- REPROVADO → fix, re-run
- APROVADO COM RESSALVAS → fix CRITICALs, then proceed

#### Tasks
1. Invoke `/cross-validation wave-2-completion`
2. Read the report
3. Fix any flagged divergences
4. Re-run if needed

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     xval_report_exists() — After running /cross-validation, Then a report file exists in docs/reviews/cross-validation/
RED:     xval_verdict_approved() — Read the report, Then verdict is APROVADO (or APROVADO COM RESSALVAS after fixing CRITICALs)
RED:     xval_no_critical_divergence() — Read the report, Then no CRITICAL items unresolved
GREEN:   Run cross-validation; address findings until APROVADO.
REFACTOR: N/A.
VERIFY:  ls docs/reviews/cross-validation/wave-2-completion-xval-*.md && grep -q APROVADO <that file>
```

BDD scenarios:
- Happy: APROVADO directly
- Validation error: REPROVADO → fix → re-run
- Edge case: COM RESSALVAS → fix CRITICALs only
- Error scenario: skill fails to run → unblock manually, ad-hoc verify

#### Acceptance Criteria
- [ ] Report file committed
- [ ] Verdict: APROVADO

#### DoD
- [ ] Plan ↔ code consistent

---

### T6.2 — Dogfood QA

#### Objective
Run `/dogfood full`. Health ≥ 80. Zero plan-caused CRITICAL/HIGH.

#### Evidence
`to-plan` skill mandates Dogfood as final gate. Wave 2 cannot ship until this passes.

#### Files to edit
```
docs/audit/dogfood-2026-XX-XX-wave-2-completion.md — produced by the skill
```

#### Deep file dependency analysis
Dogfood runs scaffolded apps + dev/build/deploy paths. With Wave 2 wire-ups in place, it can exercise `--backend python` and verify end-to-end.

#### Deep Dives

**Scenarios mandated:**

1. **Empty services BC** — `npx create-theokit my-app && cd my-app && pnpm dev` works exactly like Wave 1 (no behavior change). Health proof.
2. **Python sidecar** — `npx create-theokit my-app --backend python && pnpm dev` → uvicorn spawned, /api/agent/echo reachable via proxy.
3. **Node sidecar** — same with `--backend node`.
4. **Multi-backend** — `--backend python --backend node` boots both services.
5. **Build node** — `pnpm build --target node` emits compose + Caddyfile.
6. **Build other** — `pnpm build --target vercel` fails with actionable error when services declared.
7. **TheoCloud stub** — `pnpm build --target theo-cloud` succeeds with stub log line.

**Acceptance:**
- Health ≥ 80
- Zero plan-caused CRITICAL/HIGH
- Pre-existing issues documented but not blocking

#### Tasks
1. Invoke `/dogfood full`
2. Read the report
3. Fix any plan-caused issues
4. Re-run if needed
5. Document pre-existing issues separately

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dogfood_report_exists() — After /dogfood full runs, Then a dated report file exists in docs/audit/
RED:     dogfood_health_above_80() — Read report, Then health score >= 80
RED:     dogfood_no_plan_critical() — Read report, Then no CRITICAL items attributed to this plan
RED:     dogfood_no_plan_high() — Read report, Then no HIGH items attributed to this plan in services/* or create-theokit --backend paths
RED:     dogfood_python_scenario_passes() — Read report, Then scenario '--backend python' is marked PASS
RED:     dogfood_node_scenario_passes() — Same for --backend node
RED:     dogfood_vercel_rejection_works() — Report shows --target vercel with services correctly rejects
GREEN:   Fix plan-caused issues; re-run until acceptance.
REFACTOR: N/A.
VERIFY:  ls docs/audit/dogfood-*-wave-2-completion.md && grep -E "Health.*[8-9][0-9]|100" <that file>
```

BDD scenarios:
- Happy: health 80+, all scenarios pass
- Validation error: a scenario fails → fix root cause, re-run
- Edge case: pre-existing issue surfaces → document separately
- Error scenario: dogfood skill fails to run → manual smoke + ad-hoc report

#### Acceptance Criteria
- [ ] Report file committed
- [ ] Health ≥ 80
- [ ] Zero plan-caused CRITICAL/HIGH
- [ ] All 7 mandated scenarios pass

#### DoD
- [ ] Wave 2 is real-world-validated
- [ ] **Plan complete**

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | `pnpm dev` doesn't boot services | T1.1 | Wire orchestrateDev |
| 2 | `pnpm build` doesn't emit `.theo/services.json` | T1.2 | Wire writeManifest |
| 3 | Node adapter doesn't generate compose | T2.1 | Wire generateComposeYaml + generateCaddyfile |
| 4 | 7 adapters don't reject services | T2.2 | Wire assertServicesUnsupported uniformly |
| 5 | TheoCloud adapter doesn't exist | T2.3 | Create stub-driven adapter + register in VALID_TARGETS |
| 6 | Vite plugin doesn't generate typed clients | T3.1 | Create services-typed-client.ts plugin |
| 7 | No fixtures for Python services | T4.1 | services-python-basic fixture |
| 8 | No fixtures for Node services | T4.2 | services-node-basic fixture |
| 9 | No fixtures for multi-service | T4.3 | services-both fixture (with dependsOn) |
| 10 | No E2E proof of end-to-end flow | T5.1 | Playwright spec spawning real Python service |
| 11 | Plan ↔ code drift risk | T6.1 | Cross-validation gate |
| 12 | Real-world breakage undetected | T6.2 | Dogfood QA gate |
| 13 | Workspace pre-reg avoids fixture-creation friction | T0.2 | Register 3 fixture paths in pnpm-workspace.yaml |
| 14 | Wave 1 BC must be enforced (D1) | T1.1, T1.2, T2.x | Each wire-up has BC test asserting empty services = no behavior change |
| 15 | Fast-fail adapter rejection (D2) | T2.2 | assertServicesUnsupported is FIRST statement of build() |
| 16 | Hey API best-effort (D3) | T3.1 | Plugin swallows errors, warns only |
| 17 | Fixtures are real projects (D4) | T4.x | Each fixture is workspace-registered and dev-runnable |
| 18 | Playwright spec uses real service (D5) | T5.1 | Spec spawns Python; skips when Python absent |
| 19 | Multi-service dependsOn validated (D6) | T4.3, T5.1 | services-both fixture + Playwright assertion on boot order |
| 20 | Two-gate validation (D7) | T6.1, T6.2 | Cross-validation + Dogfood |

**Coverage: 20/20 gaps covered (100%)**

### Edge-case coverage (2026-05-27 review)

| EC | MUST FIX item | Folded into |
|---|---|---|
| EC-1 | ViteDevServer.close mutation fragile | T1.1 Deep Dives + new RED test `dev_wireup_does_not_mutate_server_close_EC1` |
| EC-2 | Port collisions across fixtures in parallel test pools | D4 + T0.2 (port range reserved 8100–8199 + serial-test discipline documented) |
| EC-3 | Fixture vs template drift on main.py / index.ts | T4.1/T4.2/T4.3 new RED tests asserting SHA-256 byte equality with template sources |

**5 SHOULD TEST items** distributed across T0.2 (pnpm version), T2.1 (Caddyfile validates against caddy:2.11), T3.1 (typed-client plugin waits for healthcheck), T3.1 (clients/ gitignored), T5.1 (Playwright actually captures stdout). All entered TDD blocks of the affected tasks.

**4 DOCUMENT items** captured as inline notes in services.md troubleshooting (T6.2 dogfood scenario rephrasing): .theo/ is build-artifact-only; Vercel/CF rejection message is generic; cross-validation COM RESSALVAS requires manual review; Python+uv prerequisite for Playwright spec.

## Global Definition of Done

- [ ] All 6 phases completed (Phase 0 → Phase 6)
- [ ] All RED tests across all phases green (~40 new tests)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings (`pnpm lint`)
- [ ] Wave 1 BC preserved (empty `services: {}` = pre-Wave-2 behavior bytewise)
- [ ] 3 fixtures committed and workspace-registered
- [ ] 1 Playwright E2E spec passing (or skipping cleanly when Python absent)
- [ ] `/cross-validation wave-2-completion` APROVADO
- [ ] `/dogfood full` health ≥ 80 with zero plan-caused CRITICAL/HIGH
- [ ] CHANGELOG `[Unreleased]` entry added documenting the Wave 2 completion
- [ ] All references to T0.2/T3.1/T3.2 in plan v1.2 are noted as superseded by THIS plan's TheoCloud-first refocus

## Final Phase: Dogfood QA (MANDATORY)

> Already covered by T6.2 in this plan. The phase is the gate, not separate.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score ≥ 80
- [ ] Zero CRITICAL plan-caused issues
- [ ] Zero HIGH plan-caused issues in services/* or create-theokit --backend paths
- [ ] All 7 scenarios from T6.2 PASS
- [ ] Any pre-existing issues documented (NOT caused by this plan)

### If Dogfood Fails

1. Identify which issues are plan-caused vs pre-existing
2. Fix all plan-caused CRITICAL and HIGH issues
3. Re-run `/dogfood full`
4. Pre-existing issues are logged but do NOT block plan completion

---

## Appendix A — Estimated effort

| Phase | Tasks | Estimated days |
|---|---|---|
| Phase 0 (preflight + workspace pre-reg) | T0.1, T0.2 | 0.25 day |
| Phase 1 (CLI wire-up) | T1.1, T1.2 | 1 day |
| Phase 2 (adapter wire-up) | T2.1, T2.2, T2.3 | 1 day |
| Phase 3 (Vite plugin typed-client) | T3.1 | 0.5 day |
| Phase 4 (fixtures) | T4.1, T4.2, T4.3 | 1 day |
| Phase 5 (Playwright) | T5.1 | 0.5 day |
| Phase 6 (cross-validation + dogfood) | T6.1, T6.2 | 1 day |

**Total:** ~5 days of focused work. ~1 week calendar.

## Appendix B — Notes on what is NOT in this plan

Out of scope (intentionally):

- **Real Vercel deploy validation** — owner refocus is 100% TheoCloud; Vercel polyglot wire-up is deferred (fresh ADR with demand evidence required).
- **Real TheoCloud K8s manifest emission** — Wave 3 deliverable; the stub in T2.3 only validates the manifest contract.
- **`@hey-api/openapi-ts` dep added to TheoKit core** — kept as soft dep; users opt-in by installing it themselves.
- **Architecture diff (`docs/architecture/services/diff/`)** — covered by the `to-plan` skill post-completion hook; not a task in this plan.
- **More polyglot backends (Go, .NET, etc.)** — fresh ADR required (per ADR-0013 D7).
