# Cost tracking

Server-side per-user agent usage accumulation for tier enforcement, billing, or dashboards. Companion to the client-side `<CostMeter>` from `@usetheo/ui`.

## API surface

```ts
import { trackAgentRun, InMemoryUsageStorage } from 'theokit/server'

const usageStorage = new InMemoryUsageStorage()

// After an Agent.prompt call:
await trackAgentRun(
  {
    userId: 'u1',
    model: 'claude-sonnet-4-5-20250929',
    tokens: { input: 1500, output: 800 },
    costUsd: 0.0042,
  },
  { storage: usageStorage },
)

// Query for tier enforcement:
const usage = await usageStorage.getUsage({
  userId: 'u1',
  period: {
    from: new Date(Date.now() - 30 * 86_400_000),
    to: new Date(),
  },
})
// → { totalTokens: 12450, totalCostUsd: 0.0285, runs: 23 }
```

## UsageStorageAdapter contract

```ts
interface UsageStorageAdapter {
  readonly name: string
  record(input: UsageRecord): Promise<void>
  getUsage(query: UsageQuery): Promise<UsageResult>
}
```

`InMemoryUsageStorage` ships in core. Production deployments swap for a durable adapter (recipes for Postgres + Redis land in R0.6.7).

## Error semantics

> **EC-14**: `trackAgentRun` NEVER bubbles errors back to the caller. Adapter failures (network outage, DB down) log via `console.warn` and are swallowed.
>
> Rationale: cost tracking is a side-channel concern. The agent response MUST NOT fail because tracking is degraded.

## Integration with defineAgentEndpoint

Wire `trackAgentRun` into your chat route after the `Agent.prompt` call:

```ts
import { defineAgentEndpoint, trackAgentRun } from 'theokit/server'
import { usageStorage } from '../lib/usage-tracking.js'

export const POST = defineAgentEndpoint({
  async *handler({ body, request }) {
    const userId = await resolveUserId(request)
    const result = await Agent.prompt(body.message, { ... })

    await trackAgentRun(
      {
        userId,
        model: 'claude-sonnet-4-5',
        tokens: result.usage,
        costUsd: result.costUsd,
      },
      { storage: usageStorage },
    )

    yield { type: 'message', content: result.result }
  },
})
```

## Production storage

> **EC-114 — `InMemoryUsageStorage` is UNBOUNDED.**
>
> The in-memory adapter accumulates records indefinitely. Acceptable for dev, tests, and demos. In production:
>
> 1. Swap for a Postgres or Redis adapter (recipes in R0.6.7, post-0.6.0)
> 2. Until then, use the in-memory adapter only for ephemeral environments
>
> Symptoms of unbounded growth: increasing process RSS over time; eventual OOM. Single-process apps hosting millions of agent runs WILL hit this.

## Tier enforcement pattern

```ts
import { defineMiddleware, trackAgentRun } from 'theokit/server'
import { usageStorage } from '../lib/usage-tracking.js'

export default defineMiddleware(async ({ request, ctx, next }) => {
  const userId = await resolveUserId(request)
  const usage = await usageStorage.getUsage({
    userId,
    period: { from: startOfMonth(), to: new Date() },
  })
  const limit = getTierLimit(ctx.user.tier)
  if (usage.totalCostUsd > limit) {
    return new Response('Monthly limit exceeded', { status: 429 })
  }
  return next()
})
```

## When this fails

| Symptom | Cause | Fix |
|---|---|---|
| Tier enforcement allows over-limit usage | Adapter returns stale data | Confirm `getUsage` query period is correct |
| Process RSS grows linearly | InMemory adapter accumulating | Swap to durable adapter (R0.6.7 recipes) |
| Tracking calls silently fail | Adapter throw being swallowed (EC-14) | Check `console.warn` logs |

## See also

- [`<CostMeter>`](https://npmjs.com/package/@usetheo/ui) — client-side companion
- R0.5.11 (this primitive), R0.6.7 (durable storage recipes)
