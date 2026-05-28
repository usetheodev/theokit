# 0017. Extract `startCommand` Bootstrap Stages into Composable Helpers

* Status: accepted
* Date: 2026-05-27
* Deciders: [TheoKit core team]
* Tags: [srp, cli, refactor]

---

## Context and Problem Statement

`startCommand` (`packages/theo/src/cli/commands/start.ts:110-494`) is a 380-line function that handles, in one body:

1. `.env` loading
2. Theo config loading
3. SDK `Agent.registry` configuration
4. `StorageManager` configuration
5. Production manifest loading (or fallback scan)
6. SSR entry resolution (handles `.mjs` and `.js`)
7. Rate-limiter construction
8. HTTP server creation with inline 130-line request handler
9. WebSocket upgrade handler attachment (lazy `ws` import)
10. Graceful shutdown registration (SIGTERM + SIGINT, 25s force-exit timer)

The function carries `eslint-disable max-lines-per-function, complexity` at line 109 with the comment "top-level CLI bootstrap; setup + request orchestration intentionally co-located so the lifecycle is readable end-to-end." A second disable on the inline request handler at line 248.

The honest cost:

- Tests must boot an HTTP server to exercise any branch.
- Adding a new bootstrap stage (e.g., distributed tracing init, audit-log sink) costs ~20 LOC inserted into the spine — high churn risk.
- Multiple owners may need to touch this file simultaneously (deployment, security, agents, storage, WS, observability) — SRP violation.
- The "lifecycle is readable end-to-end" claim only holds for someone reading sequentially; for someone debugging a specific stage, the 380 lines are a hostile environment.

---

## Decision Drivers

- **SRP (consensus, Martin Clean Code)** — one reason to change per function.
- **Testability** — extract = unit-testable without HTTP boot.
- **Future scope** — roadmap items (R0.5.x jobs+crons, R0.6.6 observability) all attach in startCommand.
- **Preserve the spine narrative** — the order of bootstrap stages IS semantic; the spine must remain readable.

---

## Considered Options

### Option A — Extract each stage as a pure helper; spine remains as a sequence of calls

```ts
export async function startCommand(opts: StartOptions): Promise<void> {
  const env = loadStartEnv(process.cwd())
  const config = await loadConfig(env.cwd)
  await initAgentRegistry(config.agents?.registry)
  await initStorageManager(config.storage)
  const ctx = await buildStartContext({ env, config })
  const ssr = await initSsrPipeline(ctx)
  const handler = createProductionRequestHandler(ctx, ssr)
  const server = createHttpServer(handler, ctx.config.port)
  await attachWebSocketServer(server, ctx)
  registerGracefulShutdown(server)
  server.listen(ctx.port, () => logBoot(ctx.port))
}
```

- Pro: spine reads top-down at ~12 lines.
- Pro: each helper is independently testable.
- Pro: new stages slot in without touching existing helpers.
- Con: more files (one per stage) — though `cli/commands/start/` subfolder absorbs it.

### Option B — Keep as one function, add inline section headers (status quo+)

- Comment-block dividers between stages.
- Con: doesn't solve testability; doesn't help SRP; cosmetic.

### Option C — Class-based `StartCommand` with private methods per stage

- Each stage is a method; orchestration via `run()`.
- Pro: namespace-cohesive.
- Con: classes are atypical in TheoKit (factories are the norm — see DP-5 in the report). Inconsistent with the codebase voice.

---

## Decision Outcome

Adopt **Option A — extract per-stage helpers; spine becomes a 12-line sequence**.

Sub-folder layout:

```
cli/commands/start.ts                  # public entry — the 12-line spine
cli/commands/start/
├── load-start-env.ts                  # (replaces lines 112-114 logic)
├── init-agent-registry.ts             # (replaces lines 47-69)
├── init-storage-manager.ts            # (replaces lines 78-93)
├── build-start-context.ts             # (config + clientDir + serverDir + rate limiter assembly)
├── init-ssr-pipeline.ts               # (replaces lines 173-246)
├── create-production-request-handler.ts  # (replaces lines 248-381)
├── attach-websocket-server.ts         # (replaces lines 384-431)
└── register-graceful-shutdown.ts      # (replaces lines 438-493)
```

`start-handlers.ts` (already exists) holds the sub-handlers `tryServeAction`, `tryServeApiRoute`, etc. — keep as-is; it's the canonical extraction pattern this ADR generalises.

---

## Consequences

- 8 new files under `cli/commands/start/`; ~50 LOC each on average.
- `start.ts` shrinks from 494 LOC → ~50 LOC (just the spine + types).
- Test files `tests/unit/start-*.test.ts` cover each helper in isolation.
- The two eslint-disables retire.
- Adding a new stage (e.g., tracing init at R0.6.6) becomes one new helper file + one line in the spine.

## Compliance check

- ✅ Resolves PV-1 (medium severity).
- ✅ Resolves PV-3 (medium severity — the inline request handler extraction is part of this).
- ✅ Reduces eslint-disable footprint (per PV-7).
- ✅ No public-API change — `startCommand` is exposed via `theokit/cli` bin.
- ✅ No cycles introduced.

## Links

- Source findings: PV-1, PV-3 in `architecture-output/architecture.db`
- File: `packages/theo/src/cli/commands/start.ts:110-494`
- Companion (the seam already extracted): `packages/theo/src/cli/commands/start-handlers.ts`
