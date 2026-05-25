/**
 * Cost tracking types (R0.5.11).
 *
 * @see docs/adr/0002-job-backend-interface-neutral-contract.md (mirror pattern)
 */

export interface UsageRecord {
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
  record(input: UsageRecord): Promise<void>
  getUsage(query: UsageQuery): Promise<UsageResult>
}
