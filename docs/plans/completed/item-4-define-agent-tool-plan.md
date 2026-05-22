# Plan: Item #4 — `defineAgentTool` + SSE wire bridge

> **Version 1.0** — Ship `defineAgentTool({ name, description, inputSchema, handler })` as a TheoKit-native helper that produces a `@usetheo/sdk` `CustomTool` (consumable by `Agent.create({ tools: [...] })`) PLUS `streamAgentRun(run)` as the SDK-stream → AgentEvent SSE bridge. Together they remove ~40 lines of manual SDK-stream/AgentEvent plumbing per agent route, letting `defineAgentEndpoint` consume the SDK's tool calling lifecycle (`tool_call → execute → tool_result`) with one yield-delegation: `yield* streamAgentRun(run)`. Closes Macro Roadmap item #4 in `CLAUDE.md`. Stack assumption (locked): `@usetheo/sdk` + `@usetheo/ui` — `defineAgentTool` is sugar over the SDK's `CustomTool` contract, not a parallel runtime.

## Context

**What exists today (post item-3 / 2026-05-22):**

- `defineAgentEndpoint` (`packages/theo/src/server/define-agent-endpoint.ts`) — async generator → SSE wire. Yields 4 `AgentEvent` variants: `message | tool_call | tool_result | error`.
- `AgentEvent` discriminated union (`packages/theo/src/server/agent-types.ts:13-49`) — runtime contract between server and client.
- Default scaffold canonical chat (`fixtures/template-default/server/routes/chat.ts` + same file in `packages/create-theo/templates/default/`) — uses `Agent.prompt` (one-shot, no tools). 30 LOC including the defensive guards.
- SDK `defineTool` (`theokit-sdk/packages/sdk/src/define-tool.ts:77-94`) — produces a `CustomTool` from `{ name, description, inputSchema: ZodObject, handler }`. Calls `z.toJSONSchema(...)` which **requires Zod 4** (lives at `zod/v4` subpath in Zod 3.25+; not at root). SDK examples that use `defineTool` pin `"zod": "^4.0.0"`.
- SDK `Agent.create({ tools })` accepts `CustomTool[]` (`theokit-sdk/packages/sdk/src/types/agent.ts:271-289`). Local runtime only; cloud agents reject `tools`.
- SDK `Run.stream()` (`theokit-sdk/packages/sdk/src/types/run.ts:166`) — `AsyncGenerator<SDKMessage>`. `SDKMessage` discriminated union includes `tool_call` (status `running | completed | error`) and `assistant` (text + tool_use blocks).

**What's broken / missing:**

1. **Zod version mismatch** — TheoKit pins `"zod": "^3.24.0"`; SDK's `defineTool` only works against Zod 4. A consumer calling SDK's `defineTool` directly from a TheoKit route would hit `z.toJSONSchema is not a function` at runtime (verified empirically: `zod@3.25.76` root has no `toJSONSchema`; only `zod/v4` subpath exposes it). Forcing TheoKit consumers to install Zod 4 alongside Zod 3 creates dual-version hell (schemas constructed by one are not `instanceof` the other).
2. **No SDK→SSE bridge** — even with tools defined, consumers must hand-roll `for await (const msg of run.stream())` + switch on `msg.type` + map to `AgentEvent` variants. ~40 LOC of plumbing per route. The roadmap explicitly calls out this gap: "agent.send().wait() returns RunResult once; consumers need the streaming surface".
3. **No fixture proves tool calling end-to-end** — `template-default` ships a tool-less chat. The deploy-target user trying "add a tool" has no copy-pasteable example.

**Evidence:**

- `node --no-warnings -e "console.log(typeof require('zod').toJSONSchema)"` → `undefined` (Zod 3.25.76).
- `node --no-warnings -e "console.log(typeof require('zod/v4').toJSONSchema)"` → `function`.
- SDK examples `theokit-sdk/examples/personality-presets/package.json` + `theokit-sdk/examples/cli-bot/package.json` pin `"zod": "^4.0.0"` — confirms `defineTool` requires Zod 4.
- TheoKit root pkg pins `"zod": "^3.24.0"` (`packages/theo/package.json`).
- Existing test pattern: `tests/unit/define-agent-endpoint.test.ts` collects SSE chunks via `Response.body.getReader()` + parses `data: <json>\n\n`. Reusable for new tests.

**Memory pins:**

- [[project-stack-deps]] — TheoKit **always** ships with `@usetheo/sdk` + `@usetheo/ui`. New primitives are sugar/wrappers over the SDK, never parallel implementations.
- [[feedback-sdk-is-evolvable]] — when TheoKit work needs an SDK change, write the SDK task into the plan; don't workaround.
- [[project-theokit-purpose]] — TheoKit is the framework someone uses to build their own agent app. `defineAgentTool` is the primitive a builder reaches for when their agent needs to do something beyond chat.

## Objective

Ship `defineAgentTool` + `streamAgentRun` so adding a tool to an agent route is 1 file × ~20 lines, with `tool_call`/`tool_result` AgentEvents flowing to the client UI automatically.

**Measurable goals:**

1. Replace mock chat with tool-using chat in `template-default` → diff ≤ +20 lines of LOC.
2. Consumer writes ZERO `for await (const msg of run.stream())` boilerplate.
3. Tool with `z.object({...})` (Zod 3) input compiles + runs end-to-end against a real Anthropic key.
4. Type inference: `handler({ name })` autocompletes `name: string` from `inputSchema: z.object({ name: z.string() })`.
5. Backward compatible: existing `template-default` (no tools) keeps working unchanged.
6. **Bundle delta ≤ +6 KB gzipped on the server bundle, +0 KB on the client bundle** (server-only primitive).
7. Dogfood `full` health ≥ 70/100 with zero plan-caused CRITICAL.

## ADRs

### D1 — TheoKit ships its own `defineAgentTool`, NOT delegate to SDK's `defineTool`

**Decision:** TheoKit's `defineAgentTool` builds the `CustomTool` object directly (no `import { defineTool } from '@usetheo/sdk'` at runtime).

**Rationale:**
- SDK's `defineTool` calls `z.toJSONSchema(...)` at the Zod root — only available in Zod 4.
- TheoKit pins Zod 3 throughout `defineRoute`, `defineAction`, `defineWebSocket`. Bumping to Zod 4 is a major-version breakage touching every primitive; out of scope for item #4.
- Two Zod versions installed simultaneously (`zod ^3` + `zod ^4`) is a known dual-package hazard: schemas constructed with one don't pass `instanceof` checks of the other. Consumers would have to think about which Zod each schema came from.
- Conversion strategy: use `zod-to-json-schema` (battle-tested, 3M weekly downloads, MIT, Zod 3 native). Add as direct dependency to `packages/theo`.

**Consequences:**
- ✅ TheoKit consumers use their existing Zod 3 — zero install pain.
- ✅ The returned `CustomTool` is structurally identical to SDK's output (same shape, same JSON Schema, same handler contract) — `Agent.create({ tools: [theokitTool] })` works.
- ⛔ `defineAgentTool` does NOT use Zod 4 features (`.transform()` to non-representable types, branded types, etc.). The 95% case (`z.object({...})`) is unaffected.
- 🔁 If the SDK later moves `defineTool` to require Zod 3 OR adds a Zod-3-compatible adapter, we can switch to delegating. Until then, structural compatibility is the contract.

### D2 — `streamAgentRun(run)` ships alongside `defineAgentTool`

