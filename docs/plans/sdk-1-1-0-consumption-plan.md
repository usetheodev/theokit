# Plan: SDK v1.1.0 Consumption — TheoKit Production-Readiness Cutover

> **Version 1.1** — `@usetheo/sdk` shipped v1.1.0 closing all 6 production-readiness gaps from the 2026-05-25 handoff (`ConversationStorageAdapter`, `Agent.registry` GC, `AgentRunError` discrimination, tool lifecycle hooks, `AbortSignal` propagation, quota gates). This plan consumes those primitives across the TheoKit framework, examples, fixtures, and docs. **Outcome**: TheoKit becomes honestly deploy-ready for serverless (Vercel/CF/Lambda) and multi-host (K8s/TheoCloud) — the three CRITICAL gaps from `docs/audit/dogfood-2026-05-25-phase-7-consolidated.md` are closed end-to-end.
>
> **v1.1 changelog** — Incorporates 17 edge cases from `docs/reviews/edge-case-plan/sdk-1-1-0-consumption-edge-cases-2026-05-26.md` (3 MUST FIX + 9 SHOULD TEST + 5 DOCUMENT). Tasks affected: T0.1, T2.1, T3.1, T4.1, T5.1, T6.1, T6.2, T7.1, T9.1, T9.2. The `## Edge cases incorporated` section at the bottom lists every EC and where it lands.

## Context

`@usetheo/sdk` v1.1.0 was released on 2026-05-26 (SDK commits `0445e1f` "version 1.1.0" + `aae7178` "Phase 7 dogfood APROVADO"). The release note (in conversation history) confirms all six gaps from `docs/handoff/2026-05-25-sdk-production-readiness-handoff.md` are addressed with the contracts I proposed. Verification on local sibling:

- `theokit-sdk/packages/sdk/package.json` → `"version": "1.1.0"` ✅
- `Agent.registry`, `AgentRunError`, `AgentRunErrorCode`, `FileSystemConversationStorage`, `InMemoryConversationStorage` all exported ✅
- `pnpm-workspace.yaml` already links `../theokit-sdk/packages/sdk` so the bump is **transparent** — TheoKit picks up v1.1.0 automatically.

### Why now

Three CRITICAL gaps audit-flagged in the previous dogfood were SDK-blocking. With v1.1.0 shipped, they become **TheoKit work**:

1. **Conversation history fs-bound** (CRITICAL) — `createConversationHistory` needs to accept the new `conversationStorage` option and pass it through to `Agent.getOrCreate`. Without this wiring, the SDK's adapter is unreachable from TheoKit apps.
2. **Agent registry GC in prod** (CRITICAL) — SDK provides `Agent.registry.configure({maxAgents, idleTimeoutMs, onEvict})`. TheoKit must surface it via `theo.config.ts > agents.registry` and wire `SIGTERM → registry.evictAll()` in `theokit start`. Without this, the SDK GC doesn't fire automatically.
3. **AbortSignal end-to-end** (HIGH) — `defineAgentEndpoint` already receives the request close signal but does not forward it to `agent.send({ signal })`. Without this wiring, browser disconnect doesn't cancel the LLM call → tokens charged for nothing.

Plus HIGH/MEDIUM items needing TheoKit-side wire:

4. `AgentEvent.error` needs new fields (`code`, `provider`, `retriable`, `retryAfterMs`) on the SSE wire so the client UI can discriminate.
5. `trackAgentRun` needs to consume `onToolStart/onToolEnd/onToolError` hooks for per-tool latency + error metrics.
6. Both example apps (`openrouter-demo` + `full-stack-agent`) need updates to use the new primitives.
7. Two new fixtures prove conversation persistence outside fs (Redis + Postgres recipes).
8. New concept doc explains "which adapter when".

### Evidence — current TheoKit state pre-consumption

- `packages/theo/src/server/agent/create-conversation-history.ts` — defines `SdkAgentOptions` structural shape with `[key: string]: unknown` escape hatch; does NOT forward a `conversationStorage` field today, BUT the index signature DOES allow it through transparently (no code change blocks this path, just no documentation/tests).
- `packages/theo/src/server/agent/agent-types.ts` — `AgentErrorEvent` has only `{ type: 'error'; message: string; id? }`. Missing `code/provider/retriable/retryAfterMs`.
- `packages/theo/src/server/agent/stream-agent-run.ts` — error mapping reduces all SDK errors to `{ type: 'error', message: error.message }`. Strips structured info.
- `packages/theo/src/server/cost/track-agent-run.ts` — only accumulates usage post-hoc via `UsageStorageAdapter`. No tool-level callbacks.
- `packages/theo/src/cli/cleanup/cleanup.ts` — `gcAgentRegistry` is a TheoKit-side workaround that **becomes redundant** with SDK v1.1.0 — `Agent.registry` does this natively in prod.
- `packages/theo/src/config/schema.ts` — no `agents.registry` section.
- `packages/theo/src/cli/commands/start.ts` — no SIGTERM hook for graceful agent shutdown.

## Objective

**Done** = `pnpm typecheck` exit 0, `pnpm lint --max-warnings=0` exit 0, `pnpm test` 100% green (target ≥ 2620 tests post-additions), `dogfood full` Phase 7 health ≥ 90/100 with zero plan-caused regressions, and a TheoKit app deployed-shaped for serverless/multi-host can be built with **all six SDK v1.1.0 primitives wired through the framework**.

Specific measurable goals:

- **G1** — `createConversationHistory({ conversationStorage })` documented + tested + used in both example apps.
- **G2** — `theo.config.ts > agents.registry` schema validates `{ maxAgents, idleTimeoutMs, onEvict }`. `theokit start` calls `Agent.registry.configure(config)` at boot and `Agent.registry.evictAll()` on SIGTERM/SIGINT.
- **G3** — `AgentEvent.error` shipped with `code/provider/retriable/retryAfterMs`. `streamAgentRun` populates them from `AgentRunError`. Client receiving `events: AgentEvent[]` can `switch (event.code)`.
- **G4** — `defineAgentEndpoint` threads `request` close signal to `agent.send({ signal })`. Test: client aborts mid-stream → `AgentRunError({code:'aborted'})` surfaces → no partial assistant message in storage.
- **G5** — `trackAgentRun` accepts `onToolStart/onToolEnd/onToolError` callbacks and accumulates per-tool latency/error counters via `UsageStorageAdapter`.
- **G6** — Both `examples/openrouter-demo` and `examples/full-stack-agent` use all G1-G5 wires in their `server/routes/chat.ts`.
- **G7** — `tests/fixtures/conversation-redis/` + `tests/fixtures/conversation-postgres/` exist, with smoke tests proving SDK's adapter contract works.
- **G8** — `docs/concepts/conversation-history.md` documents the per-deploy-target choice (FileSystem vs Redis vs Postgres).
- **G9** — `dev-agent-gc.ts` removed from `packages/theo/src/cli/cleanup/cleanup.ts` (SDK handles natively). Backward-compat barrel preserved.
- **G10** — Dogfood Phase 7 rerun: health ≥ 90/100, zero CRITICAL or HIGH plan-caused issues.

## ADRs

| ID | Decision | Rationale | Consequences |
|----|---|---|---|
| **D1** | TheoKit consumes `@usetheo/sdk` v1.1.0 via the existing workspace symlink (`pnpm-workspace.yaml`); no version pin change. | Workspace protocol means TheoKit picks up whatever the sibling has on disk. The SDK already publishes 1.1.0 (commit `0445e1f`); the bump is implicit. Pinning the version in `package.json` would couple us to an npm-published version we don't yet need. | Future SDK changes auto-flow into TheoKit on next `pnpm install`. Risk: if SDK ships a breaking change, TheoKit's CI is the first signal — acceptable, that's the workspace protocol's purpose. |
| **D2** | `createConversationHistory` passes `conversationStorage` **opaquely** via the existing `SdkAgentOptions` index signature, not via a typed field. Add a typed convenience field `conversationStorage?: ConversationStorageLike` on the public TheoKit API, but the internal call to `Agent.getOrCreate` passes it through the index. | Avoids hard-coupling TheoKit's types to the SDK's structural shape. The SDK is the source of truth for `ConversationStorageAdapter`; TheoKit defines a structural interface (duck-type) matching it. Existing apps without `conversationStorage` keep working unchanged (backward compat preserved). | Two type definitions (TheoKit structural + SDK nominal) MUST stay in sync. Mitigated by a contract test that imports the SDK type and asserts assignability to TheoKit's structural shape. |
| **D3** | `Agent.registry.configure()` is called **lazily** the first time `defineAgentEndpoint` runs, not at module load. Configuration source: `theo.config.ts > agents.registry`. Defaults: `{ maxAgents: 100, idleTimeoutMs: 30 * 60_000 }`. | Module-load configuration races with bundlers (some apps lazy-load config). Lazy-on-first-use guarantees the config object is fully resolved. Defaults match SDK defaults — no surprises. | One extra `if (!configured) configure()` check per request. Cost: < 1µs. Acceptable. |
| **D4** | `AgentEvent.error` extends the existing variant with **optional** fields. Existing client code reading `event.message` keeps working. New fields (`code`, `provider`, `retriable`, `retryAfterMs`) are read defensively. | Backward compat — clients still hydrating from old server versions get the legacy shape. Optional fields satisfy the migration window. Once TheoKit ships v0.3.0 the fields can become required (separate plan). | Type signature has 4 new optionals. Client code that does `switch (event.code)` must handle `undefined` (treat as legacy). |
| **D5** | `defineAgentEndpoint` threads the close signal **only on Node `IncomingMessage` and Web `Request`**, not on adapter-specific request types. The signal is detected at runtime via duck-typing (`req.signal` or `req.on('close', cb)`). | Web fetch `Request` exposes `request.signal` natively. Node `http.IncomingMessage` exposes `req.on('close')` — bridge via `AbortController.fromEvent`. Edge runtime (CF Workers) uses Web Request → trivial. Avoid platform-specific shims in the agent layer. | If a future adapter emits a non-standard request shape, signal threading silently no-ops. Documented in code comments — adapter authors must surface a Web `Request` or set `req.signal` manually. |
| **D6** | `trackAgentRun` keeps its existing signature (post-hoc usage record); the **new** tool hooks are wired via a sibling `trackAgentTools({ onToolStart, onToolEnd, onToolError })` helper that returns the three callbacks ready to attach to `Agent.create`. | Existing `trackAgentRun` consumers must not break. New helper is opt-in. Same `UsageStorageAdapter` accumulates both `UsageRecord` (LLM call) and a new `ToolUsageRecord` (tool call) — adapter supports both via a discriminated union. | Two record types. `UsageStorageAdapter.record()` becomes `record(UsageRecord | ToolUsageRecord)`. In-memory adapter trivially handles both; external adapters (Postgres recipe) need a column for `kind`. |
| **D7** | Remove `gcAgentRegistry` from `packages/theo/src/cli/cleanup/cleanup.ts` but **keep the barrel export** as a tombstone alias to a no-op function for one minor version. Log a deprecation warning if called. | SDK's `Agent.registry` covers this natively. The cleanup function was always dev-only. Removing cold may break niche apps that call it directly. One-version deprecation window is gentle. | One `console.warn` in any app still importing `gcAgentRegistry`. After 0.4.0 the no-op is deleted entirely. |
| **D8** | Two new fixture projects ship: `tests/fixtures/conversation-redis/` (uses `ioredis-mock` for testing without a real Redis) and `tests/fixtures/conversation-postgres/` (uses `pg-mem` — already in the test stack). Real-DB tests are env-gated (only run when `REDIS_URL` / `POSTGRES_URL` are set, mirroring the existing `tests/integration/job-backend-postgres-real.test.ts` pattern). | Two integration patterns proven without requiring real services in CI. Real-DB option keeps the door open for full validation in TheoCloud CI. | Two new fixture projects + tests. ~6 new files. CI time impact: < 5s (memory-backed mocks). |

