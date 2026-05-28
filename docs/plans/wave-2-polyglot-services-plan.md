# Plan: Wave 2 — Polyglot Services Orchestration (`services: {}` + Like-Vercel contract + create-theokit absorption)

> **Version 1.2** — Updated 2026-05-27 (later same day) per owner decision to **focus 100% of polyglot services energy on TheoCloud**. T0.2 (Vercel Services snapshot spike), T3.1 (Vercel adapter wire-up), T3.2 (Cloudflare Python rejection helper) are **REMOVED from Wave 2 scope**. T3.4 (loud rejection helper) is **EXPANDED** to cover Vercel + Cloudflare + AWS Lambda + Bun + Deno Deploy + Netlify + Static — all reject `services: {}` non-empty. T3.5 (new) is TheoCloud adapter scaffolding stub. The Like-Vercel name in ADR-0015 remains as the technical pattern reference (fetch handler universal); no Vercel-specific wire-up ships in Wave 2.
>
> **Version 1.1** — Updated 2026-05-27 after [edge-case review](../reviews/edge-case-plan/wave-2-polyglot-services-edge-cases-2026-05-27.md) folded 10 MUST FIX items (EC-1 through EC-10) into the relevant tasks. Original version 1.0 below remains otherwise unchanged in scope.
>
> **Version 1.0** — Ships TheoKit's polyglot services capability per ADRs 0012-0015. Adds `theo.config.ts > services: {}` primitive that orchestrates external Python (FastAPI) and Node (Hono) sidecar processes alongside the TS app, with a uniform Like-Vercel runtime contract (fetch handler universal, file-system routing build-time, runtime env, JSON-line stdout logs, `GET /health` convention, W3C `traceparent` propagation). Absorbs `theo-stacks/create-theo` into `create-theokit` via `--backend python|node` flags. Typed cross-service client via Hey API. Dev orchestration via Vite proxy + optional docker-compose TheoCloud-shaped harness. Production via Vercel Services (2026 feature) + Node-adapter docker-compose + (Wave 3) TheoCloud K8s manifests. **`services: {}` is empty-by-default — Wave 1 TS-only users see zero behavior change.**

## Context

**What exists today (commit `7e07053` + 4 storage modules planos completos):**
- 8 deploy adapters at `packages/theo/src/adapters/{aws-lambda,bun,cloudflare,deno-deploy,netlify,node,static,vercel}.ts` — all assume single TS process; none read a `services` manifest
- `packages/theo/src/config/schema.ts` has NO `services` field
- Vite proxy is NOT auto-wired from any TheoKit config — users would write `vite.config.ts > server.proxy` by hand
- No `.theo/services.json` artifact is emitted today
- `create-theokit` scaffolder (`packages/create-theo/`) has 5 TS templates; no `--backend python|node` flag
- `theo-stacks/create-theo` lives in a separate repo with 19 templates in 7 languages, publishing `create-theo` on npm

**What's broken or missing (gap → evidence):**
1. **No declarative service orchestration** — owner intent "Build the app your agent lives in + services on the side" requires a primitive; today users glue Vite proxy + Docker Compose by hand
2. **Cross-product moat at risk without uniform contract** — ADR-0012 invariant #4 demands the SAME contract across `create-theokit` + TheoKit + TheoCloud; today no contract exists
3. **TheoCreate maintained separately = drift risk** — 2 scaffolders, 2 npm packages, 2 release cadences; owner decision (ADR-0013) to absorb
4. **Vercel shipped "Services" in Feb 2026** — competitive baseline raised; TheoKit must match path-prefix routing to remain Like-Vercel-compatible
5. **TheoCloud adapter (Wave 3) is blocked without manifest+contract** — the K8s adapter must consume something stable; defining it in Wave 2 unblocks Wave 3

