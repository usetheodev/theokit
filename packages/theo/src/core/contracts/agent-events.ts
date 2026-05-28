/**
 * core/contracts/agent-events.ts
 *
 * Canonical home for the AgentEvent wire-format contract (T2.2 of
 * architecture-cleanup plan; ADR-0001 v3 invariant #3 exception).
 *
 * Server emits via SSE; client consumes. Discriminated union by `type`.
 * Both `server/agent/*` and `client/*` import from here.
 *
 * Per ADR-0001 v3: `cache → core/contracts`, `client → core/contracts`,
 * `devtools → core/contracts` are LEGAL direct imports (this is the
 * documented exception to the `no-cross-module-deep-import` rule).
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