## Dependency Graph

```
Phase 0 (SDK smoke)
   │
   ▼
Phase 1 (AgentEvent type contract)  ← blocks Phase 4
   │
   ├─▶ Phase 2 (createConversationHistory.storage)  ─┐
   │                                                 │
   ├─▶ Phase 3 (defineAgentEndpoint signal)         │
   │                                                 │
   ├─▶ Phase 4 (streamAgentRun error discrim)        ├─▶ Phase 8 (examples)
   │                                                 │
   ├─▶ Phase 5 (trackAgentRun tool hooks)            │
   │                                                 │
   └─▶ Phase 6 (Agent.registry + SIGTERM)            │
                  │                                  │
                  ▼                                  │
            Phase 7 (remove dev-agent-gc) ───────────┘
                                                     │
                                                     ▼
                                              Phase 9 (fixtures) ──▶ Phase 10 (docs)
                                                                          │
                                                                          ▼
                                                                   Phase 11 (Dogfood QA)
```

**Parallelizable**: Phases 2–6 are independent and can run concurrently across separate contributors/sessions. Phase 8 depends on 1+2+3+4+5+6 all merging. Phases 9+10 depend on 8. Phase 11 is the final gate.

**Critical path**: 0 → 1 → 8 → 9 → 10 → 11 (~13 phases-of-work compressed). If executed serially, ~3-4 days. If parallelized in 2-6, ~1.5-2 days.

---

## Phase 0: SDK consumption smoke

**Objective:** Verify SDK v1.1.0 is reachable from TheoKit's compile + runtime paths before touching any code.

### T0.1 — Verify SDK v1.1.0 exports + workspace wire

#### Objective
Confirm `Agent.registry`, `AgentRunError`, `AgentRunErrorCode`, `FileSystemConversationStorage`, `InMemoryConversationStorage` are imported correctly from `@usetheo/sdk` in the running workspace.

#### Evidence
- `theokit-sdk/packages/sdk/package.json` shows v1.1.0 (verified earlier).
- `pnpm-workspace.yaml` includes `../theokit-sdk/packages/sdk` — symlink already exists.
- No code in TheoKit imports the new exports yet.

#### Files to edit
```
tests/integration/sdk-1-1-0-exports.test.ts (NEW) — contract test that imports new exports and asserts shape
```

#### Deep file dependency analysis
- `tests/integration/sdk-1-1-0-exports.test.ts` (NEW) — imports from `@usetheo/sdk`, no other dependency. Runs in vitest under Node. Smoke-only — does not exercise functionality.

#### Deep Dives
- **Data structures verified**: `Agent.registry` is an object/instance with `configure/evict/evictAll/size/ids` methods. `AgentRunError` has `code/provider/retriable/retryAfterMs/providerError/requestId/conversationId`. `AgentRunErrorCode` is a string literal union of 11+ codes.
- **Invariants**: imports MUST resolve at TypeScript level AND at runtime. A TS-only assertion is not enough.
- **Edge cases**: workspace symlink could point at a stale build. Test reads `@usetheo/sdk/package.json` and asserts version starts with `1.1.`.

#### Tasks
1. Create `tests/integration/sdk-1-1-0-exports.test.ts` with import + shape assertions.
2. Run `npx vitest run tests/integration/sdk-1-1-0-exports.test.ts` — MUST be green.
3. If failure: investigate workspace symlink, run `pnpm install`, verify SDK is built (`packages/sdk/dist/` exists in sibling).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_sdk_version_satisfies_caret_range() — Given @usetheo/sdk installed, When `semver.satisfies(version, '^1.1.0')` evaluated, Then true. (EC-4 — semver-aware, forward-compat: accepts 1.1.x, 1.2.x; rejects 1.0.x, 2.0.x.)
RED:  test_agent_registry_has_configure_method() — Given Agent imported, When Agent.registry inspected, Then typeof Agent.registry.configure === 'function'
RED:  test_agent_run_error_has_code_field() — Given AgentRunError thrown with code:'auth', When .code accessed, Then value is "auth"
RED:  test_file_system_conversation_storage_constructs() — Given FileSystemConversationStorage class, When `new FileSystemConversationStorage()` called, Then instance has getMessages/appendMessage/deleteConversation methods
RED:  test_in_memory_conversation_storage_constructs() — Given InMemoryConversationStorage class, When new InMemoryConversationStorage() called, Then same contract
GREEN: Tests pass on first run (SDK is shipped); no impl needed — this is a contract verification.
REFACTOR: None expected.
VERIFY: npx vitest run tests/integration/sdk-1-1-0-exports.test.ts
```

> **EC-4 (SHOULD TEST)**: original check `starts with "1.1."` is brittle — when SDK ships 1.2.0 (non-breaking), the test fails for the wrong reason. Use `semver.satisfies(version, '^1.1.0')` (semver lib already transitive via several deps).

BDD scenarios obrigatórios:
- **Happy path**: SDK version is 1.1.x; all 5 exports import and construct.
- **Validation error**: workspace symlink broken → import throws; test catches and fails with actionable message.
- **Edge case**: SDK dist not built → import resolves but methods are undefined; test asserts methods exist.
- **Error scenario**: Wrong version installed (e.g., 1.0.x) → version test fails with diff.

#### Acceptance Criteria
- [ ] `tests/integration/sdk-1-1-0-exports.test.ts` exists with 5 named tests
- [ ] All tests green
- [ ] Pass: `pnpm typecheck` (tsc --noEmit)
- [ ] Pass: `pnpm lint --max-warnings=0`
- [ ] Pass: `pnpm exec dependency-cruiser packages/theo/src` 0 violations

#### DoD
- [ ] Vitest run green: `npx vitest run tests/integration/sdk-1-1-0-exports.test.ts`
- [ ] No new typecheck/lint errors introduced

---

## Phase 1: AgentEvent type contract — error discrimination

**Objective:** Extend `AgentEvent.error` with optional fields (`code`, `provider`, `retriable`, `retryAfterMs`) so downstream `streamAgentRun` + `useAgentStream` can carry structured error info.

### T1.1 — Extend AgentErrorEvent with discrimination fields

#### Objective
Add `code/provider/retriable/retryAfterMs` to `AgentErrorEvent` as optional fields. Existing consumers reading `event.message` are unaffected.

#### Evidence
- `packages/theo/src/server/agent/agent-types.ts:34-38` — current shape `{ type: 'error'; message: string; id? }` lacks structure.
- Release note's gap #3 specifies the new SDK shape; TheoKit's wire must transport it.

#### Files to edit
```
packages/theo/src/server/agent/agent-types.ts — extend AgentErrorEvent + type alias for AgentRunErrorCode subset
tests/unit/agent-event-type.test-d.ts — type-test the new fields are optional + present
tests/integration/agent-event-error-shape.test.ts (NEW) — runtime shape assertion
```

#### Deep file dependency analysis
- `agent-types.ts` — re-exported via `server/agent/index.ts` → `server/index.ts` → public surface `theokit/server`. Type addition is non-breaking.
- `agent-event-type.test-d.ts` — exists already (T1.1 from prior plan); will gain new assertions.
- New runtime test → standalone, no downstream impact.

#### Deep Dives
- **Data structures**: structural mirror of SDK's `AgentRunErrorCode` union without hard-importing the SDK type (per D2 decoupling). Define a local string-literal union with `(string & {})` fallback for forward-compat (EC-7):
  ```ts
  // The `& {}` trick preserves autocompletion of the known codes while
  // accepting any string at the type level — so future SDK codes don't
  // cause TS rejection on the consumer side.
  export type AgentRunErrorCode =
    | 'auth'
    | 'rate_limit'
    | 'quota_exceeded'
    | 'invalid_model'
    | 'invalid_request'
    | 'invalid_input'
    | 'context_too_large'
    | 'safety_blocked'
    | 'provider_unreachable'
    | 'tool_runtime_error'
    | 'aborted'
    | 'unknown'
    | (string & {})
  ```
- **Invariants**: backward compat — `{ type: 'error', message: 'x' }` (no new fields) MUST still typecheck. New fields ALL optional.
- **Edge cases**: client receives an error where `code === undefined` → treat as legacy/unknown. UI should not crash.

#### Tasks
1. Add `AgentRunErrorCode` exported type alias.
2. Extend `AgentErrorEvent` with optional fields.
3. Update `tests/unit/agent-event-type.test-d.ts` with `expectTypeOf` assertions for each new field.
4. Create `tests/integration/agent-event-error-shape.test.ts` validating JSON-serialized error events still match the union schema.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_agent_error_event_has_optional_code() — Given AgentErrorEvent type, When inspected, Then `code` is optional
RED:  test_agent_error_event_has_optional_provider() — Same for `provider`
RED:  test_agent_error_event_has_optional_retriable() — Same for `retriable` (boolean)
RED:  test_agent_error_event_has_optional_retry_after_ms() — Same for `retryAfterMs` (number)
RED:  test_agent_error_event_backward_compat() — Given `{ type:'error', message:'x' }` only, When typechecked, Then matches AgentErrorEvent
RED:  test_agent_run_error_code_union_has_all_codes() — Given AgentRunErrorCode, When checked, Then accepts all 12 string values from release note
GREEN: Add 4 optional fields + type alias.
REFACTOR: Reorder fields alphabetically inside the interface; verify export list intact.
VERIFY: npx vitest run tests/unit/agent-event-type.test-d.ts tests/integration/agent-event-error-shape.test.ts
```

BDD:
- **Happy path**: full populated error event → all 5 fields readable.
- **Validation error**: payload with `code: 'invalid'` (not in union) → TS rejects.
- **Edge case**: error event with only `message` (legacy server) → typechecks; runtime asserts shape OK.
- **Error scenario**: `retryAfterMs: 'string'` (wrong type) → TS rejects.

#### Acceptance Criteria
- [ ] `AgentErrorEvent` extends with 4 optional fields
- [ ] `AgentRunErrorCode` exported type alias with 12 codes
- [ ] Type tests: 6 assertions pass
- [ ] Runtime test: shape validation passes
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` 0 warnings
- [ ] Public DTS includes new fields (verified by `publint`/`attw` in Phase 11)

#### DoD
- [ ] All RED tests passed BEFORE GREEN
- [ ] Refactor pass clean (no test failures introduced)
- [ ] Code-audit checks: `no any`, `no @ts-ignore`, `no manual interface duplicating Zod` — all pass

---

## Phase 2: createConversationHistory — ConversationStorageAdapter passthrough

**Objective:** Surface SDK's `conversationStorage` option through TheoKit's `createConversationHistory` factory + document the structural type.

### T2.1 — Add structural `ConversationStorageLike` + thread to SDK

#### Objective
TheoKit defines a structural `ConversationStorageLike` interface (duck-type of SDK's `ConversationStorageAdapter`); `createConversationHistory({ conversationStorage })` accepts it and forwards via `options.conversationStorage` to `Agent.getOrCreate`.

#### Evidence
- `create-conversation-history.ts:43-49` — `SdkAgentOptions` has index signature, so the option already passes through opaquely. Wire is functional but undocumented + untyped.
- Release note's Gap #1 shows the SDK accepts `conversationStorage` on `Agent.create/getOrCreate`.

#### Files to edit
```
packages/theo/src/server/agent/create-conversation-history.ts — add ConversationStorageLike + typed conversationStorage parameter
packages/theo/src/server/agent/index.ts — re-export ConversationStorageLike
tests/unit/create-conversation-history-storage.test.ts (NEW) — wire passthrough test
```

#### Deep file dependency analysis
- `create-conversation-history.ts` — already called by `examples/openrouter-demo/server/routes/chat.ts`, `examples/full-stack-agent/server/routes/chat.ts`, `fixtures/template-default/server/routes/chat.ts`, `packages/create-theo/templates/default/server/routes/chat.ts`. Adding an optional param is non-breaking.
- `index.ts` — barrel; one new export.
- New test → smoke proves the option reaches Agent.getOrCreate via spy.

#### Deep Dives
- **Data structures**: structural shape MUST match SDK exactly:
  ```ts
  interface ConversationStorageLike {
    getMessages(conversationId: string): Promise<readonly unknown[]>
    appendMessage(conversationId: string, message: unknown): Promise<void>
    deleteConversation(conversationId: string): Promise<void>
    listConversationIds?(opts?: { limit?: number }): Promise<readonly string[] | undefined>
    dispose?(): Promise<void>
  }
  ```
  Uses `unknown` for messages to avoid coupling. Real consumers cast at the call site.
- **Invariants**: omitted `conversationStorage` → SDK falls back to its default `FileSystemConversationStorage`. Behavior unchanged for existing apps.
- **Edge cases**: D2 sync drift — contract test imports SDK's type and asserts assignability.

#### Tasks
1. Add `ConversationStorageLike` interface to `create-conversation-history.ts`.
2. Add `conversationStorage?: ConversationStorageLike` to the public `createConversationHistory` input type.
3. Wire into the call to `Agent.getOrCreate` (it's already passed via index signature; just lift to typed field).
4. Re-export from barrel.
5. New unit test using a stub storage that records calls.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_storage_passthrough_explicit() — Given stub storage + createConversationHistory({conversationStorage:stub}), When Agent.getOrCreate called, Then receives options.conversationStorage === stub
RED:  test_storage_omitted_defaults_to_sdk() — Given createConversationHistory({}) (no storage), When Agent.getOrCreate called, Then options.conversationStorage is undefined (SDK uses its default)
RED:  test_storage_partial_interface_typechecks() — Given storage with only required methods (getMessages/appendMessage/deleteConversation), When passed, Then accepted by type
RED:  test_storage_extra_methods_typecheck() — Given storage with optional listConversationIds + dispose, When passed, Then accepted
RED:  test_sdk_contract_assignability() — Given SDK's ConversationStorageAdapter import, When assigned to ConversationStorageLike variable, Then no type error (D2 invariant, direction: SDK → TheoKit)
RED:  test_theokit_storage_assignable_to_sdk_adapter() — Given TheoKit ConversationStorageLike value, When assigned to `import('@usetheo/sdk').ConversationStorageAdapter` variable, Then no type error (EC-5 — reverse direction: TheoKit → SDK; catches drift where TheoKit adds a method SDK doesn't have)
GREEN: Add interface + thread; existing test suite stays green.
REFACTOR: Inline JSDoc explaining D2 + the unknown-message rationale.
VERIFY: npx vitest run tests/unit/create-conversation-history-storage.test.ts
```

BDD:
- **Happy path**: storage passed → Agent.getOrCreate sees it → SDK uses it for persistence.
- **Validation error**: storage missing required `appendMessage` → TS rejects.
- **Edge case**: storage with only 3 required methods (no `dispose`/`listConversationIds`) → accepted; SDK no-ops the missing.
- **Error scenario**: SDK rejects the call (e.g., conflict between explicit storage and pre-existing agent in registry) — caller sees SDK's `ConfigurationError`. Test asserts error class.

#### Acceptance Criteria
- [ ] `ConversationStorageLike` interface exported
- [ ] `createConversationHistory` accepts `conversationStorage` typed
- [ ] All 5 RED tests pass
- [ ] Backward compat: existing tests in `tests/integration/create-conversation-history.test.ts` (if any) stay green
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` 0 warnings

#### DoD
- [ ] SDK contract sync check passes (T0.1's exports test + this T2.1's assignability test)
- [ ] No regressions in existing chat fixture tests

---

## Phase 3: defineAgentEndpoint — AbortSignal threading

**Objective:** When the SSE client disconnects (browser closes, fetch aborted), the in-flight LLM call cancels — tokens stop charging.

### T3.1 — Thread request close → agent.send({ signal })

#### Objective
`defineAgentEndpoint`'s handler exposes an `AbortSignal` derived from the request's close event. The signal threads to `agent.send({ signal })` so SDK propagates cancellation to the provider call.

#### Evidence
- Release note Gap #5: SDK now accepts `signal` on `agent.send()` and `agent.stream()`.
- Current TheoKit defineAgentEndpoint receives `request` but does NOT expose a signal to the user's generator.
- Browser disconnect today: SDK keeps streaming from OpenAI; user gets billed for unobserved tokens.

#### Files to edit
```
packages/theo/src/server/agent/define-agent-endpoint.ts — derive signal, pass to handler context
packages/theo/src/server/agent/agent-types.ts — add `signal: AbortSignal` to handler ctx interface
examples/openrouter-demo/server/routes/chat.ts — pass `signal` to `agent.send`
examples/full-stack-agent/server/routes/chat.ts — same
fixtures/template-default/server/routes/chat.ts — same
packages/create-theo/templates/default/server/routes/chat.ts — same
tests/integration/define-agent-endpoint-signal.test.ts (NEW) — abort propagation test
```

#### Deep file dependency analysis
- `define-agent-endpoint.ts` — adds signal derivation logic. Must support both Node `IncomingMessage` (via `req.on('close', cb)` → fires controller.abort) and Web `Request` (`request.signal` natively). Detect via duck-typing.
- `agent-types.ts` — handler context extended.
- 4 chat.ts callers — minor edit to thread `signal` through `agent.send`.
- New test asserts abort fires + reaches SDK.

#### Deep Dives
- **Algorithm — signal derivation (EC-1 MUST FIX — duck-type, not instanceof)**:
  ```ts
  function deriveSignal(req: unknown): AbortSignal {
    // Web Request — duck-type, NOT `instanceof AbortSignal`. Cross-realm
    // (Node 18 polyfill via `abort-controller` npm, undici, edge runtimes
    // with their own AbortSignal global) makes instanceof return false
    // for valid signals. EC-1 fix: structurally check the AbortSignal API.
    if (req !== null && typeof req === 'object' && 'signal' in req) {
      const sig = (req as { signal?: unknown }).signal
      if (
        sig !== null &&
        typeof sig === 'object' &&
        'aborted' in sig &&
        typeof (sig as { addEventListener?: unknown }).addEventListener === 'function'
      ) {
        return sig as AbortSignal
      }
    }
    // Node IncomingMessage — emits 'close' on disconnect.
    if (req !== null && typeof req === 'object' && typeof (req as { on?: unknown }).on === 'function') {
      const controller = new AbortController()
      ;(req as { on(ev: string, cb: () => void): void }).on('close', () => controller.abort())
      return controller.signal
    }
    // Fallback: never aborts (open-ended request, framework-tested)
    return new AbortController().signal
  }
  ```
- **Invariants**:
  - `signal.aborted` MUST become `true` within 100ms of client disconnect.
  - Aborting MUST NOT corrupt conversation history — SDK guarantees no partial assistant message persists when `code:'aborted'` is thrown.
  - The signal is request-scoped; subsequent requests get a fresh signal.
- **Edge cases**:
  - Tests that don't pass a real request shape → fallback signal (never aborts) is correct.
  - Multiple `on('close')` listeners conflict → use `{ once: true }` semantics or check `signal.aborted` before adding listener.
  - Generator yields after abort — the SSE stream MAY get an `abort` event before flushing remaining buffered chunks; document.

#### Tasks
1. Extract `deriveSignal(req)` helper into `packages/theo/src/server/agent/derive-signal.ts`.
2. Update `defineAgentEndpoint` to derive + pass to handler ctx as `ctx.signal`.
3. Extend `agent-types.ts` handler ctx interface.
4. Update 4 chat.ts files to forward `signal` to `agent.send({ signal })`.
5. Write integration test using an `AbortController` + spy on Agent.send arguments.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_signal_threaded_from_web_request() — Given request with `signal`, When defineAgentEndpoint handler invoked, Then ctx.signal === request.signal
RED:  test_signal_threading_cross_realm() — Given request.signal from a polyfilled AbortController (NOT native; mock realm via `{ aborted: false, addEventListener: vi.fn() }`), When deriveSignal called, Then returns the signal (instanceof bypassed by duck-type) — EC-1 MUST FIX
RED:  test_signal_threaded_from_node_incoming_message() — Given Node req that emits 'close', When listener fires, Then ctx.signal.aborted becomes true
RED:  test_handler_passes_signal_to_agent_send() — Given handler that calls agent.send(msg, {signal}), When spy on agent.send, Then receives options.signal: AbortSignal
RED:  test_abort_mid_stream_yields_error_aborted() — Given streaming run, When client aborts, Then AgentEvent yields { type:'error', code:'aborted' } (Phase 4 dependency — wire-up validated here)
RED:  test_no_partial_message_persisted_on_abort() — Given InMemoryConversationStorage spy, When abort fires mid-stream, Then no `assistant`-role message appended
GREEN: Implement deriveSignal + threading. Update chat.ts callers.
REFACTOR: Extract listener registration into deriveSignal helper if duplication seen.
VERIFY: npx vitest run tests/integration/define-agent-endpoint-signal.test.ts
```

