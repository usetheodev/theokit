# 0003. `ctx.queue.enqueue` returns `void` — transactional outbox locked

* Status: accepted
* Date: 2026-05-24
* Accepted: 2026-05-24 (foot-gun shield; pre-condition for R0.5.5 + R0.5.8)
* Deciders: [TheoKit team]
* Tags: [api-design, jobs, transactional-outbox, scope-lock, anti-feature]

## Context and Problem Statement

`ctx.queue.enqueue<JobName>(name, input, { idempotencyKey? })` is the
typed client over `defineJob`. The return value is a binary architectural
choice with non-binary consequences:

| Return shape | What it enables | What it leaks |
|---|---|---|
| `void` | Fire-and-forget enqueue, transactional outbox semantics, scope discipline | Job ID for log correlation (need overload) |
| `Promise<{ jobId }>` | Log correlation | Still fire-and-forget |
| `Promise<Result>` | Workflow chaining (`enqueue().then(...)`) | Locks TheoKit into being a workflow engine |
| `Run<Result>` (Inngest style) | Workflow + observability + sub-steps | TheoKit becomes Inngest/Trigger.dev competitor |

The temptation to "just return the result" is universal — every PR
author who uses jobs in another context (Inngest, Trigger.dev,
BullMQ's `Job.waitUntilFinished()`) will reach for it. The reference
doc (`.claude/knowledge-base/reference/jobs-primitives.md`, §5)
catalogs Inngest's `step.run` and Trigger.dev's `run.id`-then-poll
pattern. Both expand into workflow orchestration territory.

The locked TheoKit mission ("Build the app your agent lives in") is a
web framework wedge — NOT a workflow engine. The CLAUDE.md "Out of
scope for 0.5.0" table is explicit:

> `enqueue().then(result => ...)` (workflow API) — Reaches into
> Inngest/Trigger.dev territory. TheoKit's wedge is web framework, not
> workflow engine.

Without an ADR codifying the decision, a future PR adds
`Promise<Result>` "just for this one use case" and the wedge dilutes
within months.

### The orthogonal force: transactional outbox

Returning `void` is also the only return shape compatible with the
transactional outbox pattern (R0.5.8). The outbox semantics:

- `enqueue` inside a request handler buffers the job
- Actual dispatch to the backend happens AFTER the request's response
  is committed (`res.on('finish')`)
- If the handler throws, OR `res.end()` fails, the outbox drops the
  job — no orphan jobs after rollback

If `enqueue` returned `Promise<Result>`, the caller would need to
await the dispatch BEFORE the response commits — which defeats the
outbox. The two decisions reinforce each other.

## Considered Options

* **Option 1 — `enqueue` returns `void` (recommended).** Locks
  fire-and-forget. Outbox semantics work. Workflow expansion is
  structurally impossible.
* **Option 2 — `enqueue` returns `Promise<{ jobId }>`.** Fire-and-forget
  AND log correlation. Slightly more useful, slightly less safe (caller
  may be tempted to use jobId for polling).
* **Option 3 — `enqueue` returns `Promise<{ jobId, await(): Promise<Result> }>`.**
  Opens workflow API door. Defeats outbox.
* **Option 4 — Two methods: `enqueue` (void) and `dispatch` (Promise<Result>).**
  Two surface areas for the same operation. Confusing. Wedge erosion at
  twice the speed.

## Decision Outcome

Chosen option: **Option 1 with one log-correlation overload.**

```typescript
// packages/theo/src/server/jobs/queue-client.ts
export interface QueueClient {
  enqueue<JobName extends keyof JobRegistry>(
    name: JobName,
    input: JobRegistry[JobName],
    opts?: { idempotencyKey?: string; delaySeconds?: number }
  ): void  // <-- fire-and-forget, buffered to outbox

  /**
   * Overload for code that needs the jobId for log correlation
   * (e.g., returning to the user "Job J-abc123 enqueued").
   *
   * STILL fire-and-forget. STILL goes through outbox.
   * The returned Promise resolves with the jobId when the outbox commits
   * (i.e., when res.on('finish') fires) — NOT when the job completes.
   *
   * It is NOT a handle to await the result. There is no result API.
   */
  enqueueWithId<JobName extends keyof JobRegistry>(
    name: JobName,
    input: JobRegistry[JobName],
    opts?: { idempotencyKey?: string; delaySeconds?: number }
  ): Promise<{ jobId: string }>
}
```

The two methods share semantics; only the return shape differs. The
naming difference (`enqueue` vs `enqueueWithId`) makes the cost of log
correlation explicit at the call site.

### What this rules out — and we WILL get PRs trying to add these

| Forbidden API | Reason | Reject with link to this ADR |
|---|---|---|
| `await ctx.queue.enqueue(...)` returning `Result` | Workflow engine | `ADR-0003` |
| `ctx.queue.status(jobId): Promise<'pending' \| 'running' \| 'done'>` | Status polling = orchestration tracker | `ADR-0003` |
| `ctx.queue.cancel(jobId): Promise<void>` | Job control plane = orchestration | `ADR-0003` |
| `ctx.queue.wait(jobId): Promise<Result>` | Workflow chaining | `ADR-0003` |
| `defineJob({ handler: async () => Result })` where Result is observable to caller | Same as above | `ADR-0003` |
| `Job.then(...)` or `Job.await()` | Workflow chaining | `ADR-0003` |

If a user genuinely needs orchestration (chained steps, conditional
flows, fanout-fanin), the answer is **"use Inngest, Trigger.dev, or
Mastra alongside TheoKit"** — they own that category. TheoKit's job is
to be the web app, not the workflow engine.

### Why `void` (not `Promise<void>`)

Returning `void` (not `Promise<void>`) communicates a stronger contract:
the call has no observable effect at the call site. `await`-ing it does
nothing useful. ESLint's `no-floating-promises` won't complain because
the call IS sync (the outbox buffer write is sync; the dispatch happens
asynchronously, decoupled from the call).

The internal implementation IS async (it calls `backend.enqueue` which
returns a Promise). The outbox swallows that Promise — the caller
doesn't see it.

```typescript
// Internal — outbox buffers and dispatches on res.finish
function enqueue<N extends keyof JobRegistry>(
  name: N,
  input: JobRegistry[N],
  opts?: EnqueueOptions
): void {
  const outboxEntry = { name, input, opts, traceparent: ctx.traceId }
  outbox.push(outboxEntry)
  // No await. No return.
}
```

### Why this composes with outbox (ADR companion proof)

The outbox (R0.5.8) hooks `res.on('finish')` to flush buffered entries
to the backend. If the handler throws or the response fails, the outbox
is discarded:

```typescript
res.on('finish', async () => {
  if (res.statusCode >= 400) {
    outbox.discard()
    return
  }
  for (const entry of outbox.drain()) {
    await backend.enqueue(entry)  // <-- THIS is async, but invisible to user
  }
})

res.on('close', () => {
  // Connection aborted before finish — discard outbox
  if (!res.writableFinished) outbox.discard()
})
```

This pattern is ONLY tractable because `enqueue` returns `void`. If it
returned `Promise<{ jobId }>`, the caller could `await` it inside the
handler, forcing dispatch BEFORE outbox commit — and the rollback
semantics collapse.

## Consequences

* **Good:** Wedge protected. Future PRs that want to "just return the
  result" hit a structural wall — outbox makes the change require
  rewriting outbox + queue client + every backend at once. Cost-benefit
  pushes them to fork or use Inngest instead, which is correct.
* **Good:** Outbox semantics are real and testable. The KEY test
  (`tests/integration/job-outbox-rollback.test.ts`) verifies that
  `enqueue` inside a throwing handler leaves zero jobs dispatched.
* **Bad:** Onboarding friction — users coming from Inngest may want
  to chain steps. We mitigate via a docs page (`docs/concepts/jobs.md`)
  that explicitly addresses "I want to chain — what now?" with the
  recommended pattern (call the next job's handler from the first job's
  handler, OR use cron for delay, OR use a real orchestrator).
* **Neutral:** `enqueueWithId` exists as escape valve for log
  correlation. Naming makes the cost explicit.

## Re-evaluation triggers

Reopen this ADR if:

1. **The "use Inngest alongside" guidance proves insufficient for ≥5
   real users** who hit the wall on workflow needs AND would otherwise
   leave TheoKit. At that point, consider an `@theokit/orchestration`
   companion package — NEVER fold workflow into the core enqueue.
2. **A platform feature (e.g., Theo PaaS visualization) requires
   per-job result inspection.** That's an observability concern handled
   via logs + structured events, not via changing `enqueue` return type.
   Re-evaluate ONLY if the platform contract is unworkable through
   logs.
3. **The framework drops the "self-hostable" wedge** (won't happen on
   the current trajectory, but if mission changes, the constraint
   changes).

## Related artifacts

- Reference doc: `.claude/knowledge-base/reference/jobs-primitives.md`
  (§5, §7.1, §8 EC-1/EC-2)
- Roadmap items: R0.5.5 (`defineJob`), R0.5.6 (`ctx.queue.enqueue`),
  R0.5.8 (transactional outbox)
- Sibling ADRs: ADR-0002 (`JobBackend` interface — required for outbox
  to have a real implementation), ADR-0006 (`defineWorker` REJECTED —
  same scope-lock logic applied to stream consumption)
- Prior art: Rails ActiveJob `perform_later` returns `nil`
  (`referencias/rails/activejob/lib/active_job/core.rb`), Transactional
  Outbox pattern (https://microservices.io/patterns/data/transactional-outbox.html).
