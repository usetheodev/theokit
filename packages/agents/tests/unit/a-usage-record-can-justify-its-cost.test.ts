import { describe, expect, it } from 'vitest'

import { InMemoryUsageStorage } from '../../src/usage/in-memory-usage.js'
import type { UsageRecord } from '../../src/usage/usage-types.js'

/**
 * A usage record could state a cost and not the cache split that justifies it.
 *
 * `UsageRecord.tokens` was `{ input, output }`. Cached reads are billed at a fraction of input
 * tokens, so two runs with identical `input` totals and different cache ratios cost different
 * amounts — and the record could not say which was which. The audit trail showed the number and not
 * the reason.
 *
 * ## What the survey got wrong, corrected by measurement
 *
 * The item this closes said "cost is computed without cache-token accounting, so it is
 * systematically wrong", on evidence that `cacheCreation`, `cache_read`, `modelUsage` and
 * `total_cost_usd` returned 0 files. Those are the SPEC's spellings. The real field names are
 * `cacheReadTokens` and `cacheWriteTokens`, and they are carried in FIVE files of this layer — the
 * stream's `DoneEvent.usage` has had them since V4-O.
 *
 * Nothing in this layer COMPUTES cost either: `costUsd` is supplied by the caller on the record, and
 * `InMemoryUsageStore` only sums what it is given. So the claim was wrong twice, and the real gap is
 * narrower and still worth closing.
 */
const BASE: UsageRecord = {
  model: 'claude-sonnet-4-5',
  tokens: { input: 1000, output: 200 },
  costUsd: 0.004,
  timestamp: new Date(0),
}

describe('a usage record can justify its cost', () => {
  it('carries the cache split beside the totals', () => {
    const record: UsageRecord = {
      ...BASE,
      tokens: { input: 1000, output: 200, cacheRead: 900, cacheWrite: 50 },
    }
    expect(record.tokens.cacheRead, 'the record states a cost it cannot explain').toBe(900)
    expect(record.tokens.cacheWrite).toBe(50)
  })

  it('still accepts a record that reports no cache at all', () => {
    // The control, and the strictness the item asks to keep: a provider that does not report cache
    // is different from one that reports zero, and an absent field says so. Defaulting to `0` would
    // claim a measurement nobody made.
    expect(BASE.tokens.cacheRead).toBeUndefined()
  })

  it('sums cost across records without needing the cache split', async () => {
    // The second control. The split is for AUDIT; the totals keep working for a caller that does not
    // supply it, so this is additive rather than a new requirement.
    const store = new InMemoryUsageStorage()
    await store.record(BASE)
    await store.record({ ...BASE, costUsd: 0.006 })
    expect((await store.getUsage()).totalCostUsd).toBeCloseTo(0.01, 6)
  })

  it('does not let a model query resurrect a tool record', async () => {
    // A tool invocation has no model and no token cost of its own. The exclusion happens in
    // `getUsage`, which drops `kind === 'tool'` before summing — NOT in the model predicate, where a
    // mutation proved the equivalent check dead. This test pins the OUTCOME (a narrowing never
    // widens) rather than the mechanism, which is why it survives that simplification.
    const store = new InMemoryUsageStorage()
    await store.record(BASE)
    await store.record({
      kind: 'tool',
      conversationId: 'c',
      toolName: 'shell',
      callId: '1',
      success: true,
      timestamp: new Date(0),
    } as never)

    const narrowed = await store.getUsage({ model: 'claude-sonnet-4-5' })
    const all = await store.getUsage()
    expect(narrowed.runs).toBe(1)
    expect(narrowed.runs).toBeLessThanOrEqual(all.runs)
  })

  it('groups by model, which is what a per-model breakdown is', async () => {
    // The item asks for a per-model breakdown or a statement of its absence. It is not absent: every
    // record carries `model`, so the breakdown is a grouping over the records rather than a second
    // shape that could disagree with them — one source, asked a different question.
    const store = new InMemoryUsageStorage()
    await store.record(BASE)
    await store.record({ ...BASE, model: 'gpt-5.4', costUsd: 0.002 })
    expect((await store.getUsage({ model: 'gpt-5.4' })).totalCostUsd).toBeCloseTo(0.002, 6)
    expect((await store.getUsage({ model: 'claude-sonnet-4-5' })).totalCostUsd).toBeCloseTo(
      0.004,
      6,
    )
  })
})
