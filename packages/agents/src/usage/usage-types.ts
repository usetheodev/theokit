/**
 * M84 — the runtime-neutral half of cost tracking.
 *
 * ## Why it moved
 *
 * 1 715 LOC of observability and cost lived under `packages/theo/src/server/**`, and `theokit` is
 * the Vite/React web framework. The only real product built on this stack depends on
 * `@theokit/agents`, `@theokit/tui` and `@theokit/presenter`, and never on `theokit` — a grep for
 * `from 'theokit` in it returns zero. So none of it was reachable, and what would have been is
 * HTTP-shaped.
 *
 * What crosses is the vocabulary and the in-memory adapter: a record, a query, a result, and a place
 * to put them. The HTTP wiring (`trackAgentRun`, spans named `http.request`, keying by `requestId`)
 * stays in `theokit`, because that is what it is about.
 *
 * ## `userId` is optional here, and that is the point
 *
 * The HTTP path always has one. A terminal agent has no user — it has a person at a keyboard — and
 * requiring the field forced every terminal product to invent a constant. An invented identifier is
 * worse than an absent one: it looks like data.
 */

/** Per-LLM-call cost record. */
export interface UsageRecord {
  /** Discriminator. Optional for backward compatibility; absent ⇒ `'llm'`. */
  kind?: 'llm'
  /** Who the cost belongs to. Absent for a single-user surface such as a terminal. */
  userId?: string
  /** Model id (`claude-sonnet-4-5-20250929`). */
  model: string
  /**
   * The token split this cost is for.
   *
   * `cacheRead` and `cacheWrite` are OPTIONAL and absent by default. Cached reads are billed at a
   * fraction of input tokens, so two runs with identical `input` totals and different cache ratios
   * cost different amounts — and a record that carried only the totals stated a number it could not
   * explain. The audit trail showed the figure and not the reason.
   *
   * ABSENT, never `0`, when a provider does not report cache usage. "Not reported" and "reported as
   * zero" are different facts, and defaulting would claim a measurement nobody made — the same
   * strictness `RunUsageSnapshot` keeps by returning `undefined` before a provider has spoken.
   *
   * The spellings are this layer's own (`cacheRead`/`cacheWrite`), matching `DoneEvent.usage`'s
   * `cacheReadTokens`/`cacheWriteTokens` rather than the wire's
   * `cache_read_input_tokens`. A survey looking for the wire spellings measured zero here and
   * concluded the concept was absent; it has been carried on the stream since V4-O.
   */
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  /** USD in fractional dollars. */
  costUsd: number
  timestamp: Date
}

/** Per-tool-invocation record. */
export interface ToolUsageRecord {
  kind: 'tool'
  userId?: string
  conversationId: string
  toolName: string
  /** Unique per invocation; correlates start with end/error. */
  callId: string
  success: boolean
  durationMs: number
  /** Populated only when `success === false`. */
  errorMessage?: string
  timestamp: Date
}

export interface UsageQuery {
  /** Omitted ⇒ every record, which is what a single-user surface wants. */
  userId?: string
  period?: { from: Date; to: Date }
  /**
   * Narrow to one model — what a per-model cost breakdown is.
   *
   * It is a QUERY rather than a second shape on {@link UsageResult}, because a breakdown returned
   * alongside a total is two numbers that can disagree. One source, asked a different question,
   * cannot.
   *
   * A TOOL record has no model and is already excluded from the LLM totals; narrowing by model
   * cannot resurrect one.
   */
  model?: string
}

export interface UsageResult {
  totalTokens: number
  totalCostUsd: number
  runs: number
}

/** Where usage goes. The framework owns the vocabulary; the app owns the storage. */
export interface UsageStorageAdapter {
  readonly name: string
  record(input: UsageRecord | ToolUsageRecord): Promise<void>
  getUsage(query: UsageQuery): Promise<UsageResult>
}
