import type { AgentEvent, AgentErrorEvent } from './agent-types.js'

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

/**
 * Phase 4 — Production-Readiness #3: structural mirror of SDK's AgentRunError.
 *
 * EC-6 (SHOULD TEST): we only require `code: string` to discriminate.
 * Provider, retriable, retryAfterMs, requestId are all optional — SDK error
 * paths may omit them (e.g., aborted before request, tool runtime error).
 */
interface AgentRunErrorLike {
  message: string
  code: string
  provider?: string
  retriable?: boolean
  retryAfterMs?: number
  requestId?: string
  /**
   * EC-15 (DOCUMENT) + invariant: `providerError` is QUARANTINED. We read it
   * for type-narrowing but NEVER serialize into the AgentEvent — leaking the
   * raw provider response could leak API keys, internal endpoints, or PII.
   * Only sanitized fields above flow to the SSE wire. `error.message` is
   * trusted to not contain secrets (SDK's responsibility per the v1.1.0
   * release contract).
   */
  providerError?: unknown
}

/**
 * EC-6 (SHOULD TEST): minimal type guard — only requires `code: string`.
 * Does NOT require `'provider' in err` because the SDK throws AgentRunErrors
 * without `provider` in local error paths (timeout, tool runtime error,
 * aborted-before-call).
 */
function isAgentRunError(err: unknown): err is AgentRunErrorLike {
  if (!(err instanceof Error)) return false
  const e = err as { code?: unknown }
  return 'code' in e && typeof e.code === 'string'
}

/**
 * Map an SDK error to the AgentErrorEvent shape. Pure function — easy to test.
 *
 * Backward compat (D4): non-AgentRunError throws yield only `message` field
 * (legacy shape); discriminated fields stay `undefined`.
 *
 * Return type is the specific `AgentErrorEvent` (not the union) for ergonomic
 * call-site access — `errorToEvent(err).code` works without narrowing.
 */
export function errorToEvent(err: unknown, id?: string): AgentErrorEvent {
  if (isAgentRunError(err)) {
    const event: AgentErrorEvent = {
      type: 'error',
      message: err.message,
      code: err.code,
    }
    if (err.provider !== undefined) event.provider = err.provider
    if (err.retriable !== undefined) event.retriable = err.retriable
    if (err.retryAfterMs !== undefined) event.retryAfterMs = err.retryAfterMs
    if (id !== undefined) event.id = id
    return event
  }
  // Fallback for non-AgentRunError throws (plain Error, string, plain object with message)
  let message: string
  if (err instanceof Error) {
    message = err.message
  } else if (typeof err === 'string') {
    message = err
  } else if (err !== null && typeof err === 'object' && 'message' in err) {
    const candidate: unknown = (err as Record<string, unknown>).message
    // Plain object with `message: string` — common for SDK status:error payloads
    message = typeof candidate === 'string' ? candidate : '[object Object]'
  } else if (err === null || err === undefined) {
    message = String(err)
  } else {
    message = '[non-stringifiable error]'
  }
  const event: AgentErrorEvent = { type: 'error', message }
  if (id !== undefined) event.id = id
  return event
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
    yield errorToEvent(result.error)
  }
}
