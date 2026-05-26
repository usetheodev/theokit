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

/**
 * Discriminated union for AgentRunError codes (Phase 1 — Production-Readiness #3).
 *
 * Mirrors `@usetheo/sdk`'s `AgentRunErrorCode` without hard-importing the SDK
 * type (D2 decoupling). EC-7 forward-compat: `(string & {})` fallback preserves
 * autocompletion for the known codes while accepting future codes the SDK may
 * introduce — autocomplete works AND TS doesn't reject unknown codes.
 */
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

/**
 * Error event emitted via SSE.
 *
 * Phase 1 — Production-Readiness #3:
 *   New optional fields `code/provider/retriable/retryAfterMs` discriminate
 *   error classes for client-side handling (auth → sign-in CTA; rate_limit →
 *   countdown; quota_exceeded → upsell; etc.).
 *
 * Backward compat (D4): all new fields are optional. Existing clients that
 * read only `event.message` keep working unchanged. New clients can safely
 * `switch (event.code)` — `undefined` (legacy server) is a valid case.
 *
 * EC-15 (DOCUMENT): `message` is *trusted* to not contain secrets. SDK's
 * `AgentRunError.message` is propagated verbatim. The SDK's `providerError`
 * is NEVER serialized into this event — quarantined to prevent leakage.
 */
export interface AgentErrorEvent {
  type: 'error'
  message: string
  id?: string
  /** Discriminated error class — see AgentRunErrorCode. */
  code?: AgentRunErrorCode
  /** Provider id (e.g., 'openai', 'anthropic', 'openrouter'). */
  provider?: string
  /** Whether the SAME request can be retried as-is. */
  retriable?: boolean
  /** Hint from provider's Retry-After header (milliseconds). Zero is valid (immediate retry). */
  retryAfterMs?: number
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