BDD:
- **Happy path**: web Request signal propagates → agent.send aborts → AgentEvent error{code:'aborted'}.
- **Validation error**: handler missing signal in ctx (TS) — should not happen since ctx is typed.
- **Edge case**: request shape with neither `signal` nor `on` → fallback signal never aborts; generator runs to completion. Documented behavior.
- **Error scenario**: signal already aborted at handler entry → `agent.send` throws immediately with `code:'aborted'`. Test asserts no LLM call hit.

#### Acceptance Criteria
- [ ] `deriveSignal` exported (internal) with both Web + Node paths
- [ ] `ctx.signal` available in handler
- [ ] 4 chat.ts callers updated
- [ ] 5 RED tests pass
- [ ] Backward compat: existing handlers that ignore `ctx.signal` keep working
- [ ] `pnpm typecheck` + `pnpm lint` clean

#### DoD
- [ ] Integration test exercises abort end-to-end (controller.abort → SDK aborts → SSE closes)
- [ ] No regressions in existing defineAgentEndpoint tests

---

## Phase 4: streamAgentRun — AgentRunError discrimination

**Objective:** When SDK throws `AgentRunError`, `streamAgentRun` maps `code/provider/retriable/retryAfterMs` to the corresponding `AgentEvent.error` fields. Client UI can `switch (event.code)`.

### T4.1 — Map AgentRunError to AgentErrorEvent with structured fields

#### Objective
Inside `streamAgentRun`'s error catch block, when the error matches `AgentRunError` shape (duck-typed for D2), populate the new optional fields on the emitted `AgentEvent.error`.

#### Evidence
- `stream-agent-run.ts` currently maps any thrown error to `{ type:'error', message: error.message }`.
- Release note Gap #3 confirms `AgentRunError` has `.code/.provider/.retriable/.retryAfterMs/.requestId/.conversationId/.providerError`.

#### Files to edit
```
packages/theo/src/server/agent/stream-agent-run.ts — extend catch block; export an isAgentRunError type guard
tests/unit/stream-agent-run-error-discrim.test.ts (NEW) — mapping tests
```

#### Deep file dependency analysis
- `stream-agent-run.ts` — has a generator structure where `try { for await ... } catch (e) { yield { type:'error', message: e.message } }`. Extend the catch to detect AgentRunError shape and lift fields.
- Down-stream consumers: anyone who awaits `streamAgentRun(run)` and receives `AgentEvent`s — `defineAgentEndpoint`, every example chat handler. They all destructure `event.message`; adding fields is non-breaking.

#### Deep Dives
- **Algorithm — type guard (EC-6: weakened to require only `code`)**:
  ```ts
  // EC-6: do NOT require `'provider' in err` — SDK may throw AgentRunError
  // without provider in local error paths (timeout before request, tool
  // handler throw, etc.). Only `code: string` is structurally guaranteed.
  function isAgentRunError(err: unknown): err is AgentRunErrorLike {
    return (
      err instanceof Error &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string'
    )
  }
  ```
- **Invariants**:
  - `providerError` field on SDK's AgentRunError MUST NOT be serialized into the SSE wire (might leak provider secrets). Only `code/provider/retriable/retryAfterMs/requestId` are surfaced.
  - `message` field still populated from `error.message` (backward compat).
  - **EC-15 (DOCUMENT)**: `error.message` from the SDK is *trusted* to not contain secrets. SSE wire propagates the message verbatim. If the SDK ever leaks an API key into `.message`, that's an SDK bug — TheoKit's wire is transparent by design (allows debugging while keeping `providerError` quarantined).
- **Edge cases**:
  - Non-AgentRunError thrown (e.g., a tool handler throws a plain Error) → degrade gracefully: only `message` populated, `code` undefined.
  - `retryAfterMs: 0` is valid (immediate retry hint); MUST not be treated as "absent".
  - **EC-7 (SHOULD TEST)**: future SDK adds a 13th `AgentRunErrorCode` (e.g., `'content_filter'`). Local union with `(string & {})` fallback preserves autocompletion AND accepts unknown codes without TS rejection.

#### Tasks
1. Add `isAgentRunError` type guard (local, internal).
2. Extend `try/catch` in the generator to populate optional fields when guard matches.
3. Document the omitted `providerError` invariant in JSDoc.
4. Test mapping for each of 12 codes (parametric test).
5. Test no-leak invariant for `providerError`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_maps_code_to_event() — for each AgentRunErrorCode value, throw matching error → yielded event.code matches
RED:  test_maps_retry_after_ms() — Given AgentRunError(retryAfterMs:30000), When caught, Then event.retryAfterMs === 30000
RED:  test_does_not_leak_provider_error() — Given AgentRunError({providerError:{secret:'leaked'}}), When yielded, Then JSON.stringify(event) does NOT include 'leaked'
RED:  test_falls_back_for_plain_error() — Given new Error('boom'), When caught, Then event = {type:'error', message:'boom'}; code/provider/retriable undefined
RED:  test_retry_after_ms_zero_valid() — Given AgentRunError(retryAfterMs:0), When caught, Then event.retryAfterMs === 0 (not undefined)
RED:  test_type_guard_matches_minimal_agent_run_error() — Given `new AgentRunError({ code: 'auth' })` WITHOUT provider/retriable/retryAfterMs, When isAgentRunError checked, Then true; event.code === 'auth'; other fields undefined. EC-6 — guard must not require `'provider' in err`.
RED:  test_agent_run_error_code_accepts_unknown_string_for_forward_compat() — Given `const c: AgentRunErrorCode = 'content_filter'` (hypothetical new SDK code not in local union), When typechecked, Then accepted. EC-7 — `(string & {})` fallback preserves autocompletion.
GREEN: Implement type guard + field mapping.
REFACTOR: Extract `errorToEvent(err)` pure helper for testability.
VERIFY: npx vitest run tests/unit/stream-agent-run-error-discrim.test.ts
```

BDD:
- **Happy path**: SDK throws `AgentRunError({code:'rate_limit', retryAfterMs:30_000})` → event has all fields.
- **Validation error**: SDK throws something not matching AgentRunError shape → fallback (`message` only).
- **Edge case**: `retryAfterMs:0` valid; `code:'unknown'` valid; plain Error works without crashing.
- **Error scenario**: type guard misidentifies an error subclass — defensive: still emit valid event with at least `message`.

#### Acceptance Criteria
- [ ] `streamAgentRun` populates all 5 fields when AgentRunError thrown
- [ ] `providerError` never leaks via SSE wire (asserted by JSON.stringify guard)
- [ ] 5 RED tests pass + parametric over 12 codes
- [ ] Backward compat: plain Error still emits `{type:'error', message}`
- [ ] `pnpm typecheck` + `pnpm lint` clean

#### DoD
- [ ] Integration smoke: chat fixture throws AgentRunError → useAgentStream client receives `event.code`
- [ ] No regressions in stream-agent-run.test.ts

---

## Phase 5: trackAgentRun — Tool lifecycle hooks

**Objective:** TheoKit's `trackAgentRun` (cost) acquires per-tool latency + error counters via SDK's `onToolStart/onToolEnd/onToolError` hooks.

### T5.1 — Add trackAgentTools helper + ToolUsageRecord support

#### Objective
Expose a `trackAgentTools({ storage })` factory that returns `{ onToolStart, onToolEnd, onToolError }` callbacks ready to attach to `Agent.create`. Each invocation records a `ToolUsageRecord` via `UsageStorageAdapter.record`.

#### Evidence
- Release note Gap #4: SDK calls `onToolStart/End/Error` with `callId` + `durationMs`.
- Current `trackAgentRun` only handles post-hoc LLM usage; no per-tool granularity.

#### Files to edit
```
packages/theo/src/server/cost/track-agent-tools.ts (NEW) — factory
packages/theo/src/server/cost/cost-types.ts — extend UsageStorageAdapter.record signature; add ToolUsageRecord type
packages/theo/src/server/cost/usage-storage-memory.ts — handle new ToolUsageRecord union member
packages/theo/src/server/cost/index.ts — export
tests/unit/track-agent-tools.test.ts (NEW)
```

#### Deep file dependency analysis
- `cost-types.ts` — `UsageStorageAdapter.record(rec: UsageRecord)` becomes `record(rec: UsageRecord | ToolUsageRecord)`. Discriminated by `kind: 'llm' | 'tool'`. EXISTING ADAPTERS NEED A MIGRATION PATH — backward compat: if record arrives without `kind`, treat as `'llm'` (default). All in-tree adapters updated; external adapter consumers updated via release note.
- `usage-storage-memory.ts` — stores records in a flat array; just need to accept the new type.
- `track-agent-tools.ts` (NEW) — pure factory; no side effects beyond callbacks.
- Cost example in `examples/full-stack-agent` uses trackAgentRun; will gain new option in Phase 8.

#### Deep Dives
- **Data structures**:
  ```ts
  interface UsageRecord {
    kind: 'llm'                // ← NEW discriminator (optional in v0.2.x; required in v0.3.0)
    userId: string
    model: string
    tokens: { input: number; output: number }
    costUsd: number
    timestamp: Date
  }
  interface ToolUsageRecord {
    kind: 'tool'
    userId: string
    conversationId: string
    toolName: string
    callId: string
    success: boolean
    durationMs: number
    errorMessage?: string  // only when success === false
    timestamp: Date
  }
  ```
- **Invariants**:
  - `onToolStart` records nothing yet (no duration); only stashes start timestamp by callId in a per-factory Map.
  - `onToolEnd` reads start timestamp, computes duration, records ToolUsageRecord with `success:true`.
  - `onToolError` reads start timestamp, records with `success:false`.
  - Throws inside hooks are SWALLOWED (release note states observation hooks must not crash the run).
  - **EC-16 (DOCUMENT)**: `callId` uniqueness is SDK's contract. TheoKit defends against duplicate-start (last wins) but does NOT retry if End fires twice. If a future SDK bug causes callId reuse, the impact is at-most a stale duration measurement — never a corrupt cost record.
- **Edge cases**:
  - `callId` of an onToolEnd doesn't match any prior onToolStart → record with `durationMs: 0` and log warning (orphan end).
  - Multiple onToolStart with same callId → use the last one (defensive).
  - **EC-8 (SHOULD TEST)**: The start-timestamp Map MUST prune orphan entries (Start without matching End/Error). Without pruning, a 24h-running server with intermittent SDK bugs grows the Map unbounded → memory leak. Fix: each onToolStart prunes entries older than 5 minutes (`startedAt < now - 5 * 60_000`) from the Map. Simple O(N) sweep; N is typically small (active concurrent tools). Acceptable for the prod workload.

#### Tasks
1. Define `ToolUsageRecord` + extend `UsageRecord` with `kind` discriminator.
2. Update `UsageStorageAdapter.record` signature to union.
3. Patch in-tree memory adapter.
4. Write `track-agent-tools.ts` factory.
5. Export from cost barrel.
6. Tests for all 3 hooks + edge cases.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_on_tool_start_records_nothing() — Given factory + storage spy, When onToolStart fires, Then storage.record NOT called
RED:  test_on_tool_end_records_tool_usage() — Given paired start+end, When end fires, Then storage.record called with kind:'tool', success:true, durationMs > 0
RED:  test_on_tool_error_records_failure() — Given start+error pair, When error fires, Then record with success:false + errorMessage from error.message
RED:  test_durationMs_computed() — Given start at t0, end at t0+100ms (mocked Date), Then durationMs === 100
RED:  test_orphan_end_logs_warning_records_zero() — Given end without start, When fired, Then record with durationMs:0 + warn logged
RED:  test_hook_throw_swallowed() — Given storage.record throws, When hook fires, Then exception suppressed (no rethrow) + console.warn
RED:  test_backward_compat_old_usage_record() — Given record({userId,model,tokens,costUsd}) (no kind field), When stored, Then treated as kind:'llm'
RED:  test_orphan_starts_pruned_after_ttl() — Given onToolStart('a') fired at t0 WITHOUT matching End/Error, When onToolStart('b') called at t0 + 6 min (fake timer), Then internal Map no longer contains 'a' (EC-8 — orphan TTL prune)
RED:  test_external_adapter_without_kind_field_backward_compat() — Given a custom UsageStorageAdapter mock whose record signature accepts `{userId,model,tokens,costUsd,timestamp}` (no `kind`), When trackAgentRun called, Then adapter.record receives normalized `{...input, kind:'llm'}` — caller code from older versions stays compatible (EC-9)
GREEN: Implement factory + storage signature change + TTL prune sweep.
REFACTOR: Inline JSDoc; extract Map cleanup into helper.
VERIFY: npx vitest run tests/unit/track-agent-tools.test.ts
```

