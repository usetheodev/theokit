# Edge Case Review — item-4-define-agent-tool-plan

Data: 2026-05-22
Tasks analisadas: 5 (T1.1, T2.1, T3.1, T4.1, T5.1)
Edge cases encontrados: 12 (MUST FIX: 3, SHOULD TEST: 5, DOCUMENT: 4, IGNORE: 0)

---

## MUST FIX

### EC-1: `tool_result.data` may be non-JSON-serializable; `JSON.stringify` in `encodeSSE` throws → uncaught inside the generator → falls through to `defineAgentEndpoint`'s catch and the **`tool_result` event is lost**, replaced by a generic `error`

- **Task afetada:** T2.1 (`streamAgentRun`)
- **Família:** Boundary / I/O
- **Cenário:** SDK `SDKToolUseMessage.result` is typed `unknown`. A user-defined tool whose handler returns a `Date`, a `bigint`, or a value with a circular reference (e.g., `{ self: self }`) will be passed straight through to `AgentToolResultEvent.data`. `defineAgentEndpoint`'s `encodeSSE` (`packages/theo/src/server/define-agent-endpoint.ts:48-50`) calls `JSON.stringify(event)` unconditionally. `bigint` throws `TypeError`; circular refs throw `TypeError`; `Date` silently becomes an ISO string (data shape changes — subtle UI bug).
- **Impacto:** The tool LOOKS like it errored from the client's POV even when it succeeded — the legitimate `tool_result` event never reaches the wire, replaced by `{type: 'error', message: 'Converting circular structure to JSON'}`. The `defineAgentTool` contract (handler returns `string | Promise<string>`) IS safe, but `streamAgentRun` passes through *any* SDK tool's result, including tools defined elsewhere (e.g., MCP tools — out of scope for this plan but possible).
- **Fix sugerido:** In `streamAgentRun`'s `'completed'` branch, coerce non-string results to string defensively:
  ```typescript
  const data = typeof msg.result === 'string'
    ? msg.result
    : safeJsonStringify(msg.result)  // returns `[Unserializable]` on throw
  yield { type: 'tool_result', name: msg.name, data, id: msg.call_id }
  ```
  Add a 5-line `safeJsonStringify` helper next to the adapter. Document in JSDoc that `data` is always a JSON-serializable scalar/string.

### EC-2: `agent.dispose()` in `finally` may THROW and **mask the original SDK error** the SSE was about to deliver

- **Task afetada:** T3.1 (fixture `chat.ts`)
- **Família:** State / Error handling
- **Cenário:** With a fake `ANTHROPIC_API_KEY`, `agent.send(message)` rejects with an auth error. Execution jumps to `finally { await agent.dispose() }`. If `dispose()` throws (uninitialized resources, or an SDK bug under auth-failure path), JavaScript replaces the original auth error with the dispose error. The user sees `"<dispose failure>"` instead of `"auth_failed: invalid Anthropic key"` — actively misleading.
- **Impacto:** Day-one users with bad keys see a confusing error instead of the actionable "set ANTHROPIC_API_KEY" message. This is the exact failure mode the Playwright spec in T4.1 is meant to pin, but the regression test only asserts "some error appears" — it would PASS even with the wrong error message.
- **Fix sugerido:** Wrap dispose in a try/catch that swallows + logs to console.warn:
  ```typescript
  } finally {
    try { await agent.dispose() } catch (e) { console.warn('[chat] agent.dispose() failed:', e) }
  }
  ```
  Two lines. Apply in both `fixtures/template-default/server/routes/chat.ts` AND `packages/create-theo/templates/default/server/routes/chat.ts`. Add a test in T3.1 that grep'd for `try { await agent.dispose()` to enforce.

### EC-3: `msg.args ?? {} as Record<string, unknown>` is an `as` cast violating `.claude/rules/type-safety.md` ("No `as` type assertions")

- **Task afetada:** T2.1 (`streamAgentRun`)
- **Família:** Type safety
- **Cenário:** Plan's algorithm at line 367: `args: (msg.args ?? {}) as Record<string, unknown>`. SDK types `args?: unknown`. A raw `as` cast hides the possibility that `msg.args` is an array, a primitive, or `null` (`null` survives `??`). The contract `AgentToolCallEvent.args: Record<string, unknown>` is lied to.
- **Impacto:** Client UI consuming `AgentEvent.args` may iterate it as object (`Object.entries(args)`) and explode on non-object. Auto-fail of `tsc --strict` lint gates if anyone ever turns on `no-explicit-any-cast`.
- **Fix sugerido:** Type-guard the value:
  ```typescript
  const args = (typeof msg.args === 'object' && msg.args !== null && !Array.isArray(msg.args))
    ? (msg.args as Record<string, unknown>) : {}
  ```
  Three lines. Keeps the `as` only after a runtime guard makes it safe. Or use `Object.fromEntries(Object.entries(msg.args ?? {}))` to coerce, sacrificing one entry for safety.

---

## SHOULD TEST

### EC-4: Interleaved `assistant` text + `tool_call(running)` + `assistant` text + `tool_call(completed)`

- **Task afetada:** T2.1
- **Teste sugerido:** `test_stream_agent_run_preserves_interleaved_assistant_and_tool_lifecycle` — Given a mock Run yielding `[assistant("let me check"), tool_call(running, "current_time"), tool_call(completed, "current_time", "12:00"), assistant("It's noon")]`, When `streamAgentRun` is consumed, Then yields **exactly** 4 events in that order: `message`, `tool_call`, `tool_result`, `message`. This is Anthropic's real wire shape.