**Evidence:**
- [ADR-0012](../adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) — accepted 2026-05-27
- [ADR-0013](../adr/0013-theocreate-absorbed-into-create-theokit.md) — accepted 2026-05-27
- [ADR-0014](../adr/0014-services-as-external-processes.md) — accepted 2026-05-27
- [ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md) — accepted 2026-05-27
- [Reference doc — Polyglot Services Orchestration](../../.claude/knowledge-base/reference/polyglot-services-orchestration.md) — 9 frameworks deep-read, 7 convergent patterns, 12 edge cases catalogued
- [Vercel Services docs (Feb 2026)](https://vercel.com/docs/services) — external corroboration
- Owner direction transcript 2026-05-27: "só trocar o server", "TheoCloud está sendo provisionado, quero validar em ambiente prod-like", "TheoCreate deve estar no TheoKit"

## Objective

**Done = a user runs `npx create-theokit my-app --backend python && cd my-app && pnpm dev`, sees TheoKit + FastAPI service boot, hits an endpoint in the browser, gets a typed response via the proxy with `traceparent` propagation, and ships to Vercel via the same `theo.config.ts > services: {}` config without code changes.**

Measurable goals:
1. `theo.config.ts > services: {}` Zod-validated primitive accepted; empty `{}` default preserves Wave 1 behavior (zero impact on TS-only apps)
2. `pnpm dev` boots TheoKit + declared services; Vite proxy auto-wired from `services: {}`; healthcheck poller blocks readiness; logs merged with `[service]` prefix
3. `pnpm build` emits `.theo/services.json` manifest (schemaVersion 1, neutral across adapters)
4. Vercel adapter writes `vercel.json > services` block matching 2026 Vercel Services spec; Cloudflare adapter rejects `runtime: 'python'` with actionable error; Node adapter emits `docker-compose.yml` + `Caddyfile` (TheoCloud-shaped local harness)
5. `npx create-theokit my-app --backend python` scaffolds working FastAPI sidecar under `services/agent-python/`; `--backend node` scaffolds working Hono sidecar
6. Hey API typed client generation wires automatically when `services.<name>.openapi` is reachable; types update on backend OpenAPI changes
7. Path traversal blocked via ported `isPathInScope` (GHSA-5w89-w975-hf9q); hop-by-hop headers stripped both directions per Hono's pattern
8. Coverage: 60+ new unit/integration tests + 1 Playwright E2E spec + 3 fixtures
9. Dogfood `full` health >= 80/100 with zero plan-caused CRITICAL/HIGH issues

## ADRs

### D1 — Use the canonical Like-Vercel contract verbatim across all 3 product surfaces

- **Decision:** All 6 runtime invariants from [ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md) (fetch-handler universal, build-time routing, runtime env, JSON-line stdout, `GET /health` healthcheck, W3C `traceparent` propagation) MUST hold uniformly across `create-theokit` scaffolds, TheoKit dev/build runtime, and every deploy adapter. No per-surface relaxations.
- **Rationale:** ADR-0012 invariant #4 establishes that the cross-product standardization IS the moat. Any "let's accept a different healthcheck shape on TheoCloud because K8s makes it easier" PR destroys the moat. This plan implements the discipline by sharing the same Zod schema + manifest format across surfaces.
- **Consequences:** ✅ Vercel/CF Workers/Node/TheoCloud all consume `.theo/services.json` of the same shape. ✅ Future adapters slot in without bespoke contracts. ⚠️ Edge case where a platform truly cannot host the contract (e.g., CF Workers + Python) requires the adapter to REJECT loudly, not silently downgrade.

### D2 — Declarative `services: {}` in `theo.config.ts`, NOT convention-file discovery

- **Decision:** Services are declared in `theo.config.ts > services: { [name]: ServiceDefinition }`. No `encore.service.ts`-style convention file. No auto-discovery of `services/*/` directories in Wave 2.
- **Rationale:** TheoKit already centralizes config in `theo.config.ts`; consistency wins. Convention discovery adds magic without clear benefit when `services` is empty by default for 90% of users. ADR-0014 + ADR-0015 already encode the runtime contract — discovery would only save a few lines of config.
- **Consequences:** ✅ One place to look for service config. ✅ Type-checked via Zod. ✅ Easy to grep/lint. ⚠️ Cannot scaffold a service just by dropping a directory — must add config line (acceptable; `create-theokit --backend python` adds the config + the directory).

### D3 — HTTP/OpenAPI only as the inter-service transport; NO gRPC

- **Decision:** Services communicate with TheoKit and each other via HTTP/JSON proxy on path prefixes (`services.<name>.proxy: '/api/agent'`). OpenAPI spec emitted by each service is the contract. NO gRPC.
- **Rationale:** ADR-0015 invariant #1 (fetch handler universal) makes HTTP the natural choice. Vercel Services (2026), CF Workers, Bun, Deno all converge on fetch handlers. gRPC over HTTP/2 needs special handling on edge runtimes, breaks "só trocar o server". Nitric's gRPC choice is a documented counter-example (reference doc §3.5).
- **Consequences:** ✅ Works across all 8 adapters + future. ✅ Hey API generates types from OpenAPI seamlessly. ⚠️ High-throughput service-to-service streams may want gRPC eventually — deferred to a fresh ADR with demand evidence.

### D4 — Hono-style proxy helper (Web Standards) for production hot path; `http-proxy-3` only in the Node-adapter dev fallback

- **Decision:** Production proxy implementation in `packages/theo/src/services/proxy.ts` follows the Hono `proxy/index.ts` pattern: pure Web Standards `Request`/`Response`, no Node-specific I/O API. The `http-proxy-3` library is used ONLY in the Node adapter for the local Vite-style dev path (matches how Vite already wires `server.proxy`).
- **Rationale:** Reference doc §3.2 documents Hono's ~190-LOC proxy: hop-by-hop header stripping both directions, `accept-encoding`/`content-encoding`/`content-length` handling, `duplex: 'half'` for body streaming. This is fetch-handler-native, works on every platform. `http-proxy-3` is the battle-tested Node lib but bound to IncomingMessage — keep it in the dev fallback only.
- **Consequences:** ✅ Production hot path is platform-neutral. ✅ Vite dev experience preserved (proxy mechanism unchanged). ⚠️ Two proxy code paths (Web Standards prod + Node dev) — keep them feature-parity via shared header policy module.

### D5 — Manifest `.theo/services.json` schemaVersion 1; adapters consume; never write platform-specific data inside

- **Decision:** Build emits `.theo/services.json` with `version: 1` and a neutral shape (service name, runtime kind, port, proxy prefix, openapi URL, dev/start commands, healthcheck path). Adapters read this and translate to platform-native config — they NEVER read or write platform-specific fields inside the manifest.
- **Rationale:** Same logic as ADR-0002 `JobBackend` interface: keep the contract platform-neutral so multiple backends can implement it. If we add `vercel: { fluid: true }` inside the manifest, we couple the manifest to Vercel.
- **Consequences:** ✅ Adapters are pluggable. ✅ TheoCloud (Wave 3) just adds another adapter. ⚠️ Platform-specific tuning (e.g., Vercel memory size per service) lives in `theo.config.ts > services.<name>.vercel.memory`, gets read by Vercel adapter, NOT serialized into the neutral manifest.

### D6 — `@hey-api/openapi-ts` as the typed-client generator; Vite plugin wiring; opt-in Zod plugin

- **Decision:** Adopt `@hey-api/openapi-ts` (used by Vercel/OpenCode/PayPal per Feb 2026 reference doc §3.11). Wire via TheoKit's Vite plugin so generation happens at dev startup + on `openapi.json` change. Default: TS types only. Opt-in `@hey-api/zod` plugin via `services.<name>.runtimeValidation: true`.
- **Rationale:** Manual fetch + manual types diverge fast. Hey API is the de facto 2026 standard for FastAPI typed clients (OpenAPI 3.1 native). Vite plugin matches TheoKit's existing integration model. Zod plugin would double bundle size if always-on — make it opt-in.
- **Consequences:** ✅ Frontend gets autocompletion + compile errors on service contract drift. ✅ Hot-reload workflow: backend route changes → OpenAPI changes → client regenerates → frontend type errors surface. ⚠️ Adds 2 npm deps (`@hey-api/openapi-ts` + `@hey-api/client-fetch`). ⚠️ Hey API tool churn risk mitigated via pinned version + snapshot test on generated output.

### D7 — Wave 2 backends are Python + Node ONLY; archive theo-stacks's 5 other languages

- **Decision:** `--backend python` (FastAPI + uv) and `--backend node` (Hono + tsx) are the ONLY supported polyglot scaffolds in Wave 2. Go/Rust/Java/Ruby/PHP from `theo-stacks` are ARCHIVED (read-only in original repo), NOT migrated.
- **Rationale:** ADR-0013 records the scope decision. JHipster's matrix-explosion failure (ref doc §3.10 lessons) is the warning. Each language adds test matrix, docs, dogfood overhead. Wave 2 narrows to 2 to ship; future waves can add with demand evidence.
- **Consequences:** ✅ Manageable test matrix. ✅ Docs surface stays sane. ⚠️ Existing `theo-stacks` Go/Rust/Java/Ruby/PHP users lose first-party migration path — they can fork the archived repo. Migration guide ships in T4.4.

### D8 — `theo-stacks/create-theo` deprecation is sequenced (not abrupt); `create-theokit` absorbs first, deprecation marker after

- **Decision:** Phase 4 of this plan ABSORBS `python-fastapi` template into `create-theokit`. The standalone `create-theo` npm package gets a deprecation marker AFTER Wave 2 ships and end-to-end smoke tests pass. NO parallel patches to `create-theo` during this plan.
- **Rationale:** ADR-0013 deprecation timeline. Parallel patches create two sources of truth. Hard cutover risks stranding existing users with a broken state.
- **Consequences:** ✅ Single source of truth post-Wave-2. ✅ Existing `create-theo` users keep their pinned versions working (we don't unpublish). ⚠️ For ~6 weeks after Wave 2 ship, both packages exist on npm; the older one becomes "deprecated, use `create-theokit`".

## Dependency Graph

```
Phase 0 (preflight + spikes resolution)
   │
   ├──▶ Phase 1 (schema + manifest + proxy helper)
   │       │
   │       ├──▶ Phase 2 (dev orchestration — Vite plugin + spawn)
   │       │       │
   │       │       └──▶ Phase 4 (scaffolder absorption — depends on dev orchestration to demo end-to-end)
   │       │
   │       ├──▶ Phase 3 (production adapters — consume manifest from Phase 1)
   │       │
   │       └──▶ Phase 5 (typed client + docs — depends on schema + working dev)
   │
   └──▶ Phase 3 (adapters can parallelize with Phase 2 once Phase 1 lands)


Final Phase: Dogfood QA  (after ALL implementation phases)
```

**Phases that can run in parallel:**
- Phase 2 and Phase 3 can run in parallel after Phase 1 lands (different file trees, share only the manifest schema)
- Phase 5 can start once Phase 1 lands; Phase 5's typed-client validation requires Phase 2 dev orchestration to be working

**Phases that are sequential blockers:**
- Phase 0 → Phase 1 (open questions resolved before schema is locked)
- Phase 1 → Phase 2/3/5 (schema is the foundation)
- Phase 2 → Phase 4 (scaffolder demo end-to-end requires dev orchestration)
- All implementation phases → Final Dogfood QA

---

## Phase 0: Preflight + Open Questions Resolution

**Objective:** Resolve the 7 open questions from the reference doc + snapshot architecture baseline + green pre-flight before any new code lands.

### T0.1 — Architecture snapshot (BEFORE state)

#### Objective
Capture the current architecture of `packages/theo/src/{config,adapters,cli,vite-plugin}/` BEFORE Wave 2 changes, so the post-implementation diff is observable.

#### Evidence
[`to-plan` skill](../.claude/skills/to-plan/SKILL.md) Process step 2 requires the BEFORE snapshot. ADR-0001 (`docs/adr/0001-update-architecture-rules-to-current-module-layout.md`) established the v2 module layout; Wave 2 will add a new `services/` module under `packages/theo/src/` and modify adapters.

#### Files to edit
```
docs/architecture/services/system-context.md       (NEW)
docs/architecture/services/container-diagram.md    (NEW)
docs/architecture/services/component-*.md          (NEW)
docs/architecture/services/deep-dive.md            (NEW)
```

#### Deep file dependency analysis
- These are NEW docs — no upstream/downstream deps in code
- Will be REGENERATED into `docs/architecture/services/diff/` after Wave 2 completes (per `to-plan` skill Post-Implementation step)

#### Deep Dives
- C4 model levels: System Context → Container → Component → Deep Dive (architecture-docs skill convention)
- Domain name: `services` (matches the new `packages/theo/src/services/` directory)
- Scope: must cover the `config` module (where the schema lands), `cli` (dev/build commands), `vite-plugin` (dev orchestration), and `adapters` (prod translation)

#### Tasks
1. Run `/architecture-docs services` to generate baseline C4 docs
2. Verify all 4 files exist and reference current `packages/theo/src/` layout
3. Commit baseline before any code changes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     architecture_docs_baseline_exists() — Given the services domain has not been documented, When /architecture-docs services runs, Then 4 markdown files appear in docs/architecture/services/ (MUST fail before run)
RED:     architecture_docs_references_current_layout() — Given the baseline docs are generated, When grep "services/" docs/architecture/services/, Then ZERO references to services/ module exist (it does not exist yet in code)
RED:     architecture_docs_baseline_no_diff_yet() — Given baseline is generated, When ls docs/architecture/services/diff/, Then directory does NOT exist (diff is post-implementation)
RED:     architecture_docs_committed() — Given baseline exists, When git status, Then docs/architecture/services/ files are tracked (no .gitignore exclusion)
GREEN:   Invoke /architecture-docs services. Commit output.
REFACTOR: None expected for a doc snapshot.
VERIFY:  ls docs/architecture/services/ && grep -L "services/" docs/architecture/services/*.md
```

BDD scenarios:
- **Happy path:** baseline generated, 4 files exist, no `services/` code referenced (since it doesn't exist yet)
- **Validation error:** N/A (snapshot task)
- **Edge case:** baseline already exists from prior run → STOP and ask user to commit first (skill convention)
- **Error scenario:** `/architecture-docs` skill fails to run → block plan progression; resolve upstream

#### Acceptance Criteria
- [ ] `docs/architecture/services/system-context.md` exists
- [ ] `docs/architecture/services/container-diagram.md` exists
- [ ] `docs/architecture/services/component-*.md` exists (one or more)
- [ ] `docs/architecture/services/deep-dive.md` exists
- [ ] All 4 reference current `packages/theo/src/{config,adapters,cli,vite-plugin}/` (NOT the future `services/` module)
- [ ] `docs/architecture/services/diff/` does NOT exist yet (post-implementation only)
- [ ] Files committed to develop

#### DoD
- [ ] Snapshot rendered + committed
- [ ] Verified zero `services/` module references (it doesn't exist yet)
- [ ] Plan can proceed to T0.2

---

### T0.2 — Resolve open question #2: capture Vercel Services JSON shape

#### Objective
Pin the exact `vercel.json > services` block shape (per Vercel's 2026 Services feature) into a snapshot test fixture, so the Vercel adapter (Phase 3) generates a contract-conformant artifact.

#### Evidence
Reference doc §3.9 + §10 Open Question #2: Vercel docs describe the Services feature but the JSON shape needs empirical capture. Without this, Phase 3 Vercel adapter writes a guessed shape that may diverge from reality.

#### Files to edit
```
docs/spikes/vercel-services-shape-2026-05.md       (NEW) — captured snapshot + commentary
tests/fixtures/spike-vercel-services/              (NEW) — Vercel project scaffold used to capture
tests/fixtures/spike-vercel-services/vercel.json   (NEW) — committed snapshot
```

#### Deep file dependency analysis
- Spike doc is reference-only; not consumed by code
- Snapshot `vercel.json` is consumed by `tests/integration/services-prod-vercel.test.ts` (Phase 3) as the expected output reference

#### Deep Dives
- Create a 2-service throwaway Vercel project (TS app + Python FastAPI sidecar) via Vercel dashboard
- Deploy and capture: `vercel.json` (services array shape), `.vercel/output/config.json` (routing + functions), the request flow `/` → TS app + `/api/python` → Python service
- Document edge cases: how Vercel routes path prefixes, whether `excludeFiles` is required for Python, runtime selection syntax
- DO NOT include this throwaway project in production deploys

#### Tasks
1. Scaffold throwaway Vercel project locally (`vercel init`)
2. Add a Python FastAPI service under `api/python/`
3. Add a Next.js or Vite SPA TS app
4. Deploy with `vercel deploy`
5. Pull `.vercel/output/config.json` from the deployment
6. Sanitize secrets/URLs; commit as snapshot
7. Write `docs/spikes/vercel-services-shape-2026-05.md` documenting: shape, gotchas, what TheoKit's adapter must match

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     vercel_services_shape_captured() — Given Vercel Services is a 2026 feature, When tests/fixtures/spike-vercel-services/vercel.json is opened, Then it contains a "services" or equivalent block per 2026 spec (MUST fail before capture)
RED:     vercel_services_shape_documented() — Given the snapshot is captured, When docs/spikes/vercel-services-shape-2026-05.md is read, Then it has sections: "Shape", "Routing", "Python runtime", "TheoKit adapter requirements"
RED:     vercel_services_path_prefix_routing() — Given Vercel Services routes by path prefix, When the spike's deployed URL receives /api/python/* requests, Then they reach the Python function (verify via real deploy log snippet in doc)
RED:     vercel_services_python_excludefiles_documented() — Given Vercel Python has a 500MB bundle cap, When the spike doc is read, Then the excludeFiles requirement is explicit
GREEN:   Run the spike, capture, sanitize, document.
REFACTOR: None — pure documentation/snapshot task.
VERIFY:  test -f tests/fixtures/spike-vercel-services/vercel.json && test -f docs/spikes/vercel-services-shape-2026-05.md
```

BDD scenarios:
- **Happy path:** spike deploys, snapshot captured, doc written, real-world routing verified
- **Validation error:** Vercel rejects the spike project shape → debug, retry; the iteration IS the spike
- **Edge case:** Vercel CLI fails locally (auth, region) → fall back to capturing shape from Vercel docs HTML/JSON dumps + Vercel's `nextjs-fastapi-starter` template (see ref doc §3.9 sources)
- **Error scenario:** Vercel Services feature shape changes between Feb 2026 and now → re-spike; update snapshot

#### Acceptance Criteria
- [ ] `tests/fixtures/spike-vercel-services/vercel.json` committed
- [ ] `docs/spikes/vercel-services-shape-2026-05.md` committed
- [ ] Snapshot includes: services array, path-prefix routes, Python runtime declaration
- [ ] Doc explicitly lists TheoKit Vercel adapter requirements (what fields the adapter MUST emit)
- [ ] All secrets sanitized from snapshot

#### DoD
- [ ] Real Vercel deploy succeeded once (proof in doc)
- [ ] Snapshot matches deploy reality byte-for-byte (post-sanitization)
- [ ] Phase 3 T3.1 (Vercel adapter) has a concrete target to assert against

---

### T0.3 — Resolve open question #1: Hey API Vite plugin vs CLI spike

#### Objective
Choose the integration path for `@hey-api/openapi-ts` (Vite plugin vs CLI) based on a 1-day spike comparing both.

#### Evidence
Reference doc §10 Open Question #1. Both paths are documented in Hey API docs. Vite plugin is more native (build-time); CLI is more portable (works without Vite if needed for tooling).

#### Files to edit
```
tests/fixtures/spike-hey-api-vite/                  (NEW) — Vite plugin variant
tests/fixtures/spike-hey-api-cli/                   (NEW) — CLI variant
docs/spikes/hey-api-integration-2026-05.md          (NEW) — decision + rationale
```

#### Deep file dependency analysis
- Both fixtures are reference-only; not consumed by production code
- The decision documented in the spike doc binds Phase 5 T5.1 (Hey API integration) implementation

#### Deep Dives
- Spike A (Vite plugin): wire `@hey-api/vite-plugin` into a minimal Vite project that watches `http://localhost:8001/openapi.json` and regenerates `src/client/` on change
- Spike B (CLI): wire `npx @hey-api/openapi-ts -i http://localhost:8001/openapi.json -o src/client` via `package.json > scripts.dev:client` running in parallel with Vite via `concurrently`
- Compare on: cold-start time, hot-reload latency, error reporting clarity, bundle impact, "fail loudly" behavior when OpenAPI URL is unreachable

#### Tasks
1. Build spike A (Vite plugin variant)
2. Build spike B (CLI variant)
3. Run both against a stable FastAPI fixture for 30 minutes
4. Measure cold-start, hot-reload, error reporting
5. Document decision in `docs/spikes/hey-api-integration-2026-05.md`
6. Recommend ONE for Phase 5 implementation

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     spike_a_vite_plugin_regenerates_client() — Given spike-hey-api-vite is running, When FastAPI route changes, Then src/client/*.ts is regenerated within 3s (MUST fail before spike)
RED:     spike_b_cli_regenerates_client() — Given spike-hey-api-cli is running, When FastAPI route changes, Then src/client/*.ts is regenerated within 3s
RED:     spike_doc_compares_metrics() — Given spike doc is opened, Then it has a Comparison table with: cold start (ms), hot reload (ms), errors visible (yes/no), bundle impact (KB)
RED:     spike_doc_picks_one_with_rationale() — Given spike doc is opened, Then a Decision section names ONE option (plugin OR cli) with a Rationale paragraph
GREEN:   Build both spikes, run measurements, document decision.
REFACTOR: None.
VERIFY:  test -d tests/fixtures/spike-hey-api-vite && test -d tests/fixtures/spike-hey-api-cli && grep -q "Decision:" docs/spikes/hey-api-integration-2026-05.md
```

BDD scenarios:
- **Happy path:** both spikes run; comparison table populated; one option chosen with rationale
- **Validation error:** Hey API rejects OpenAPI 3.1 from FastAPI → version mismatch; document and pin
- **Edge case:** one spike is unworkable (e.g., Vite plugin not yet supporting watch mode) → document the failure as a finding; chooses the other
- **Error scenario:** both spikes fail → escalate; block Phase 5 until resolved

#### Acceptance Criteria
- [ ] Both fixture directories committed
- [ ] Spike doc has comparison table with concrete numbers
- [ ] Decision named (plugin OR cli) with rationale
- [ ] Phase 5 T5.1 implementation path is now unambiguous

#### DoD
- [ ] Decision recorded
- [ ] Phase 5 unblocked

---

### T0.4 — Pre-flight: green baseline (typecheck + lint + test)

#### Objective
Confirm the develop branch is green BEFORE Wave 2 changes start. Any pre-existing failures get cataloged and EXCLUDED from Wave 2 attribution.

#### Evidence
[`framework-zero-config-polish-plan` Phase 0](./framework-zero-config-polish-plan.md) established this pattern. Pre-flight catches regression-baseline issues that would otherwise get blamed on the current plan.

#### Files to edit
```
docs/audit/phase-0-typecheck-pre-flight-wave-2-{YYYY-MM-DD}.md  (NEW)
```

#### Deep file dependency analysis
- Audit doc is observation-only; no downstream code dependency
- Establishes a baseline that Phase 1+ implementations are compared against

#### Deep Dives
- Run `pnpm typecheck` (or equivalent) — expect 0 errors
- Run `pnpm lint` — expect 0 warnings (or document pre-existing)
- Run `pnpm test` — capture pass count + any pre-existing skips/failures
- Run `pnpm --filter theokit build` — expect exit 0
- Capture all output to the audit doc

#### Tasks
1. Run all 4 checks in sequence
2. Capture output (pass counts, durations, any failures)
3. Write audit doc with pre-flight status
4. If any check fails: STOP, escalate, do NOT start Phase 1

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     pre_flight_typecheck_clean() — Given develop HEAD, When pnpm typecheck runs, Then exit code 0
RED:     pre_flight_lint_clean() — Given develop HEAD, When pnpm lint runs, Then exit code 0 (or pre-existing warnings cataloged)
RED:     pre_flight_tests_baseline() — Given develop HEAD, When pnpm test runs, Then pass count >= 2881 (baseline from 2026-05-27 storage modules dogfood)
RED:     pre_flight_build_clean() — Given develop HEAD, When pnpm --filter theokit build runs, Then exit code 0
GREEN:   Run all 4 checks. If any RED fails, escalate.
REFACTOR: None.
VERIFY:  test -f docs/audit/phase-0-typecheck-pre-flight-wave-2-*.md
```

BDD scenarios:
- **Happy path:** all 4 checks green; audit doc captures the green baseline
- **Validation error:** typecheck fails on develop → STOP, fix or document as pre-existing, get owner sign-off
- **Edge case:** one test in the 2881 suite is newly flaky → capture; do NOT mark as plan-caused
- **Error scenario:** build fails → block Phase 1 unconditionally

#### Acceptance Criteria
- [ ] `pnpm typecheck` exit 0 (or documented pre-existing)
- [ ] `pnpm lint` exit 0
- [ ] `pnpm test` >= 2881 passing
- [ ] `pnpm --filter theokit build` exit 0
- [ ] Audit doc committed

#### DoD
- [ ] Green baseline established
- [ ] Plan can proceed to Phase 1

---

## Phase 1: Schema + Manifest + Proxy Helper

**Objective:** Land the foundational data structures + utility functions that all subsequent phases build on. `services: {}` is Zod-validated, the manifest format is stable, the proxy helper is Web-Standards-native.

### T1.1 — Add `services: {}` Zod schema to `config/schema.ts`

#### Objective
Extend `TheoConfigSchema` with the `services` field. Default `{}`. Validate runtime kind (Wave 2: `'python' | 'node'`), port, proxy prefix, dev/start commands, healthcheck path, OpenAPI URL.

#### Evidence
Reference doc §9.3 (Public API surface). ADR-0014 (services as external processes). ADR-0015 (Like-Vercel runtime contract).

#### Files to edit
```
packages/theo/src/config/schema.ts                            — extend TheoConfigSchema with services field
packages/theo/src/config/schema.test.ts                       (NEW or MODIFY) — schema tests
packages/theo/src/services/types.ts                           (NEW) — re-export ServiceDefinition + ServicesConfig
tests/unit/services-schema.test.ts                            (NEW) — Zod schema validation tests
```

#### Deep file dependency analysis
- `config/schema.ts` is consumed by: `cli/commands/dev.ts`, `cli/commands/build.ts`, `cli/commands/start.ts`, `vite-plugin/`, `adapters/*`. ALL of these will eventually read `config.services` — but in Phase 1, only the schema lands. Downstream consumption comes in later phases.
- The new `services/types.ts` re-export gives consumers `import type { ServiceDefinition } from 'theokit/server'` (Wave 2 stretch — exposed via barrel)

#### Deep Dives
**Zod schema design:**

```ts
const ServiceRuntimeSchema = z.enum(['python', 'node'])  // D7 — Wave 2 only

const ServiceDefinitionSchema = z.object({
  runtime: ServiceRuntimeSchema,
  port: z.number().int().min(1).max(65535),
  // EC-4 fix: regex requires NON-EMPTY path after / (was * → became +); rejects `/` which would catch-all and break TheoKit routing
  proxy: z.string().regex(/^\/[a-zA-Z0-9\-_/]+$/, 'proxy must be a non-root path starting with /'),
  dev: z.string().min(1),
  build: z.string().optional(),
  start: z.string().min(1),
  openapi: z.string().url().optional(),
  healthcheck: z.string().regex(/^\//).default('/health'),
  cors: z.boolean().default(false),
  env: z.record(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  passSetCookie: z.boolean().default(false),  // Edge case from ref doc §8: strip upstream Set-Cookie by default
})

// EC-3 fix: reserve names that conflict with generated docker-compose entries
const RESERVED_SERVICE_NAMES = ['web', 'caddy', 'postgres', 'redis'] as const

// EC-12 (SHOULD TEST escalated): service-name must be docker-compose-safe — lowercase alphanumeric + hyphens
const ServiceNameSchema = z.string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, 'service name must be lowercase, start with letter, contain only a-z 0-9 -')
  .refine((n) => !(RESERVED_SERVICE_NAMES as readonly string[]).includes(n), {
    message: `service name conflicts with reserved name (${RESERVED_SERVICE_NAMES.join('/')})`,
  })

const ServicesConfigSchema = z.record(ServiceNameSchema, ServiceDefinitionSchema)
  .default({})
  // EC-1 fix: detect duplicate ports across services
  .refine((s) => {
    const ports = Object.values(s).map(v => v.port)
    return new Set(ports).size === ports.length
  }, { message: 'duplicate port across services — each service must bind a unique port' })
  // EC-1 corollary: detect duplicate proxy prefixes across services
  .refine((s) => {
    const prefixes = Object.values(s).map(v => v.proxy)
    return new Set(prefixes).size === prefixes.length
  }, { message: 'duplicate proxy prefix across services' })
```

```ts
// EC-2 fix: cross-config refine — service.port must not collide with TheoKit's own port.
// Lives in the outer TheoConfigSchema since it needs both `port` and `services`.
TheoConfigSchema.refine(
  (cfg) => !Object.values(cfg.services ?? {}).some(s => s.port === cfg.port),
  { message: 'service.port collides with TheoKit web port — change one of them' }
)
```

**Invariants:**
- Empty `{}` is valid (Wave 1 BC preserved)
- `dependsOn` references service names that exist in the same `services` record (refine validation)
- `proxy` MUST start with `/` AND be non-root (EC-4)
- `runtime` MUST be `'python' | 'node'` (Wave 2 narrows; D7)
- Cycles in `dependsOn` are forbidden (refine validation)
- Service names match `^[a-z][a-z0-9-]*$` and are NOT in reserved list (EC-3, EC-12)
- No two services share the same port (EC-1)
- No two services share the same proxy prefix
- No service's port equals TheoKit's web port (EC-2)

**Edge cases:**
- `services: {}` (empty) → valid, no behavior change
- `services: { agent: { ... } }` (one service) → typical case
- `services: { agent: { ..., dependsOn: ['db'] }, db: {...} }` (multi-service with order)
- `services: { agent: { ..., dependsOn: ['agent'] } }` → REJECT (self-dep)
- `services: { agent: { ..., dependsOn: ['nonexistent'] } }` → REJECT (refine)
- `services: { agent: {..., port: 8001}, worker: {..., port: 8001} }` → REJECT (EC-1)
- `services: { agent: {..., port: 3000} }` when `config.port = 3000` → REJECT (EC-2)
- `services: { web: {...} }` → REJECT (EC-3 reserved name)
- `services: { 'agent.v2': {...} }` → REJECT (EC-12 invalid name)
- `services: { agent: {..., proxy: '/'} }` → REJECT (EC-4 catch-all)
- `services: { agent: {..., dependsOn: []} }` → ACCEPT (EC-13 empty array = no deps)

#### Tasks
1. Add `ServiceRuntimeSchema`, `ServiceDefinitionSchema`, `ServicesConfigSchema` to `config/schema.ts`
2. Extend `TheoConfigSchema` with `services: ServicesConfigSchema`
3. Add `z.refine` for `dependsOn` cycle + missing-reference detection
4. Create `packages/theo/src/services/types.ts` re-exporting `ServiceDefinition` + `ServicesConfig`
5. Re-export from `theokit/server` barrel
6. Add type tests with `expectTypeOf` asserting inference

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     services_schema_accepts_empty() — Given services: {}, When TheoConfigSchema parses, Then no error (Wave 1 BC)
RED:     services_schema_accepts_python_minimal() — Given services: { agent: { runtime: 'python', port: 8001, proxy: '/api/agent', dev: 'uvicorn main:app --port 8001', start: 'uvicorn main:app --port 8001 --workers 4' } }, When parsed, Then no error
RED:     services_schema_accepts_node_minimal() — Given services: { worker: { runtime: 'node', port: 8002, proxy: '/api/worker', dev: 'tsx watch src/index.ts', start: 'node dist/index.js' } }, When parsed, Then no error
RED:     services_schema_rejects_invalid_runtime() — Given services: { agent: { runtime: 'go', ... } }, When parsed, Then ZodError on .runtime field
RED:     services_schema_rejects_proxy_without_slash() — Given services: { agent: { ..., proxy: 'api/agent' } }, When parsed, Then ZodError on .proxy field
RED:     services_schema_rejects_port_out_of_range() — Given services: { agent: { ..., port: 0 } }, When parsed, Then ZodError on .port field
RED:     services_schema_rejects_self_dependency() — Given services: { agent: { ..., dependsOn: ['agent'] } }, When parsed, Then ZodError citing self-dep
RED:     services_schema_rejects_missing_dependency() — Given services: { agent: { ..., dependsOn: ['nonexistent'] } }, When parsed, Then ZodError citing missing reference
RED:     services_schema_rejects_dependency_cycle() — Given services: { a: { ..., dependsOn: ['b'] }, b: { ..., dependsOn: ['a'] } }, When parsed, Then ZodError citing cycle
RED:     services_schema_default_healthcheck() — Given services: { agent: { ..., healthcheck not set } }, When parsed, Then result.agent.healthcheck === '/health'
RED:     services_schema_type_inference() — Given const cfg = defineConfig({ services: { a: { runtime: 'python', ... } } }), When expectTypeOf(cfg.services.a.runtime).toEqualTypeOf<'python' | 'node'>(), Then no type error
RED:     services_schema_rejects_duplicate_port_EC1() — Given services={a: {port:8001, ...}, b: {port:8001, ...}}, When parsed, Then ZodError 'duplicate port across services'
RED:     services_schema_rejects_port_eq_web_EC2() — Given config.port=3000 and services={a: {port:3000, ...}}, When TheoConfig parses, Then ZodError 'service.port collides with TheoKit web port'
RED:     services_schema_rejects_reserved_name_web_EC3() — Given services={web: ServiceDefinition}, When parsed, Then ZodError citing reserved name 'web'
RED:     services_schema_rejects_reserved_name_caddy_EC3() — Given services={caddy: ServiceDefinition}, When parsed, Then ZodError citing reserved name 'caddy'
RED:     services_schema_rejects_root_proxy_EC4() — Given services.agent.proxy='/', When parsed, Then ZodError citing non-root path requirement
RED:     services_schema_rejects_proxy_collision() — Given services={a: {proxy: '/api/x', ...}, b: {proxy: '/api/x', ...}}, When parsed, Then ZodError 'duplicate proxy prefix'
RED:     services_schema_accepts_empty_dependson_EC13() — Given services.agent.dependsOn=[], When parsed, Then no error
RED:     services_schema_rejects_invalid_name_EC12() — Given services={'agent.v2': ServiceDefinition}, When parsed, Then ZodError citing service-name regex
RED:     services_schema_accepts_valid_kebab_name_EC12() — Given services={'agent-prod': ServiceDefinition}, When parsed, Then no error
GREEN:   Implement schema + refines (including EC-1/2/3/4/12/13 hardening).
REFACTOR: Extract dependsOn validation to a helper if it becomes complex.
VERIFY:  npx vitest run tests/unit/services-schema.test.ts && npx tsc --noEmit
```

BDD scenarios:
- **Happy path:** empty `{}` + minimal Python + minimal Node configs all accepted
- **Validation error:** invalid runtime / invalid port / invalid proxy / self-dep / missing-dep / cycle all rejected with clear ZodError messages
- **Edge case:** `dependsOn` with valid forward references; default `healthcheck` applied when omitted
- **Error scenario:** parse fails on first error (Zod default) — error message names the field path

#### Acceptance Criteria
- [ ] `services: {}` field added to `TheoConfigSchema`
- [ ] All 11 RED tests green
- [ ] Type inference correct (`expectTypeOf` assertions pass)
- [ ] `services/types.ts` exports `ServiceDefinition`, `ServicesConfig`
- [ ] Re-export from `theokit/server` barrel works (`import type { ServiceDefinition } from 'theokit/server'`)
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `pnpm lint` zero warnings
- [ ] Pass: `npx vitest run tests/unit/services-schema.test.ts` all green

#### DoD
- [ ] Schema lands, all tests green, BC preserved (empty `{}` works)
- [ ] Downstream consumers can `import type { ServiceDefinition }` (used in Phase 2/3/4/5)

---

### T1.2 — Port `isPathInScope` from Nitro (path traversal guard)

#### Objective
Implement the path traversal scope guard that prevents `%2F`-bypass attacks on `/**` proxy patterns (GHSA-5w89-w975-hf9q).

#### Evidence
Reference doc §3.1 + §7 + §8 (path traversal edge case). Nitro `referencias/nitro/src/runtime/internal/route-rules.ts:113-126`. Real CVE in h3 history.

#### Files to edit
```
packages/theo/src/services/path-scope.ts                      (NEW)
tests/unit/services-path-scope.test.ts                        (NEW)
```

#### Deep file dependency analysis
- `path-scope.ts` is consumed by `services/proxy.ts` (T1.3) and by adapters' proxy path
- Pure function, no I/O, no deps — easy to unit test exhaustively

#### Deep Dives

**Algorithm (verbatim port from Nitro with attribution):**

```ts
/**
 * Path traversal scope guard for /**-style proxy patterns.
 *
 * Ported from Nitro src/runtime/internal/route-rules.ts:113-126
 * (GHSA-5w89-w975-hf9q). Pre-decodes %2F (/) and %5C (\) which WHATWG URL
 * leaves opaque, then canonicalizes ./../ via new URL(...).
 *
 * Returns false (deny) if:
 *   - pathname cannot be parsed
 *   - canonicalized path escapes the base
 */
export function isPathInScope(pathname: string, base: string): boolean {
  let canonical: string
  try {
    const pre = pathname.replace(/%2f/gi, '/').replace(/%5c/gi, '\\')
    canonical = new URL(pre, 'http://_').pathname
  } catch {
    return false
  }
  return !base || canonical === base || canonical.startsWith(base + '/')
}
```

**Invariants:**
- Empty `base` → always returns true (no scope to enforce)
- Malformed `pathname` → returns false (fail-closed)
- `%2F` and `%5C` are pre-decoded before canonicalization
- Returns `pathname.startsWith(base + '/')` after canonicalization — exact match or sub-path

**Edge cases:**
- `pathname = '/api/agent/foo'`, `base = '/api/agent'` → TRUE
- `pathname = '/api/agent/../escape'`, `base = '/api/agent'` → canonicalized to `/escape` → FALSE
- `pathname = '/api%2Fagent%2F..%2Fescape'`, `base = '/api/agent'` → decoded to `/api/agent/../escape` → canonicalized to `/escape` → FALSE
- `pathname = '/api/agent\\foo'` (`%5C`), `base = '/api/agent'` → decoded to `/api/agent\foo` → canonical depends on WHATWG URL handling → tested for documented behavior
- Malformed URL chars → returns false (no throw)

#### Tasks
1. Create `packages/theo/src/services/path-scope.ts` with the verbatim port + attribution comment
2. Add unit tests covering all edge cases from above
3. Verify TypeScript strict mode acceptance

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     path_scope_accepts_exact_match() — Given pathname=/api/agent and base=/api/agent, When isPathInScope, Then true
RED:     path_scope_accepts_subpath() — Given pathname=/api/agent/foo/bar and base=/api/agent, When isPathInScope, Then true
RED:     path_scope_rejects_sibling() — Given pathname=/api/agentt and base=/api/agent, When isPathInScope, Then false (no slash boundary)
RED:     path_scope_rejects_dotdot_escape() — Given pathname=/api/agent/../escape and base=/api/agent, When isPathInScope, Then false
RED:     path_scope_rejects_percent_2f_bypass() — Given pathname=/api%2Fagent%2F..%2Fescape and base=/api/agent, When isPathInScope, Then false (GHSA case)
RED:     path_scope_rejects_percent_5c_bypass() — Given pathname=/api/agent%5C..%5Cescape and base=/api/agent, When isPathInScope, Then false
RED:     path_scope_accepts_lowercase_percent_2f_inside_scope() — Given pathname=/api/agent%2ffoo and base=/api/agent, When isPathInScope, Then true (foo is inside scope after decode)
RED:     path_scope_empty_base_accepts_anything() — Given pathname=/anything and base='', When isPathInScope, Then true
RED:     path_scope_malformed_url_rejects() — Given pathname=://malformed and base=/api, When isPathInScope, Then false (no throw)
RED:     path_scope_does_not_throw() — Given any input, When isPathInScope is called, Then no exception thrown
GREEN:   Implement verbatim port from Nitro.
REFACTOR: None — keep verbatim for attribution.
VERIFY:  npx vitest run tests/unit/services-path-scope.test.ts
```

BDD scenarios:
- **Happy path:** in-scope paths accepted (exact, subpath, encoded slash inside)
- **Validation error:** out-of-scope paths rejected (dot-dot, %2F bypass, %5C bypass, sibling)
- **Edge case:** empty base accepts anything; malformed URL fails closed
- **Error scenario:** never throws — pure function, fail-closed

#### Acceptance Criteria
- [ ] `isPathInScope` exported from `packages/theo/src/services/path-scope.ts`
- [ ] All 10 RED tests green
- [ ] Attribution comment cites Nitro `route-rules.ts:113-126` + GHSA-5w89-w975-hf9q
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/unit/services-path-scope.test.ts` all green

#### DoD
- [ ] Function ported and tested
- [ ] T1.3 (proxy helper) can consume it

---

### T1.3 — Implement `proxyFetch` (Hono-style Web Standards proxy)

#### Objective
Implement the Web-Standards-native proxy helper that strips hop-by-hop headers, handles encoding correctly, and integrates `isPathInScope` for security.

#### Evidence
Reference doc §3.2 + §6 + §7 + §8. Hono's `proxy/index.ts` is the canonical reference (~190 LOC, RFC 2616 §13.5.1 + RFC 9110 §7.6.1 compliant).

#### Files to edit
```
packages/theo/src/services/proxy.ts                           (NEW)
tests/unit/services-proxy.test.ts                             (NEW)
```

#### Deep file dependency analysis
- `proxy.ts` consumes `path-scope.ts` (T1.2)
- Consumed by: production adapters (Phase 3) and the dev orchestration path when not using Vite's built-in proxy
- Pure function (mostly) — testable with `customFetch` injection

#### Deep Dives

**API surface:**

```ts
export interface ProxyOptions {
  target: string                              // 'http://localhost:8001'
  stripBase?: string                          // '/api/agent' for '/api/agent/**' patterns
  rewrite?: (path: string) => string          // optional path rewriter
  customFetch?: typeof fetch                  // for testing
  strictConnectionProcessing?: boolean        // default false (secure per Hono)
  passSetCookie?: boolean                     // default false (TheoKit-specific; ref doc §8 edge case)
  traceparent?: string                        // injected by middleware upstream; forwarded as-is
}

export async function proxyFetch(request: Request, options: ProxyOptions): Promise<Response>
```

**Algorithm:**

1. Parse request URL
2. If `stripBase` is set: assert `isPathInScope(url.pathname, stripBase)` — throw 400 if false
3. If `stripBase`: replace `url.pathname` removing `stripBase` prefix
4. If `rewrite`: apply
5. Build target URL: `joinURL(options.target, url.pathname + url.search)`
6. Build outgoing Request:
   - Clone headers from request
   - Strip hop-by-hop headers (`connection`, `keep-alive`, `proxy-authenticate`, `proxy-authorization`, `te`, `trailer`, `transfer-encoding`, `upgrade`)
   - Delete `accept-encoding` (let runtime negotiate)
   - **EC-5 fix: Set `Host` to target host (NOT inherited from incoming request).** This prevents virtual-host routing bugs in upstream services that key on Host header.
     ```ts
     const targetUrl = new URL(target)
     outgoingHeaders.set('host', targetUrl.host)
     ```
   - Set/preserve `traceparent` (from options OR existing request header)
   - For HEAD/OPTIONS: do NOT include body (EC-16; ref doc §8). For other methods with body present: `duplex: 'half'`
   - **EC-26 fix: `redirect: 'manual'`** in outgoing Request init — relay 3xx as-is, don't follow upstream redirects.
   - Set `method`, `body` (conditional per method), `signal`
7. Fetch via `customFetch ?? fetch`
8. Build outgoing Response:
   - Clone headers from response
   - Strip hop-by-hop headers
   - Delete `content-encoding` + `content-length` (body may be re-streamed/re-encoded)
   - If `!passSetCookie`: delete `set-cookie` (Wave 2 default; per ref doc §8)
9. Return `new Response(res.body, { status, statusText, headers })`

**Invariants:**
- Hop-by-hop headers MUST be stripped on BOTH request and response
- `accept-encoding` MUST be deleted from outgoing request
- `Host` MUST be set to target host (EC-5)
- HEAD/OPTIONS requests MUST NOT forward body (EC-16)
- `content-encoding` + `content-length` MUST be deleted from outgoing response
- `Set-Cookie` deleted by default; opt-in via `passSetCookie: true`
- `isPathInScope` fails closed → 400 to caller
- 3xx redirects RELAYED as-is (`redirect: 'manual'`)
- 304 Not Modified preserved with empty body (EC-17)

**Edge cases (from ref doc §8 + EC review):**
- Path traversal via `%2F` → blocked by `isPathInScope`
- Hop-by-Hop Header Injection → defaulted-off (strictConnectionProcessing: false)
- `content-encoding` mismatch when body re-streams → deleted preemptively
- Upstream 5xx → relayed as-is (status + body) with hop-by-hop stripping
- Upstream connection refused → 502 with body `{ error: { code: 'SERVICE_UNAVAILABLE', service: '<name>' } }` (TheoKit convention)
- Upstream 304 Not Modified → relayed with empty body (EC-17)
- Upstream 3xx redirect → relayed as-is, NOT followed (EC-26)
- Virtual-hosted upstream that keys on Host header → works correctly because Host is set to target (EC-5)

#### Tasks
1. Create `packages/theo/src/services/proxy.ts`
2. Implement `proxyFetch` per algorithm above
3. Import `isPathInScope` from T1.2
4. Import `joinURL` from `ufo` (D4: Nitro-validated dep)
5. Add unit tests covering each step + edge case

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     proxy_fetch_happy_path() — Given GET request, customFetch returning 200 + body, target='http://example/agent', When proxyFetch, Then response.status=200 and body matches
RED:     proxy_fetch_strips_hop_by_hop_request() — Given request with Connection: keep-alive + Keep-Alive: timeout=5, When proxyFetch with capturing customFetch, Then outgoing Request has neither header
RED:     proxy_fetch_strips_hop_by_hop_response() — Given customFetch returns Response with Connection: close + Transfer-Encoding: chunked, When proxyFetch, Then returned response has neither header
RED:     proxy_fetch_deletes_accept_encoding_outgoing() — Given request with accept-encoding: br, When proxyFetch with capturing customFetch, Then outgoing Request has NO accept-encoding header
RED:     proxy_fetch_deletes_content_encoding_response() — Given customFetch returns Response with content-encoding: gzip, When proxyFetch, Then returned response has NO content-encoding
RED:     proxy_fetch_deletes_content_length_response() — Given customFetch returns Response with content-length: 1234, When proxyFetch, Then returned response has NO content-length
RED:     proxy_fetch_strips_set_cookie_by_default() — Given customFetch returns Response with Set-Cookie: foo=bar, When proxyFetch (passSetCookie default false), Then returned response has NO set-cookie
RED:     proxy_fetch_passes_set_cookie_when_opted_in() — Given customFetch returns Response with Set-Cookie, When proxyFetch with passSetCookie: true, Then returned response HAS set-cookie
RED:     proxy_fetch_blocks_path_traversal() — Given request path=/api/agent/../escape and stripBase=/api/agent, When proxyFetch, Then thrown error with status 400 (NEVER reaches customFetch)
RED:     proxy_fetch_strips_base_correctly() — Given path=/api/agent/foo/bar and stripBase=/api/agent, When proxyFetch, Then outgoing URL has pathname=/foo/bar
RED:     proxy_fetch_forwards_traceparent() — Given request with traceparent: 00-trace-id-span-id-01, When proxyFetch with capturing customFetch, Then outgoing request has SAME traceparent
RED:     proxy_fetch_streams_body_with_duplex() — Given POST with stream body, When proxyFetch, Then customFetch receives Request with body and duplex: 'half' (verify via RequestInit shape)
RED:     proxy_fetch_502_on_upstream_failure() — Given customFetch throws TypeError ('connection refused'), When proxyFetch, Then returns Response 502 with TheoKit error body
RED:     proxy_fetch_relays_upstream_5xx_status() — Given customFetch returns Response 503, When proxyFetch, Then returned response status is 503 (not rewritten)
RED:     proxy_fetch_sets_host_to_target_EC5() — Given incoming Request has Host: theokit.example.com and target=http://localhost:8001, When proxyFetch with capturing customFetch, Then outgoing Request Host header is 'localhost:8001' (NOT 'theokit.example.com')
RED:     proxy_fetch_head_no_body_EC16() — Given HEAD request, When proxyFetch with capturing customFetch, Then outgoing Request has NO body and NO duplex option
RED:     proxy_fetch_options_no_body_EC16() — Given OPTIONS request, When proxyFetch with capturing customFetch, Then outgoing Request has NO body
RED:     proxy_fetch_304_relayed_empty_body_EC17() — Given customFetch returns Response 304 with null body, When proxyFetch, Then returned response status is 304 and body is null
RED:     proxy_fetch_3xx_redirect_not_followed_EC26() — Given customFetch returns 302 Location: /elsewhere, When proxyFetch, Then returned response status is 302 with Location header preserved (NOT auto-followed) — proxy uses redirect: 'manual'
GREEN:   Implement proxyFetch per algorithm (including EC-5/16/17/26).
REFACTOR: Extract hop-by-hop list to a constant; extract response builder to a helper if size > 200 LOC.
VERIFY:  npx vitest run tests/unit/services-proxy.test.ts
```

BDD scenarios:
- **Happy path:** GET + POST + various status codes proxied; headers cleaned correctly; body streamed
- **Validation error:** path traversal blocked; malformed `stripBase` fails closed
- **Edge case:** upstream unreachable → 502; upstream 5xx → relayed; `Set-Cookie` stripped by default
- **Error scenario:** customFetch throws → 502 with TheoKit error body

#### Acceptance Criteria
- [ ] `proxyFetch` exported with documented `ProxyOptions`
- [ ] All 14 RED tests green
- [ ] Hop-by-hop list matches RFC 2616 §13.5.1
- [ ] `Set-Cookie` stripping is default-on; opt-in pass-through documented
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/unit/services-proxy.test.ts` all green
- [ ] LOC budget: <250 LOC (target: ~200, Hono parity)

#### DoD
- [ ] Helper ready for Phase 3 adapter consumption
- [ ] All edge cases from ref doc §8 covered by tests

---

### T1.4 — Implement manifest emit/read (`.theo/services.json`)

#### Objective
Land the cross-product manifest format. `pnpm build` emits `.theo/services.json` (schemaVersion 1). Adapters read it. Empty `services: {}` → emit empty manifest (or skip — design choice; default: emit empty for consistency).

#### Evidence
Reference doc §3.x (Vercel Services manifest), §9.2 (file list), ADR-0015 invariant: contract is global across product surfaces. ADR-0002 set the precedent for neutral interfaces (JobBackend).

#### Files to edit
```
packages/theo/src/services/manifest.ts                        (NEW)
tests/unit/services-manifest.test.ts                          (NEW)
```

#### Deep file dependency analysis
- `manifest.ts` consumed by: `cli/commands/build.ts` (T3.x writes manifest); all `adapters/*.ts` (T3.1-T3.5 read manifest)
- Pure function (file I/O at boundary) — testable via in-memory or temp dirs

#### Deep Dives

**Manifest shape:**

```ts
export interface ServicesManifest {
  version: 1
  services: Array<{
    name: string
    runtime: 'python' | 'node'
    port: number
    proxy: string
    dev: string
    build?: string
    start: string
    openapi?: string
    healthcheck: string
    cors: boolean
    env?: Record<string, string>
    dependsOn?: string[]
    passSetCookie: boolean
  }>
}
```

**API:**

```ts
export function buildManifest(services: ServicesConfig): ServicesManifest
export function writeManifest(cwd: string, manifest: ServicesManifest): void  // writes .theo/services.json
export function readManifest(cwd: string): ServicesManifest | null            // returns null if file missing
```

**Invariants:**
- Manifest is NEUTRAL — no platform-specific fields (D5)
- `version: 1` is always present
- Service order in `services` array matches `dependsOn` topological order (deterministic)
- File path is exactly `<cwd>/.theo/services.json`

**Edge cases:**
- Empty `services: {}` → manifest with `services: []` (still emit for consistency)
- `dependsOn` cycle → schema rejects upstream (T1.1), not manifest's concern
- File not present on read → return `null` (adapter's job to handle)
- File present but malformed → throw with actionable error

#### Tasks
1. Create `services/manifest.ts` with `buildManifest`, `writeManifest`, `readManifest`
2. Implement topological sort for `dependsOn` ordering
3. Add unit tests + snapshot test on fixture config

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     manifest_build_empty() — Given services={}, When buildManifest, Then result.services=[] and result.version=1
RED:     manifest_build_one_service() — Given services={agent: ServiceDefinition}, When buildManifest, Then result.services has 1 entry with name='agent'
RED:     manifest_build_preserves_all_fields() — Given a ServiceDefinition with all optional fields set, When buildManifest, Then resulting entry preserves them
RED:     manifest_topological_order() — Given services={a: {dependsOn:['b']}, b: {}, c: {dependsOn:['a']}}, When buildManifest, Then services array order is [b, a, c]
RED:     manifest_write_read_roundtrip() — Given a manifest M, When writeManifest then readManifest from same cwd, Then deep-equal to M
RED:     manifest_read_missing_returns_null() — Given .theo/services.json does not exist, When readManifest, Then returns null
RED:     manifest_read_malformed_throws() — Given .theo/services.json contains invalid JSON, When readManifest, Then throws with actionable message
RED:     manifest_no_platform_specific_fields() — Given a manifest is written, When .theo/services.json is parsed, Then no keys named 'vercel'/'cloudflare'/'theoCloud' exist (D5 enforcement via test)
RED:     manifest_write_creates_directory_EC6() — Given .theo/ does NOT exist (fresh project), When writeManifest, Then .theo/ is created (mkdir recursive) and services.json is written successfully
GREEN:   Implement buildManifest + writeManifest + readManifest. Add topological sort. writeManifest calls fs.mkdirSync(path.dirname(filePath), { recursive: true }) before write (EC-6 fix).
REFACTOR: Extract topo sort to a util if used elsewhere.
VERIFY:  npx vitest run tests/unit/services-manifest.test.ts
```

BDD scenarios:
- **Happy path:** services → manifest → file → parsed back identically
- **Validation error:** malformed JSON → throw with message
- **Edge case:** empty services; topological ordering preserved
- **Error scenario:** missing file returns null (not error); permission errors propagate

#### Acceptance Criteria
- [ ] `buildManifest`, `writeManifest`, `readManifest` exported
- [ ] All 8 RED tests green
- [ ] Topological sort deterministic
- [ ] D5 enforced: no platform fields in manifest
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/unit/services-manifest.test.ts` all green

#### DoD
- [ ] Manifest format stable; adapters can rely on schemaVersion 1
- [ ] Phase 3 unblocked

---

### T1.5 — Implement healthcheck poller

#### Objective
Poll `GET http://localhost:<port><healthcheck>` with backoff until 200 OR timeout. Used by `pnpm dev` to gate readiness on services being live.

#### Evidence
Reference doc §3.x (Caddy depends_on pattern, Docker healthcheck), §9.5 (test strategy). ADR-0015 invariant #4 (healthcheck convention `GET /health`).

#### Files to edit
```
packages/theo/src/services/healthcheck-poller.ts              (NEW)
tests/unit/services-healthcheck.test.ts                       (NEW)
```

#### Deep file dependency analysis
- Consumed by Phase 2 (`vite-plugin/services-dev.ts`) to block dev readiness
- Could also be used by adapters (Phase 3) for build-time validation (out of Wave 2 scope — opt-in)
- No external lib deps (uses `fetch` + `AbortController`)

#### Deep Dives

**API:**

```ts
export interface HealthcheckOptions {
  url: string                              // 'http://localhost:8001/health'
  timeoutMs?: number                       // default 30000 (30s)
  intervalMs?: number                      // default 500
  signal?: AbortSignal                     // for test cancel
}

export interface HealthcheckResult {
  healthy: boolean
  attempts: number
  durationMs: number
  lastError?: string
}

export async function pollHealthcheck(options: HealthcheckOptions): Promise<HealthcheckResult>
```

**Algorithm:**

1. Record start time
2. Loop:
   - `fetch(url, { signal: timeoutSignal })`
   - If response.status === 200 → return `{ healthy: true, attempts, durationMs, lastError: undefined }`
   - On error or non-200: capture `lastError`, sleep `intervalMs`, increment attempts
   - If elapsed > `timeoutMs`: return `{ healthy: false, attempts, durationMs, lastError }`
3. Respect external `signal` for early cancel

**Invariants:**
- Returns within `timeoutMs` + one interval (no hang)
- `attempts >= 1` always
- Never throws — returns `{ healthy: false }` on error

**Edge cases:**
- Service up on first try → 1 attempt, fast return
- Service slow → multiple attempts, eventual success
- Service never up → timeout, `healthy: false`
- External cancel via signal → returns early with `healthy: false, lastError: 'aborted'`
- 503 response (service starting) → treated like any non-200, keep polling

#### Tasks
1. Implement `pollHealthcheck` with `AbortController` timeout
2. Add tests using mock `fetch` (vitest mock)
3. Test signal cancel, timeout, fast success, slow success

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     healthcheck_returns_healthy_on_first_200() — Given mock fetch returning 200, When pollHealthcheck, Then result.healthy=true and attempts=1
RED:     healthcheck_retries_until_200() — Given mock fetch returning 503,503,200, When pollHealthcheck, Then result.healthy=true and attempts=3
RED:     healthcheck_returns_unhealthy_on_timeout() — Given mock fetch always returning 503, When pollHealthcheck with timeoutMs=200 intervalMs=50, Then result.healthy=false within ~250ms
RED:     healthcheck_returns_unhealthy_on_network_error() — Given mock fetch always throwing TypeError, When pollHealthcheck with timeoutMs=200, Then result.healthy=false
RED:     healthcheck_respects_external_abort_signal() — Given external AbortController, When abort is called mid-poll, Then pollHealthcheck returns within <intervalMs with healthy=false and lastError='aborted'
RED:     healthcheck_records_attempts_correctly() — Given mock fetch returning 5 failures then 200, When pollHealthcheck, Then result.attempts=6
RED:     healthcheck_records_duration() — Given mock fetch with 100ms delay returning 200 on second call, When pollHealthcheck intervalMs=50, Then result.durationMs >= 50 and < 1000
RED:     healthcheck_never_throws() — Given mock fetch throwing any error, When pollHealthcheck, Then promise resolves (never rejects)
GREEN:   Implement pollHealthcheck.
REFACTOR: Extract sleep helper if reused.
VERIFY:  npx vitest run tests/unit/services-healthcheck.test.ts
```

BDD scenarios:
- **Happy path:** service up → healthy quickly
- **Validation error:** N/A (no validation)
- **Edge case:** service slow-start (retries); external cancel
- **Error scenario:** never up → timeout returns `{healthy: false}` not throw

#### Acceptance Criteria
- [ ] `pollHealthcheck` exported
- [ ] All 8 RED tests green
- [ ] Never throws — returns `{healthy: false}` on any error
- [ ] Respects external `AbortSignal`
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/unit/services-healthcheck.test.ts` all green

#### DoD
- [ ] Poller ready for Phase 2 dev orchestration
- [ ] Documented edge cases all tested

---

## Phase 2: Dev Orchestration

**Objective:** `pnpm dev` boots TheoKit + declared polyglot services. Vite proxy auto-wired. Healthcheck-gated readiness. Log merge with `[service]` prefix.

### T2.1 — Vite plugin: wire `services: {}` → `server.proxy`

#### Objective
Read `theo.config.ts > services: {}` at Vite plugin init and translate each service entry into `vite.config.server.proxy` config. Vite uses `http-proxy-3` underneath (D4).

#### Evidence
Reference doc §3.3 (Vite proxy middleware). ADR-0015 invariant #1 (fetch handler, but Vite dev path uses Node IncomingMessage — internal detail).

#### Files to edit
```
packages/theo/src/vite-plugin/services-dev.ts                 (NEW)
packages/theo/src/vite-plugin/index.ts                        (MODIFY — wire services-dev plugin)
tests/unit/services-vite-plugin.test.ts                       (NEW)
tests/integration/services-dev-python.test.ts                 (NEW — requires uvicorn locally OR mock-spawn)
```

#### Deep file dependency analysis
- `services-dev.ts` consumes `config/schema.ts` (T1.1) — reads `config.services`
- Wired into Vite plugin chain via `vite-plugin/index.ts`
- Integration test depends on Phase 1 schema + uvicorn locally (CI fixture)

#### Deep Dives

**Algorithm:**

1. Vite plugin `config()` hook reads loaded TheoKit config
2. For each entry in `config.services`:
   - Compute `target = http://localhost:${service.port}`
   - Build proxy rule: `{ [service.proxy]: { target, changeOrigin: true, rewrite: undefined } }`
   - Optionally: add `headers: { traceparent: ... }` for outgoing requests (Wave 2 strict: rely on request-passed traceparent only, no injection at proxy layer)
3. Merge into Vite's `server.proxy` config
4. Return modified Vite config

**Invariants:**
- Empty `services: {}` → no-op (no proxy entries added)
- `service.proxy` MUST be unique across services (validation in T1.1 schema refine OR here as a defensive check)
- Vite's existing `server.proxy` (if user manually set) is RESPECTED — TheoKit only adds, never overwrites

**Edge cases:**
- User sets `server.proxy` manually AND has `services: {}` → both apply (TheoKit doesn't clobber)
- Service port collision (`port: 8001` × 2) → schema rejects upstream
- Proxy prefix collision (`proxy: '/api/foo'` × 2) → DETECT here, throw with actionable message

#### Tasks
1. Create `vite-plugin/services-dev.ts` with `serviceDevPlugin(config)` function
2. Wire into `vite-plugin/index.ts` (after existing plugins)
3. Add unit tests for translation logic
4. Add integration test spawning a real uvicorn (OR a mock that listens on a port)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     vite_services_empty_no_op() — Given config with services={}, When serviceDevPlugin().config(), Then no server.proxy entries added
RED:     vite_services_python_translates() — Given config with services.agent={runtime:'python',port:8001,proxy:'/api/agent',...}, When serviceDevPlugin().config(), Then server.proxy has entry { '/api/agent': { target: 'http://localhost:8001', changeOrigin: true } }
RED:     vite_services_multiple_translate() — Given config with services.agent (python) and services.worker (node), When plugin runs, Then server.proxy has BOTH entries
RED:     vite_services_preserves_user_proxy() — Given user-set vite.config.server.proxy={'/external': '...'}, When TheoKit plugin runs, Then user entry is preserved AND services entries are added
RED:     vite_services_prefix_collision_throws() — Given services.a.proxy='/api/x' and services.b.proxy='/api/x', When plugin runs, Then throws with actionable message naming both services
RED:     vite_services_integration_uvicorn_real() — Given a uvicorn process listening on 8001 with /health returning 200 and /echo POST returning request body, When pnpm dev runs with services.agent config, Then GET /api/agent/echo from browser returns echoed body (Playwright OR fetch in test)
GREEN:   Implement serviceDevPlugin.
REFACTOR: Extract proxy entry builder if reused by Node adapter (T3.3).
VERIFY:  npx vitest run tests/unit/services-vite-plugin.test.ts && npx vitest run tests/integration/services-dev-python.test.ts
```

BDD scenarios:
- **Happy path:** services translate to Vite proxy correctly; user proxy preserved
- **Validation error:** prefix collision throws
- **Edge case:** empty services no-op; user's manual proxy survives
- **Error scenario:** integration test — uvicorn down, healthcheck poller (T1.5) catches BEFORE Vite tries to proxy

#### Acceptance Criteria
- [ ] `serviceDevPlugin` exported and wired in `vite-plugin/index.ts`
- [ ] All 6 RED tests green
- [ ] Integration test passes when uvicorn is running
- [ ] User's manual `server.proxy` preserved
- [ ] Prefix collision detected with actionable error
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run` for both test files green

#### DoD
- [ ] Vite plugin wires services to proxy
- [ ] Real uvicorn → browser request flow verified

---

### T2.2 — Process spawn + lifecycle (dev startup)

#### Objective
On `pnpm dev`, spawn each declared service as a child process running its `dev` command. Manage lifecycle: graceful shutdown on Ctrl+C, restart on crash (opt-in, off-by-default in Wave 2 — let user restart).

#### Evidence
Reference doc §9.6 Phase 2. Convergent pattern from Encore (`encore run`) and Nitro (built-in dev).

#### Files to edit
```
packages/theo/src/services/process-spawn.ts                   (NEW)
packages/theo/src/cli/commands/dev.ts                         (MODIFY — invoke spawn on startup)
tests/unit/services-process-spawn.test.ts                     (NEW)
```

#### Deep file dependency analysis
- `process-spawn.ts` consumes `config/schema.ts` (T1.1) + `healthcheck-poller.ts` (T1.5)
- `cli/commands/dev.ts` orchestrates: spawn services → poll healthchecks → start Vite (existing behavior preserved if `services: {}`)
- Cross-platform shell handling required (Windows vs Unix)

#### Deep Dives

**API:**

```ts
export interface SpawnedService {
  name: string
  process: ChildProcess
  port: number
  stop: () => Promise<void>  // SIGTERM then SIGKILL after 5s
}

export async function spawnServices(
  services: ServicesConfig,
  options: {
    cwd: string
    onLog?: (service: string, stream: 'stdout' | 'stderr', line: string) => void
    onExit?: (service: string, code: number | null) => void
  }
): Promise<SpawnedService[]>

export async function stopAllServices(services: SpawnedService[]): Promise<void>
```

**Algorithm:**

1. For each service in `services`:
   - Resolve `cwd` (relative to project root: `services/<name>/`)
   - **EC-8 fix: auto-inject convention env vars** before merging user env:
     ```ts
     const env = {
       ...process.env,
       THEOKIT_SERVICE_NAME: name,                  // e.g., 'agent'
       THEOKIT_SERVICE_PORT: String(service.port),  // e.g., '8001'
       ...(service.env ?? {}),                       // user env wins if conflict
     }
     ```
   - Spawn child process via `child_process.spawn(command, { cwd, shell: true, env })`
   - Pipe stdout/stderr to `onLog` callback
   - On 'exit' event: invoke `onExit`
2. **EC-7 fix: register lifecycle handlers** on parent process to prevent orphans:
   ```ts
   const killAll = () => children.forEach(c => { try { c.process.kill('SIGKILL') } catch {} })
   process.on('exit', killAll)                       // normal exit
   process.on('SIGINT', async () => { await stopAllServices(children); process.exit(130) })
   process.on('SIGTERM', async () => { await stopAllServices(children); process.exit(143) })
   ```
   Note: SIGKILL on parent cannot be caught (kernel-level); documented in EC-27. Normal exits and SIGINT/SIGTERM ARE covered.
3. Return array of `SpawnedService` (NOT awaiting healthcheck here — that's T2.4)

**Invariants:**
- Empty `services: {}` → returns `[]` (no spawns)
- Stopping triggers SIGTERM → wait 5s → SIGKILL if still alive
- Cross-platform: use `shell: true` for command parsing (works on Win+Unix)
- Env variables: `THEOKIT_SERVICE_NAME` + `THEOKIT_SERVICE_PORT` auto-injected (EC-8); service-specific env in `service.env` merged on top
- On parent normal exit / SIGINT / SIGTERM: all child processes killed (EC-7); SIGKILL on parent is uncatchable (documented limit)

**Edge cases:**
- Service command fails to spawn (binary not found) → `onExit` called with code !== 0 → log error + continue (don't crash dev startup)
- Service crashes mid-run → `onExit` invoked → log warning; user restarts (no auto-restart in Wave 2)
- `pnpm dev` Ctrl+C → catch SIGINT → call `stopAllServices` → wait → exit
- Terminal force-closed (SIGKILL parent) → orphan children possible (EC-7 documented limit); user must `lsof -i :<port>` to clean
- Auto-injected env vars: `THEOKIT_SERVICE_NAME`, `THEOKIT_SERVICE_PORT` available in service code (EC-8)

#### Tasks
1. Create `services/process-spawn.ts` with auto-env-injection (EC-8) and lifecycle handlers (EC-7)
2. Modify `cli/commands/dev.ts` to call `spawnServices` BEFORE starting Vite
3. Wire shutdown handler on SIGINT/SIGTERM
4. Add unit tests using mock `child_process.spawn` (vitest mock)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     spawn_empty_services_returns_empty() — Given services={}, When spawnServices, Then returns []
RED:     spawn_one_service_starts_process() — Given services={agent: {dev: 'echo hello', cwd: 'services/agent'}}, When spawnServices, Then returns 1 SpawnedService and onLog received 'hello'
RED:     spawn_multiple_services_starts_all() — Given 2 services, When spawnServices, Then returns 2 SpawnedService entries
RED:     spawn_passes_env_correctly() — Given services.agent.env={MY_VAR:'x'}, When spawnServices and process echoes $MY_VAR, Then onLog receives 'x'
RED:     spawn_auto_injects_service_name_EC8() — Given services.agent (no env field), When spawnServices and command echoes $THEOKIT_SERVICE_NAME, Then onLog receives 'agent'
RED:     spawn_auto_injects_service_port_EC8() — Given services.agent.port=8001, When spawnServices and command echoes $THEOKIT_SERVICE_PORT, Then onLog receives '8001'
RED:     spawn_user_env_wins_over_auto_inject() — Given services.agent.env={THEOKIT_SERVICE_NAME:'custom'}, When spawnServices, Then $THEOKIT_SERVICE_NAME is 'custom' (user override wins)
RED:     spawn_registers_exit_handler_EC7() — Given spawnServices runs and registers handlers, When process.on('exit') is inspected via mock, Then a killAll handler is registered
RED:     spawn_sigint_triggers_stop_all_EC7() — Given spawnServices ran and a SIGINT-like event is dispatched, When handler runs, Then stopAllServices is called (verify via spy)
RED:     stop_service_sends_sigterm() — Given a running spawned service, When stop() is called, Then kill is called with SIGTERM (verify via mock)
RED:     stop_service_sigkill_after_timeout() — Given a service that ignores SIGTERM (mock), When stop() called with 5s timeout, Then SIGKILL sent after 5s
RED:     spawn_exit_invokes_callback() — Given a service that exits with code 1, When spawned, Then onExit called with code=1
RED:     spawn_binary_not_found_handled() — Given services={a: {dev: 'nonexistent-binary'}}, When spawnServices, Then promise resolves, onExit called with non-zero exit (does NOT crash dev startup)
RED:     stop_all_services_awaits_all() — Given 3 running services, When stopAllServices, Then all 3 receive SIGTERM and stopAllServices resolves after all exit
GREEN:   Implement spawnServices + stopAllServices.
REFACTOR: Extract SIGTERM-then-SIGKILL pattern to a helper.
VERIFY:  npx vitest run tests/unit/services-process-spawn.test.ts
```

BDD scenarios:
- **Happy path:** services spawn, run, log output, stop gracefully
- **Validation error:** N/A (validation done in T1.1 schema)
- **Edge case:** binary not found → graceful failure; user signal cancel
- **Error scenario:** service crashes → onExit fires; no auto-restart in Wave 2

#### Acceptance Criteria
- [ ] `spawnServices`, `stopAllServices` exported
- [ ] All 9 RED tests green
- [ ] `cli/commands/dev.ts` invokes spawn BEFORE Vite starts
- [ ] SIGINT handler in dev.ts triggers `stopAllServices`
- [ ] Cross-platform (test on Linux + macOS; Windows verified in integration)
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/unit/services-process-spawn.test.ts` all green

#### DoD
- [ ] Services boot with `pnpm dev`
- [ ] Services stop cleanly on Ctrl+C

---

### T2.3 — Log merge with `[service]` prefix

#### Objective
Stream all service stdout/stderr through TheoKit's logger with `[service-name]` prefix, so the dev terminal shows interleaved logs from TheoKit + all services without ambiguity.

#### Evidence
Convergent pattern from Encore (`encore run` log output), Nitro, JHipster docker-compose. ADR-0015 invariant #5 (JSON-line stdout for services).

#### Files to edit
```
packages/theo/src/services/log-merge.ts                       (NEW)
packages/theo/src/cli/commands/dev.ts                         (MODIFY — wire onLog callback)
tests/unit/services-log-merge.test.ts                         (NEW)
```

#### Deep file dependency analysis
- `log-merge.ts` consumes service stdout/stderr (from T2.2 `onLog`)
- Wired into `cli/commands/dev.ts` after T2.2
- Uses existing TheoKit logger conventions (picocolors)

#### Deep Dives

**API:**

```ts
export function createLogMerger(): {
  onLog: (service: string, stream: 'stdout' | 'stderr', line: string) => void
}
```

**Algorithm:**

1. Receive `(service, stream, line)` per log line
2. Detect if line is JSON (starts with `{`) — try parse:
   - If JSON: extract `level`, `message`, `traceparent` if present; pretty-print with prefix `[service]`
   - If not JSON: print raw with prefix `[service]`
3. Use picocolors: service name colored deterministically (hash service name → color from palette)
4. stderr lines marked with `!` prefix or red color

**Invariants:**
- Each log line prefixed with `[service]` (no exceptions)
- Line is NEVER swallowed — always rendered
- JSON parse failure falls back to raw line (no error)

**Edge cases:**
- Multi-line JSON in single chunk → split by `\n`, parse each
- Very long lines → no truncation (responsibility of service to limit)
- ANSI codes in non-JSON output → forwarded as-is (dev mode), stripped in CI (env detection)

#### Tasks
1. Create `services/log-merge.ts` with `createLogMerger`
2. Wire into `cli/commands/dev.ts` (`onLog` passed to T2.2 `spawnServices`)
3. Add unit tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     log_merge_prefixes_service_name() — Given onLog('agent', 'stdout', 'hello'), When merger handles it, Then output contains '[agent]' and 'hello'
RED:     log_merge_parses_json_line() — Given onLog('agent', 'stdout', '{"level":"info","message":"started"}'), When merger handles, Then output formatted with level 'info' and message 'started'
RED:     log_merge_fallback_on_invalid_json() — Given onLog with invalid JSON line, When merger handles, Then raw line rendered with [service] prefix (no error)
RED:     log_merge_stderr_marked() — Given onLog('agent', 'stderr', 'error msg'), When merger handles, Then output marks stderr distinctly (e.g., red color or '!' prefix)
RED:     log_merge_deterministic_color_per_service() — Given onLog called twice for 'agent' and twice for 'worker', When merger handles, Then 'agent' uses ONE consistent color and 'worker' uses ANOTHER consistent color
RED:     log_merge_handles_multiline_chunk() — Given onLog with line containing 2 \n-separated entries, When merger handles, Then 2 prefixed lines rendered
GREEN:   Implement createLogMerger.
REFACTOR: Extract JSON parse + color hash if reused.
VERIFY:  npx vitest run tests/unit/services-log-merge.test.ts
```

BDD scenarios:
- **Happy path:** JSON logs parsed + prefixed; raw logs prefixed
- **Validation error:** invalid JSON → raw fallback (no error)
- **Edge case:** multi-line chunks split; color deterministic per service
- **Error scenario:** N/A — never throws

#### Acceptance Criteria
- [ ] `createLogMerger` exported
- [ ] All 6 RED tests green
- [ ] Wired in `cli/commands/dev.ts`
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/unit/services-log-merge.test.ts` all green

#### DoD
- [ ] Logs from services merged with TheoKit logs in dev terminal
- [ ] Service identification unambiguous

---

### T2.4 — Healthcheck-gated readiness

#### Objective
Block `pnpm dev`'s "ready" message until ALL services pass healthcheck. Fail fast if any service is unhealthy after timeout.

#### Evidence
Reference doc §3.10 (Caddy depends_on pattern), §8 (race condition edge case). ADR-0015 invariant #4 (healthcheck convention).

#### Files to edit
```
packages/theo/src/cli/commands/dev.ts                         (MODIFY — sequence spawn → poll → Vite)
tests/integration/services-dev-readiness.test.ts              (NEW)
```

#### Deep file dependency analysis
- `dev.ts` orchestrates: T2.2 (spawn) → T1.5 (healthcheck poll per service in parallel) → start Vite → render "ready"
- Integration test simulates a slow-starting service

#### Deep Dives

**Sequence in `dev.ts`:**

```ts
const services = await spawnServices(config.services, {...})

if (services.length > 0) {
  log.info('Waiting for services to be healthy...')
  const results = await Promise.all(
    services.map(s => pollHealthcheck({
      url: `http://localhost:${s.port}${config.services[s.name].healthcheck}`,
      timeoutMs: 30000,
    }))
  )
  const unhealthy = results.filter(r => !r.healthy)
  if (unhealthy.length > 0) {
    log.error('Services failed to become healthy:', unhealthy)
    await stopAllServices(services)
    process.exit(1)
  }
  log.info('All services healthy')
}

// existing Vite startup
```

**Invariants:**
- Vite never starts before all services healthy
- Healthcheck timeout = 30s default
- Healthcheck poll in PARALLEL (not sequential) for fast boot

**Edge cases:**
- Service has no `healthcheck` URL (e.g., `healthcheck: ''`) → SKIP poll, assume healthy after spawn (Wave 2: opt-out documented but discouraged)
- Service crashes during polling → onExit detected → poll returns unhealthy → fail fast
- User Ctrl+C during polling → cancel via AbortController → stopAllServices → exit clean

#### Tasks
1. Modify `cli/commands/dev.ts` to add healthcheck sequence
2. Add integration test using mock service that takes ~2s to be healthy

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dev_waits_for_healthy_services() — Given services config + mock service that becomes healthy after 2s, When pnpm dev starts, Then Vite startup is delayed until services healthy
RED:     dev_fails_fast_on_unhealthy_service() — Given service that never responds, When pnpm dev starts with healthcheck timeout 5s, Then dev exits with code 1 within ~6s and stopAllServices called
RED:     dev_starts_immediately_with_empty_services() — Given services={}, When pnpm dev starts, Then Vite starts without healthcheck wait
RED:     dev_parallel_healthcheck_for_multiple_services() — Given 2 services each taking 2s to be healthy, When dev waits, Then total wait time ~2s (parallel) not ~4s (sequential)
RED:     dev_ctrl_c_during_poll_clean_shutdown() — Given dev is waiting on healthcheck, When SIGINT received, Then stopAllServices called and exit 0
GREEN:   Implement healthcheck gate in dev.ts.
REFACTOR: Extract orchestration to a function if it grows.
VERIFY:  npx vitest run tests/integration/services-dev-readiness.test.ts
```

BDD scenarios:
- **Happy path:** services healthy → Vite starts
- **Validation error:** N/A
- **Edge case:** empty services → no wait; multiple services → parallel
- **Error scenario:** timeout → fail fast; Ctrl+C → clean shutdown

#### Acceptance Criteria
- [ ] `dev.ts` sequence: spawn → poll in parallel → start Vite
- [ ] All 5 RED tests green
- [ ] Timeout default 30s; configurable via `services.<name>.healthcheckTimeout` (Wave 2 optional, schema extension)
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/integration/services-dev-readiness.test.ts` all green

#### DoD
- [ ] Vite never starts before services healthy
- [ ] Fail fast on unhealthy
- [ ] Clean shutdown on Ctrl+C

---

## Phase 3: Production Adapters

**Objective:** Each deploy adapter reads `.theo/services.json` and produces platform-native artifacts. Vercel = Vercel Services block. Node = docker-compose + Caddyfile. Cloudflare = reject Python with actionable error. Others = loud rejection (Wave 2 limitation, documented).

### T3.1 — Vercel adapter: write services block

#### Objective
The Vercel adapter consumes `.theo/services.json` and emits `vercel.json` matching the 2026 Vercel Services spec (captured in T0.2 snapshot).

#### Evidence
T0.2 snapshot. Reference doc §3.9. ADR-0015 cross-product framing.

#### Files to edit
```
packages/theo/src/adapters/vercel.ts                          (MODIFY — read manifest, emit vercel.json)
tests/integration/services-prod-vercel.test.ts                (NEW)
tests/fixtures/services-python-basic/                         (NEW — minimal fixture with 1 Python service)
```

#### Deep file dependency analysis
- `vercel.ts` currently emits Vercel function entry; Wave 2 ADDS services block to `vercel.json`
- Reads manifest via T1.4 `readManifest`
- Fixture project provides reproducible end-to-end test target

#### Deep Dives

**Algorithm:**

1. Read manifest via `readManifest(cwd)`
2. If null OR `services.length === 0` → no change (Wave 1 behavior)
3. **EC-9 fix: read existing `vercel.json` and deep-merge.** Never overwrite user-defined fields:
   ```ts
   const existingPath = path.join(cwd, 'vercel.json')
   const existing = fs.existsSync(existingPath)
     ? JSON.parse(fs.readFileSync(existingPath, 'utf-8'))
     : {}
   const merged = {
     ...existing,
     services: buildServicesBlock(manifest),  // TheoKit owns ONLY this key
   }
   fs.writeFileSync(existingPath, JSON.stringify(merged, null, 2))
   ```
   The TheoKit adapter ONLY writes/overwrites the `services` key. All other top-level keys (`env`, `headers`, `redirects`, `crons`, etc.) come from existing file untouched.
4. Build Vercel `services` block per T0.2 snapshot shape:

```json
{
  "version": 2,
  "services": [
    {
      "name": "web",
      "buildCommand": "pnpm build",
      "outputDirectory": ".theo/vercel"
    },
    {
      "name": "<service.name>",
      "runtime": "python",
      "src": "services/<service.name>/",
      "buildCommand": "...",
      "routes": [{ "src": "<service.proxy>/(.*)", "dest": "..." }]
    }
  ]
}
```

(Exact shape from T0.2 snapshot — not guessed)

**Invariants:**
- Empty manifest → no behavior change (Wave 1 BC)
- Non-empty manifest → adapter writes services block + Python `excludeFiles` for size limit
- Path routing matches `service.proxy` prefix

**Edge cases:**
- Service runtime `node` → mapped to Vercel Node function or Edge function (T0.2 should clarify)
- Service requires `excludeFiles` for Python 500MB bundle → adapter generates default `excludeFiles: ['__pycache__/**', 'tests/**', '*.pyc']` plus user-provided

#### Tasks
1. Modify `adapters/vercel.ts` to read manifest
2. Add services-block emission to `vercel.json`
3. Create fixture `tests/fixtures/services-python-basic/` (TS app + FastAPI service)
4. Add integration test asserting `vercel.json` shape matches T0.2 snapshot

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     vercel_adapter_no_services_unchanged() — Given fixture with services={}, When vercel adapter runs, Then vercel.json does NOT contain services array (Wave 1 BC)
RED:     vercel_adapter_python_service_emits_block() — Given fixture with services.agent (python), When vercel adapter runs, Then vercel.json has services array with web + agent entries
RED:     vercel_adapter_python_runtime_excludefiles() — Given Python service, When adapter runs, Then vercel.json has excludeFiles for service.agent including __pycache__ and tests
RED:     vercel_adapter_path_routing_matches_proxy() — Given services.agent.proxy='/api/agent', When adapter runs, Then vercel.json routes include path matching /api/agent/(.*)
RED:     vercel_adapter_shape_matches_snapshot() — Given fixture services-python-basic, When adapter runs, Then generated vercel.json deep-equals tests/fixtures/spike-vercel-services/vercel.json (T0.2 snapshot)
RED:     vercel_adapter_multi_service() — Given fixture with 2 services (python+node), When adapter runs, Then vercel.json has 3 entries (web + 2 services)
RED:     vercel_adapter_node_runtime_handled() — Given services.worker (node, port 8002), When adapter runs, Then vercel.json includes correct Node runtime spec per T0.2
RED:     vercel_adapter_preserves_user_fields_EC9() — Given existing vercel.json with {env: {FOO:'bar'}, headers: [...], crons: [...]}, When vercel adapter runs with services, Then merged vercel.json has BOTH original env/headers/crons AND new services array
RED:     vercel_adapter_only_overwrites_services_key_EC9() — Given existing vercel.json with services: [/* user-set */], When adapter runs, Then services key is REPLACED with TheoKit-generated (TheoKit owns this key); all other keys preserved
GREEN:   Modify adapter with deep-merge (EC-9).
REFACTOR: Extract Vercel-config builder to a helper if growing.
VERIFY:  npx vitest run tests/integration/services-prod-vercel.test.ts
```

BDD scenarios:
- **Happy path:** services emit Vercel block correctly
- **Validation error:** N/A (validation upstream in T1.1)
- **Edge case:** empty services preserves Wave 1; multi-service routes correctly
- **Error scenario:** N/A — adapter is pure build-time

#### Acceptance Criteria
- [ ] Vercel adapter reads manifest
- [ ] All 7 RED tests green
- [ ] Shape matches T0.2 snapshot byte-for-byte (post-sanitization)
- [ ] Wave 1 BC preserved (empty services → no change)
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/integration/services-prod-vercel.test.ts` all green

#### DoD
- [ ] Vercel adapter polyglot-ready
- [ ] Fixture deploys to real Vercel (manual smoke; not in CI)

---

### T3.2 — Cloudflare adapter: reject Python with actionable error

#### Objective
The Cloudflare Workers adapter throws an actionable error when `runtime: 'python'` is in the manifest. Node services are accepted (CF Workers has Node compat).

#### Evidence
Reference doc §8 (CF Workers no Python). ADR-0014 invariant: don't silently degrade.

#### Files to edit
```
packages/theo/src/adapters/cloudflare.ts                      (MODIFY — reject Python)
tests/integration/services-prod-cloudflare.test.ts            (NEW)
```

#### Deep file dependency analysis
- `cloudflare.ts` reads manifest, scans for `runtime: 'python'`, throws if found
- No fixture needed beyond `services-python-basic` (T3.1) for the rejection test

#### Deep Dives

**Algorithm:**

1. Read manifest
2. For each service: if `runtime === 'python'` → throw with message:

> ```
> Error: Cloudflare Workers does not support Python services (as of 2026).
> Service '<name>' declared runtime: 'python' in theo.config.ts.
>
> Options:
>   1. Deploy to Vercel (supports Python via Vercel Services)
>   2. Deploy to TheoCloud (Wave 3 — supports Python)
>   3. Use Node services on Cloudflare instead
>
> See docs/concepts/services.md for the polyglot adapter compatibility matrix.
> ```

**Invariants:**
- Empty services / Node-only services → adapter proceeds normally (Wave 1 BC + Node sidecars supported)
- Python services → throw immediately, fail loud
- Mixed (Node + Python) → throw

**Edge cases:**
- Manifest absent → no change (Wave 1)
- Wave 1 user has no services in config → no change

#### Tasks
1. Modify `adapters/cloudflare.ts` with manifest scan + throw
2. Add integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     cf_adapter_no_services_unchanged() — Given services={}, When CF adapter runs, Then build completes successfully (Wave 1 BC)
RED:     cf_adapter_node_only_allowed() — Given services.worker (node only), When CF adapter runs, Then build completes
RED:     cf_adapter_python_throws_actionable_error() — Given services.agent (python), When CF adapter runs, Then throws with message containing 'Cloudflare Workers does not support Python' and naming the service
RED:     cf_adapter_mixed_python_node_throws() — Given services.agent (python) + services.worker (node), When CF adapter runs, Then throws (named only the python service in error)
RED:     cf_adapter_error_lists_alternatives() — Given Python service rejection, When error is thrown, Then message contains 'Vercel', 'TheoCloud', 'Node services'
GREEN:   Modify adapter with scan-and-throw.
REFACTOR: Extract error message to a constant.
VERIFY:  npx vitest run tests/integration/services-prod-cloudflare.test.ts
```

BDD scenarios:
- **Happy path:** empty services or Node-only proceeds
- **Validation error:** Python rejection
- **Edge case:** mixed Python+Node → still rejects
- **Error scenario:** error message actionable (lists alternatives)

#### Acceptance Criteria
- [ ] CF adapter scans manifest
- [ ] All 5 RED tests green
- [ ] Error message names service + lists alternatives
- [ ] Wave 1 BC preserved
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: `npx vitest run tests/integration/services-prod-cloudflare.test.ts` all green

#### DoD
- [ ] CF adapter rejects Python loudly
- [ ] User has clear path forward

---

### T3.3 — Node adapter: emit docker-compose

#### Objective
The Node adapter consumes `.theo/services.json` and emits a `docker-compose.yml` + `Caddyfile` enabling the local "TheoCloud-shaped" prod-like environment.

#### Evidence
Reference doc §3.10 (Caddy + docker-compose pattern), §9.6 Phase 3. Owner direction "ambiente parecido com o produtivo".

#### Files to edit
```
packages/theo/src/adapters/node.ts                            (MODIFY — emit compose + Caddyfile)
packages/theo/src/services/compose-generator.ts               (NEW)
packages/theo/src/services/caddy-generator.ts                 (NEW)
tests/unit/services-compose-gen.test.ts                       (NEW)
tests/unit/services-caddy-gen.test.ts                         (NEW)
tests/integration/services-prod-node.test.ts                  (NEW)
```

#### Deep file dependency analysis
- Node adapter consumes manifest + generators
- Generators are pure functions (manifest → string output)
- Integration test asserts emitted files match snapshot

#### Deep Dives

**docker-compose.yml generated:**

```yaml
services:
  caddy:
    image: caddy:2.11
    ports: ["3000:3000"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro"]
    depends_on:
      web: { condition: service_healthy }
      <service>: { condition: service_healthy }
  web:
    build: { context: ".", dockerfile: "Dockerfile" }
    environment: [...]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 10s, timeout: 5s, retries: 3
  <service>:
    build: { context: "services/<name>", dockerfile: "Dockerfile" }
    environment: [...]
    healthcheck: {test: curl -f http://localhost:<port><healthcheck>, ...}
```

**Caddyfile generated (with W3C tracing per ref doc §3.10):**

```caddyfile
:3000 {
  tracing
  reverse_proxy <service.proxy>* <service-name>:<port>
  reverse_proxy /* web:3000
}
```

**Invariants:**
- Empty services → emit only `web` + `caddy` (no service entries)
- Healthcheck `depends_on: service_healthy` for all entries
- Caddy `tracing` directive enabled (W3C traceparent propagation)
- Generated files at `.theo/node/{docker-compose.yml, Caddyfile}`

**Edge cases:**
- Service has `cors: true` → Caddyfile adds CORS headers
- Service has `env` → docker-compose injects per `services.<name>.environment`
- Multiple services → all get their own reverse_proxy block

#### Tasks
1. Create `services/compose-generator.ts`
2. Create `services/caddy-generator.ts`
3. Modify `adapters/node.ts` to call both
4. Add snapshot tests for fixture configs

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     compose_gen_empty_services() — Given services={}, When generateCompose, Then result has web + caddy entries only
RED:     compose_gen_python_service_entry() — Given services.agent (python), When generateCompose, Then result has agent service with healthcheck targeting /health
RED:     compose_gen_includes_depends_on_healthy() — Given services.agent, When generateCompose, Then caddy depends_on agent: condition: service_healthy
RED:     compose_gen_injects_env() — Given services.agent.env={MY_VAR:'x'}, When generateCompose, Then result has agent.environment with MY_VAR=x
RED:     compose_gen_snapshot_matches_fixture() — Given fixture services-python-basic, When generateCompose, Then result equals tests/fixtures/snapshots/compose-services-python-basic.yml
RED:     caddy_gen_includes_tracing_directive() — Given any services, When generateCaddyfile, Then result includes 'tracing' directive (W3C traceparent)
RED:     caddy_gen_reverse_proxy_per_service() — Given services.agent.proxy=/api/agent, services.agent.port=8001, When generateCaddyfile, Then result includes 'reverse_proxy /api/agent/* agent:8001'
RED:     caddy_gen_cors_when_opted_in() — Given services.agent.cors=true, When generateCaddyfile, Then result has CORS headers directive for /api/agent
RED:     node_adapter_emits_files() — Given fixture services-python-basic, When node adapter runs, Then .theo/node/docker-compose.yml and .theo/node/Caddyfile both exist
RED:     node_adapter_no_services_emits_minimal() — Given services={}, When node adapter runs, Then docker-compose.yml has only web entry
GREEN:   Implement generators + wire into node adapter.
REFACTOR: Extract YAML serialization to a util (use 'yaml' lib).
VERIFY:  npx vitest run tests/unit/services-compose-gen.test.ts tests/unit/services-caddy-gen.test.ts tests/integration/services-prod-node.test.ts
```

BDD scenarios:
- **Happy path:** services translate to compose + Caddyfile correctly
- **Validation error:** N/A (validation upstream)
- **Edge case:** empty services emit minimal; CORS opt-in; env injection
- **Error scenario:** N/A — pure generators

#### Acceptance Criteria
- [ ] Both generators land
- [ ] All 10 RED tests green
- [ ] Snapshot test green for fixture
- [ ] Caddy tracing enabled by default
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: all 3 vitest files green

#### DoD
- [ ] `theokit build --target node` produces deployable docker-compose stack
- [ ] Local `docker compose up` brings up TheoCloud-shaped harness

---

### T3.4 — Other adapters: loud rejection (Wave 2 limitation)

#### Objective
Bun, Deno Deploy, AWS Lambda, Netlify, Static adapters reject non-empty `services: {}` with actionable error: this functionality is in Wave 2 for Vercel/Node/Cloudflare(node-only) only. Future ADR per platform if demand exists.

#### Evidence
ADR-0014 invariant: fail-loud over silent degradation. Reference doc §9.6 Phase 3 (other adapters: assess + reject loudly if `services` is non-empty).

#### Files to edit
```
packages/theo/src/adapters/bun.ts                             (MODIFY — reject)
packages/theo/src/adapters/deno-deploy.ts                     (MODIFY — reject)
packages/theo/src/adapters/aws-lambda.ts                      (MODIFY — reject)
packages/theo/src/adapters/netlify.ts                         (MODIFY — reject)
packages/theo/src/adapters/static.ts                          (MODIFY — reject)
tests/integration/services-prod-other-adapters.test.ts        (NEW)
```

#### Deep file dependency analysis
- Each adapter reads manifest; rejects if services non-empty
- Common rejection helper `assertServicesUnsupported(adapter, manifest)` in `services/manifest.ts`

#### Deep Dives

**Common rejection helper:**

```ts
export function assertServicesUnsupported(adapterName: string, manifest: ServicesManifest | null): void {
  if (manifest && manifest.services.length > 0) {
    throw new Error(
      `Adapter '${adapterName}' does not support polyglot services in Wave 2.\n` +
      `Detected services in theo.config.ts: ${manifest.services.map(s => s.name).join(', ')}.\n\n` +
      `Supported in Wave 2: vercel, node, cloudflare (node services only).\n` +
      `Future support per platform requires an ADR with demand evidence.\n` +
      `See docs/concepts/services.md.`
    )
  }
}
```

Each adapter calls this at the start of its build function.

#### Tasks
1. Add `assertServicesUnsupported` to `services/manifest.ts`
2. Wire into each of 5 adapters
3. Add integration test asserting each adapter throws

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     bun_adapter_empty_services_ok() — Given services={}, When bun adapter runs, Then no error
RED:     bun_adapter_rejects_services() — Given services.agent (any), When bun adapter runs, Then throws with message naming 'bun' and listing supported adapters
RED:     deno_adapter_rejects_services() — Given services.agent, When deno-deploy adapter runs, Then throws naming 'deno-deploy'
RED:     lambda_adapter_rejects_services() — Given services.agent, When aws-lambda adapter runs, Then throws naming 'aws-lambda'
RED:     netlify_adapter_rejects_services() — Given services.agent, When netlify adapter runs, Then throws naming 'netlify'
RED:     static_adapter_rejects_services() — Given services.agent, When static adapter runs, Then throws naming 'static'
RED:     all_adapters_share_error_format() — Given any rejected adapter, When error thrown, Then message contains 'Supported in Wave 2', 'vercel, node, cloudflare', and 'docs/concepts/services.md'
GREEN:   Add helper + wire into 5 adapters.
REFACTOR: Pull rejection helper to one place.
VERIFY:  npx vitest run tests/integration/services-prod-other-adapters.test.ts
```

BDD scenarios:
- **Happy path:** empty services → no rejection
- **Validation error:** non-empty services → rejection per adapter
- **Edge case:** rejection message consistent across all 5
- **Error scenario:** error message lists supported alternatives

#### Acceptance Criteria
- [ ] 5 adapters modified
- [ ] All 7 RED tests green
- [ ] Helper exists in one place
- [ ] Wave 1 BC preserved (empty services → no change in any adapter)
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: vitest run green

#### DoD
- [ ] All non-supported adapters reject loudly
- [ ] Users have clear migration paths

---

## Phase 4: Scaffolder Absorption (`create-theokit --backend python|node`)

**Objective:** `npx create-theokit my-app --backend python` scaffolds a working FastAPI sidecar. `--backend node` scaffolds a Hono sidecar. Multi-backend supported. `theo-stacks` deprecation marker.

### T4.1 — `--backend python` flag + FastAPI template (absorbed from theo-stacks)

#### Objective
Add `--backend python` CLI flag that scaffolds `services/agent-python/` with FastAPI + uv + Dockerfile + healthcheck + structured logs + traceparent middleware.

#### Evidence
ADR-0013 (absorption). Reference doc §3.9 (Vercel FastAPI deployment), §9.2 (file list).

#### Files to edit
```
packages/create-theo/src/cli.ts                               (MODIFY — multi-value --backend flag)
packages/create-theo/templates/services/agent-python/main.py                (NEW)
packages/create-theo/templates/services/agent-python/pyproject.toml.tmpl    (NEW)
packages/create-theo/templates/services/agent-python/Dockerfile.tmpl        (NEW)
packages/create-theo/templates/services/agent-python/.env.example           (NEW)
packages/create-theo/templates/services/agent-python/README.md              (NEW)
packages/create-theo/templates/default-with-python/                         (NEW — fixture for end-to-end test)
tests/unit/create-theokit-backend-python.test.ts                            (NEW)
tests/fixtures/services-python-basic/                                       (REUSE from T3.1)
```

#### Deep file dependency analysis
- CLI parses `--backend python` flag (multi-value allowed)
- Templates copied verbatim, with `{{name}}` substitution
- Generated `theo.config.ts` includes `services: { agent: { runtime: 'python', port: 8001, proxy: '/api/agent', ... } }`

#### Deep Dives

**Template `main.py` (minimal FastAPI conforming to Like-Vercel contract):**

```python
import os
import json
import sys
import logging
from fastapi import FastAPI, Request
from pydantic import BaseModel

# Structured JSON logging to stdout (ADR-0015 invariant #5)
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": self.formatTime(record),
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "service": os.environ.get("THEOKIT_SERVICE_NAME", "agent-python"),
        }
        if hasattr(record, "traceparent"):
            log_obj["traceparent"] = record.traceparent
        return json.dumps(log_obj)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
log = logging.getLogger(__name__)

app = FastAPI(title="{{name}} agent service")

# W3C traceparent propagation middleware (ADR-0015 invariant #6)
@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    traceparent = request.headers.get("traceparent")
    if traceparent:
        log.info("request", extra={"traceparent": traceparent, "path": request.url.path})
    response = await call_next(request)
    return response

# Healthcheck (ADR-0015 invariant #4)
@app.get("/health")
async def health():
    return {"status": "ok"}

# Example endpoint
class EchoRequest(BaseModel):
    message: str

@app.post("/echo")
async def echo(req: EchoRequest):
    return {"echo": req.message}
```

**Template `pyproject.toml.tmpl`:**

```toml
[project]
name = "{{name}}-agent-python"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["fastapi", "uvicorn[standard]", "pydantic"]

[tool.uv]
dev-dependencies = ["pytest", "httpx"]
```

**Template `Dockerfile.tmpl`:**

```Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv && uv sync --frozen
COPY . .
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD curl -f http://localhost:8001/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
```

**Generated config snippet in user's `theo.config.ts`:**

```ts
services: {
  agent: {
    runtime: 'python',
    port: 8001,
    proxy: '/api/agent',
    dev: 'uvicorn main:app --reload --port 8001',
    start: 'uvicorn main:app --port 8001 --workers 4',
    openapi: 'http://localhost:8001/openapi.json',
    healthcheck: '/health',
  }
}
```

#### Tasks
1. Add `--backend python` parsing to CLI (multi-value flag)
2. Create template files (verbatim copies + `.tmpl` substitution)
3. Modify CLI scaffold to merge `theo.config.ts` with services entries
4. Modify CLI to copy `services/agent-python/` from templates to target
5. Add unit tests for CLI flag parsing
6. Add fixture for end-to-end smoke

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     cli_backend_python_flag_parsed() — Given argv=['my-app', '--backend', 'python'], When CLI parses, Then result.backends includes 'python'
RED:     cli_backend_python_scaffolds_directory() — Given --backend python, When create-theokit runs, Then services/agent-python/ exists with main.py
RED:     cli_backend_python_main_py_has_health() — Given --backend python, When scaffolded, Then services/agent-python/main.py contains '@app.get("/health")'
RED:     cli_backend_python_main_py_has_traceparent_middleware() — Given --backend python, When scaffolded, Then main.py contains 'traceparent' in middleware code
RED:     cli_backend_python_main_py_has_structured_logging() — Given --backend python, When scaffolded, Then main.py contains 'JsonFormatter' or equivalent JSON-line logging
RED:     cli_backend_python_theo_config_has_services() — Given --backend python on my-app, When scaffolded, Then my-app/theo.config.ts contains services.agent with runtime: 'python'
RED:     cli_backend_python_dockerfile_present() — Given --backend python, When scaffolded, Then services/agent-python/Dockerfile exists with HEALTHCHECK directive
RED:     cli_backend_python_pyproject_has_fastapi() — Given --backend python, When scaffolded, Then services/agent-python/pyproject.toml has 'fastapi' in dependencies
RED:     cli_backend_python_name_substituted() — Given --backend python with my-app name, When scaffolded, Then pyproject.toml contains 'my-app-agent-python'
RED:     cli_backend_python_template_compose_compatible() — Given fixture scaffolded with --backend python, When node adapter generates compose, Then it includes agent-python service
RED:     cli_backend_python_app_package_json_has_hey_api_client_EC10() — Given --backend python on my-app, When scaffolded, Then my-app/package.json (the TS frontend, NOT the Python service) has '@hey-api/client-fetch' in dependencies — required for the generated clients/agent.ts runtime
GREEN:   Implement CLI flag + template files. When --backend is provided, inject '@hey-api/client-fetch' into the user's package.json dependencies (EC-10).
REFACTOR: Extract template-engine into a util if reused (already exists for TS templates).
VERIFY:  npx vitest run tests/unit/create-theokit-backend-python.test.ts
```

BDD scenarios:
- **Happy path:** flag works, files generated, config wired
- **Validation error:** `--backend invalid` → error message listing valid options
- **Edge case:** `--backend python` AND default TS template → both coexist (TheoKit + service)
- **Error scenario:** target directory not writable → error propagates

#### Acceptance Criteria
- [ ] CLI accepts `--backend python` (multi-value)
- [ ] All 10 RED tests green
- [ ] Generated FastAPI conforms to all 6 Like-Vercel invariants (ADR-0015)
- [ ] `pnpm dev` of scaffolded project boots TheoKit + uvicorn + Vite proxy works
- [ ] Manual smoke: `curl http://localhost:3000/api/agent/echo` returns `{"echo":"hello"}`
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: vitest run green

#### DoD
- [ ] Python sidecar scaffold works end-to-end
- [ ] Owner can demonstrate `npx create-theokit demo --backend python && cd demo && pnpm dev` in one terminal

---

### T4.2 — `--backend node` flag + Hono template (NEW)

#### Objective
`--backend node` scaffolds `services/agent-node/` with Hono + tsx + Dockerfile + healthcheck + JSON logs + traceparent middleware. NEW template — not absorbed from `theo-stacks` (which had Express/Fastify; we choose Hono per D4).

#### Evidence
ADR-0013 Wave 2 absorption choices. ADR-0015 invariants. Hono is fetch-handler-native (Like-Vercel contract match).

#### Files to edit
```
packages/create-theo/src/cli.ts                               (MODIFY — extend --backend handler)
packages/create-theo/templates/services/agent-node/src/index.ts    (NEW)
packages/create-theo/templates/services/agent-node/package.json.tmpl (NEW)
packages/create-theo/templates/services/agent-node/tsconfig.json   (NEW)
packages/create-theo/templates/services/agent-node/Dockerfile.tmpl (NEW)
packages/create-theo/templates/services/agent-node/README.md       (NEW)
tests/unit/create-theokit-backend-node.test.ts                     (NEW)
tests/fixtures/services-node-basic/                                (NEW)
```

#### Deep file dependency analysis
- Parallel structure to T4.1 but with Hono runtime
- Shares CLI multi-flag mechanism

#### Deep Dives

**Template `src/index.ts`:**

```ts
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'

const app = new Hono()

// JSON-line structured logging (ADR-0015 invariant #5)
app.use(logger((message) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message,
    service: process.env.THEOKIT_SERVICE_NAME ?? 'agent-node',
  }))
}))

// traceparent middleware (ADR-0015 invariant #6)
app.use(async (c, next) => {
  const tp = c.req.header('traceparent')
  if (tp) {
    c.set('traceparent', tp)
  }
  await next()
})

// Healthcheck (ADR-0015 invariant #4)
app.get('/health', (c) => c.json({ status: 'ok' }))

// Example
app.post('/echo', async (c) => {
  const body = await c.req.json()
  return c.json({ echo: body.message })
})

const port = parseInt(process.env.PORT ?? '8002')
serve({ fetch: app.fetch, port }, () => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `agent-node listening on :${port}` }))
})
```

**`package.json.tmpl`:**

```json
{
  "name": "{{name}}-agent-node",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.x"
  },
  "devDependencies": {
    "tsx": "^4.x",
    "typescript": "^5.x"
  }
}
```

**Generated `theo.config.ts` snippet:**

```ts
services: {
  worker: {
    runtime: 'node',
    port: 8002,
    proxy: '/api/worker',
    dev: 'cd services/agent-node && pnpm dev',
    start: 'cd services/agent-node && pnpm start',
    healthcheck: '/health',
  }
}
```

(Note: differing service NAME `worker` to avoid Python `agent` collision in multi-backend scaffolds.)

#### Tasks
1. Extend CLI to handle `--backend node` (same multi-value parsing as Python)
2. Create Hono template files
3. Add unit tests parallel to T4.1

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     cli_backend_node_flag_parsed() — Given argv=['my-app', '--backend', 'node'], When CLI parses, Then result.backends includes 'node'
RED:     cli_backend_node_scaffolds_directory() — Given --backend node, When scaffolded, Then services/agent-node/src/index.ts exists
RED:     cli_backend_node_uses_hono() — Given scaffolded, When src/index.ts is read, Then it imports from 'hono'
RED:     cli_backend_node_has_health() — Given scaffolded, When src/index.ts is read, Then it has app.get('/health', ...)
RED:     cli_backend_node_has_traceparent_middleware() — Given scaffolded, When src/index.ts is read, Then it contains "c.req.header('traceparent')"
RED:     cli_backend_node_json_logging() — Given scaffolded, When src/index.ts is read, Then it uses JSON.stringify for log output
RED:     cli_backend_node_theo_config_services() — Given --backend node on my-app, When scaffolded, Then theo.config.ts contains services.worker with runtime: 'node'
RED:     cli_backend_node_package_json_hono_dep() — Given scaffolded, When package.json read, Then hono is in dependencies
RED:     cli_backend_node_dockerfile_with_healthcheck() — Given scaffolded, When Dockerfile read, Then it has HEALTHCHECK directive
RED:     cli_backend_node_runs_end_to_end() — Given fixture services-node-basic, When pnpm dev runs and curl /api/worker/echo executes, Then returns echoed response
RED:     cli_backend_node_app_package_json_has_hey_api_client_EC10() — Given --backend node on my-app, When scaffolded, Then my-app/package.json (the TheoKit app, NOT the Node service) has '@hey-api/client-fetch' in dependencies
GREEN:   Implement Hono template + CLI extension. Reuse the '@hey-api/client-fetch' inject helper from T4.1 (EC-10 shared).
REFACTOR: Share template-engine helper with T4.1.
VERIFY:  npx vitest run tests/unit/create-theokit-backend-node.test.ts
```

BDD scenarios:
- **Happy path:** Hono service scaffolds + runs
- **Validation error:** invalid flag → error
- **Edge case:** `--backend node` standalone OR alongside `--backend python`
- **Error scenario:** integration test boot fails → captures actionable error

#### Acceptance Criteria
- [ ] CLI accepts `--backend node`
- [ ] All 10 RED tests green
- [ ] Generated Hono service conforms to all 6 ADR-0015 invariants
- [ ] Multi-backend (`--backend python --backend node`) works
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: vitest run green

#### DoD
- [ ] Node sidecar scaffold works end-to-end
- [ ] Multi-backend scaffold supported

---

### T4.3 — `theo-stacks` deprecation marker + MIGRATION.md

#### Objective
After Wave 2 ships, mark `create-theo` (in `theo-stacks/`) as deprecated on npm; archive the repo with a MIGRATION.md pointing to `create-theokit`.

#### Evidence
ADR-0013 deprecation timeline. ADR-0012 absorption decision.

#### Files to edit (cross-repo)
```
../theo-stacks/MIGRATION.md                                   (NEW)
../theo-stacks/README.md                                      (MODIFY — add deprecation banner)
../theo-stacks/package.json                                   (MODIFY — version bump to "@deprecated")
docs/migration/from-theo-stacks-to-create-theokit.md          (NEW — TheoKit-side mirror)
```

#### Deep file dependency analysis
- Cross-repo changes — coordinate with `theo-stacks` maintainer (owner)
- `theo-stacks` repo is not under TheoKit's CI; smoke test is manual

#### Deep Dives

**Migration steps to document:**

| `theo-stacks` user command | `create-theokit` equivalent |
|---|---|
| `npm create theo@latest -- python-fastapi` | `npx create-theokit my-app --backend python` (TS frontend + FastAPI service) |
| `npm create theo@latest -- node-fastify` | `npx create-theokit my-app --backend node` (Hono sidecar, NOT Fastify) |
| `npm create theo@latest -- node-express` | Same — Hono replaces Express (D4 D7) |
| `npm create theo@latest -- go-api` | **No equivalent in Wave 2.** Archive Go template stays in `theo-stacks`; community can fork. |
| `npm create theo@latest -- rust-axum` | Same — archived; community fork. |
| `npm create theo@latest -- java-spring` | Same. |
| `npm create theo@latest -- ruby-sinatra` | Same. |
| `npm create theo@latest -- php-slim` | Same. |
| `npm create theo@latest -- monorepo-*` | **No equivalent in Wave 2.** TheoKit's monorepo story is the workspace itself. |

**Deprecation timing:** Wait until Wave 2 ships AND end-to-end smoke passes on at least one production app. Then `npm deprecate create-theo "Use create-theokit instead. See https://github.com/usetheodev/theokit/blob/main/docs/migration/from-theo-stacks-to-create-theokit.md"`.

#### Tasks
1. Write `docs/migration/from-theo-stacks-to-create-theokit.md` (TheoKit side)
2. Coordinate with owner to ship `theo-stacks/MIGRATION.md` and README banner
3. Schedule npm deprecation marker for ~6 weeks post-Wave-2 ship

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     migration_doc_exists() — When ls docs/migration/from-theo-stacks-to-create-theokit.md, Then file exists
RED:     migration_doc_covers_python_path() — When file is read, Then it contains 'python-fastapi → create-theokit --backend python'
RED:     migration_doc_documents_archived_languages() — When file is read, Then it lists Go/Rust/Java/Ruby/PHP as ARCHIVED with rationale
RED:     migration_doc_links_to_archived_repo() — When file is read, Then it links to theo-stacks GitHub for archived templates
RED:     migration_doc_explains_node_change() — When file is read, Then it explicitly notes Express/Fastify replaced by Hono in Wave 2
GREEN:   Write migration doc.
REFACTOR: None.
VERIFY:  test -f docs/migration/from-theo-stacks-to-create-theokit.md && grep -q "Hono" docs/migration/from-theo-stacks-to-create-theokit.md
```

BDD scenarios:
- **Happy path:** doc exists with all migration paths
- **Validation error:** missing path → CI grep fails
- **Edge case:** archived languages explicitly listed (transparent)
- **Error scenario:** N/A (doc-only)

#### Acceptance Criteria
- [ ] `docs/migration/from-theo-stacks-to-create-theokit.md` exists
- [ ] All 5 RED tests green
- [ ] Cross-repo coordination tracked (separate PR in `theo-stacks`)
- [ ] npm deprecation scheduled post-Wave-2

#### DoD
- [ ] Migration doc on TheoKit side merged
- [ ] `theo-stacks` MIGRATION.md scheduled

---

## Phase 5: Typed Client + Concept Docs

**Objective:** OpenAPI → typed TS client integration via Hey API (D6). User code calls `services.agent.echo({...})` typed from the Python service. Concept docs anchor the `server/` vs sidecar discipline.

### T5.1 — Hey API integration via Vite plugin

#### Objective
Wire `@hey-api/openapi-ts` into TheoKit's Vite plugin so that at dev startup AND on OpenAPI changes, the typed client is regenerated to `clients/<service>.ts`.

#### Evidence
T0.3 spike output (plugin vs CLI decision). Reference doc §3.11. D6.

#### Files to edit
```
packages/theo/src/services/openapi-client-gen.ts              (NEW)
packages/theo/src/vite-plugin/services-typed-client.ts        (NEW)
packages/theo/src/vite-plugin/index.ts                        (MODIFY — wire)
tests/unit/services-typed-client-gen.test.ts                  (NEW)
tests/integration/services-typed-client-flow.test.ts          (NEW)
```

#### Deep file dependency analysis
- `openapi-client-gen.ts` wraps Hey API API surface
- Vite plugin watches each service's `openapi` URL (T1.1 schema field)
- Generated `clients/<service>.ts` written to the user's project root

#### Deep Dives

**API:**

```ts
export async function generateTypedClient(options: {
  service: ServiceDefinition & { name: string }
  outputDir: string  // e.g., 'clients/'
}): Promise<{ generated: string[] }>
```

**Algorithm:**

1. If `service.openapi` not set → SKIP (warn once)
2. Fetch the OpenAPI JSON from `service.openapi`
3. Run Hey API generator with output `outputDir/<service.name>.ts`
4. On generation error: log warning, do NOT crash dev

**Vite plugin algorithm:**

1. On Vite `configureServer` hook:
   - For each service with `openapi` URL, schedule a watcher
2. Watcher polls `openapi` URL every N seconds (e.g., 5s) OR uses HTTP If-Modified-Since
3. On change detected: call `generateTypedClient`
4. Vite HMR picks up changes to `clients/*.ts`

**Invariants:**
- Empty services → no-op
- Service without `openapi` URL → skipped with warning
- Generation failure → warning logged, dev continues
- Generated file is gitignored (TheoKit's `create-theokit` adds `clients/` to .gitignore)

**Edge cases:**
- OpenAPI URL down at startup → retry; if N retries fail → warn, skip
- OpenAPI shape changes radically → Hey API may produce different output; HMR triggers user code recompile
- Service writes OpenAPI mid-regen → retry after 1s (ref doc §8 edge case)

#### Tasks
1. Implement `openapi-client-gen.ts` wrapper around Hey API
2. Implement `services-typed-client.ts` Vite plugin
3. Wire into vite-plugin chain
4. Add unit + integration tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     client_gen_empty_services_noop() — Given services={}, When client-gen plugin runs, Then no calls to Hey API
RED:     client_gen_service_without_openapi_skipped() — Given services.agent without openapi field, When plugin runs, Then no client generated; warning logged
RED:     client_gen_python_service_generates_client() — Given services.agent with openapi='http://localhost:8001/openapi.json' (mocked), When plugin runs, Then clients/agent.ts written with TS types
RED:     client_gen_uses_hey_api() — Given a generation happens, When code is inspected, Then @hey-api/openapi-ts is invoked (verify via mock spy)
RED:     client_gen_watch_regenerates_on_change() — Given a generated client, When mocked openapi changes, Then within N seconds clients/agent.ts is regenerated with new content
RED:     client_gen_handles_unreachable_url() — Given openapi URL returns 503, When plugin runs, Then no crash; warning logged
RED:     client_gen_handles_invalid_json() — Given openapi URL returns malformed JSON, When plugin runs, Then no crash; actionable warning
RED:     client_gen_handles_concurrent_change() — Given mocked openapi mid-rewrite (race), When generator hits partial JSON, Then retries after 1s and succeeds
RED:     client_gen_integration_full_flow() — Given a fixture services-python-basic with /echo endpoint, When dev starts with this plugin, Then clients/agent.ts compiles and a TS file importing services.agent.echo({message:'x'}) typechecks
GREEN:   Implement gen + plugin.
REFACTOR: Extract retry loop into a util.
VERIFY:  npx vitest run tests/unit/services-typed-client-gen.test.ts tests/integration/services-typed-client-flow.test.ts
```

BDD scenarios:
- **Happy path:** OpenAPI → typed client generated; HMR picks up
- **Validation error:** malformed OpenAPI → warning, no crash
- **Edge case:** service down at startup; concurrent edit race
- **Error scenario:** OpenAPI permanently unreachable → warning, skipped

#### Acceptance Criteria
- [ ] Hey API wrapper exists
- [ ] Vite plugin wires
- [ ] All 9 RED tests green
- [ ] Generated `clients/<service>.ts` is type-correct
- [ ] Generation failure does NOT crash dev
- [ ] Pass: `npx tsc --noEmit` clean
- [ ] Pass: vitest run green

#### DoD
- [ ] User writes `import { services } from 'clients/agent'`; types autocomplete in IDE
- [ ] Backend change → frontend type error appears within 5s

---

### T5.2 — Concept doc: `docs/concepts/services.md`

#### Objective
Document the `services: {}` primitive, the decision matrix (server/ vs sidecar), and the migration story from `theo-stacks`.

#### Evidence
ADR-0012 positioning clarification. CLAUDE.md mandate: positioning MUST be clear in docs.

#### Files to edit
```
docs/concepts/services.md                                     (NEW)
tests/unit/concept-doc-services.test.ts                       (NEW — assertions on doc structure)
```

#### Deep file dependency analysis
- Doc references ADRs 0012/0013/0014/0015
- Asserts via test: required sections exist

#### Deep Dives

**Doc structure:**

1. **What and when** — agent products on TheoKit; `server/` covers end-to-end; sidecars are opt-in
2. **Decision matrix** — table from ADR-0012 / CLAUDE.md (when sidecar makes sense)
3. **Quick start** — `npx create-theokit my-app --backend python` walkthrough
4. **`services: {}` reference** — every field documented
5. **The Like-Vercel contract** — 6 invariants from ADR-0015 with examples per language
6. **Adapter compatibility matrix** — Vercel ✅, Node ✅, Cloudflare (Node only) 🟡, Others ❌ (Wave 2)
7. **Migration from `theo-stacks`** — table pointing to `docs/migration/`
8. **Troubleshooting** — common errors + fixes

#### Tasks
1. Write the doc
2. Add structure-assertion tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     services_doc_exists() — When ls docs/concepts/services.md, Then file exists
RED:     services_doc_has_decision_matrix() — When read, Then contains '## When to use a sidecar' or 'Decision matrix' section
RED:     services_doc_has_quick_start() — When read, Then contains 'create-theokit' command with --backend
RED:     services_doc_has_services_reference() — When read, Then documents fields: runtime, port, proxy, dev, start, healthcheck, openapi
RED:     services_doc_has_invariants_section() — When read, Then references all 6 ADR-0015 invariants
RED:     services_doc_has_adapter_matrix() — When read, Then lists Vercel/Node/Cloudflare with explicit support marks
RED:     services_doc_links_migration() — When read, Then links docs/migration/from-theo-stacks-to-create-theokit.md
RED:     services_doc_has_troubleshooting() — When read, Then has '## Troubleshooting' section with at least 3 known issues
GREEN:   Write doc.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/concept-doc-services.test.ts
```

BDD scenarios:
- **Happy path:** doc exists with all sections
- **Validation error:** missing section → test fails
- **Edge case:** doc references all 4 Wave 2 ADRs
- **Error scenario:** N/A (doc-only)

#### Acceptance Criteria
- [ ] `docs/concepts/services.md` written
- [ ] All 8 RED tests green
- [ ] Adapter matrix accurate
- [ ] Voice and Tone compliance (CLAUDE.md): no "polyglot" in HERO; precise technical language in BODY/DEEP DIVE

#### DoD
- [ ] User reading the doc can decide between `server/` route vs sidecar
- [ ] Migration path from `theo-stacks` clear

---

### T5.3 — Concept doc: `docs/concepts/services-runtime-contract.md`

#### Objective
Deep-dive reference of the Like-Vercel runtime contract (ADR-0015's 6 invariants), with per-language examples and the rationale for each.

#### Evidence
ADR-0015. Reference doc §3.10 (Caddy + W3C trace context). ADR-0012 invariant #4 (cross-product moat).

#### Files to edit
```
docs/concepts/services-runtime-contract.md                    (NEW)
tests/unit/concept-doc-services-runtime-contract.test.ts      (NEW)
```

#### Deep file dependency analysis
- Doc references ADR-0015 verbatim invariants
- Test asserts all 6 invariants are documented with examples

#### Deep Dives

**Doc structure:**

1. **What is the Like-Vercel contract** — paragraph quoting ADR-0015
2. **Why it matters** — cross-product moat (ADR-0012 invariant #4)
3. **The 6 invariants** — one section per invariant, with:
   - Statement
   - Why it's required
   - Python example (FastAPI)
   - Node example (Hono)
   - What happens if violated
4. **TheoCloud-shaped local harness** — docker-compose + Caddy walkthrough (T3.3)
5. **Testing your service against the contract** — `theokit check --runtime-contract` (Phase 6 stretch goal; documented even if not shipped)

#### Tasks
1. Write doc
2. Add structure tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     contract_doc_exists() — Then file exists
RED:     contract_doc_lists_6_invariants() — Then doc has 6 numbered invariant sections matching ADR-0015
RED:     contract_doc_python_example_per_invariant() — Then each invariant has FastAPI example
RED:     contract_doc_node_example_per_invariant() — Then each invariant has Hono example
RED:     contract_doc_explains_traceparent() — Then doc references W3C traceparent and Caddy 2.11 propagation
RED:     contract_doc_local_harness_walkthrough() — Then doc walks through docker-compose + Caddy setup with a working snippet
GREEN:   Write doc.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/concept-doc-services-runtime-contract.test.ts
```

BDD scenarios:
- **Happy path:** doc complete
- **Validation error:** missing invariant → test fails
- **Edge case:** doc cross-links to services.md (T5.2)
- **Error scenario:** N/A

#### Acceptance Criteria
- [ ] Doc written
- [ ] All 6 RED tests green
- [ ] Each invariant has Python AND Node example
- [ ] References ADR-0015 verbatim invariant text

#### DoD
- [ ] User writing a custom service has a reference for compliance

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | No declarative service orchestration primitive | T1.1, T2.1 | `services: {}` Zod schema + Vite proxy wiring |
| 2 | Cross-product moat at risk without uniform contract | T1.1, T1.4, T3.1, T3.3, ADR-0015 | Same Zod schema, same manifest format, all adapters consume the same shape |
| 3 | TheoCreate maintained separately = drift risk | T4.1, T4.2, T4.3 | Absorbed into create-theokit; migration doc; deprecation marker |
| 4 | Vercel Services 2026 not yet matched | T0.2, T3.1 | Snapshot captured; adapter writes matching block |
| 5 | TheoCloud adapter (Wave 3) blocked without manifest | T1.4 | Manifest format stable; Wave 3 adapter consumes it directly |
| 6 | Path traversal vulnerability if naive proxy | T1.2, T1.3 | Ported `isPathInScope` from Nitro; integrated into proxy helper |
| 7 | Hop-by-hop header injection / leak | T1.3 | Hono-style stripping both directions |
| 8 | No typed cross-service client | T5.1 | Hey API integration via Vite plugin |
| 9 | Dev orchestration: services + Vite must boot together | T2.1, T2.2, T2.3, T2.4 | Vite plugin + spawn + log merge + healthcheck gate |
| 10 | Service crash mid-dev not surfaced | T2.2 (onExit) | `onExit` callback logged via T2.3 log merge |
| 11 | Cloudflare doesn't support Python — silent break risk | T3.2 | Adapter rejects loudly with actionable error |
| 12 | Bun/Deno/Lambda/Netlify/Static don't support polyglot in Wave 2 | T3.4 | All 5 adapters reject loudly with helper |
| 13 | `theo-stacks` users need a migration path | T4.3 | `docs/migration/` + cross-repo MIGRATION.md |
| 14 | Local dev not "TheoCloud-shaped" | T3.3 | docker-compose + Caddy generator |
| 15 | W3C traceparent must propagate | T3.3 (Caddy `tracing`), T4.1 (Python middleware), T4.2 (Node middleware) | Three layers ensure end-to-end propagation |
| 16 | Healthcheck convention `GET /health` enforced | T1.5, T2.4, T3.3, T4.1, T4.2 | Poller in dev + Docker healthchecks + Caddy depends_on + template middleware |
| 17 | Structured JSON logging mandated | T2.3, T4.1, T4.2 | Templates emit JSON; log merger parses and routes |
| 18 | Run-time env (not build-time) per ADR-0015 | T4.1, T4.2 (templates), ADR-0015 doc | Templates read `os.environ`/`process.env` at module top; no build-time bake |
| 19 | Empty `services: {}` must be Wave 1 BC-safe | T1.1 default, T2.1 no-op, T3.x no-op when empty | Tests assert no behavior change |
| 20 | Open question #1 (Hey API plugin vs CLI) | T0.3 | Spike resolves |
| 21 | Open question #2 (Vercel JSON shape) | T0.2 | Spike captures |
| 22 | Open question #6 (CSRF non-localhost target) | T1.1 schema, T1.3 proxy | Schema regex limits to relative `/` paths; non-localhost target NOT in Wave 2 (documented in T5.2) |
| 23 | Documentation clarity (sidecar vs server/) | T5.2, T5.3 | Two docs anchored in ADRs |

**Coverage: 23/23 gaps covered (100%)**

### v1.2 amendment — Wave 2 TheoCloud-first refocus (2026-05-27)

Per owner decision: deconcentrate polyglot wire-ups from Vercel/Cloudflare/etc. and channel 100% of Wave 2 energy into TheoCloud. The following tasks are **REMOVED** from Wave 2 scope:

- **T0.2** (Vercel Services snapshot spike) — no longer needed
- **T3.1** (Vercel adapter wire-up + `vercel-config-builder.ts`) — deleted (files removed)
- **T3.2** (Cloudflare Python rejection helper `assertCloudflareSupportedRuntimes`) — deleted (function removed; rejection unified under T3.4)

The following tasks are **AMPLIFIED**:

- **T3.4** (loud rejection helper) now covers **ALL** adapters except `node` + future `theo-cloud`. The list expands from 5 (Bun/Deno/Lambda/Netlify/Static) to 7 (adds Vercel + Cloudflare). Test renamed to `services-adapter-support.test.ts` covers the unified rejection.

The following task is **NEW**:

- **T3.5** (TheoCloud adapter scaffolding) — placeholder in `packages/theo/src/adapters/theo-cloud.ts` consuming `.theo/services.json` manifest. Full K8s manifest generation lands in Wave 3.

Tests still passing post-amendment: `tests/unit/services-adapter-support.test.ts` (6 tests, rewritten); the previous Cloudflare-specific 5 tests are gone, replaced by 6 generic-rejection tests.

Coverage post-amendment remains **23/23 gaps** (the gaps map to the GAP, not to which adapter implements; T3.4 now covers more adapters with the same generic rejection).

### Edge-case coverage (10 MUST FIX from review 2026-05-27)

| EC | MUST FIX item | Folded into |
|---|---|---|
| EC-1 | Port collision across services | T1.1 schema refine + RED test |
| EC-2 | service.port colides com TheoKit web port | T1.1 cross-config refine + RED test |
| EC-3 | Reserved service names (web/caddy/postgres/redis) | T1.1 ServiceNameSchema + RED test |
| EC-4 | proxy='/' catch-all collision | T1.1 regex tightened (* → +) + RED test |
| EC-5 | Host header forwarded leaks to upstream | T1.3 set host to target + RED test |
| EC-6 | writeManifest fails if .theo/ absent | T1.4 mkdir recursive + RED test |
| EC-7 | Orphan child processes on parent SIGKILL | T2.2 lifecycle handlers + RED tests |
| EC-8 | Templates use THEOKIT_SERVICE_NAME but not injected | T2.2 auto-inject env + RED tests |
| EC-9 | Vercel adapter overwrites user vercel.json | T3.1 deep-merge + RED tests |
| EC-10 | Hey API generated client needs @hey-api/client-fetch dep | T4.1 + T4.2 inject into user package.json + RED tests |

**Total: 10/10 MUST FIX items addressed (100%)**. SHOULD TEST items and DOCUMENT notes captured in the [edge-case review](../reviews/edge-case-plan/wave-2-polyglot-services-edge-cases-2026-05-27.md) — they enter the codebase as additional test cases / doc notes during implementation, not as plan tasks.

## Global Definition of Done

- [ ] All 5 implementation phases completed (Phase 1-5)
- [ ] All Phase 0 spikes resolved and committed
- [ ] All ~85 RED tests green across unit + integration + type tests
- [ ] All 3 fixtures committed and reproducible (`services-python-basic`, `services-node-basic`, `services-both`)
- [ ] 1 Playwright E2E spec passes (`services-fullstack.spec.ts`)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean across packages)
- [ ] Zero lint warnings (`pnpm lint` clean)
- [ ] Backward compatibility preserved (empty `services: {}` = Wave 1 behavior; verified by BC tests)
- [ ] `pnpm check:deps` (dependency-cruiser) zero violations after new `services/` module added
- [ ] `pnpm check:naming` zero violations
- [ ] `publint` and `attw` clean on `theokit` package after barrel exports updated
- [ ] All 4 ADRs (0012/0013/0014/0015) referenced as accepted in plan tasks
- [ ] `docs/concepts/services.md` + `docs/concepts/services-runtime-contract.md` published
- [ ] `docs/migration/from-theo-stacks-to-create-theokit.md` published
- [ ] CHANGELOG `[Unreleased]` entry added for Wave 2 polyglot services
- [ ] Cross-validation review (`/cross-validation wave-2-polyglot-services`) APROVADO
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 80, zero CRITICAL plan-caused issues
- [ ] **Architecture diff** generated to `docs/architecture/services/diff/` and approved by owner

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases AND `/cross-validation` APROVADO. The plan is NOT done until dogfood passes.

**Objective:** Validate that `services: {}` works as a real user would experience it. Empty `{}` doesn't regress Wave 1. `--backend python` boots a working FastAPI sidecar end-to-end. Production adapters emit valid artifacts.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

Specific dogfood scenarios mandated by this plan:
1. **Empty services BC scenario:** scaffold default template (`npx create-theokit my-app`), `pnpm dev`, browse `/`, send chat — verify ZERO behavior change from pre-Wave-2.
2. **Python sidecar scenario:** `npx create-theokit my-app --backend python`, `pnpm dev`, browse `/api/agent/echo` via the typed client, verify response.
3. **Node sidecar scenario:** `npx create-theokit my-app --backend node`, `pnpm dev`, verify Hono endpoint reachable via proxy.
4. **Multi-backend scenario:** `npx create-theokit my-app --backend python --backend node`, both services boot, both reachable.
5. **Vercel build scenario:** Python fixture + `theokit build --target vercel` — assert `vercel.json` matches T0.2 snapshot.
6. **CF rejection scenario:** Python fixture + `theokit build --target cloudflare` — assert build fails with actionable error.
7. **Node docker-compose scenario:** Python fixture + `theokit build --target node` — assert `.theo/node/docker-compose.yml` + `Caddyfile` generated; `docker compose up` brings stack up (manual smoke OK).

### Acceptance Criteria

- [ ] Health score >= 80/100
- [ ] Zero CRITICAL plan-caused issues
- [ ] Zero HIGH plan-caused issues in `services` / `create-theokit --backend` / adapter paths
- [ ] All 7 dogfood scenarios above explicitly tested and recorded in dogfood report
- [ ] Any pre-existing issues documented (NOT caused by this plan)

### If Dogfood Fails

1. Identify which issues are plan-caused vs pre-existing
2. Fix ALL plan-caused CRITICAL and HIGH issues
3. Re-run `/dogfood full`
4. Pre-existing issues are logged but DO NOT block plan completion

---

## Post-Implementation: Cross-Validation (BEFORE dogfood)

After all implementation phases complete, BEFORE running `/dogfood`, run:

```
/cross-validation wave-2-polyglot-services
```

This reads the plan line by line and cross-references every task, ADR, TDD cycle, acceptance criterion, and DoD item against the actual code.

- **APROVADO** → proceed to `/dogfood`
- **REPROVADO** → fix divergences, then re-run `/cross-validation wave-2-polyglot-services`
- **APROVADO COM RESSALVAS** → fix CRITICALs, then proceed to `/dogfood`

Report saved to `docs/reviews/cross-validation/wave-2-polyglot-services-xval-{YYYY-MM-DD}.md`.

## Post-Implementation: Architecture Diff (AFTER all phases + dogfood)

After dogfood APROVADO, run:

```
/architecture-docs services
```

But output to `docs/architecture/services/diff/`. Then ask the user:

> "A implementação alterou a arquitetura do domínio `services`. Os novos diagramas estão em `docs/architecture/services/diff/`. Posso substituir os documentos principais em `docs/architecture/services/` com a versão atualizada?"

- **YES** → replace main docs, delete `diff/`
- **NO** → keep diff for reference

---

## Appendix A — Estimated effort

| Phase | Tasks | Estimated days |
|---|---|---|
| Phase 0 (preflight + spikes) | T0.1-T0.4 | 2-3 days (mostly the Vercel spike) |
| Phase 1 (schema + manifest + proxy) | T1.1-T1.5 | 4-5 days (TDD-heavy) |
| Phase 2 (dev orchestration) | T2.1-T2.4 | 3-4 days (integration tests with real uvicorn) |
| Phase 3 (production adapters) | T3.1-T3.4 | 4-5 days (Vercel snapshot match is detail-heavy) |
| Phase 4 (scaffolder absorption) | T4.1-T4.3 | 3-4 days (Python + Node templates + migration doc) |
| Phase 5 (typed client + docs) | T5.1-T5.3 | 3-4 days (Hey API integration + 2 concept docs) |
| Final Dogfood QA | — | 1-2 days (running scenarios + fixing issues) |

**Total:** ~20-27 days of focused work. ~4-5 weeks calendar.

## Appendix B — Open questions deferred to future ADRs

After Wave 2 ships, the following remain open and require fresh ADRs with demand evidence:

1. **WebSocket proxying in `services: {}`** — documented as known limit (T1.3 invariants)
2. **CSRF for non-localhost service targets** — schema-level rejection in Wave 2 (T1.1); future ADR if cross-origin services demanded
3. **`@usetheo/sdk-py` (native Python agent runtime)** — locked deferred per ADR-0012 invariant #2
4. **Auto-restart on service crash** — explicit decision: NO in Wave 2; user restarts
5. **Service discovery via convention vs explicit** — decided explicit (D2); reopen only with demand
6. **`@usetheo/gateway-telegram` migration to sidecar** — documented in T5.2 troubleshooting; in-process default in Wave 2
7. **Go/Rust/Java/Ruby/PHP backends** — archived in `theo-stacks`; future ADR per language with demand evidence
