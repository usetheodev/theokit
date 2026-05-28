import type { StorageAdapter } from '../storage/storage-types.js'

import type {
  ToolUsageRecord,
  UsageQuery,
  UsageRecord,
  UsageResult,
  UsageStorageAdapter,
} from './cost-types.js'

/**
 * In-memory usage storage for dev/tests. Unbounded — production
 * deployments MUST plug in a durable adapter (Postgres/Redis recipes
 * land with R0.6.7; documented in EC-114).
 *
 * Phase 5 — Production-Readiness #4: accepts both `UsageRecord` (LLM call,
 * kind='llm' or omitted) AND `ToolUsageRecord` (tool call, kind='tool').
 * `getUsage` only sums LLM records (tools have no token/cost dimension).
 *
 * EC-9 (backward compat): input without `kind` is normalized to `kind:'llm'`
 * — adapters from older versions stay working.
 *
 * Concurrency: Node's single-threaded event loop guarantees that
 * `Array.push` is atomic, so concurrent record() calls cannot lose data.
 */
export class InMemoryUsageStorage implements UsageStorageAdapter, StorageAdapter {
  readonly name = 'memory'
  readonly #records: (UsageRecord | ToolUsageRecord)[] = []

  /**
   * T2.3 — `StorageAdapter` lifecycle hook (ADR-0007 D6). In-memory storage
   * has no real cleanup to perform — this is intentionally a noop so the
   * adapter can be registered with `StorageManager.register()` and
   * participate in graceful shutdown without changing behavior.
   *
   * Does NOT clear stored records (dispose ≠ reset). For test reset use
   * a fresh instance.
   */
  dispose(): Promise<void> {
    // Intentional noop — see jsdoc above
    return Promise.resolve()
  }

  async record(input: UsageRecord | ToolUsageRecord): Promise<void> {
    // EC-9: normalize legacy input (no `kind` field) to kind:'llm'.
    const normalized: UsageRecord | ToolUsageRecord =
      'kind' in input && input.kind === 'tool'
        ? { ...input }
        : ({ ...input, kind: 'llm' as const } satisfies UsageRecord)
    this.#records.push(normalized)
    return Promise.resolve()
  }

  async getUsage(query: UsageQuery): Promise<UsageResult> {
    const from = query.period.from.getTime()
    const to = query.period.to.getTime()
    let totalTokens = 0
    let totalCostUsd = 0
    let runs = 0
    for (const r of this.#records) {
      if (r.kind === 'tool') continue
      if (r.userId !== query.userId) continue
      const t = r.timestamp.getTime()
      if (t < from || t > to) continue
      totalTokens += r.tokens.input + r.tokens.output
      totalCostUsd += r.costUsd
      runs += 1
    }
    return Promise.resolve({ totalTokens, totalCostUsd, runs })
  }

  /** @internal — test helper to inspect raw record stream */
  __getRecords(): readonly (UsageRecord | ToolUsageRecord)[] {
    return this.#records
  }
}
