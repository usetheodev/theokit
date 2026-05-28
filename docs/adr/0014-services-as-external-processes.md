# 0014. Services as external processes — TheoKit orchestrates, never embeds runtimes

* Status: accepted
* Date: 2026-05-27
* Accepted: 2026-05-27
* Deciders: [TheoKit owner]
* Tags: [architecture, polyglot, services, runtime, invariant]

## Context and Problem Statement

[ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md) expanded the mission to include polyglot services orchestration. That decision opens a door that has historically wrecked frameworks: **embedding non-native runtimes in the framework's process**.

Examples of the failure mode:

- Pyodide / WASI inside Node — works for toys, falls over on real Python libraries with C extensions (numpy, pydantic-core, asyncpg)
- GraalVM polyglot inside JVM — performance footguns, deployment complexity
- ScriptEngine in Java — abandoned by Oracle for a reason
- Embedded V8 in Python (PyV8) — abandoned

The temptation will appear: "let's run Python in the same Node process so we share memory / avoid HTTP overhead / give a 'cleaner' DX". **This ADR locks the door before that PR shows up.**

**Cross-product moat angle:** Embedding a runtime in TheoKit core would ALSO destroy the cross-product moat established in [ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md) (invariant #4) — because TheoCloud (K8s, separate containers) cannot host an in-process Python runtime inside the Node container. The local dev experience would diverge from production. The Like-Vercel contract ([ADR-0015](./0015-services-runtime-contract-like-vercel.md)) assumes external processes everywhere; embedding violates the contract at the foundation. **This ADR is therefore both a TheoKit-core invariant AND a guard on the product-mark moat.**

## Decision Drivers

- **Mission expansion invariant 1** ([ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md)) — multi-runtime is NEVER embedded in TheoKit core
- **Mission expansion invariant 4** ([ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md)) — the cross-product Like-Vercel contract is global; embedded runtimes would force per-surface divergence (TheoKit-embed vs TheoCloud-external), violating the moat
- **Like-Vercel contract** ([ADR-0015](./0015-services-runtime-contract-like-vercel.md)) — Vercel/CF Workers/TheoCloud all run services as separate processes/containers; embedding contradicts the deploy target shape
- **Single-maintainer reality** — debugging cross-runtime issues (Pyodide thread starvation, GraalVM memory leaks) consumes weeks; one team cannot afford this
- **"Não Reinvente a Roda"** (CLAUDE.md global §9) — FastAPI's uvicorn, Hono's Bun/Node servers, ASP.NET's Kestrel all exist. TheoKit doesn't write a new server.

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Embed Python via Pyodide / RustPython / GraalPy | Fails on real Python ecosystem (C extensions, pydantic, asyncpg). Even if it worked, it diverges from production runtime (TheoCloud K8s = uvicorn) — local dev != prod. |
| Embed Node service in TheoKit's Node process (in-process require) | Tempting because "it's already Node". Rejected because: (a) port/healthcheck/log/observability contract must match the Python case for consistency; (b) shared event loop blocks both surfaces if one misbehaves; (c) memory leaks in service code crash TheoKit core. |
| Spawn services via `child_process.fork` (Node-Node only) | Special-cases Node; doesn't generalize to Python. Forces a parallel orchestration path. KISS violated. |
| Run all services in a single Docker container | Single point of failure; impossible to scale services independently; contradicts TheoCloud's per-container model. |
| Let users figure out orchestration (just document the proxy pattern) | Defeats the absorption story. If users have to write `docker-compose.yml` and `vite.config.ts` proxy by hand, they don't get the "one CLI" promise of [ADR-0013](./0013-theocreate-absorbed-into-create-theokit.md). |

## Decision

**Services are external processes. Period.**

Concretely:

1. **TheoKit owns orchestration. TheoKit does NOT own runtimes.**
   - TheoKit writes the `docker-compose.yml` that boots services
   - TheoKit writes the Vite proxy config that routes `/api/agent/*` → `http://localhost:8001`
   - TheoKit writes the `.theo/services.json` manifest that adapters consume
   - TheoKit reads `OPENAPI` to generate typed clients
   - TheoKit does NOT spawn Python interpreters in-process; users run uvicorn
   - TheoKit does NOT run Node services in-thread; they get their own port + process
2. **`services: {}` configuration in `theo.config.ts` declares external processes.** Its schema validates the orchestration contract (port, runtime kind, dev command, healthcheck, OpenAPI URL, proxy prefix). It NEVER declares an in-process module.
3. **The line between framework control and service code is drawn at the network boundary.** TheoKit controls everything BEFORE the HTTP request leaves the proxy (auth headers, traceparent injection, body-size limits, healthcheck retries, log correlation). TheoKit controls NOTHING inside `services/agent-python/main.py`.
4. **Wave 1 (TS apps) are unaffected.** `services: {}` defaults to empty; no behavior change for the existing TheoKit user.

**Concrete table of what TheoKit owns vs what it doesn't:**

| TheoKit OWNS (closed contract) | TheoKit does NOT own (open) |
|---|---|
| `theo.config.ts > services: {}` schema | Code inside `services/<name>/main.py` |
| Project structure (`services/agent-python/` layout) | How FastAPI handlers are written |
| Dev command line (`pnpm dev` boots web + services) | The `dev` script value (`uvicorn main:app --reload --port 8001`) is user-configurable |
| Proxy mapping (`/api/agent/*` → `:8001`) | What routes the service exposes internally |
| Manifest shape (`.theo/services.json`) | The Dockerfile contents (template, user-overridable) |
| Typed-client generator (from OpenAPI) | The Python types inside FastAPI |
| Healthcheck contract (`GET /health` → 200 / 503) | The healthcheck body — service decides |
| Structured-log expectation (JSON lines on stdout) | What gets logged at runtime |
| Trace-context injection on proxy hop (`traceparent` header) | Trace exporters inside the service (service uses its own OTel SDK if any) |

**Future-proofing — what would force a re-open of this ADR:**

ALL three of these must hold:

1. A production-deployed TheoKit app with ≥ 10k DAU where the cross-process HTTP overhead measurably degrades user-perceived latency (p95 > 100ms attributable to the proxy hop) AND
2. A mature embedded runtime exists for the target language that supports the full library ecosystem (not just the standard library) AND
3. TheoCloud's runtime model accepts the embedded approach in production (otherwise local/prod diverge — unacceptable per ADR-0015)

If even one of these is missing, the ADR stays locked. We expect this to never reopen.

## Consequences

**Positive:**

- The framework stays small and debuggable
- Service code is unconstrained — users write idiomatic FastAPI / Hono / Express
- Local dev mirrors production (everything is HTTP) — `theo deploy` becomes a manifest translation, not a runtime migration
- Failure isolation — a buggy service can OOM without taking the TheoKit server down
- Independent scaling becomes natural (Wave 3 — TheoCloud can scale Python service horizontally without touching the TS app)

**Negative:**

- HTTP overhead per cross-service call (typically 0.5–2 ms locally, dominated by the wire). For agent products where calls happen per-message-stream rather than per-keystroke, this is negligible.
- More moving parts in dev — `pnpm dev` now boots ≥ 2 processes. **Mitigation:** the generated docker-compose handles this; `pnpm dev` orchestrates internally.
- Debugging across the boundary requires log correlation. **Mitigation:** trace-context injection at the proxy.

**Neutral:**

- This decision is INVISIBLE to a user who doesn't use `--backend`. Wave 1 (TS-only) users feel no change.

## Implementation outline (not part of this decision; for sequencing only)

1. **`services` Zod schema in `config/schema.ts`** — defines the allowed shape; rejects in-process variants (no `module: string` field)
2. **Process orchestration in `cli/commands/dev.ts`** — boots services per the `services: {}` config, manages graceful shutdown of children when TheoKit shuts down
3. **Vite proxy plugin integration** — translates `services: {}` to `server.proxy` config
4. **Manifest generator in `cli/commands/build.ts`** — emits `.theo/services.json` for adapters to consume
5. **Healthcheck poller** — `pnpm dev` waits for each service's `/health` before considering the app ready

## Related ADRs

- [ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md) — mission expansion (this ADR is invariant #1 of that expansion, made concrete)
- [ADR-0013](./0013-theocreate-absorbed-into-create-theokit.md) — TheoCreate absorption (the absorbed templates produce external processes per this ADR)
- [ADR-0015](./0015-services-runtime-contract-like-vercel.md) — Like-Vercel runtime contract (the shape every external process must conform to)
- [ADR-0002](./0002-job-backend-interface-neutral-contract.md) — JobBackend neutral interface (same philosophy: framework owns the contract, not the implementation)

## References

- Pyodide limitations: https://pyodide.org/en/stable/usage/wasm-constraints.html (no C extensions; numpy works via patched build)
- GraalPy production reports — community feedback on memory profiles vs CPython
- Owner direction, 2026-05-27 conversation transcript