BDD:
- **Happy path**: 3 tool calls → 3 ToolUsageRecord rows in memory storage.
- **Validation error**: invalid record (missing required fields) → adapter throws; factory catches + warns.
- **Edge case**: orphan onToolEnd (no matching start) → record with duration:0, log warning.
- **Error scenario**: storage.record throws (DB outage) → hook does NOT propagate the error to abort the run.

#### Acceptance Criteria
- [ ] `trackAgentTools({ storage })` factory exported
- [ ] `ToolUsageRecord` type exported
- [ ] `UsageRecord` gains optional `kind` (default 'llm')
- [ ] 7 RED tests pass
- [ ] Backward compat: existing `trackAgentRun(input, { storage })` still works (default kind:'llm')
- [ ] `pnpm typecheck` + `pnpm lint` clean

#### DoD
- [ ] Memory adapter accepts both record kinds
- [ ] No regressions in existing cost tests

---

## Phase 6: Agent.registry config + SIGTERM eviction

**Objective:** Surface `Agent.registry.configure()` via `theo.config.ts > agents.registry`; wire `theokit start` to evict all agents on SIGTERM/SIGINT.

### T6.1 — Add agents.registry to config schema + lazy boot config

#### Objective
`theo.config.ts > agents.registry: { maxAgents, idleTimeoutMs, onEvict }` validates via Zod and gets applied (lazily) at first `defineAgentEndpoint` invocation.

#### Evidence
- `packages/theo/src/config/schema.ts` has no `agents` section.
- Release note Gap #2 documents `Agent.registry.configure(opts)` accepting `{ maxAgents, idleTimeoutMs, onEvict }`.

#### Files to edit
```
packages/theo/src/config/schema.ts — add agents.registry Zod section
packages/theo/src/server/agent/define-agent-endpoint.ts — call Agent.registry.configure() lazily on first request
tests/unit/config-agents-registry.test.ts (NEW) — schema validation
tests/integration/agent-registry-lazy-config.test.ts (NEW) — boot config wire test
```

#### Deep file dependency analysis
- `config/schema.ts` — Zod schema; adding a section is non-breaking.
- `define-agent-endpoint.ts` — guarded once-per-process flag controls configure call.
- New tests → standalone.

#### Deep Dives
- **Data structures**:
  ```ts
  agentsRegistrySchema = z.object({
    maxAgents: z.number().int().positive().max(10_000).default(100),
    idleTimeoutMs: z.number().int().nonneg().default(30 * 60_000),
  })
  agentsSchema = z.object({
    registry: agentsRegistrySchema.optional(),
  }).optional()
  ```
  `onEvict` is NOT in the config schema (callbacks are not JSON-serializable; surfaced only via programmatic `defineConfig`).
- **Invariants**:
  - Configure once per process. Subsequent calls are no-ops.
  - Defaults match SDK defaults (no surprise behavior).
  - If `agents.registry` omitted, SDK defaults apply (matched). No-op call still safe.
  - **EC-3 (MUST FIX) — sync flag flip BEFORE configure**:
    ```ts
    // WRONG (race-vulnerable):
    //   if (!configured) { configure(opts); configured = true }
    // Two concurrent first-requests both pass `if (!configured)` and call configure 2x.
    //
    // RIGHT (sync flip):
    let configured = false
    function configureAgentRegistryOnce(opts: AgentRegistryOptions): void {
      if (configured) return
      configured = true  // ← flip BEFORE configure; second concurrent caller exits the if-guard
      try {
        Agent.registry.configure(opts)
      } catch (err) {
        configured = false  // rollback so a future request can retry (rare; only on SDK bug)
        console.warn('[theokit] Agent.registry.configure threw:', err)
      }
    }
    ```
  - **EC-14 (DOCUMENT)**: if user code calls `Agent.registry.configure()` programmatically BEFORE the first defineAgentEndpoint request, TheoKit's lazy fire will overwrite with `theo.config.ts` values. Framework wins by design — production config lives in theo.config.ts, not in user code.
  - **EC-17 (DOCUMENT)**: `maxAgents` MUST be ≥ max-concurrent-active-conversations. With `maxAgents: 1` and 2 simultaneous chats, LRU evicts the first agent mid-stream → Agent disposed → SDK aborts with `code:'aborted'`. Default `100` covers indie/small-team; tune up for high-traffic. Add an inline schema comment.
- **Edge cases**:
  - User supplies `maxAgents: 0` → schema rejects (positive int required). Documented.
  - `idleTimeoutMs: 0` → schema accepts (means "never idle-evict"). Documented.

#### Tasks
1. Extend `config/schema.ts` with `agentsSchema`.
2. Add `configureAgentRegistryOnce()` helper in `define-agent-endpoint.ts`.
3. Wire helper to fire on first request.
4. Tests for schema validation + lazy boot.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_config_accepts_valid_agents_registry() — Given config {agents:{registry:{maxAgents:50}}}, When parsed, Then valid
RED:  test_config_rejects_zero_max_agents() — Given maxAgents:0, When parsed, Then ZodError
RED:  test_config_accepts_zero_idle_timeout() — Given idleTimeoutMs:0, When parsed, Then valid
RED:  test_config_defaults_applied() — Given config {agents:{registry:{}}}, When parsed, Then defaults populated
RED:  test_configure_called_once_per_process() — Given 3 requests to defineAgentEndpoint, When inspected, Then Agent.registry.configure called exactly 1x
RED:  test_configure_skipped_when_registry_undefined() — Given config without agents.registry, When request hit, Then configure NOT called (SDK defaults apply)
RED:  test_lazy_configure_no_race_under_concurrency() — Given module freshly loaded, When `Promise.all([handler(), handler(), handler()])` simulates 3 concurrent first-requests, Then `Agent.registry.configure` spy called exactly 1x (EC-3 MUST FIX — sync flag flip prevents race)
GREEN: Implement schema + lazy guard (sync flag flip BEFORE configure per EC-3).
REFACTOR: Extract guard into module-scoped flag.
VERIFY: npx vitest run tests/unit/config-agents-registry.test.ts tests/integration/agent-registry-lazy-config.test.ts
```

BDD:
- **Happy path**: config with `{maxAgents:50, idleTimeoutMs:600000}` → registry configured at boot.
- **Validation error**: `maxAgents:'fifty'` (wrong type) → ZodError surfaces in loadConfig.
- **Edge case**: registry config omitted → SDK defaults apply silently.
- **Error scenario**: `Agent.registry.configure` itself throws (SDK bug) → defineAgentEndpoint handler must NOT crash the request (log + continue).

#### Acceptance Criteria
- [ ] Zod schema validates `{ maxAgents, idleTimeoutMs }`
- [ ] Lazy guard fires once
- [ ] 6 RED tests pass
- [ ] `pnpm typecheck` + `pnpm lint` clean

#### DoD
- [ ] Schema test validates rejection cases
- [ ] Integration test asserts single configure call

### T6.2 — SIGTERM / SIGINT → Agent.registry.evictAll()

#### Objective
`theokit start` registers SIGTERM/SIGINT handlers that call `await Agent.registry.evictAll()` before exiting. Graceful shutdown for K8s pod termination grace window.

#### Evidence
- `packages/theo/src/cli/commands/start.ts` — no signal handlers today.
- Release note Gap #2 confirms `Agent.registry.evictAll()` returns Promise<void>.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts — register SIGTERM/SIGINT handlers
tests/integration/start-sigterm-evictall.test.ts (NEW) — child process kill -TERM + assert evictAll called
```

#### Deep file dependency analysis
- `start.ts` is the prod server entry. Adding signal handlers is additive.
- Integration test spawns a child `theokit start`, sends SIGTERM, asserts evictAll log line in stderr.

#### Deep Dives
- **Algorithm**:
  ```ts
  let shuttingDown = false
  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    log.info({ signal }, '[theokit] graceful shutdown — evicting all agents')
    await Agent.registry.evictAll()
    log.info('[theokit] shutdown complete')
    process.exit(0)
  }
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
  ```
