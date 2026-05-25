import type { UsageQuery, UsageRecord, UsageResult, UsageStorageAdapter } from './cost-types.js'

/**
 * In-memory usage storage for dev/tests. Unbounded — production
 * deployments MUST plug in a durable adapter (Postgres/Redis recipes
 * land with R0.6.7; documented in EC-114).
 *
 * Concurrency: Node's single-threaded event loop guarantees that
 * `Array.push` is atomic, so concurrent record() calls cannot lose data.
 */
export class InMemoryUsageStorage implements UsageStorageAdapter {
  readonly name = 'memory'
  readonly #records: UsageRecord[] = []

  async record(input: UsageRecord): Promise<void> {
    this.#records.push({ ...input })
    return Promise.resolve()
  }

  async getUsage(query: UsageQuery): Promise<UsageResult> {
    const from = query.period.from.getTime()
    const to = query.period.to.getTime()
    let totalTokens = 0
    let totalCostUsd = 0
    let runs = 0
    for (const r of this.#records) {
      if (r.userId !== query.userId) continue
      const t = r.timestamp.getTime()
      if (t < from || t > to) continue
      totalTokens += r.tokens.input + r.tokens.output
      totalCostUsd += r.costUsd
      runs += 1
    }
    return Promise.resolve({ totalTokens, totalCostUsd, runs })
  }
}