**Decision:** Ship a separate helper `streamAgentRun(run): AsyncGenerator<AgentEvent>` that adapts SDK's `Run.stream()` (SDKMessage) into TheoKit's `AgentEvent` SSE wire.

**Rationale:**
- The roadmap deliverable says "sugar... that adapts the SDK's tool contract into AgentEvent SSE wire (tool_call → execute → tool_result)". `defineAgentTool` alone doesn't ship that wire bridge — it produces a tool definition. The bridge needs to consume the SDK Run.
- Consumer pattern: `yield* streamAgentRun(run)` inside the `defineAgentEndpoint` async generator. One line. Replaces 40+ lines of manual switch-on-message-type.
- Keeping them as separate exports (tool def + stream adapter) avoids over-coupling: a consumer could ship a tool-less chat with `streamAgentRun` alone (richer than `Agent.prompt`), or define tools and stream them. Composability beats a god-function.

**Consequences:**
- ✅ Single yield-delegation in the consumer route. No `for await` boilerplate.
- ✅ The SDK message-type mapping lives in ONE place (the adapter), not duplicated across user routes.
- 🔁 If SDK adds new `SDKMessage` variants (e.g., `object_delta` from `streamObject`), only `streamAgentRun` needs updating — consumer routes don't.

### D3 — Tool handler error → `tool_result` with truncated payload OR `error` event — pick one explicit policy

**Decision:** Tool handler `throw` → SDK's tool-dispatcher converts to `tool_result(isError, content)`. The `streamAgentRun` adapter sees `SDKToolUseMessage.status === 'error'` and yields **`{ type: 'error', message: result.content }`** (the AgentEvent `error` variant).

**Rationale:**
- AgentEvent has only 4 variants; `tool_result` carries `data: unknown`, no error discriminator. Forcing error data into `tool_result` would force the client to second-guess every `tool_result` payload for hidden errors.
- The TheoUI `AgentErrorCard` already renders `error` cleanly with `kind="generic"` (validated empirically in item-3 dogfood).
- Tool errors are user-actionable (likely a bad input to a tool the LLM picked) — surfacing them as `error` events keeps the UI honest.

**Consequences:**
- ✅ Client UI logic stays simple — `error` is always an error.
- ⛔ A tool that legitimately returns a string starting with "Error:" is NOT misclassified — the discrimination is on `SDKToolUseMessage.status`, not on the payload string content.
- 🔁 If a future SDK adds `tool_result.isError: boolean` AND TheoKit adds a 5th AgentEvent variant `tool_error`, this can be revisited.

### D4 — `zod-to-json-schema` becomes a direct (non-peer) dep of `packages/theo`

**Decision:** Add `"zod-to-json-schema": "^3.24.0"` to `packages/theo/package.json` `dependencies`. NOT peer, NOT optional.

**Rationale:**
- The library is small (~5 KB minified), pure JS, zero transitive deps, MIT licensed, mature (3M weekly DLs).
- Forcing consumers to `pnpm add zod-to-json-schema` would re-introduce the install-pain pattern item #3 explicitly removed for `@usetheo/sdk`.
- Tree-shaking: `defineAgentTool` is server-only (`packages/theo/src/server/`). It does NOT leak into the client bundle. The dependency cost is server-side only.

**Consequences:**
- ✅ Zero-config for the consumer (the 95% case).
- ⛔ +5 KB on the server install footprint. Acceptable per the bundle goals.
- 🔁 If we adopt Zod 4 framework-wide later, `z.toJSONSchema` replaces this dep and we drop it.

## Dependency Graph

```
Phase 1 (defineAgentTool primitive)
   │
   ├─▶ Phase 2 (streamAgentRun adapter — depends on Phase 1's CustomTool type contract)
   │       │
   │       └─▶ Phase 3 (default scaffold tool-calling example)
   │                │
   │                └─▶ Phase 4 (Playwright proof + fixture project)
   │                          │
   │                          └─▶ Phase 5 (Dogfood + README update)
   │
   └─▶ Phase 3 (also depends on Phase 1 for the tool definition syntax)
```

- **Phase 1 + Phase 2** can develop **in parallel** once D1/D2 land — they share no source files. Tests for both can run independently.
- **Phase 3** is sequential after both 1+2 are GREEN.
- **Phase 4** requires Phase 3 fixture; Playwright depends on the live scaffold rendering tools.
- **Phase 5** is the dogfood gate; must run last.

---

## Phase 1: `defineAgentTool` primitive

**Objective:** Ship the type-safe Zod 3 → CustomTool adapter in `packages/theo/src/server/`.

### T1.1 — Add `zod-to-json-schema` dep and create `define-agent-tool.ts`

#### Objective

Land the helper that converts `{ name, description, inputSchema: z.ZodTypeAny, handler }` into a `CustomTool` consumable by `Agent.create({ tools: [...] })`.

#### Evidence

- `node --no-warnings -e "console.log(typeof require('zod').toJSONSchema)"` returns `undefined` against the resolved Zod (3.25.76). Direct SDK delegation is blocked at runtime. (D1)
- `zod-to-json-schema@3.24.x` ships zero transitive deps and supports Zod 3 ZodTypeAny → JSON Schema 7. The `target: 'jsonSchema7'` mode matches what Anthropic's tools API + the SDK's CustomTool contract expect (`type: "object"` root).
- Test pattern existing: `tests/unit/define-agent-endpoint.test.ts` — vitest + SSE collection. Reusable for the integration roundtrip.

#### Files to edit

```
packages/theo/package.json                                — add "zod-to-json-schema": "^3.24.0" to dependencies
packages/theo/src/server/define-agent-tool.ts             — (NEW) the helper
packages/theo/src/server/index.ts                         — export defineAgentTool + DefineAgentToolSpec + CustomTool type re-export
tests/unit/define-agent-tool.test.ts                      — (NEW) 6 unit tests
tests/unit/define-agent-tool.test-d.ts                    — (NEW) 4 type tests (expectTypeOf)
```

#### Deep file dependency analysis

- **`packages/theo/package.json`** — adding `zod-to-json-schema` to `dependencies` triggers `pnpm install` rerun. No version conflict expected (pure JS, no peer needs). Downstream: any consumer running `pnpm install` after `git pull` picks it up automatically.
- **`packages/theo/src/server/define-agent-tool.ts`** — NEW file. No downstream files touch it yet. Will be imported by Phase 3's scaffold chat.ts and by Playwright fixture in Phase 4.
- **`packages/theo/src/server/index.ts`** — already re-exports `defineAgentEndpoint` + `AgentEvent` variants (lines 4-5, 109-113). Adding `defineAgentTool` + `DefineAgentToolSpec` type at the same level. Re-export `CustomTool` from `@usetheo/sdk` as a type-only alias (the consumer pattern: `import { defineAgentTool, type CustomTool } from 'theokit/server'`).
- **`tests/unit/define-agent-tool.test.ts`** (NEW) — vitest. Imports `defineAgentTool` from source. No fixture project needed (pure unit).
- **`tests/unit/define-agent-tool.test-d.ts`** (NEW) — type test via `expectTypeOf`.

#### Deep Dives

**Data structure of `DefineAgentToolSpec<T>`:**

```typescript
export interface DefineAgentToolSpec<T extends z.ZodType> {
  name: string                                          // ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$
  description: string                                   // required — drives LLM tool selection
  inputSchema: T                                        // Zod 3 schema, must root in z.object(...)
  handler: (input: z.infer<T>) => string | Promise<string>
}
```

**Algorithm:**