### EC-5: Duplicate `tool_call(running)` for the same `call_id` (parallel tool calls or SDK retry)

- **Task afetada:** T2.1
- **Teste sugerido:** `test_stream_agent_run_yields_two_tool_calls_for_same_call_id_without_dedup` — Given two consecutive `tool_call(running, name='x', call_id='c1')` messages, When consumed, Then yields two `tool_call` AgentEvents (no dedup at adapter level; dedup is client's concern via `id`). Pins the no-state contract.

### EC-6: `defineAgentTool` with `name === ''` (empty string, valid Zod string but invalid name regex)

- **Task afetada:** T1.1
- **Teste sugerido:** `test_define_agent_tool_rejects_empty_name` — Given `spec.name === ''`, When `defineAgentTool(spec)` is called, Then throws Error matching `/name must match/`. The existing plan test covers `"invalid name with spaces"` but not empty string; the regex `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` rejects empty, but the test should pin it.

### EC-7: `zod-to-json-schema` with `z.lazy(...)` circular schema → infinite recursion with `$refStrategy: 'none'`

- **Task afetada:** T1.1
- **Teste sugerido:** `test_define_agent_tool_handles_recursive_schema_safely` — Given `const Self: z.ZodType = z.object({ children: z.array(z.lazy(() => Self)) })`, When passed as `inputSchema`, Then either (a) throws a clear error or (b) completes within 1s without hang. If the library hangs, switch `$refStrategy` to `'root'` to break the cycle. Realistic for tree-shaped tool inputs (e.g., a "navigate filesystem" tool).

### EC-8: `streamAgentRun` consumer aborts MID-stream — `run.wait()` is NOT awaited; SDK resources not cleaned up

- **Task afetada:** T2.1
- **Teste sugerido:** `test_stream_agent_run_does_not_await_wait_on_consumer_return` — Given a mock Run with a slow stream, When the consumer calls `generator.return()` after the first yield, Then `run.wait()` is NEVER called (verify via spy). Plan's algorithm awaits `wait()` only AFTER the `for await` completes naturally; consumer abort jumps to the implicit `return` and skips `wait()`. This is the documented behavior (per plan's edge cases line 410), but no test pins it — future refactor could break it silently.

---

## DOCUMENT

### EC-9: `msg.truncated` field dropped silently — consumer cannot tell tool args/result were truncated

- **Risco aceito:** SDK exposes `truncated?: { args?: boolean; result?: boolean }` on `SDKToolUseMessage`. `AgentEvent` has no field to carry this. Adding a 5th AgentEvent variant or a 4th field to `tool_call` is out of scope per ADR D3 ("Tool errors via `error` event"). UX impact: a 4096-byte result might display as the truncated 1024-byte version with no visual indicator. Document in `streamAgentRun` JSDoc: "If `msg.truncated.result === true`, the client will see the partial value as-is without truncation marker."

### EC-10: Empty `description: ''` triggers `console.warn` once per `defineAgentTool` call — beginners may put `defineAgentTool` INSIDE the request handler, flooding logs

- **Risco aceito:** Plan recommends module-level tool definition (T3.1 example places `currentTime` at module top-level). Beginners following docs verbatim will do the right thing. Per-request `defineAgentTool` calls are wasteful but not broken. Document in `defineAgentTool` JSDoc: "Define tools at module top-level. Repeated construction per request is wasteful and may flood console.warn on empty descriptions."

### EC-11: `Date` objects in `tool_result.data` silently coerce to ISO string via `JSON.stringify`

- **Risco aceito:** Already partially addressed by EC-1's `safeJsonStringify`. For Date specifically, the coercion to ISO 8601 is unambiguous and recoverable on the client. Only non-`Date` non-serializable values risk data loss after EC-1's fix. No further mitigation; document expectation: "Tool handlers should return primitive-typed results; complex objects must be JSON-serializable."

### EC-12: `defineAgentTool` does NOT support `z.object({}).strict()` vs `.passthrough()` distinction in the JSON Schema output

- **Risco aceito:** `zod-to-json-schema` emits `additionalProperties: false` for `z.object({})` by default (matches `.strict()` semantics). A user expecting `.passthrough()` would silently see extra keys rejected by the LLM's JSON Schema validator. This matches Anthropic's recommended `strict: true` pattern, so the default is correct, but document: "`defineAgentTool` schemas are converted with `additionalProperties: false`. Use `z.record(...)` patterns if you need arbitrary keys."

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T1.1 (`defineAgentTool`) | 4 | 0 | 2 (EC-6, EC-7) | 2 (EC-10, EC-12) |
| T2.1 (`streamAgentRun`) | 6 | 2 (EC-1, EC-3) | 3 (EC-4, EC-5, EC-8) | 1 (EC-9) |
| T3.1 (fixture chat) | 2 | 1 (EC-2) | 0 | 1 (EC-11) |
| T4.1 (Playwright) | 0 | 0 | 0 | 0 |
| T5.1 (Dogfood) | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE (mínimo).

Os 3 MUST FIX são pequenos:
- EC-1: +5 linhas (safeJsonStringify helper)
- EC-2: +2 linhas (try/catch em finally)
- EC-3: +3 linhas (type guard antes do `as`)

Total: ~10 LOC adicionais. Não viola o objetivo de bundle (+6KB server, +0KB client). Não viola os goals de simplicidade (cada fix é um `if` ou um try). Não introduz novas abstrações (proibido pela skill).

Após aplicar os 3 MUST FIX e adicionar os 5 SHOULD TEST tests, o plano está pronto para implementação. Os 4 DOCUMENT entries viram JSDoc comments — zero code impact.
