import type { UsageRecord, UsageStorageAdapter } from './cost-types.js'

export interface TrackAgentRunInput {
  userId: string
  model: string
  tokens: { input: number; output: number }
  costUsd: number
  /** Defaults to `new Date()`. */
  timestamp?: Date
}

export interface TrackAgentRunOptions {
  /** Adapter resolved from `theo.config.ts > cost.storage`. */
  storage: UsageStorageAdapter | undefined
}

/**
 * Record a single agent run's usage + cost. Companion to the client-side
 * `<CostMeter>` from `@usetheo/ui`.
 *
 * EC-14: this function NEVER bubbles errors back to the caller. Adapter
 * failures (network outage, DB down, etc.) are logged via `console.warn`
 * and swallowed. The agent response MUST NOT fail because cost tracking
 * is degraded.
 *
 * No-op when `storage` is undefined (cost tracking unconfigured).
 *
 * @see docs/concepts/cost-tracking.md (when implemented in T6.3)
 */
export async function trackAgentRun(
  input: TrackAgentRunInput,
  opts: TrackAgentRunOptions,
): Promise<void> {
  if (!opts.storage) return
  const record: UsageRecord = {
    userId: input.userId,
    model: input.model,
    tokens: input.tokens,
    costUsd: input.costUsd,
    timestamp: input.timestamp ?? new Date(),
  }
  try {
    await opts.storage.record(record)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    console.warn(
      `[theokit:cost] usage storage record failed: ${message}. ` +
        '(Response is unaffected — cost tracking degraded.)',
    )
  }
}
