# Jobs

Background work for TheoKit agent apps. One file per job in `server/jobs/`. Enqueue from routes via `ctx.queue.enqueue`.

## API surface

```ts
// server/jobs/process-document.ts
import { defineJob } from 'theokit/server'
import { z } from 'zod'

export default defineJob('process-document', {
  input: z.object({ documentId: z.string() }),
  maxAttempts: 3,
  async handler({ input, traceId, attempt }) {
    // ... work
  },
})
```

```ts
// server/routes/upload.ts
export const POST = defineRoute({
  body: z.object({ documentId: z.string() }),
  handler({ body, ctx }) {
    ctx.queue.enqueue('process-document', { documentId: body.documentId })
    return { accepted: true }
  },
})
```

## TypeScript JobRegistry setup

> **EC-110**: Without explicit module augmentation, `ctx.queue.enqueue('process-document', ...)` errors with `Type 'process-document' is not assignable to type 'never'`. This is the canonical TheoKit jobs onboarding bug.

You MUST extend `JobRegistry` in your project (one-time setup):

```ts
// types/jobs.d.ts (or anywhere your tsconfig picks up)
declare module 'theokit/server' {
  interface JobRegistry {
    'process-document': { documentId: string }
    'send-email': { to: string; subject: string; body: string }
    'cleanup-stale-rows': { initiatedBy: 'cron' | 'admin'; traceparent?: string }
  }
}
```

Once augmented, `ctx.queue.enqueue` gets full type inference on `input`.

## Pluggable backends (ADR-0002)

Ship in core:

- `InMemoryJobBackend` — dev + tests + single-instance prototypes. ZERO external deps.
- `PostgresJobBackend` — production self-host. Uses `SELECT FOR UPDATE SKIP LOCKED` for concurrent worker safety. Requires `pg` peer dep.

```ts
// theo.config.ts
import { defineConfig } from 'theokit'
import { PostgresJobBackend } from 'theokit/server'
import { Pool } from 'pg'

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 5000, // EC-108 — bounded pool wait
})

export default defineConfig({
  jobs: {
    backend: new PostgresJobBackend({ pool: pgPool }),
  },
})
```

Third-party backends (`@theokit/jobs-redis`, `@theokit/jobs-sqs`, future theo PaaS) implement the same `JobBackend` interface.

## Transactional outbox (ADR-0003)

`ctx.queue.enqueue` returns `void` — it BUFFERS jobs in a per-request outbox. Jobs dispatch to the backend ONLY AFTER the response commits (`res.on('finish')` + statusCode < 400).

**Guarantees:**

- Handler throws → ZERO jobs dispatched
- Response status >= 400 → ZERO jobs dispatched
- Client disconnects mid-stream → ZERO jobs dispatched
- All entries dispatched in insertion order on success

This makes jobs composable with DB writes — if your transaction rolls back, the jobs you enqueued also drop.

```ts
handler({ ctx }) {
  ctx.queue.enqueue('send-welcome', { userId: 'u1' })
  // If this throws, the welcome email is NEVER sent
  throw new Error('oh no')
}
```

### enqueueWithId (log correlation)

If you need the jobId for logging:

```ts
const { jobId } = await ctx.queue.enqueueWithId('process-document', { documentId: 'd1' })
console.log(`enqueued ${jobId}`)
```

The Promise resolves AFTER the outbox flushes — so AFTER the response commits. It's NOT a handle to await the job result (see "I want to chain steps" below).

## I want to chain steps

> TheoKit jobs are intentionally NOT a workflow engine (ADR-0003). `enqueue` returns `void`, not `Promise<Result>`.

If you need step chains:

| Pattern | When |
|---|---|
| Job A's handler enqueues Job B | Simple sequence; no result-passing |
| Cron triggers Job A → Job B | Delayed orchestration |
| **Use Inngest / Trigger.dev / Mastra** | Real workflows (conditional branches, fanout-fanin, sub-steps) |

TheoKit's wedge is the web framework. Workflows are a separate category with mature options. Use them alongside TheoKit — they compose perfectly.

## Retries + NonRetryableError

Default `maxAttempts: 1` (per ADR-0003 — no retry surprise). Override per job:

```ts
defineJob('flaky-api-call', {
  maxAttempts: 5,
  async handler({ input, attempt }) {
    // Will retry up to 5 times on throw
  },
})
```

To opt OUT of retry for a specific error:

```ts
import { NonRetryableError } from 'theokit/server'

async handler({ input }) {
  if (!isValidInput(input)) {
    throw new NonRetryableError('input invalid — do not retry')
  }
}
```

## W3C Trace Context propagation (R0.5.9)

Every job handler's `ctx.traceId` matches the originating request's trace_id. The chain preserves across `request → job1 → job2 → job3`. Use it for correlated logging across your tracing backend.

```ts
async handler({ traceId, input }) {
  logger.info({ traceId, msg: 'processing', input })
}
```

## Adapter limitations

> **EC-112 — outbox does NOT apply on Cloudflare Workers / edge runtimes.**
>
> On Node, the outbox hooks `res.on('finish')` for transactional semantics. Cloudflare Workers and other edge runtimes use Web Response without that lifecycle. On those targets, `ctx.queue.enqueue` dispatches IMMEDIATELY — no rollback if the handler throws afterwards.
>
> If your app deploys to both Node and CF, write handlers as if outbox does NOT apply (avoid relying on the rollback guarantee).

## Local development limitations

> **EC-111**: HMR + dynamic import cache (same as crons). Editing a job handler during `theokit dev` may require a restart.

> **EC-104** — InMemoryJobBackend drops pending jobs on process restart. Visible by design: a warning logs "N jobs dropped on shutdown". Use PostgresJobBackend for durability across restarts.

## When this fails

| Symptom | Cause | Fix |
|---|---|---|
| `Type 'X' is not assignable to type 'never'` | JobRegistry not augmented | Add `declare module 'theokit/server'` |
| Jobs enqueue but never run | No worker process consuming the queue | Start a worker loop via `createJobRunner` |
| Jobs dispatched twice | Worker concurrency without idempotency key | Pass `idempotencyKey` on enqueue |
| Postgres pool exhausted | Long-running jobs holding connections | Reduce job duration OR increase pool size; ensure `connectionTimeoutMillis` set |

## See also

- [ADR-0002](../adr/0002-job-backend-interface-neutral-contract.md) — neutral backend contract
- [ADR-0003](../adr/0003-enqueue-returns-void-transactional-outbox.md) — void return + outbox
- [ADR-0006](../adr/0006-define-worker-rejected.md) — why `defineWorker` is rejected
- [`.claude/knowledge-base/reference/jobs-primitives.md`](../../.claude/knowledge-base/reference/jobs-primitives.md) — full deep-dive
- [Crons](./crons.md) — for time-triggered work
- [Webhooks](./webhooks.md) — for externally-triggered work
