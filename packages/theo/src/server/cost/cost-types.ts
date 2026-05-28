/**
 * Cost tracking types (R0.5.11).
 *
 * @see docs/adr/0002-job-backend-interface-neutral-contract.md (mirror pattern)
 *
 * Phase 5 — Production-Readiness #4: adds `ToolUsageRecord` for per-tool
 * latency / error tracking via SDK's onToolStart/onToolEnd/onToolError hooks.
 * Same UsageStorageAdapter handles both via discriminated union.
 *
 * EC-9 (SHOULD TEST): backward compat — record() input without `kind` is
 * normalized to 'llm' by the framework so external adapters from older
 * versions keep working.
 */

/**
 * Per-LLM-call cost record (existing — gains optional `kind` discriminator).
 */
export interface UsageRecord {
  /** Discriminator. Optional for backward-compat; defaults to 'llm'. */
  kind?: 'llm'
  /** User identifier (e.g., session userId, tenantId, apiKey hash). */
  userId: string
  /** Model id (e.g., 'claude-sonnet-4-5-20250929'). */
  model: string
  /** Token counts per direction. */
  tokens: { input: number; output: number }
  /** USD cost in fractional dollars. */
  costUsd: number
  /** When the run happened. */
  timestamp: Date
}

/**
 * Per-tool-invocation record (Phase 5 — Production-Readiness #4).
 *
 * Emitted by `trackAgentTools` on every `onToolEnd` / `onToolError`. The same
 * `UsageStorageAdapter.record` accepts both record kinds via union.
 */
export interface ToolUsageRecord {
  kind: 'tool'
  userId: string
  conversationId: string
  toolName: string
  /**
   * Unique per invocation; correlates onToolStart with onToolEnd / onToolError.
   * EC-16 (DOCUMENT): callId uniqueness is SDK contract — if SDK ever reuses
   * a callId, `trackAgentTools`'s Map uses last-write-wins (defensive).
   */
  callId: string
  /** True when the tool handler returned; false when it threw. */
  success: boolean
  /** Milliseconds from onToolStart to onToolEnd / onToolError. */
  durationMs: number
  /** Populated only when success === false. */
  errorMessage?: string
  timestamp: Date
}

export interface UsageQuery {
  userId: string
  period: { from: Date; to: Date }
}

export interface UsageResult {
  totalTokens: number
  totalCostUsd: number
  runs: number
}

export interface UsageStorageAdapter {
  readonly name: string
  /**
   * Record a usage event. Accepts both kinds; framework normalizes input
   * without `kind` to 'llm' before calling adapter (EC-9 backward compat).
   */
  record(input: UsageRecord | ToolUsageRecord): Promise<void>
  getUsage(query: UsageQuery): Promise<UsageResult>
}
