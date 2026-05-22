import type { AgentEvent } from './agent-types.js'

/**
 * Item #4 — `streamAgentRun`
 *
 * Adapter that consumes the `@usetheo/sdk` `Run.stream()` async generator
 * (SDKMessage variants) and yields TheoKit `AgentEvent`s suitable for SSE
 * via `defineAgentEndpoint`. One line at the consumer side:
 *
 *   ```ts
 *   const run = await agent.send(message)
 *   yield* streamAgentRun(run)
 *   ```
 *
 * Mapping table (SDK → AgentEvent):
 *
 * | SDK message                          | AgentEvent yielded                     |
 * |---|---|
 * | assistant.content[].type==='text'    | { type: 'message', content }           |
 * | assistant.content[].type==='tool_use'| (none — covered by tool_call below)    |
 * | tool_call(status='running')          | { type: 'tool_call', name, args, id }  |
 * | tool_call(status='completed')        | { type: 'tool_result', name, data, id }|
 * | tool_call(status='error')            | { type: 'error', message, id }         |
 * | run.wait() status==='error'          | { type: 'error', message }             |
 * | run.wait() status==='cancelled'      | (none — cancel ≠ error)                |
 * | system / user / thinking / status /  | (none — internal SDK telemetry)        |
 * |   task / request / object_delta      |                                        |
 *
 * Abort semantics: when the consumer calls `generator.return()` on the
 * outer `defineAgentEndpoint` generator, `streamAgentRun` exits the
 * `for await` loop and does NOT call `run.wait()`. Cleanup of in-flight
 * SDK resources is the SDK consumer's responsibility (`run.cancel()`).
 */

/**
 * Local mirror of the SDK's `Run` interface — only the surfaces we consume.
 * The message contract is minimal (just `{ type: string }`) so the SDK's
 * `SDKMessage` discriminated union IS structurally assignable without any
 * cast at the consumer site (covariant — TS accepts the SDK's typed message
 * as the wider `{ type: string }`). Property access inside `streamAgentRun`
 * narrows via runtime type guards.
 *
 * `import type` from `@usetheo/sdk` would couple TheoKit to the SDK at type-
 * resolution time even for consumers who never use the agent surface.
 */
export interface AgentRunLike {
  stream: () => AsyncIterable<{ type: string }>
  wait: () => Promise<AgentRunResult>
}

/**
 * Re-exported as a convenience for test fixtures. Production code typically
 * passes an SDK `Run` directly (structural match via `{ type: string }`).
 */
export type AgentRunStreamMessage =
  | {
      type: 'assistant'
      message: { role: 'assistant'; content: { type: string; text?: string }[] }
    }
  | {
      type: 'tool_call'
      name: string
      status: 'running' | 'completed' | 'error'
      args?: unknown
      result?: unknown
      call_id: string
    }
  | { type: string; [k: string]: unknown }

/** Subset of the SDK `RunResult` we consume. */
export interface AgentRunResult {
  status: 'finished' | 'error' | 'cancelled'
  error?: { message: string; code?: string; cause?: unknown }
}

/**
 * EC-1 (edge case review): tool result may be a Date, bigint, circular ref,
 * etc. `JSON.stringify` in `encodeSSE` would throw — uncaught inside the
 * outer generator — and `defineAgentEndpoint` would replace the legitimate
 * `tool_result` with a generic `error`. Coerce here so the wire stays honest.
 */
function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[Unserializable]'
  }
}

/**
 * EC-3 (edge case review): SDK types `args?: unknown`. A raw `as` cast hides
 * the possibility that `msg.args` is an array, primitive, or `null` (null
 * survives `??`). Type-guard BEFORE narrowing to `Record<string, unknown>`.
 */
function safeArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  return {}
}

/**
 * Yield AgentEvents derived from the SDK Run lifecycle.
 *
 * Consumer pattern:
 *
 *   ```ts
 *   export const POST = defineAgentEndpoint({
 *     async *handler({ body }) {
 *       const agent = await Agent.create({ apiKey, model, tools: [...] })
 *       try {
 *         const run = await agent.send(body.message)
 *         yield* streamAgentRun(run)
 *       } finally {
 *         try { await agent.dispose() } catch (e) { console.warn(e) }
 *       }
 *     },
 *   })
 *   ```
 *
 * @public
 */
interface AssistantLike {
  type: 'assistant'
  message: { role: 'assistant'; content: { type: string; text?: string }[] }
}
interface ToolCallLike {
  type: 'tool_call'
  name: string
  status: 'running' | 'completed' | 'error'
  args?: unknown
  result?: unknown
  call_id: string
}

function isAssistant(msg: { type: string }): msg is AssistantLike {
  // Wide cast to `unknown` first so runtime null guard survives ESLint
  // narrowing complaints — the SDK contract permits `null` even when its
  // TS type does not.
  const m = msg as unknown as {
    type: string
    message?: { content?: unknown } | null
  }
  return (
    m.type === 'assistant' &&
    m.message != null &&
    typeof m.message === 'object' &&
    Array.isArray(m.message.content)
  )
}
function isToolCall(msg: { type: string }): msg is ToolCallLike {
  const t = msg as unknown as {
    type: string
    name?: unknown
    status?: unknown
    call_id?: unknown
  }
  return (
    t.type === 'tool_call' &&
    typeof t.name === 'string' &&
    typeof t.call_id === 'string' &&
    (t.status === 'running' || t.status === 'completed' || t.status === 'error')
  )
}

function yieldFromToolCall(msg: ToolCallLike): AgentEvent {
  if (msg.status === 'running') {
    return {
      type: 'tool_call',
      name: msg.name,
      args: safeArgs(msg.args),
      id: msg.call_id,
    }
  }
  if (msg.status === 'completed') {
    const data = typeof msg.result === 'string' ? msg.result : safeJsonStringify(msg.result)
    return {
      type: 'tool_result',
      name: msg.name,
      data,
      id: msg.call_id,
    }
  }
  // status === 'error' — exhaustive by type
  const message = typeof msg.result === 'string' ? msg.result : `Tool ${msg.name} failed`
  return { type: 'error', message, id: msg.call_id }
}

export async function* streamAgentRun(
  run: AgentRunLike,
): AsyncGenerator<AgentEvent, void, unknown> {
  for await (const msg of run.stream()) {
    if (isAssistant(msg)) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
          yield { type: 'message', content: block.text }
        }
      }
    } else if (isToolCall(msg)) {
      yield yieldFromToolCall(msg)
    }
    // SDK-internal variants (system, user, thinking, status, task,
    // request, object_delta) are intentionally not yielded.
  }

  const result = await run.wait()
  if (result.status === 'error' && result.error !== undefined) {
    yield { type: 'error', message: result.error.message }
  }
}
