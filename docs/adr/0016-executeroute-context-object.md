# 0016. Replace `executeRoute(12 positional args)` with `ExecuteRouteContext`

* Status: accepted
* Date: 2026-05-27
* Deciders: [TheoKit core team]
* Tags: [clean-code, refactor, request-pipeline]

---

## Context and Problem Statement

`executeRoute` (`packages/theo/src/server/http/execute.ts:90-107`) declares 12 positional parameters:

```ts
export async function executeRoute(
  route: ServerRouteNode,
  method: string,
  params: Record<string, string>,
  req: IncomingMessage,
  res: ServerResponse,
  loadModule: LoadModule,
  serverDir?: string,
  requestId?: string,
  pluginRunner?: PluginRunner,
  transformer?: TheoTransformer,
  csrfMode: CsrfMode = 'strict',
  disallowed?: DisallowedConfig,
  jobBackend?: JobBackend,
): Promise<void>
```

The function carries an `eslint-disable max-params, max-lines-per-function, complexity, sonarjs/cognitive-complexity` comment at line 89, with the justification "the framework central request pipeline." The same shape repeats in `executeAction` (`server/http/action-execute.ts:302`).

Robert Martin (Clean Code, consensus) caps function parameters at 4; beyond that, refactor to a parameter object. 12 is 3x the consensus threshold.

The downstream pain:

- Every caller (start-handlers.ts, action-execute.ts) must thread all 12 args.
- Adding a new dependency (e.g., a `tracer`, `metricsCollector`) requires changing every callsite.
- Positional drift is a real risk on refactor — TS will catch type mismatches but NOT swapped positions of two `string`-typed args (e.g., `serverDir` vs `requestId`).
- The eslint-disable comments document the smell rather than fixing it.

How should the request pipeline be refactored without losing the readability of the spine?

---

## Decision Drivers

- **Clean Code consensus** — Martin's 4-param cap is a firm guideline.
- **Future-proofing** — every roadmap item (jobs, crons, webhooks, tracing) adds another arg.
- **Test ergonomics** — building a 12-arg test fixture is a chore.
- **No type churn for consumers** — `executeRoute` is internal; only framework code calls it.

---

## Considered Options

### Option A — Single `ExecuteRouteContext` object

```ts
interface ExecuteRouteContext {
  route: ServerRouteNode
  method: string
  params: Record<string, string>
  req: IncomingMessage
  res: ServerResponse
  loadModule: LoadModule
  serverDir?: string
  requestId?: string
  pluginRunner?: PluginRunner
  transformer?: TheoTransformer
  csrfMode?: CsrfMode  // default 'strict' applied internally
  disallowed?: DisallowedConfig
  jobBackend?: JobBackend
}

export async function executeRoute(ctx: ExecuteRouteContext): Promise<void>
```

- Pro: one knob to add new fields without touching callsites.
- Pro: callers build the context once per request.
- Pro: removes 3 of the 4 eslint-disables (only `max-lines-per-function` may remain).
- Con: minor verbosity — destructuring at the top of `executeRoute`.

### Option B — Split into two objects: `RequestPipeline` + `RequestEnvelope`

- `RequestEnvelope = { route, method, params, req, res }` — the per-request data.
- `RequestPipeline = { loadModule, pluginRunner, transformer, csrfMode, disallowed, jobBackend, serverDir }` — the boot-time deps.
- Pro: clearer semantic split.
- Con: callers now pass two args; modest reduction (12 → 2 args).

### Option C — Status quo + better tests

- Keep 12 args; add Jest-style strict-shape tests on callers to catch position drift.
- Con: doesn't address the underlying smell; tests are reactive not preventative.

---

## Decision Outcome

Adopt **Option A — single `ExecuteRouteContext` object**.

Migration plan (one PR per step to keep diffs reviewable):

1. Introduce `ExecuteRouteContext` interface in `server/http/types.ts` (or `execute.ts`).
2. Refactor `executeRoute` to accept `ctx: ExecuteRouteContext`, destructure internally.
3. Update callers in start-handlers.ts and action-execute.ts to build the context.
4. Apply same pattern to `executeAction` (`ExecuteActionContext`).
5. Remove the three eslint-disables (`max-params`, `complexity`, `sonarjs/cognitive-complexity`). The `max-lines-per-function` disable may remain; that's a separate refactor on the function body length.

---

## Consequences

- ~80 LOC churn across 3 files for `executeRoute`; ~50 LOC for `executeAction`.
- Three eslint-disables retired.
- Future additions (tracer, metricsCollector, audit-log enricher) are pure context-field additions, no callsite churn.
- Test fixtures get simpler — one factory `buildExecuteContext()` produces a base; tests override fields.

## Compliance check

- ✅ Resolves PV-2 (high severity).
- ✅ Reduces eslint-disable footprint (per PV-7 KISS note).
- ✅ No public-API change (executeRoute is internal).
- ✅ No cycles introduced (this is a pure refactor within `server/http/`).

## Links

- Source finding: PV-2 in `architecture-output/architecture.db`
- File: `packages/theo/src/server/http/execute.ts:90`
- Companion: `packages/theo/src/server/http/action-execute.ts:302`
