import type {
  ToolUsageRecord,
  UsageQuery,
  UsageRecord,
  UsageResult,
  UsageStorageAdapter,
} from './usage-types.js'

/**
 * M84 — usage in memory.
 *
 * Deliberately does NOT implement `theokit`'s `StorageAdapter`: that is a lifecycle contract of the
 * web framework, and requiring it here is exactly the coupling that made cost tracking unreachable
 * from a terminal product. The `theokit` side extends this one and adds the lifecycle.
 *
 * Concurrency: Node's event loop makes `Array.push` atomic, so concurrent `record()` calls cannot
 * lose data. This is single-process by construction — a multi-instance deploy supplies its own
 * adapter, which is what the interface is for.
 */
export class InMemoryUsageStorage implements UsageStorageAdapter {
  readonly name = 'memory'
  readonly #records: (UsageRecord | ToolUsageRecord)[] = []

  record(input: UsageRecord | ToolUsageRecord): Promise<void> {
    // Normalise legacy input with no `kind` to `'llm'` so adapters written before the discriminator
    // keep working.
    const normalised: UsageRecord | ToolUsageRecord =
      'kind' in input && input.kind === 'tool' ? { ...input } : { ...input, kind: 'llm' as const }
    this.#records.push(normalised)
    return Promise.resolve()
  }

  getUsage(query: UsageQuery = {}): Promise<UsageResult> {
    const matching = this.#records.filter((record) => matches(record, query))
    const llm = matching.filter((record): record is UsageRecord => record.kind !== 'tool')
    return Promise.resolve({
      totalTokens: llm.reduce((sum, r) => sum + r.tokens.input + r.tokens.output, 0),
      totalCostUsd: llm.reduce((sum, r) => sum + r.costUsd, 0),
      runs: llm.length,
    })
  }

  /**
   * The most recent LLM record, or `undefined`.
   *
   * The question a terminal asks after every turn — "what did that cost?" — and the reason a
   * consumer wrote a ten-line file to answer it. Tool records are excluded: a tool invocation has no
   * token cost of its own, and returning one here would make the footer show zero after every tool.
   */
  latestUsage(): UsageRecord | undefined {
    for (let i = this.#records.length - 1; i >= 0; i -= 1) {
      const record = this.#records[i]
      if (record.kind !== 'tool') return record
    }
    return undefined
  }
}

function matches(record: UsageRecord | ToolUsageRecord, query: UsageQuery): boolean {
  // An omitted `userId` matches everything: a single-user surface has no id to filter by, and
  // requiring one is what forced terminal products to invent a constant.
  if (query.userId !== undefined && record.userId !== query.userId) return false
  // A tool record has no model, and `getUsage` already drops it before summing (`kind !== 'tool'`),
  // so testing for it HERE cannot change any answer. The first version did test for it and a
  // mutation proved the branch dead: inverting the condition left every assertion green. A conjunct
  // that cannot change an answer reads as a second condition somebody needed, which is how a dead
  // branch survives review — the same note `guardrails/stream.ts` carries about its own.
  if (query.model !== undefined && record.kind !== 'tool' && record.model !== query.model) {
    return false
  }
  if (query.period === undefined) return true
  return record.timestamp >= query.period.from && record.timestamp <= query.period.to
}
