---
"@theokit/agents": minor
---

A usage record can carry the cache split that justifies its cost, and usage can be narrowed by model.

**Two of the item's three claims did not survive measurement, and the correction is the point.**

The survey reported "cost is computed without cache-token accounting, so it is systematically wrong",
on evidence that `cacheCreation`, `cache_read`, `modelUsage` and `total_cost_usd` returned 0 files.
Those are the *wire* spellings. The real field names are `cacheReadTokens` and `cacheWriteTokens`,
carried in five files of this layer — `DoneEvent.usage` has had them since V4-O.

Nothing in this layer *computes* cost either: `costUsd` is supplied by the caller on the record, and
the storage only sums what it is given.

**What was genuinely missing is narrower and still worth closing.** `UsageRecord.tokens` was
`{ input, output }`, so a record stated a cost it could not explain: cached reads are billed at a
fraction of input tokens, and two runs with identical `input` totals and different cache ratios cost
different amounts. The audit trail showed the figure and not the reason. `cacheRead` and `cacheWrite`
are optional and **absent rather than `0`** when a provider does not report — "not reported" and
"reported as zero" are different facts, and defaulting would claim a measurement nobody made.

**The per-model breakdown was absent at the query surface**, not in the data: every record carries
`model`, and `UsageQuery` had no way to ask. It is a query rather than a second shape on
`UsageResult`, because a breakdown returned alongside a total is two numbers that can disagree; one
source asked a different question cannot.

One implementation note worth keeping. The model predicate first carried an explicit
`kind === 'tool'` exclusion, and a mutation proved it dead: `getUsage` already drops tool records
before summing, so inverting the condition left every assertion green. It was removed rather than
kept — a conjunct that cannot change an answer reads as a second condition somebody needed, which is
how a dead branch survives review.
