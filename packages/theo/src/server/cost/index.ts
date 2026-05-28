/**
 * server/cost — Cost tracking primitives (Phase 5, R0.5.11).
 *
 * T4.4 (architecture-cleanup) — sub-barrel entrypoint. Consumers may import
 * from `theokit/server/cost` directly via package.json subpath exports.
 *
 * Backwards compat: `theokit/server` still re-exports these symbols via
 * its top-level barrel (deprecated path; remove in 1.0).
 */

export { trackAgentRun } from './track-agent-run.js'
export type { TrackAgentRunInput, TrackAgentRunOptions } from './track-agent-run.js'

export type {
  UsageRecord,
  ToolUsageRecord,
  UsageQuery,
  UsageResult,
  UsageStorageAdapter,
} from './cost-types.js'

export { InMemoryUsageStorage } from './usage-storage-memory.js'

export { trackAgentTools } from './track-agent-tools.js'
export type {
  TrackAgentToolsOptions,
  TrackAgentToolsHooks,
  ToolHookEvent,
} from './track-agent-tools.js'
