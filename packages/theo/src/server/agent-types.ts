/**
 * T1.1 — Agent runtime event variant.
 *
 * Defines the wire-format that `defineAgentEndpoint` emits via SSE and
 * `useAgentStream` consumes on the client. Discriminated union by `type`.
 *
 * This type lives in TheoKit (not TheoUI) because it describes the runtime
 * contract between server and client. TheoUI has its own visual `AgentEvent`
 * (timeline row interface) — consumer code maps runtime variant → visual row
 * when rendering. No cross-package type coupling.
 */

export interface AgentMessageEvent {
  type: 'message'
  content: string
  /** Optional id for client-side dedup / animation keys. */
  id?: string
}

export interface AgentToolCallEvent {
  type: 'tool_call'
  name: string
  args: Record<string, unknown>
  id?: string
}

export interface AgentToolResultEvent {
  type: 'tool_result'
  name: string
  data: unknown
  id?: string
}

export interface AgentErrorEvent {
  type: 'error'
  message: string
  id?: string
}

/**
 * Runtime AgentEvent — discriminated union of the 4 variants emitted by
 * agent endpoints. Server produces; client consumes.
 */
export type AgentEvent =
  | AgentMessageEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentErrorEvent
