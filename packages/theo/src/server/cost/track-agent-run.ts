import type { UsageRecord, UsageStorageAdapter } from './cost-types.js'

export interface TrackAgentRunInput {
  userId: string
  model: string
  tokens: { input: number; output: number }
  costUsd: number
  /** Defaults to `new Date()`. */
  timestamp?: Date
  /** Optional execution status surfaced to devtools (default 'finished'). */
  status?: 'finished' | 'error' | 'aborted'
}

export interface TrackAgentRunOptions {
  /** Adapter resolved from `theo.config.ts > cost.storage`. */
  storage: UsageStorageAdapter | undefined
}

// v1.1 EC-4 MUST FIX — universal dev gate (Vite OR tsup-bundled).
// Both checks are statically replaceable by bundlers in prod build,
// so the entire dispatcher import is tree-shaken from the prod bundle.
const __IS_DEV = (() => {
  try {
    return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true
  } catch {
    return process.env.NODE_ENV !== 'production'
  }
})()

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
 * In dev mode (Vite OR tsup-built with NODE_ENV != 'production'), fires a
 * `theokit-evolution-ci-and-dx` Phase 3 dispatcher event so the devtools
 * Agents tab can render the run. Prod tree-shakes the entire dispatcher
 * import via the `__IS_DEV` IIFE guard.
 *
 * @see docs/concepts/cost-tracking.md (when implemented in T6.3)
 */
export async function trackAgentRun(
  input: TrackAgentRunInput,
  opts: TrackAgentRunOptions,
): Promise<void> {
  // Dev-only: surface run to devtools Agents tab (T3.1)
  if (__IS_DEV) {
    try {
      const mod = (await import('../../devtools/dispatcher.js')) as {
        dispatcher: { onAgentRun: (r: import('../../devtools/shared.js').AgentRunRecord) => void }
      }
      mod.dispatcher.onAgentRun({
        // eslint-disable-next-line sonarjs/pseudo-random -- non-secret correlation id
        id: `run-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: (input.timestamp ?? new Date()).getTime(),
        userId: input.userId,
        model: input.model,
        tokensInput: input.tokens.input,
        tokensOutput: input.tokens.output,
        costUsd: input.costUsd,
        status: input.status ?? 'finished',
      })
    } catch {
      // devtools dispatcher missing in some prod-like bundle — silently skip
    }
  }

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