1. Validate `spec.name` against `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` regex (matches SDK's `CustomTool.name` contract).
2. Validate `spec.inputSchema._def.typeName === 'ZodObject'` (Anthropic + SDK require object-typed input). Throw `Error("defineAgentTool: inputSchema must be a ZodObject (z.object({...}))")` otherwise.
3. Call `zodToJsonSchema(spec.inputSchema, { target: 'jsonSchema7', $refStrategy: 'none' })` — produces a JSON Schema 7 object. `$refStrategy: 'none'` inlines all subschemas (LLMs handle inline schemas better than refs).
4. Strip the top-level `$schema` field (Anthropic rejects schemas with `$schema` at root in some provider modes).
5. Construct CustomTool: `{ name, description, inputSchema: <jsonSchema>, handler: async (input) => spec.inputSchema.parse(input) then spec.handler(parsed) }`.
6. Type assertion: handler input from `input: Record<string, unknown>` to `z.infer<T>` happens INSIDE the handler via `spec.inputSchema.parse(input)` — runtime safety. The OUTER type signature stays `Record<string, unknown>` for the CustomTool contract.

**Invariants:**

- BEFORE: `spec.inputSchema` is a Zod 3 schema rooted in `z.object(...)`.
- AFTER: `customTool.inputSchema.type === 'object'`; `customTool.handler` is async; calling `customTool.handler({})` with invalid input throws a `ZodError` that the SDK's tool-dispatcher catches and converts to `tool_result(isError)`.
- AFTER: `customTool.name === spec.name`, `customTool.description === spec.description`.

**Edge cases:**

- Empty `z.object({})` — `zodToJsonSchema` produces `{ type: 'object', properties: {}, additionalProperties: false }`. Valid for the LLM (no-arg tool).
- Optional fields `z.object({ x: z.string().optional() })` — `properties: { x: { type: 'string' } }` with `required: []` (no `required` array). Correct.
- Nested object `z.object({ user: z.object({ name: z.string() }) })` — inlined nested schema. Works.
- Top-level non-object (`z.string()` directly) — REJECTED at construction time with a clear error.
- `name` with whitespace/special chars — REJECTED.
- `description: ''` — Allowed by Zod typing but DEGRADES LLM tool selection. Log a `console.warn` (not throw) recommending non-empty description.
- Handler returns non-string (e.g., a number) — TypeScript catches via the return type. Runtime: not validated (trust TS).
- Handler throws `ZodError` from schema parse → SDK gets ZodError → tool_result(isError, msg). Working as designed.

#### Tasks

1. Add `zod-to-json-schema` to `packages/theo/package.json` dependencies.
2. Run `pnpm install` to regenerate the lockfile entry.
3. Create `packages/theo/src/server/define-agent-tool.ts` with the `DefineAgentToolSpec` interface and `defineAgentTool` function.
4. Add the name regex validation + ZodObject root check.
5. Add the `console.warn` for empty description.
6. Re-export from `packages/theo/src/server/index.ts`: `defineAgentTool`, type `DefineAgentToolSpec`, type `CustomTool` (re-exported from `@usetheo/sdk` as type-only).
7. Add `@usetheo/sdk` as a type-only peer dep declaration in `packages/theo/package.json` `peerDependenciesMeta` (`{ "optional": true }`) — TheoKit doesn't NEED the SDK at runtime, but the `CustomTool` type re-export makes it a type-time peer.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED: test_define_agent_tool_returns_custom_tool_with_object_input_schema()
  Given a spec { name: 'greet', description: '...', inputSchema: z.object({ name: z.string() }), handler: ({name}) => `Hello, ${name}!` }
  When defineAgentTool(spec) is called
  Then result.name === 'greet'
  And result.description matches
  And result.inputSchema.type === 'object'
  And result.inputSchema.properties.name.type === 'string'
  And typeof result.handler === 'function'

RED: test_define_agent_tool_handler_parses_input_at_runtime()
  Given a spec with z.object({ n: z.number().int() })
  When tool.handler({ n: 7 }) is called
  Then handler returns the expected string with parsed n
  When tool.handler({ n: 'not-a-number' }) is called
  Then the promise rejects with a ZodError

RED: test_define_agent_tool_rejects_non_object_root_schema()
  Given a spec with inputSchema: z.string()  (NOT a ZodObject)
  When defineAgentTool(spec) is called
  Then it throws Error('defineAgentTool: inputSchema must be a ZodObject (z.object({...}))')

RED: test_define_agent_tool_rejects_invalid_name()
  Given a spec with name: 'invalid name with spaces'
  When defineAgentTool(spec) is called
  Then it throws Error matching /name must match \^\[a-zA-Z\]/

RED: test_define_agent_tool_rejects_empty_name()  (EC-6, SHOULD TEST)
  Given a spec with name: ''
  When defineAgentTool(spec) is called
  Then it throws Error matching /name must match/

RED: test_define_agent_tool_handles_recursive_schema_within_1s()  (EC-7, SHOULD TEST)
  Given a recursive schema via z.lazy: const Self: z.ZodType = z.object({ children: z.array(z.lazy(() => Self)) })
  When defineAgentTool({ inputSchema: Self, ... }) is called
  Then either (a) throws a clear error OR (b) completes within 1000ms
  (Guards against zod-to-json-schema infinite recursion with $refStrategy: 'none' — switch to 'root' if hang)

RED: test_define_agent_tool_warns_on_empty_description()
  Given a spec with description: ''
  When defineAgentTool(spec) is called
  Then console.warn is called once with a message recommending non-empty description
  And the tool is STILL constructed (warn, not throw)

RED: test_define_agent_tool_strips_$schema_from_json_schema()
  Given any valid spec
  When defineAgentTool(spec) is called
  Then result.inputSchema does NOT have a $schema key at root

RED (type): test_define_agent_tool_infers_handler_input_from_zod_schema()
  Given inputSchema: z.object({ count: z.number(), tag: z.string() })
  When handler is typed as (input: ?) => string
  Then expectTypeOf(input).toEqualTypeOf<{ count: number; tag: string }>()

RED (type): test_define_agent_tool_handler_can_return_promise_string()
  Given handler: async (input) => 'ok'
  When type-checked
  Then defineAgentTool accepts it (no compile error)

RED (type): test_define_agent_tool_handler_cannot_return_number()
  Given handler: (input) => 42
  When type-checked
  Then it errors with "is not assignable to type string | Promise<string>"

RED (type): test_define_agent_tool_returns_custom_tool_typed()
  Given the result of defineAgentTool
  When inspected as a type
  Then expectTypeOf(result).toMatchTypeOf<CustomTool>()

GREEN: Implement defineAgentTool with name regex validation, ZodObject check,
       zod-to-json-schema conversion, $schema strip, parse-then-call handler wrap.

REFACTOR: None expected — single-purpose helper.

VERIFY:
  npx vitest run tests/unit/define-agent-tool.test.ts
  npx vitest run tests/unit/define-agent-tool.test-d.ts
```

BDD scenarios obrigatórios:
- **Happy path:** valid `z.object({...})` schema → CustomTool constructed correctly.
- **Validation error:** invalid name (spaces) → throws.
- **Edge case:** empty `z.object({})` → constructed with empty properties.
- **Error scenario:** handler throws → SDK-dispatch-safe (handler propagates).

#### Acceptance Criteria

- [ ] `defineAgentTool` exported from `theokit/server` import path.
- [ ] `DefineAgentToolSpec<T>` type-exported.
- [ ] `CustomTool` re-exported as a type-only alias from `@usetheo/sdk`.
- [ ] 10/10 unit + type tests GREEN.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` zero warnings.
- [ ] `zod-to-json-schema` appears in `packages/theo/package.json` dependencies.
- [ ] No `any` introduced (verify: `grep -n '\\bany\\b' packages/theo/src/server/define-agent-tool.ts` → empty).

#### DoD (Definition of Done)

- [ ] All 7 implementation tasks completed.
- [ ] All 10 tests GREEN (6 unit + 4 type).
- [ ] Zero TypeScript errors in `packages/theo`.
- [ ] Zero ESLint warnings.
- [ ] Bundle size: client bundle unchanged (server-only primitive). Verify via `npx vitest run tests/unit/bundle-budget.test.ts`.

---

## Phase 2: `streamAgentRun` adapter

**Objective:** Ship the SDK `Run.stream()` → AgentEvent yield bridge.

### T2.1 — Create `stream-agent-run.ts`

#### Objective

A single `async function* streamAgentRun(run: Run): AsyncGenerator<AgentEvent>` that consumes the SDK's stream, maps each `SDKMessage` variant to the appropriate AgentEvent, and yields a terminal `error` event if `run.wait()` resolves with `status: 'error'`.

#### Evidence

- SDK `Run.stream()` returns `AsyncGenerator<SDKMessage>` (`theokit-sdk/packages/sdk/src/types/run.ts:166`).
- `SDKMessage` discriminated union (`theokit-sdk/packages/sdk/src/types/messages.ts:160-169`) has 9 variants; we only care about `assistant` (text) and `tool_call` (lifecycle) for the AgentEvent SSE wire.
- `SDKToolUseMessage.status` is `'running' | 'completed' | 'error'` — the three states that map to `tool_call` | `tool_result` | `error` AgentEvents respectively (per ADR D3).
- After the stream completes, `run.wait()` resolves with the RunResult. If `result.status === 'error'`, we yield a final `error` AgentEvent so the SSE consumer surfaces it (mirrors the pattern from `Agent.prompt` + `throwOnError` semantics from item #3).

#### Files to edit

```
packages/theo/src/server/stream-agent-run.ts              — (NEW) the adapter
packages/theo/src/server/index.ts                         — export streamAgentRun
tests/unit/stream-agent-run.test.ts                       — (NEW) 8 unit tests with mock Run
tests/unit/stream-agent-run.test-d.ts                     — (NEW) 2 type tests
```

#### Deep file dependency analysis

- **`packages/theo/src/server/stream-agent-run.ts`** — NEW. Type-only imports of `Run`, `SDKMessage`, `SDKToolUseMessage`, `SDKAssistantMessage`, `TextBlock`, `ToolUseBlock`, `RunResult` from `@usetheo/sdk`. No runtime SDK call from TheoKit core. Used by Phase 3 (fixture) and Phase 4 (Playwright).
- **`packages/theo/src/server/index.ts`** — append `export { streamAgentRun } from './stream-agent-run.js'`.
- Tests use mock `Run` objects (`{ stream: () => yieldedSDKMessages, wait: () => terminalResult }`) — no live network.

#### Deep Dives

**Algorithm:**

```typescript
function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[Unserializable]'
  }
}

function safeArgs(args: unknown): Record<string, unknown> {
  // EC-3 (edge case review): SDK types args?: unknown. Guard against null/array/primitive
  // BEFORE narrowing to Record. Bare `as` cast violates type-safety rule (no-as).
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {}
}

export async function* streamAgentRun(run: Run): AsyncGenerator<AgentEvent, void, unknown> {
  for await (const msg of run.stream()) {
    switch (msg.type) {
      case 'assistant':
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text.length > 0) {
            yield { type: 'message', content: block.text }
          }
          // tool_use blocks NOT yielded here — they trigger a tool_call SDK message
          // that we handle in the 'tool_call' case below.
        }
        break
      case 'tool_call':
        if (msg.status === 'running') {
          yield {
            type: 'tool_call',
            name: msg.name,
            args: safeArgs(msg.args),  // EC-3 fix
            id: msg.call_id,
          }
        } else if (msg.status === 'completed') {
          // EC-1 (edge case review): tool result may be a Date, bigint, circular ref, etc.
          // JSON.stringify in encodeSSE would throw → uncaught → defineAgentEndpoint catches
          // and replaces the legitimate tool_result with a generic `error`. Coerce here.
          const data =
            typeof msg.result === 'string' ? msg.result : safeJsonStringify(msg.result)
          yield {
            type: 'tool_result',
            name: msg.name,
            data,
            id: msg.call_id,
          }
        } else if (msg.status === 'error') {
          const message =
            typeof msg.result === 'string'
              ? msg.result
              : `Tool ${msg.name} failed`
          yield { type: 'error', message, id: msg.call_id }
        }
        break
      // Other SDKMessage variants (system, user, thinking, status, task, request, object_delta)
      // are intentionally NOT yielded — they are SDK-internal telemetry, not AgentEvent wire data.
    }
  }
  const result = await run.wait()
  if (result.status === 'error' && result.error !== undefined) {
    yield { type: 'error', message: result.error.message }
  }
}
```

**Invariants:**

- BEFORE: `run.stream()` is an unconsumed AsyncGenerator. `run.wait()` is a pending promise.
- DURING: every yielded AgentEvent corresponds to exactly ONE non-trivial SDKMessage. Empty-text assistant messages and SDK-internal telemetry are filtered.
- AFTER: the stream is fully drained AND `run.wait()` resolved. A terminal `error` event is emitted IFF `result.status === 'error'`.

**Edge cases:**

- `run.stream()` throws mid-iteration → propagates to the caller of `defineAgentEndpoint`'s generator, which catches via the existing try/catch in `define-agent-endpoint.ts:130-132` and yields a final `error` event. No extra handling needed.
- `run.stream()` yields an `assistant` message with `content: []` (empty array) → the inner `for` loop runs zero times → no yield. Correct.
- `run.stream()` yields an `assistant` message where a block has `type: 'tool_use'` → ignored (we only yield from `tool_call` SDK messages, which carry the full lifecycle). Per SDK semantics, every `tool_use` block in an assistant message is followed by a `tool_call` (running) message.
- `tool_call` with `status: 'error'` but `result === undefined` → message defaults to `"Tool ${name} failed"`. No crash.
- `run.wait()` resolves with `status: 'cancelled'` → NO error event yielded (cancel ≠ error). Mirrors `Agent.prompt` semantics from item #3.
- `run.wait()` resolves with `status: 'error'` but `result.error === undefined` (malformed RunResult) → NO error event yielded (defensive guard). The SDK's contract says `error` is populated when `status === 'error'`, but we guard against malformed objects.
- The consumer of `streamAgentRun` (the `defineAgentEndpoint` generator) aborts → the SSE wrapper calls `generator.return()` → our `for await` exits → `run.wait()` is NOT awaited (cleanup is the SDK's responsibility via `run.cancel()`, NOT ours). Documented in JSDoc.

#### Tasks

1. Create `packages/theo/src/server/stream-agent-run.ts`.
2. Add type imports from `@usetheo/sdk` (Run, SDKMessage, RunResult).
3. Implement the async generator per the algorithm above.
4. Add JSDoc covering the abort semantics (consumer cancellation responsibility).
5. Export from `packages/theo/src/server/index.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED: test_stream_agent_run_yields_message_for_assistant_text_block()
  Given a mock Run yielding { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } }
  When streamAgentRun is consumed
  Then the first yielded event is { type: 'message', content: 'hi' }

RED: test_stream_agent_run_yields_tool_call_then_tool_result()
  Given a mock Run yielding [
    { type: 'tool_call', status: 'running', name: 'greet', args: { name: 'world' }, call_id: 'c1' },
    { type: 'tool_call', status: 'completed', name: 'greet', result: 'Hello, world!', call_id: 'c1' }
  ]
  When streamAgentRun is consumed
  Then the yielded events are [
    { type: 'tool_call', name: 'greet', args: { name: 'world' }, id: 'c1' },
    { type: 'tool_result', name: 'greet', data: 'Hello, world!', id: 'c1' }
  ]

RED: test_stream_agent_run_yields_error_for_tool_status_error()
  Given a mock Run yielding { type: 'tool_call', status: 'error', name: 'greet', result: 'invalid input', call_id: 'c2' }
  When streamAgentRun is consumed
  Then the yielded event is { type: 'error', message: 'invalid input', id: 'c2' }

RED: test_stream_agent_run_yields_terminal_error_when_run_wait_status_error()
  Given a mock Run with no stream events but wait() resolving { status: 'error', error: { message: 'auth failed', code: 'llm_4xx' } }
  When streamAgentRun is consumed
  Then exactly one event is yielded: { type: 'error', message: 'auth failed' }

RED: test_stream_agent_run_does_not_yield_for_assistant_empty_text()
  Given a mock Run yielding { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '' }] } }
  When streamAgentRun is consumed
  Then zero events are yielded (filtered out)

RED: test_stream_agent_run_does_not_yield_for_internal_sdk_message_types()
  Given a mock Run yielding [{ type: 'system', subtype: 'init', agent_id: 'a', run_id: 'r' }, { type: 'thinking', text: 't', agent_id: 'a', run_id: 'r' }]
  When streamAgentRun is consumed
  Then zero events are yielded

RED: test_stream_agent_run_does_not_yield_terminal_error_on_cancelled()
  Given a mock Run with wait() resolving { status: 'cancelled' }
  When streamAgentRun is consumed
  Then zero terminal events are yielded (cancel is not error)

RED: test_stream_agent_run_defaults_tool_error_message_when_result_undefined()
  Given a mock Run yielding { type: 'tool_call', status: 'error', name: 'greet', call_id: 'c1' } (no result)
  When streamAgentRun is consumed
  Then yielded event is { type: 'error', message: 'Tool greet failed', id: 'c1' }

RED: test_stream_agent_run_coerces_non_string_tool_result_to_safe_json()  (EC-1)
  Given a mock Run yielding { type: 'tool_call', status: 'completed', name: 't', result: 42n, call_id: 'c1' }  (bigint)
  When streamAgentRun is consumed
  Then yielded event has data === '[Unserializable]'
  And NO error event is yielded (the tool DID succeed)
  Given a mock Run yielding { type: 'tool_call', status: 'completed', name: 't', result: { ok: true }, call_id: 'c2' }
  When streamAgentRun is consumed
  Then yielded event has data === '{"ok":true}'

RED: test_stream_agent_run_safe_args_returns_empty_object_for_non_object()  (EC-3)
  Given a mock Run yielding { type: 'tool_call', status: 'running', name: 't', args: null, call_id: 'c1' }
  When streamAgentRun is consumed
  Then yielded event args === {}
  Given args: [1,2,3] (array)
  Then yielded event args === {}
  Given args: 'str' (primitive)
  Then yielded event args === {}

RED: test_stream_agent_run_preserves_interleaved_assistant_and_tool_lifecycle()  (EC-4, SHOULD TEST)
  Given a mock Run yielding [
    {type:'assistant', content:[{type:'text', text:'let me check'}]},
    {type:'tool_call', status:'running', name:'current_time', args:{}, call_id:'c1'},
    {type:'tool_call', status:'completed', name:'current_time', result:'12:00', call_id:'c1'},
    {type:'assistant', content:[{type:'text', text:"It's noon"}]}
  ]
  When consumed
  Then yields EXACTLY 4 events: message('let me check') | tool_call | tool_result | message("It's noon") IN ORDER

RED: test_stream_agent_run_does_not_dedup_duplicate_call_id()  (EC-5, SHOULD TEST)
  Given two consecutive { type: 'tool_call', status: 'running', name: 'x', call_id: 'c1', args: {} } messages
  When consumed
  Then yields two tool_call AgentEvents (no dedup at adapter level; client's responsibility)

RED: test_stream_agent_run_does_not_call_wait_when_consumer_returns_early()  (EC-8, SHOULD TEST)
  Given a mock Run with run.stream() yielding more events than the consumer reads, and a spy on run.wait()
  When the consumer calls generator.return() after the first yield
  Then run.wait() spy was NEVER invoked
  (Pins documented behavior — consumer aborts skip wait(); SDK cleanup is run.cancel()'s job)

RED (type): test_stream_agent_run_returns_agent_event_generator()
  When typed
  Then expectTypeOf(streamAgentRun(mockRun)).toEqualTypeOf<AsyncGenerator<AgentEvent, void, unknown>>()

RED (type): test_stream_agent_run_accepts_sdk_run_type()
  Given a Run from @usetheo/sdk
  When passed to streamAgentRun
  Then it compiles without `as` casts

GREEN: Implement the algorithm above with switch on msg.type
       and per-status branching for tool_call.

REFACTOR: None expected.

VERIFY:
  npx vitest run tests/unit/stream-agent-run.test.ts
  npx vitest run tests/unit/stream-agent-run.test-d.ts
```

BDD scenarios obrigatórios:
- **Happy path:** assistant text → message event; tool lifecycle → tool_call → tool_result.
- **Validation error:** internal SDK message types → filtered out (zero yield).
- **Edge case:** empty text block → filtered; result undefined → default message.
- **Error scenario:** tool status 'error' → error event; run.wait status 'error' → terminal error event.

#### Acceptance Criteria

- [ ] `streamAgentRun` exported from `theokit/server`.
- [ ] 10/10 tests GREEN (8 unit + 2 type).
- [ ] Type imports from `@usetheo/sdk` are type-only (`import type {...}`).
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` zero warnings.
- [ ] No `any` introduced.

#### DoD

- [ ] All 5 implementation tasks completed.
- [ ] All 10 tests GREEN.
- [ ] Zero TS errors.
- [ ] Zero lint warnings.
- [ ] JSDoc covers abort semantics.

---

## Phase 3: Tool-calling example in `template-default`

**Objective:** Replace the tool-less `chat.ts` of the default scaffold with a tool-using version that proves the wire end-to-end, plus update the create-theo template to match (fixture parity).

### T3.1 — Replace fixture chat with tool-calling chat

#### Objective

Show in the default scaffold how to add a tool. Pick a deliberately tiny tool (`current_time`) so the LOC delta is small and the example obviously works without external dependencies.

#### Evidence

- `template-default` is the scaffold every `npx create-theokit my-app` user lands on. It must showcase the canonical API, not a stripped-down placeholder. Item #4 deliverable mentions "tool calling stops being manual wiring" — that promise needs a fixture to back it.
- A `current_time` tool needs no API key, no flaky external service, no permission grant — perfect for the empty-room scaffold.
- The added LOC is the headline measurable goal (#1): ≤ +20 lines on top of the canonical 30-LOC `chat.ts` from item #3.

#### Files to edit

```
fixtures/template-default/server/routes/chat.ts                       — refactor to use Agent.create + send + streamAgentRun + 1 tool
packages/create-theo/templates/default/server/routes/chat.ts          — mirror (template parity)
fixtures/template-default/package.json                                — already has @usetheo/sdk (item #3); no change
tests/unit/fixture-template-default-canonical-chat.test.ts            — update assertions to check for defineAgentTool + streamAgentRun usage
tests/unit/create-theo-default-template.test.ts                       — update assertions to mirror
```

#### Deep file dependency analysis

- **`fixtures/template-default/server/routes/chat.ts`** — currently uses `Agent.prompt` (one-shot). Refactor to `Agent.create({ tools: [...] }) → agent.send(...) → yield* streamAgentRun(run)`. Used by Playwright in Phase 4.
- **`packages/create-theo/templates/default/server/routes/chat.ts`** — the file `create-theokit` copies into a new project. Must mirror the fixture EXACTLY (item-3 anti-stack lint gate enforces this; expand the gate to also enforce the tool-calling shape).
- **Test files** — both have item-3 assertions for `Agent.prompt`. Update to accept either `Agent.prompt` (legacy) OR `Agent.create + streamAgentRun` (current). Or just hard-pin to `defineAgentTool + streamAgentRun + Agent.create`.

#### Deep Dives

**New `chat.ts` shape (target ≤ 50 LOC total including the tool def):**

```typescript
import { Agent } from '@usetheo/sdk'
import { z } from 'zod'
import { defineAgentEndpoint, defineAgentTool, streamAgentRun, type AgentEvent } from 'theokit/server'

const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO timestamp on the server.',
  inputSchema: z.object({}),
  handler: () => new Date().toISOString(),
})

export const POST = defineAgentEndpoint({
  async *handler({ body }): AsyncGenerator<AgentEvent> {
    const safeBody =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { message?: string })
        : {}
    const { message = '' } = safeBody
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey === undefined || apiKey.length === 0) {
      yield { type: 'error', message: 'Set ANTHROPIC_API_KEY in your .env to enable the agent.' }
      return
    }
    const agent = await Agent.create({
      apiKey,
      model: { id: 'claude-sonnet-4-5-20250929' },
      tools: [currentTime],
    })
    try {
      const run = await agent.send(message)
      yield* streamAgentRun(run)
    } finally {
      // EC-2 (edge case review): dispose() may throw and MASK the original SDK error
      // (auth_failed, tool_dispatch_failed, etc.). Swallow + warn so the wire keeps
      // the actionable error users actually need.
      try { await agent.dispose() } catch (e) { console.warn('[chat] agent.dispose() failed:', e) }
    }
  },
})
```

**LOC budget check:** 30 (header + tool def + body) ≈ within +20 of the item-3 baseline of 30 LOC. Tight.

**Why `current_time`:** zero external dependencies, deterministic for testing (Playwright can mock with `Date.now`), proves the wire without needing a real API account.

**Backward compat:** existing users on item-3 (`Agent.prompt` chat) get the tool-calling upgrade only when they re-scaffold or copy. The framework primitives `defineAgentTool` + `streamAgentRun` are additive — old code keeps compiling.

**Edge cases:**

- LLM doesn't pick the tool (it's optional from the model's POV) → `streamAgentRun` yields only `message` events. No `tool_call` event. Test must accept this.
- LLM picks the tool but Anthropic returns a 5xx mid-run → SDK emits `tool_call(status: 'error')` → streamAgentRun yields `{ type: 'error', message }`. The `agent.dispose()` in the `finally` still runs.
- Body parse fails before agent is created → the early `apiKey` check + yield + return short-circuits. Agent never created, dispose never called. Correct.

#### Tasks

1. Update `fixtures/template-default/server/routes/chat.ts` to the shape above.
2. Mirror exactly into `packages/create-theo/templates/default/server/routes/chat.ts`.
3. Update `tests/unit/fixture-template-default-canonical-chat.test.ts` — add 2 assertions: file contains `defineAgentTool(` and `yield* streamAgentRun(`.
4. Update `tests/unit/create-theo-default-template.test.ts` — mirror.
5. Run the existing `tests/unit/scaffold-no-openai-anti-stack.test.ts` to confirm no anti-stack regression.

#### TDD + BDD

```
RED: test_fixture_chat_imports_define_agent_tool()
  Given fixtures/template-default/server/routes/chat.ts
  When read as text
  Then it imports defineAgentTool and streamAgentRun from 'theokit/server'

RED: test_fixture_chat_declares_at_least_one_tool()
  Given the same file
  When grep'd for /defineAgentTool\(/
  Then exactly one match

RED: test_fixture_chat_yield_delegates_to_stream_agent_run()
  Given the same file
  When grep'd for /yield\*\s+streamAgentRun\(/
  Then exactly one match

RED: test_fixture_chat_disposes_agent_in_finally_with_try_catch()  (EC-2)
  Given the same file
  When grep'd for /try\s*\{\s*await agent\.dispose\(\)/
  Then at least one match
  And the dispose appears inside a `finally` block (regex line-context check)
  And a catch with console.warn follows (regex /catch.*console\.warn/)

RED: test_template_chat_mirrors_fixture()
  Given packages/create-theo/templates/default/server/routes/chat.ts
  And fixtures/template-default/server/routes/chat.ts
  When both are read
  Then the bodies are byte-equal (modulo trailing whitespace normalization)

RED: test_scaffold_anti_stack_still_passes_with_tool_calling()
  Given the updated fixture chat
  When the existing anti-stack lint test runs
  Then it still passes (no `from 'openai'` import introduced)

GREEN: Update both chat.ts files; update both test files.

REFACTOR: None expected.

VERIFY:
  npx vitest run tests/unit/fixture-template-default-canonical-chat.test.ts
  npx vitest run tests/unit/create-theo-default-template.test.ts
  npx vitest run tests/unit/scaffold-no-openai-anti-stack.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** chat.ts uses defineAgentTool + streamAgentRun.
- **Validation error:** anti-stack gate still GREEN.
- **Edge case:** fixture and template are byte-equal.
- **Error scenario:** dispose in finally (catches the tool-error / run-error path).

#### Acceptance Criteria

- [ ] Both `chat.ts` files updated and byte-equal.
- [ ] LOC delta vs item-3 baseline ≤ +20 lines.
- [ ] 6/6 fixture tests GREEN.
- [ ] Anti-stack lint still passes.
- [ ] `pnpm tsc --noEmit` clean in fixture.

#### DoD

- [ ] All 5 tasks completed.
- [ ] All 6 tests GREEN.
- [ ] LOC delta verified via `wc -l`.
- [ ] Fixture diff reviewed for accidental scope creep.

---

## Phase 4: Playwright E2E for tool-calling chat

**Objective:** Prove the wire end-to-end in a real Chromium against a real (fake-key) Anthropic call. Pins the contract Playwright-style.

### T4.1 — Add Playwright spec for tool-calling fixture

#### Objective

Extend the existing `template-default-canonical-chat` Playwright project (item #3) with 2 new specs that exercise tool-calling: (a) composer renders + sends with tool defined in the route, (b) on auth error, the SSE wire still terminates with an `error` event (regression for the dispose-in-finally path).

#### Evidence

- Item-3 Playwright spec lives at `tests/e2e/template-default-canonical-chat.spec.ts` — 3 scenarios passing, with a fake `ANTHROPIC_API_KEY=sk-ant-fake-for-playwright-canonical-chat`.
- The fixture from Phase 3 uses `Agent.create` + a tool. Fake key still fails the same way (401 from Anthropic) — but now the error path also has to clean up via `agent.dispose()`.
- A new spec proving that scaffold-with-tool boots and surfaces errors cleanly catches the integration regression where, e.g., `Agent.create` rejects synchronously (no API key) or `agent.dispose()` throws after a failed run.

#### Files to edit

```
tests/e2e/template-default-canonical-chat.spec.ts        — append 2 new test cases
playwright.config.ts                                     — no change (port 3470 fixture already set up by item #3)
```

#### Deep file dependency analysis

- **`tests/e2e/template-default-canonical-chat.spec.ts`** — existing 3 specs stay; append 2 new ones. Reuses the `collectConsoleErrors` helper.
- **Playwright `webServer`** — already configured to boot `fixtures/template-default` with the fake key. No re-config.

#### Deep Dives

**New specs:**

```typescript
test('agent.create + tool-defined route boots without crash', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/')
  const composer = page.getByPlaceholder('Ask the agent…')
  await expect(composer).toBeVisible({ timeout: 10_000 })
  // The mere fact that the page rendered proves `defineAgentTool` + `streamAgentRun`
  // load cleanly server-side (no top-level throw).
  expect(errors.length).toBe(0)
})

test('tool-calling chat surfaces SSE error event on auth failure (regression for dispose-in-finally)', async ({ page }) => {
  await page.goto('/')
  const composer = page.getByPlaceholder('Ask the agent…')
  await composer.click()
  await composer.pressSequentially('what time is it', { delay: 10 })
  await composer.press('Enter')

  // Fake key → 401 → either tool never called OR tool_call(error) → error event yields.
  await expect(
    page.getByText(/Agent error|auth_failed|HTTP 401/i).first(),
  ).toBeVisible({ timeout: 15_000 })

  // The dispose-in-finally path must not leak a second error from the runtime.
  // After 5s of settled-state, at most 2 matches (the SSE error + the optional retry hint).
  await page.waitForTimeout(5_000)
  const matchCount = await page.getByText(/auth_failed|HTTP 401/i).count()
  expect(matchCount).toBeLessThanOrEqual(2)
})
```

**Edge cases:**

- Playwright's `pressSequentially` already known-needed pattern from item #3 (controlled input).
- Fake key returns 401 BEFORE the LLM emits a `tool_use` — so the tool's handler may NEVER run. The spec only asserts the error appears, not the tool path. The tool's mere presence (in `Agent.create({ tools })`) is what matters for the regression.

#### Tasks

1. Append the 2 new tests to the spec file.
2. Ensure they share the existing `test.describe` block.
3. Run the spec → expect 3 (existing) + 2 (new) = 5 passing.

#### TDD + BDD

```
RED: test_e2e_tool_calling_route_boots_without_crash()  (Playwright)
  Given the scaffold with defineAgentTool in chat.ts
  When the page loads
  Then composer is visible
  And zero console errors

RED: test_e2e_tool_calling_surfaces_auth_error_via_sse()  (Playwright)
  Given fake ANTHROPIC_API_KEY
  When user types 'what time is it' + Enter
  Then an error AgentEvent renders in the UI within 15s
  And no duplicate error events

GREEN: The implementation in Phase 3 already covers this; tests just verify.

REFACTOR: None.

VERIFY:
  CI=true npx playwright test --project=template-default-canonical-chat
```

BDD scenarios obrigatórios:
- **Happy path:** scaffold boots, composer rendered.
- **Validation error:** N/A (covered by item-3 specs).
- **Edge case:** auth error during agent.send → dispose() still cleanly cleans up.
- **Error scenario:** SSE error event surfaces in UI.

#### Acceptance Criteria

- [ ] Spec file has 5 total tests in the same describe block.
- [ ] 5/5 PASS in CI mode.
- [ ] No new console errors introduced by tool-defining code.

#### DoD

- [ ] All 3 tasks completed.
- [ ] 5/5 Playwright tests GREEN.
- [ ] No flake on 3 consecutive CI runs (manual verify in dogfood phase).

---

## Phase 5: Dogfood QA (mandatory)

**Objective:** Validate that item #4 ships at user-experience level, not just unit-test level.

### T5.1 — Run dogfood + update roadmap

#### Objective

Run `/dogfood full`. Update `CLAUDE.md` macro roadmap entry #4 with the dogfood verdict and evidence path.

#### Evidence

- Item #3 dogfood at `docs/audit/dogfood-2026-05-22.md` is the template — 22-phase audit, Health Score, phase-by-phase scoring, item-specific validation table, bugs-fixed-in-session table.
- The Global DoD has `Dogfood QA PASS — /dogfood full health score >= 70, zero CRITICAL issues introduced by this plan's changes`.
- The roadmap update must include: status `✅ Done {DATE}`, evidence path, key tests pinning the deliverable, dogfood verdict.

#### Files to edit

```
docs/audit/dogfood-{YYYY-MM-DD}.md                       — (NEW) the dogfood report
CLAUDE.md                                                — update roadmap entry #4 to ✅ Done with evidence
CHANGELOG.md                                             — add [Unreleased] entry under "Added"
```

#### Tasks

1. Execute `/dogfood full` against the post-Phase-4 codebase.
2. Capture the Health Score, phase-by-phase table, item-4-specific validation, and any bugs found+fixed.
3. Save report to `docs/audit/dogfood-{YYYY-MM-DD}.md`.
4. Update `CLAUDE.md` roadmap item #4 to ✅ Done with evidence pointers.
5. Update `CHANGELOG.md` [Unreleased] → Added: `defineAgentTool` + `streamAgentRun` primitives.

#### TDD + BDD

```
RED: test_dogfood_health_score_at_least_70()
  Given the dogfood report
  When parsed
  Then Health Score >= 70/100
  And zero plan-caused CRITICAL issues

RED: test_changelog_unreleased_entry_present()
  Given CHANGELOG.md
  When grep'd in [Unreleased] section
  Then both `defineAgentTool` and `streamAgentRun` are mentioned in 'Added'

RED: test_roadmap_item_4_marked_done()
  Given CLAUDE.md
  When the line "| 4 | B · Convergence |" is read
  Then it contains "✅ Done"
  And it links to the dogfood report path

GREEN: Run /dogfood full and update the 3 files.

REFACTOR: N/A.

VERIFY:
  grep "defineAgentTool" CHANGELOG.md
  grep -A 1 "| 4 | B · Convergence" CLAUDE.md
  test -f docs/audit/dogfood-$(date +%Y-%m-%d).md
```

BDD scenarios obrigatórios:
- **Happy path:** dogfood ≥ 70, roadmap updated.
- **Validation error:** if dogfood < 70, plan-caused issues must be enumerated.
- **Edge case:** Node 22-only phases (3, 17) may BLOCK on this environment (Node 20) — must be documented as pre-existing, not item-4 regression (mirrors item #3 pattern).
- **Error scenario:** if Playwright fails in CI, fix before declaring done.

#### Acceptance Criteria

- [ ] Dogfood report exists at `docs/audit/dogfood-{YYYY-MM-DD}.md`.
- [ ] Health Score ≥ 70.
- [ ] Zero plan-caused CRITICAL.
- [ ] `CLAUDE.md` roadmap row 4 marked ✅ Done with evidence.
- [ ] `CHANGELOG.md` has Added entry for both primitives.

#### DoD

- [ ] All 5 tasks completed.
- [ ] All 3 tests pass.
- [ ] Loop promise is genuinely TRUE.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Tool definition ergonomic helper (`defineAgentTool`) | T1.1 | New primitive in `packages/theo/src/server/` with Zod 3 input, JSON Schema output, parse-then-call handler wrapping |
| 2 | SDK stream → AgentEvent SSE wire bridge | T2.1 | New `streamAgentRun` primitive that maps SDKMessage to AgentEvent variants |
| 3 | Default scaffold demonstrates tool calling | T3.1 | Both fixture + template `chat.ts` updated with one `current_time` tool |
| 4 | E2E proof in real browser | T4.1 | 2 new Playwright specs in the existing canonical-chat suite |
| 5 | Roadmap status reflects shipped work | T5.1 | `CLAUDE.md` item #4 marked ✅ Done with evidence |
| 6 | Backward compatibility — existing item-3 chats keep working | T1.1 + T2.1 | New primitives are additive; old `Agent.prompt` route is unchanged |
| 7 | Type-safety — `handler({ x })` infers from `inputSchema` | T1.1 (test-d) | `expectTypeOf` test pins inference |
| 8 | Zod 3 dual-package hazard avoided | D1 + T1.1 | TheoKit's `defineAgentTool` does NOT delegate to SDK's `defineTool`; produces CustomTool directly via `zod-to-json-schema` |
| 9 | Tool error policy explicit | D3 + T2.1 | Tool error → `error` AgentEvent (not `tool_result` with hidden error flag) |
| 10 | No invented agent runtime (per [[project-stack-deps]]) | All tasks | The CustomTool produced is consumed by SDK's `Agent.create({ tools })` — TheoKit does NOT implement tool dispatch |
| 11 | Bundle budget kept | T1.1 + Acceptance | Server-only primitive; client bundle unchanged (verified via bundle-budget test) |
| 12 | `pnpm install` re-runs after dep add | T1.1 task 2 | Explicit step |
| 13 | Fixture + template byte-equal | T3.1 (test) | Test asserts the two chat.ts are byte-equal |
| 14 | Dogfood gate | T5.1 | Mandatory phase, ≥70 health |
| 15 | EC-1 — non-JSON-serializable tool result corrupts SSE wire | T2.1 (algo + test) | `safeJsonStringify` helper in `streamAgentRun` 'completed' branch |
| 16 | EC-2 — `agent.dispose()` throws and masks original error | T3.1 (chat.ts + test) | Wrap dispose in try/catch with console.warn |
| 17 | EC-3 — bare `as` cast violates type-safety rule | T2.1 (algo + test) | `safeArgs` type-guard helper |
| 18 | EC-4 — interleaved assistant + tool lifecycle | T2.1 (test) | New test pins Anthropic's real wire shape ordering |
| 19 | EC-5 — duplicate `call_id` not deduped at adapter | T2.1 (test) | New test pins no-state contract |
| 20 | EC-6 — empty-string tool name | T1.1 (test) | New test pins regex rejection of empty |
| 21 | EC-7 — recursive Zod schema via `z.lazy` | T1.1 (test) | New test with 1s timeout; falls back to `$refStrategy: 'root'` if hang |
| 22 | EC-8 — consumer abort doesn't await `run.wait()` | T2.1 (test) | Spy-based test pins documented behavior |

**Coverage: 22/22 gaps covered (100%)** — including 3 MUST FIX + 5 SHOULD TEST from edge-case-plan review.

**Edge case review:** `docs/reviews/edge-case-plan/item-4-define-agent-tool-edge-cases-2026-05-22.md` — full audit (3 MUST FIX incorporated above, 5 SHOULD TEST tests added inline, 4 DOCUMENT items below).

**DOCUMENT (acknowledged risks, no fix needed in this plan):**
- **EC-9:** `msg.truncated` field from SDK is dropped in our adapter. Acceptable — client UI can't render truncation flags today.
- **EC-10:** Empty-description warn floods console if same tool defined per-request. Acceptable for v0; future fix: WeakSet of warned specs.
- **EC-11:** Date results auto-coerce to ISO string via `safeJsonStringify`. Documented in JSDoc; consumers can pre-stringify with custom format if they need control.
- **EC-12:** `zod-to-json-schema` defaults `additionalProperties: false`. Strict by default = correct for LLM tool contracts.

## Global Definition of Done

- [ ] All 5 phases completed (Phases 1, 2 in parallel → 3 → 4 → 5)
- [ ] All RED → GREEN tests passing (~28 new tests across phases)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean across `packages/theo`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (item-3 `Agent.prompt` chat still compiles and runs)
- [ ] Code-audit checks passing across `packages/theo/src/server/`
- [ ] `CHANGELOG.md [Unreleased]` updated with item #4 entry
- [ ] `CLAUDE.md` macro roadmap item #4 marked `✅ Done` with evidence
- [ ] **Fixture proof** — `fixtures/template-default/` ships `current_time` tool; Playwright spec automates the round-trip
- [ ] **Dogfood QA PASS** — `/dogfood full` health ≥ 70, zero plan-caused CRITICAL
- [ ] LOC delta in `fixtures/template-default/server/routes/chat.ts` ≤ +20 lines vs item-3 baseline (30 LOC)
- [ ] Bundle delta: client bundle unchanged; server bundle ≤ +6 KB gzipped

## Final Phase: Dogfood QA (MANDATORY)

> Runs AFTER all 4 implementation phases. The plan is NOT done until dogfood passes.

**Objective:** Validate that the new primitives + tool-calling fixture work as a real user would experience them: scaffold → install → add tool → chat → see tool call in UI.

### Execution

```
/dogfood full
```

Always full. No shortcuts.

Plus a **manual smoke** specifically for this plan:

```bash
# Clean room (Node 22 required)
rm -rf /tmp/dogfood-item-4 && cd /tmp
npx --yes create-theokit dogfood-item-4
cd dogfood-item-4
grep 'defineAgentTool' server/routes/chat.ts      # EXPECT: match
grep 'streamAgentRun' server/routes/chat.ts       # EXPECT: match
cat server/routes/chat.ts | wc -l                 # EXPECT: <= 60 lines
pnpm install
echo "ANTHROPIC_API_KEY=sk-ant-fake" >> .env
pnpm dev &
sleep 8
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" -H "X-Theo-Action: 1" \
  -d '{"message":"what time is it"}'
# EXPECT: data: {"type":"error","message":"... auth_failed ..."}\n\n
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues introduced by this plan
- [ ] Zero HIGH issues in `defineAgentTool` / `streamAgentRun` / scaffold
- [ ] Manual smoke above passes
- [ ] Any pre-existing issues documented as such

### If Dogfood Fails

1. Identify which issues are caused by this plan vs pre-existing.
2. Fix all plan-caused CRITICAL and HIGH issues before declaring complete.
3. Re-run `/dogfood full` to confirm fixes.
4. Pre-existing issues are logged but do NOT block plan completion.

---

## Out of scope (intentional)

- **Tool dispatch implementation.** The SDK owns this. TheoKit only produces the CustomTool and adapts its stream output.
- **Cloud agent tool support.** SDK's CustomTool is local-runtime-only per `theokit-sdk/packages/sdk/src/types/agent.ts:263-265`. Cloud agents reject `tools`.
- **MCP server tool integration.** Out of MVP. The SDK supports MCP via `mcpServers`, but wiring that into AgentEvent SSE is a future item.
- **`generate-object` / `stream-object` adapters.** SDK has `streamObject` with `object_delta` SDKMessage; integrating with AgentEvent needs a new variant. Out of scope.
- **Zod 4 framework-wide adoption.** Massive scope; treated separately. See ADR D1.
- **Persistent tool registry.** Tools are declared per-request via `Agent.create({ tools })`. No "register globally" surface. By design.