- **Invariants**:
  - Re-entry guarded (multiple signals don't double-call).
  - Exit code 0 after successful eviction.
  - Max grace period before forced exit: respect K8s default 30s — if `evictAll` hangs > 25s, log warning and force exit. (Optional in v1; document.)
  - **EC-13 (DOCUMENT) — rely on platform-level LB drain**: SIGTERM evicts agents IMMEDIATELY (no per-request drain). In-flight requests are aborted mid-stream. This is correct: K8s + Vercel + most LBs already remove the pod from the rotation BEFORE sending SIGTERM (preStop hook + `terminationGracePeriodSeconds`). By the time SIGTERM fires, the pod is no longer receiving new traffic; in-flight requests can either complete (if fast) or get aborted (acceptable — clients should retry). Adding TheoKit-side drain would duplicate platform behavior. Document this assumption in JSDoc + code comment.
- **Edge cases**:
  - `evictAll()` throws (one agent's dispose fails) → log + continue + exit anyway.
  - SIGKILL received → no opportunity to handle; documented; users must rely on idle eviction policy for cleanup.

#### Tasks
1. Add signal handlers to `start.ts`.
2. Integration test: spawn subprocess, send SIGTERM, assert log + exit 0.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_sigterm_triggers_evict_all() — Given running theokit start, When SIGTERM sent, Then Agent.registry.evictAll called + exit code 0
RED:  test_sigint_triggers_evict_all() — Same for SIGINT
RED:  test_re_entry_guarded() — Given 2 SIGTERMs sent in quick succession, When inspected, Then evictAll called only once
RED:  test_evict_all_throw_does_not_block_exit() — Given evictAll rejects, When handler runs, Then process still exits (status 0 or 1, but exits)
GREEN: Implement handlers.
REFACTOR: Extract `gracefulShutdown` to helper module if reused elsewhere.
VERIFY: npx vitest run tests/integration/start-sigterm-evictall.test.ts
```

BDD:
- **Happy path**: prod server → SIGTERM → eviction → exit.
- **Validation error**: signal handler config invalid (shouldn't happen, but defensive) — skip wire-up + warn.
- **Edge case**: multiple signals → single shutdown.
- **Error scenario**: evictAll fails → log error + force exit.

#### Acceptance Criteria
- [ ] SIGTERM + SIGINT handlers registered
- [ ] 4 RED tests pass (subprocess-based)
- [ ] Re-entry guard verified
- [ ] No process exits non-zero on graceful path

#### DoD
- [ ] Integration test reliable (no flake — use `pidusage` or controlled timing)
- [ ] No regressions in existing start.ts tests

---

## Phase 7: Remove dev-agent-gc (legacy, redundant with SDK)

**Objective:** Delete the TheoKit-side `gcAgentRegistry` workaround now that SDK v1.1.0 handles it natively. Keep a one-version deprecation alias.

### T7.1 — Tombstone gcAgentRegistry + log deprecation

#### Objective
`gcAgentRegistry` becomes a no-op + deprecation `console.warn`. The dev mode no longer schedules it. Code is deleted in 0.4.0 (separate plan).

#### Evidence
- `packages/theo/src/cli/cleanup/cleanup.ts:gcAgentRegistry` — current LRU eviction implementation.
- `packages/theo/src/cli/cleanup/cleanup-types.ts` — `GcAgentRegistryOptions/GcAgentRegistryResult` types.
- Per ADR D7: tombstone for one version.

#### Files to edit
```
packages/theo/src/cli/cleanup/cleanup.ts — replace impl with no-op + warn
packages/theo/src/cli/cleanup/index.ts — keep barrel export
packages/theo/src/cli/commands/dev.ts — remove scheduling call (or replace with comment pointing to SDK registry)
tests/unit/cleanup-gcagentregistry-tombstone.test.ts (NEW) — assert no-op + warn
```

#### Deep file dependency analysis
- `cleanup.ts` — `gcAgentRegistry` removed from active code path. Stub remains for one version (D7).
- `dev.ts` — invocation removed. Existing dev startup tests must continue to pass (the scheduled call was internal; removing it has no user-visible effect except the SDK GC now handles it).
- Type aliases stay in `cleanup-types.ts` as `@deprecated`.

#### Deep Dives
- **Algorithm (EC-10: warn-once dedupe)**:
  ```ts
  let warnedOnce = false
  export function gcAgentRegistry(_opts?: unknown): { removed: number; kept: number } {
    if (!warnedOnce) {
      warnedOnce = true
      console.warn('[theokit] gcAgentRegistry is deprecated; SDK Agent.registry handles GC natively')
    }
    return { removed: 0, kept: 0 }
  }
  ```
- **Invariants**: no agent dir deleted by TheoKit anymore — SDK's `FileSystemConversationStorage` handles eviction by file-mtime if it wants to. Warn fires exactly once per process (avoids log spam in apps that loop-call the deprecated function).
- **Edge cases**: someone imports and uses it programmatically → gets the warning ONCE + no-op forever after. No crash.

#### Tasks
1. Replace `gcAgentRegistry` body with tombstone.
2. Remove invocation from `dev.ts`.
3. Add `@deprecated` JSDoc.
4. Test asserts no-op + warn.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_gc_agent_registry_returns_no_op() — Given any options, When called, Then result = {removed:0, kept:0}
RED:  test_gc_agent_registry_logs_deprecation() — When called, Then console.warn invoked with 'deprecated' substring
RED:  test_gc_agent_registry_does_not_delete_files() — Given a fake .theokit/agents/old/ dir, When tombstone called, Then dir still exists
RED:  test_dev_command_does_not_call_gc_agent_registry() — Given dev startup, When spy on gcAgentRegistry, Then NOT called
RED:  test_gc_agent_registry_warns_only_once_per_process() — Given gcAgentRegistry called 100x in same process, When console.warn spy inspected, Then expect(warnSpy).toHaveBeenCalledTimes(1) (EC-10 — module-scoped warnedOnce flag prevents log spam)
GREEN: Tombstone the function with warn-once flag.
REFACTOR: None — minimal change by design.
VERIFY: npx vitest run tests/unit/cleanup-gcagentregistry-tombstone.test.ts
```

BDD:
- **Happy path**: tombstone returns shape, warns, deletes nothing.
- **Validation error**: option object malformed → tombstone still returns no-op (defensive — don't crash deprecated paths).
- **Edge case**: caller spy on console.warn captures the deprecation message.
- **Error scenario**: dev command runs without calling the tombstone (eviction handled by SDK).

#### Acceptance Criteria
- [ ] Tombstone in place
- [ ] Dev mode no longer invokes
- [ ] 4 RED tests pass
- [ ] `pnpm typecheck` + `pnpm lint` clean

#### DoD
- [ ] Existing `cli-cleanup-rename.test.ts` still passes (it tests file presence, not behavior)
- [ ] No regressions in existing dev tests

---

## Phase 8: Examples — wire all 6 SDK primitives

**Objective:** Both `examples/openrouter-demo` and `examples/full-stack-agent` use `conversationStorage`, `signal`, error discrimination (server-side), and tool hooks (full-stack-agent only). Demonstrates the new wires in real code.

### T8.1 — openrouter-demo wires conversationStorage + signal

#### Objective
The openrouter-demo's chat.ts uses `InMemoryConversationStorage` (good for the demo; ephemeral OK), thread `ctx.signal` to `agent.send`. Comments explain when to swap for Postgres/Redis in prod.

#### Evidence
- `examples/openrouter-demo/server/routes/chat.ts:23` — comment says "SDK auto-persists in .theokit/agents/" — stale (now configurable).
- No `signal` threaded today.

#### Files to edit
```
examples/openrouter-demo/server/routes/chat.ts — use InMemoryConversationStorage; thread signal; map AgentRunError (auto via Phase 4)
tests/integration/openrouter-demo-storage-wire.test.ts (NEW) — fixture-style smoke
```

#### Deep file dependency analysis
- chat.ts is the canonical openrouter demo. Changes ripple to anyone reading it as reference.
- Documentation in the README needs update (Phase 10).

#### Deep Dives
- **Code**:
  ```ts
  import { InMemoryConversationStorage } from '@usetheo/sdk'
  // ...
  const storage = new InMemoryConversationStorage()
  // ...
  const { agent } = await createConversationHistory({
    request,
    response: { headers: cookieHeaders },
    agentId: probedId,
    options: {
      apiKey,
      model: { id: modelId },
      tools,
      conversationStorage: storage,
    },
  })
  const run = await agent.send(message, { signal: ctx.signal })  // signal threaded
  yield* streamAgentRun(run)
  ```
- **Invariants**: demo MUST still work without OPENROUTER_API_KEY (graceful error path tested).
- **Edge cases**: `InMemoryConversationStorage` resets per request (each new handler instance creates fresh) — document this caveat clearly.

#### Tasks
1. Update chat.ts.
2. Test asserts: (a) storage passed through; (b) signal abort propagates.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_storage_passed_in_demo() — Given chat.ts handler invoked, When inspected, Then options.conversationStorage instanceof InMemoryConversationStorage
RED:  test_signal_threaded_in_demo() — Given AbortController in test, When handler aborts, Then agent.send received signal
RED:  test_missing_api_key_still_returns_error_event() — Given no OPENROUTER_API_KEY, When request sent, Then SSE error event with code:'auth' or message indicating missing key
RED:  test_in_memory_storage_does_not_persist_across_requests() — Given two requests with same agentId, When state inspected, Then no shared messages
GREEN: Update chat.ts.
REFACTOR: Extract storage construction into a config helper if reused.
VERIFY: npx vitest run tests/integration/openrouter-demo-storage-wire.test.ts
```

BDD:
- **Happy path**: full chat flow with storage + signal.
- **Validation error**: API key missing → graceful error event.
- **Edge case**: ephemeral InMemoryConversationStorage (intentional for demo).
- **Error scenario**: storage init throws → handler returns error event.

#### Acceptance Criteria
- [ ] chat.ts uses InMemoryConversationStorage
- [ ] signal threaded
- [ ] 4 RED tests pass
- [ ] `pnpm typecheck` clean for the example

#### DoD
- [ ] Example builds (`pnpm build` inside example dir)
- [ ] No regression in existing fixture tests

### T8.2 — full-stack-agent wires all 6 primitives (incl. tool hooks)

#### Objective
The full-stack-agent example uses Postgres conversation storage (already in `examples/full-stack-agent/server/lib/*` per the template), threads signal, uses `trackAgentTools` for per-tool metrics, surfaces structured errors. Demonstrates production-shaped wiring.

#### Evidence
- `examples/full-stack-agent` ships with Drizzle + Postgres infra (server/lib/db.ts exists, presumably).
- The tools/ directory has 8 tools (calculator, web_fetch, workspace_*, etc.); each tool call should be tracked.

#### Files to edit
```
examples/full-stack-agent/server/routes/chat.ts — full primitives wire
examples/full-stack-agent/server/lib/storage.ts (NEW or update) — PostgresConversationStorage recipe
examples/full-stack-agent/server/lib/cost.ts — wire trackAgentTools alongside trackAgentRun
tests/integration/full-stack-agent-primitives-wire.test.ts (NEW)
```

#### Deep file dependency analysis
- Full-stack-agent has more moving parts than openrouter-demo (Telegram bot, history page, cache page, settings). The chat.ts change is localized; other pages unaffected.
- Cost dashboard (if present) reads from UsageStorageAdapter → automatically picks up ToolUsageRecord.

#### Deep Dives
- **Code skeleton**:
  ```ts
  const storage = new PostgresConversationStorage(db.pool) // user-defined recipe
  const usageStorage = new PostgresUsageStorage(db.pool)
  const tools = buildTools(probedId)
  const { onToolStart, onToolEnd, onToolError } = trackAgentTools({ storage: usageStorage })

  const { agent } = await createConversationHistory({
    request, response: { headers: cookieHeaders }, agentId: probedId,
    options: {
      apiKey: provider.apiKey, model: { id: provider.modelId }, tools,
      conversationStorage: storage,
      onToolStart, onToolEnd, onToolError,
    },
  })
  const run = await agent.send(message, { signal: ctx.signal })
  yield* streamAgentRun(run)
  ```
- **Invariants**: must remain runnable with `pg-mem` for tests (no real Postgres in CI).
- **Edge cases**: telegram bot path also uses Agent.create — needs same wiring (out of scope: separate task if telegram-bot.ts diverges).

#### Tasks
1. Define a `PostgresConversationStorage` class in `server/lib/storage.ts`.
2. Update chat.ts to wire storage + signal + tool hooks.
3. Test against pg-mem.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_postgres_storage_constructed_in_example() — Given Postgres pool, When chat handler invoked, Then storage instanceof PostgresConversationStorage
RED:  test_tool_hooks_recorded() — Given a tool call in conversation, When end fires, Then ToolUsageRecord present in usage storage
RED:  test_abort_signal_threaded() — Same as T8.1 but for full-stack-agent
RED:  test_storage_persists_across_requests() — Given same agentId across requests, When history fetched, Then messages persist
GREEN: Update chat.ts + add storage class.
REFACTOR: Extract chat-handler creation into testable factory.
VERIFY: npx vitest run tests/integration/full-stack-agent-primitives-wire.test.ts
```

BDD:
- **Happy path**: full primitives wired; production-shaped.
- **Validation error**: invalid agentId → 400 (pre-existing path).
- **Edge case**: storage transaction rollback → message not persisted; SDK observes consistency.
- **Error scenario**: Postgres unreachable → storage throws → chat.ts returns error event with code:'provider_unreachable' (degrade).

#### Acceptance Criteria
- [ ] PostgresConversationStorage in `server/lib/storage.ts`
- [ ] All 4 RED tests pass
- [ ] Telegram bot path NOT broken (smoke check)
- [ ] `pnpm typecheck` clean for the example

#### DoD
- [ ] Example builds
- [ ] pg-mem test green

---

## Phase 9: Fixtures — proof Redis + Postgres storage

**Objective:** Two new fixture projects (`tests/fixtures/conversation-redis/` + `tests/fixtures/conversation-postgres/`) prove the SDK's `ConversationStorageAdapter` contract works against real-shaped storage backends.

### T9.1 — conversation-postgres fixture

#### Objective
Minimal Theo project using `pg-mem`-backed `PostgresConversationStorage`. Test exercises full read+append+delete cycle.

#### Files to edit
```
tests/fixtures/conversation-postgres/package.json (NEW)
tests/fixtures/conversation-postgres/theo.config.ts (NEW)
tests/fixtures/conversation-postgres/app/page.tsx (NEW)
tests/fixtures/conversation-postgres/server/routes/chat.ts (NEW)
tests/fixtures/conversation-postgres/server/lib/storage.ts (NEW)
tests/integration/conversation-postgres-fixture.test.ts (NEW)
```

#### Deep file dependency analysis
- Mirrors the openrouter-demo structure but with Postgres-backed storage.
- pg-mem already in dev deps (used by other tests).

#### Deep Dives
- **Storage schema (Postgres)**:
  ```sql
  CREATE TABLE IF NOT EXISTS agent_conversations (
    id TEXT PRIMARY KEY,
    messages JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```
  - `appendMessage` = `UPDATE ... SET messages = messages || $msg, updated_at = NOW() WHERE id = $id` (with `INSERT ON CONFLICT` for create-if-not-exists).
  - `getMessages` = `SELECT messages FROM agent_conversations WHERE id = $id` → `[]` if missing.
  - `deleteConversation` = `DELETE FROM agent_conversations WHERE id = $id`.
- **Invariants**:
  - Atomic appends via single SQL statement (no read-modify-write race).
  - JSONB type supports unbounded message size; cap at 1MB per conversation in app code if needed.
  - **EC-11 (SHOULD TEST)**: pg-mem's JSONB operator coverage is limited in older versions; the `messages || $msg` concat operator may not be supported. Preflight smoke MUST verify pg-mem accepts the SQL before running the concurrent-append test. Fallback path if pg-mem rejects: `UPDATE ... SET messages = $newArray` (RMW — loses atomicity, but only used in tests; real Postgres still uses the atomic `||` path).

#### Tasks
1. Scaffold the fixture project.
2. Implement `PostgresConversationStorage`.
3. Test exercises read/append/delete + concurrent appends.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_pg_mem_supports_jsonb_concat() — Given pg-mem instance, When `UPDATE t SET col = col || '$msg' RETURNING col` executed, Then no syntax error + result includes appended message. EC-11 preflight: confirms pg-mem version supports JSONB `||` operator before relying on the atomic-append claim downstream.
RED:  test_postgres_empty_returns_empty() — Given empty Postgres + getMessages('x'), Then []
RED:  test_postgres_append_then_get() — Given append(msg), When get, Then [msg]
RED:  test_postgres_concurrent_appends_no_corruption() — Given 50 parallel appends, When get, Then exactly 50 messages (depends on EC-11 preflight passing; otherwise test marked skip + fallback RMW path tested in real-Postgres env)
RED:  test_postgres_delete_clears_history() — Given conversation with 3 msgs, When delete, Then get returns []
RED:  test_postgres_delete_missing_idempotent() — Given non-existent id, When delete, Then no throw
GREEN: Implement storage class + fixture project.
REFACTOR: Extract migration SQL to a `migrate()` method on the storage.
VERIFY: npx vitest run tests/integration/conversation-postgres-fixture.test.ts
```

BDD:
- **Happy path**: read/append/delete cycle works.
- **Validation error**: conversationId with SQL injection chars → parameterized query rejects (no exec).
- **Edge case**: concurrent appends preserve all messages (atomicity).
- **Error scenario**: Postgres pool exhausted → adapter surfaces error; framework catches at higher level.

#### Acceptance Criteria
- [ ] Fixture project structure complete
- [ ] PostgresConversationStorage implements all required methods
- [ ] 5 RED tests pass (pg-mem)
- [ ] Optional: real Postgres run gated by `POSTGRES_URL` env

#### DoD
- [ ] Fixture documented in `fixtures/README.md` row
- [ ] Build green for the fixture

### T9.2 — conversation-redis fixture

#### Objective
Same shape as T9.1 but with `ioredis-mock`-backed `RedisConversationStorage`.

#### Files to edit
```
tests/fixtures/conversation-redis/package.json (NEW)
tests/fixtures/conversation-redis/theo.config.ts (NEW)
tests/fixtures/conversation-redis/app/page.tsx (NEW)
tests/fixtures/conversation-redis/server/routes/chat.ts (NEW)
tests/fixtures/conversation-redis/server/lib/storage.ts (NEW)
tests/integration/conversation-redis-fixture.test.ts (NEW)
```

#### Deep file dependency analysis
- Mirrors T9.1 — Redis-backed storage.

#### Deep Dives
- **Storage scheme (Redis)**:
  - Key: `agent:conversation:<id>` (Redis List type).
  - `appendMessage` = `RPUSH agent:conversation:<id> <JSON.stringify(msg)>` + `EXPIRE agent:conversation:<id> 86400 * 30` (30-day TTL).
  - `getMessages` = `LRANGE agent:conversation:<id> 0 -1` + parse.
  - `deleteConversation` = `DEL agent:conversation:<id>`.
- **EC-2 (MUST FIX) — conversationId validation**:
  ```ts
  const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/
  function assertValidId(id: string): void {
    if (!VALID_ID.test(id)) {
      throw new Error(`invalid conversationId: ${JSON.stringify(id)}`)
    }
  }
  // Apply to every public method: getMessages/appendMessage/deleteConversation
  ```
  Even though LRANGE/RPUSH don't expand globs, an id containing `:` collides with the namespace; an id containing whitespace or `*` may break tooling that uses `KEYS agent:conversation:*` for housekeeping. Reject early at the adapter boundary, regardless of upstream validation in `readCookie`.
- **Invariants**:
  - `RPUSH` is atomic — no race.
  - Per-conversation TTL prevents unbounded storage growth.
  - Every public method validates `conversationId` at entry (EC-2).
- **Edge cases**:
  - Redis offline → adapter throws; framework degrades.
  - Message > Redis string size limit (512MB default) → unlikely but document.
  - **EC-12 (SHOULD TEST)**: `ioredis-mock` TTL semantics may differ from real Redis when using fake timers. Specifically, `EXPIRE` set via mock may not honor `vi.advanceTimersByTime` for deletion. Preflight test verifies the mock supports time-based expiration; if not, TTL test gets marked `skipIf(useMock)` and runs only against `REDIS_URL` env.

#### Tasks
1. Scaffold fixture.
2. Implement RedisConversationStorage with ioredis-mock for tests.
3. Tests for read/append/delete/concurrent/TTL.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_redis_empty_returns_empty()
RED:  test_redis_append_then_get()
RED:  test_redis_concurrent_appends()
RED:  test_redis_delete_clears()
RED:  test_redis_ttl_expires() — Given expired key, When get, Then [] (EC-12 — preflight verifies ioredis-mock honors fake-timer TTL; otherwise test gated by REDIS_URL env)
RED:  test_redis_storage_rejects_id_with_colon() — Given `new RedisConversationStorage().appendMessage('a:b', msg)`, When called, Then throws Error matching /invalid conversationId/ (EC-2 MUST FIX)
RED:  test_redis_storage_rejects_id_with_wildcard() — Given id 'a*', When called, Then throws (EC-2 MUST FIX)
RED:  test_redis_storage_rejects_id_with_whitespace() — Given id 'a b', When called, Then throws (EC-2 MUST FIX — defensive completeness)
RED:  test_redis_storage_mock_supports_fake_timer_ttl() — Given ioredis-mock + EXPIRE 30d + vi.advanceTimersByTime(31d), When get, Then key returns [] (EC-12 preflight; if fails, gate subsequent TTL tests with skipIf)
GREEN: Implement validation + storage methods.
REFACTOR: Extract key builder + id validator into helpers.
VERIFY: npx vitest run tests/integration/conversation-redis-fixture.test.ts
```

BDD:
- **Happy path**: read/append/delete.
- **Validation error**: conversationId with `:` or `*` → must be escaped/rejected per Redis key safety.
- **Edge case**: TTL boundary (fake timer advance past 30 days).
- **Error scenario**: Redis down → adapter throws cleanly.

#### Acceptance Criteria
- [ ] Fixture project complete
- [ ] RedisConversationStorage implementation
- [ ] 5 RED tests pass (ioredis-mock)
- [ ] Optional real Redis gated by `REDIS_URL` env

#### DoD
- [ ] Fixture documented in `fixtures/README.md`
- [ ] Build green

---

## Phase 10: Docs — conversation-history.md concept page

**Objective:** New doc explains the trade-offs between FileSystem (default), Redis, and Postgres conversation storage, plus per-deploy-target recommendation.

### T10.1 — Write docs/concepts/conversation-history.md

#### Objective
Standalone concept doc; cross-links to fixtures. Treats "which adapter for which deploy" as the central question.

#### Files to edit
```
docs/concepts/conversation-history.md (NEW)
```

#### Deep file dependency analysis
- New doc, no upstream changes.
- Linked from README under "Concepts" section (assume one exists; if not, this might need a README touch — out of scope, separate task).

#### Deep Dives
Structure of the doc:
1. **What is conversation history?** — what the SDK persists; why TheoKit cares.
2. **The interface** — `ConversationStorageLike` shape.
3. **Three adapters** — FileSystem (default), Redis, Postgres.
4. **Deploy target matrix** — table mapping Node-self-host / Vercel / CF / Lambda / K8s / TheoCloud → recommended adapter.
5. **Migration** — switching adapter after deploy (manual JSONL → Postgres script).
6. **Limits** — message size, TTL, max-conversations-per-user (link to quota hooks).

#### Tasks
1. Write the doc.
2. Cross-link from fixtures' READMEs.
3. Optional: add a row to `README.md > Concepts` table (if section exists).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:  test_docs_concepts_conversation_history_exists() — Given doc file, When read, Then file present with min 200 lines
RED:  test_docs_mentions_three_adapters() — When read, Then contains 'FileSystemConversationStorage' + 'RedisConversationStorage' + 'PostgresConversationStorage'
RED:  test_docs_links_to_fixtures() — When read, Then contains 'tests/fixtures/conversation-postgres' + 'tests/fixtures/conversation-redis' references
RED:  test_docs_has_deploy_target_matrix() — When read, Then contains markdown table with TheoCloud / Vercel / Cloudflare rows
GREEN: Write the doc.
REFACTOR: Polish wording.
VERIFY: npx vitest run tests/integration/docs-conversation-history.test.ts
```

BDD:
- **Happy path**: doc exists with all sections.
- **Validation error**: section missing → test fails with diff.
- **Edge case**: doc < 200 lines = too thin; flag for review.
- **Error scenario**: doc references a nonexistent file path → broken link check fails.

#### Acceptance Criteria
- [ ] Doc exists at `docs/concepts/conversation-history.md`
- [ ] 4 RED tests pass
- [ ] Min 200 lines + 5 H2 sections
- [ ] Cross-links to both fixtures present + functional

#### DoD
- [ ] No broken cross-links (verified by test)
- [ ] Linked from at least one other doc

---

## Phase 11: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases (0-10) are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them, not just as unit tests assert. Re-runs `/dogfood full` (Phase 7 sub-phases).

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score >= 90/100 (aiming higher than previous 92 — improvements expected from new wires)
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] Any pre-existing issues documented (not caused by this plan)
- [ ] All 9 Cross-Validation features still PASS
- [ ] New regression tests added by this plan: ≥ 25 passing
- [ ] `dogfood-2026-MM-DD-sdk-1-1-0-consumption.md` report saved to `docs/audit/`

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing
2. Fix all plan-caused CRITICAL and HIGH issues before declaring the plan complete
3. Re-run `/dogfood full` to confirm fixes
4. Pre-existing issues are logged but do NOT block plan completion

### Cross-validation (BEFORE dogfood)

Per `/.claude/skills/to-plan` post-impl rule, run `/cross-validation sdk-1-1-0-consumption` BEFORE running `/dogfood`:

- **APROVADO** → proceed
- **REPROVADO** → fix divergences; re-run cross-validation
- **APROVADO COM RESSALVAS** → fix CRITICALs; proceed

Report saved to `docs/reviews/cross-validation/sdk-1-1-0-consumption-xval-YYYY-MM-DD.md`.

---

## Coverage Matrix

Every gap from the handoff (`docs/handoff/2026-05-25-sdk-production-readiness-handoff.md`) maps to a task here:

| # | Gap (SDK-side, now done) | TheoKit consumption task | Resolution |
|---|---|---|---|
| 1 | `ConversationStorageAdapter` interface | T2.1 + T8.1 + T8.2 + T9.1 + T9.2 + T10.1 | Wire surfaced via `createConversationHistory`; demos use it; fixtures prove Postgres+Redis recipes; doc explains. |
| 2 | `Agent.registry` GC | T6.1 + T6.2 + T7.1 | Config schema validates; lazy boot wire; SIGTERM eviction; legacy dev-gc tombstoned. |
| 3 | `AgentRunError` discrimination | T1.1 + T4.1 + T8.1 + T8.2 | AgentEvent shape extended; streamAgentRun maps; demos surface code on UI. |
| 4 | Tool lifecycle hooks | T5.1 + T8.2 | trackAgentTools helper + full-stack-agent uses. |
| 5 | AbortSignal propagation | T3.1 + T8.1 + T8.2 | defineAgentEndpoint threads signal; demos pass it through. |
| 6 | Quota hooks | (out of scope — uncommitted) | Examples could add `onBeforeCreate/onBeforeSend` as a follow-up; not required for production-grade core wire. |

**Coverage: 5/6 of original SDK gaps consumed (83%).** Gap 6 deliberately deferred — quota gates are application-level concerns; the SDK already supports them; TheoKit doesn't need to wrap them in framework-level abstractions. Document the recipe in Phase 10's doc instead.

## Global Definition of Done

- [ ] All Phases 0-10 completed (per their DoD)
- [ ] All tests passing (Vitest unit + integration; Playwright skipped per durable user rule)
- [ ] Zero TypeScript errors (`tsc --noEmit` exit 0)
- [ ] Zero lint warnings (`pnpm lint --max-warnings=0` exit 0)
- [ ] Backward compatibility preserved — old chat.ts (no storage, no signal) still works
- [ ] `pnpm exec dependency-cruiser packages/theo/src` 0 violations
- [ ] `publint` All good + `attw --pack` No problems
- [ ] **Dogfood QA PASS** — health ≥ 90/100, zero CRITICAL plan-caused
- [ ] **Fixture proof** — `conversation-redis/` + `conversation-postgres/` both green
- [ ] **Doc proof** — `docs/concepts/conversation-history.md` written + linked
- [ ] Cross-validation report APROVADO (or APROVADO COM RESSALVAS with CRITICALs fixed)
- [ ] CHANGELOG entry under `[Unreleased]` Added + Changed

## Final Phase: Dogfood QA (MANDATORY)

See **Phase 11** above.

---

## Edge cases incorporated (EC-1..EC-17)

Source: `docs/reviews/edge-case-plan/sdk-1-1-0-consumption-edge-cases-2026-05-26.md`. All 17 ECs are addressed inline above. Quick lookup:

### MUST FIX (3)

| EC | Task | Resolution |
|----|:---:|------------|
| **EC-1** | T3.1 | `deriveSignal` uses duck-type check (`'aborted' in sig && typeof sig.addEventListener === 'function'`) instead of `instanceof AbortSignal`. Cross-realm signals (Node 18 polyfill, undici, edge runtimes) now propagate correctly. New RED: `test_signal_threading_cross_realm`. |
| **EC-2** | T9.2 | `RedisConversationStorage` constructor + every public method validates `conversationId` against `/^[a-zA-Z0-9_-]{1,128}$/`. Three new REDs: `test_redis_storage_rejects_id_with_{colon,wildcard,whitespace}`. |
| **EC-3** | T6.1 | `configureAgentRegistryOnce` flips the `configured` flag SYNCHRONOUSLY before calling `Agent.registry.configure(opts)`. Rollback on throw. Eliminates race when 2+ concurrent first-requests hit cold start. New RED: `test_lazy_configure_no_race_under_concurrency`. |

### SHOULD TEST (9)

| EC | Task | Test added |
|----|:---:|------------|
| EC-4 | T0.1 | `test_sdk_version_satisfies_caret_range` — semver-aware (`^1.1.0`), forward-compat. |
| EC-5 | T2.1 | `test_theokit_storage_assignable_to_sdk_adapter` — reverse-direction sync check (TheoKit → SDK). |
| EC-6 | T4.1 | `test_type_guard_matches_minimal_agent_run_error` — guard only requires `code: string`; works on SDK errors without provider. |
| EC-7 | T1.1 + T4.1 | `AgentRunErrorCode` union uses `(string & {})` fallback; `test_agent_run_error_code_accepts_unknown_string_for_forward_compat`. |
| EC-8 | T5.1 | `test_orphan_starts_pruned_after_ttl` — Map prunes entries older than 5 min on each onToolStart. |
| EC-9 | T5.1 | `test_external_adapter_without_kind_field_backward_compat` — legacy adapter (no `kind` field) keeps working via default `kind:'llm'`. |
| EC-10 | T7.1 | `test_gc_agent_registry_warns_only_once_per_process` — module-scoped `warnedOnce` flag prevents log spam. |
| EC-11 | T9.1 | `test_pg_mem_supports_jsonb_concat` preflight — verifies pg-mem accepts `||` operator; concurrent-append test gated by preflight. |
| EC-12 | T9.2 | `test_redis_storage_mock_supports_fake_timer_ttl` preflight — verifies ioredis-mock honors `vi.advanceTimersByTime`; TTL test skipped if not (real Redis covers via `REDIS_URL`). |

### DOCUMENT (5)

| EC | Task | JSDoc / inline note |
|----|:---:|---------------------|
| EC-13 | T6.2 | SIGTERM evicts immediately; rely on platform-level LB drain (K8s preStop hook + `terminationGracePeriodSeconds`). Adding framework-side drain duplicates platform behavior. |
| EC-14 | T6.1 | Programmatic `Agent.registry.configure()` is overridden by TheoKit's lazy call driven by `theo.config.ts`. Framework wins; production config lives in config file. |
| EC-15 | T4.1 | SDK's `error.message` is *trusted* to not contain secrets. SSE wire propagates verbatim. `providerError` is quarantined — never serialized. |
| EC-16 | T5.1 | `callId` uniqueness is SDK contract. TheoKit defends against duplicate-start (last wins) but does not retry; future SDK callId bug has bounded impact (stale duration only, never corrupt cost record). |
| EC-17 | T6.1 | `maxAgents` MUST be ≥ max-concurrent-active-conversations. Default `100` covers indie/small-team; tune up for high-traffic. Inline schema comment. |

---

## Estimated effort

- Phase 0: 30 min
- Phase 1: 1 h
- Phase 2: 1 h
- Phase 3: 2 h
- Phase 4: 2 h
- Phase 5: 3 h
- Phase 6 (T6.1 + T6.2): 2 h
- Phase 7: 30 min
- Phase 8 (T8.1 + T8.2): 4 h
- Phase 9 (T9.1 + T9.2): 6 h
- Phase 10: 2 h
- Phase 11 (dogfood + xval + ADR diff): 3 h

**Total: ~28-30 h focused work** (~3-4 days serial; ~1.5-2 days with parallelization in 2-6). v1.1 adds ~1-3 h for the 9 new SHOULD TEST REDs and the 3 MUST FIX implementations — but all SHOULD TEST tests are colocated with existing TDD blocks so the overhead is bounded.

## Post-plan checklist

- [x] Run `/edge-case-plan sdk-1-1-0-consumption` — DONE 2026-05-26 → `docs/reviews/edge-case-plan/sdk-1-1-0-consumption-edge-cases-2026-05-26.md`
- [x] Incorporate MUST FIX items from edge-case review back into this plan — DONE in v1.1 (this version)
- [ ] Present final version of plan to user for sign-off
- [ ] After implementation: `/cross-validation sdk-1-1-0-consumption`
- [ ] After cross-validation: `/dogfood full`
- [ ] After dogfood: `/architecture-docs server` (diff vs baseline)
