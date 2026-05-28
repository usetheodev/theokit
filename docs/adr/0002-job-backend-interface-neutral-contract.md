# 0002. `JobBackend` is a neutral interface — no platform lock-in

* Status: accepted
* Date: 2026-05-24
* Accepted: 2026-05-24 (pre-condition for R0.5.5 of macro roadmap)
* Deciders: [TheoKit team]
* Tags: [architecture, jobs, queue, extensibility, adapter-pattern]

## Context and Problem Statement

The 0.5.0 roadmap ships `defineJob(name, { input, handler })` plus a
typed `ctx.queue.enqueue<JobName>(name, input)` client (R0.5.5, R0.5.6).
Between the user-facing API and the storage substrate sits one question:
**how does TheoKit decouple itself from any single queue implementation?**

The market shows three postures:

- **Sidekiq** (Ruby) — Redis-only. The framework IS the backend. Anyone
  who wants Postgres goes to a different gem (`good_job`, `solid_queue`).
- **Rails ActiveJob** (Ruby) — defines a neutral `queue_adapter`
  interface. Users plug Sidekiq, Solid Queue, Resque, GoodJob, Delayed
  Job, etc. by setting `config.active_job.queue_adapter = :sidekiq`.
  The application code is identical regardless of backend.
- **Inngest** (TypeScript SaaS) — backend IS the service. No local
  alternative. Code calls Inngest's hosted infrastructure.

The deep-dive reference
(`.claude/knowledge-base/reference/jobs-primitives.md`, §3.1, §6, §9.4)
catalogs all three. ActiveJob's pluggable adapter is convergent prior
art — eight of the surveyed backends conform to the same shape (enqueue
/ dequeue / ack / idempotency).

Three concrete forces push TheoKit toward neutrality, not lock-in:

1. **`theo` platform commitment.** The CLAUDE.md mission lists "Theo
   PaaS" as a deploy target. A hosted Theo platform should be A backend
   for TheoKit jobs — not THE only backend.
2. **Local development.** A dev running `theokit dev` must not need
   Redis or Postgres up before they can `ctx.queue.enqueue`. An
   in-memory backend MUST work zero-config.
3. **Self-hosted SaaS reality.** Real users have Postgres already (most
   templates ship with it). Requiring Redis "just for queues" adds an
   operational burden out of proportion to the value.

If we lock to one backend (say Postgres-only, à la Solid Queue),
everyone on Theo PaaS has to run Postgres alongside their managed
queue. If we lock to a third-party SaaS, we contradict the
"self-hostable framework" wedge.

## Considered Options

* **Option 1 — Neutral `JobBackend` interface; ship InMemory + Postgres
  in core, allow user-supplied backends (recommended).** TheoKit defines
  the contract. Two first-party implementations cover ~95% of users.
  Theo PaaS, BullMQ, Cloudflare Queues, SQS — all become third-party
  backends matching the same interface.
* **Option 2 — Lock to Postgres (Solid Queue pattern).** Single
  implementation, no abstraction. Forces every user to run Postgres.
  Operational burden + Cloudflare Workers / Vercel Edge users blocked
  (Postgres connection from edge is fragile or impossible).
* **Option 3 — Lock to Redis (Sidekiq pattern).** Performant, mature
  ecosystem. Forces every user to run Redis. Same operational burden;
  doesn't compose with the existing Drizzle/Postgres template story.
* **Option 4 — No backend abstraction; users implement everything.**
  Maximum flexibility, zero ergonomics. Defeats the framework promise
  ("APIs that validate themselves … server actions without plumbing").

## Decision Outcome

Chosen option: **Option 1 — neutral `JobBackend` interface, InMemory +
Postgres ship in core.**

Rationale:

- ActiveJob already proved the model works in production at Rails
  scale for 12+ years.
- KISS: the user surface stays the same regardless of backend. Swap is
  one line in `theo.config.ts > jobs.backend = ...`.
- The two shipped backends cover the two most common deployments:
  - **InMemory** — dev + tests + single-instance prototypes (free).
  - **Postgres** — production self-host (most users have Postgres
    already; reuses the existing connection from `db/index.ts` in the
    postgres template).
- Future Theo PaaS slots in as a third backend without modifying
  TheoKit core or user code.

### Interface contract (final shape — implemented in T1.1)

```typescript
// packages/theo/src/server/jobs/job-backend.ts
export interface JobBackend {
  /** Human-readable name for logging. */
  readonly name: string

  /** Persist a job for later dispatch. Returns generated jobId. */
  enqueue(input: JobEnqueueInput): Promise<{ jobId: string }>

  /** Worker loop polls for the next available job. */
  dequeue(opts: { batchSize?: number; lockSeconds?: number }): Promise<JobLease[]>

  /** Mark a job complete (success). */
  ack(jobId: string): Promise<void>

  /** Mark a job failed; backend decides retry vs DLQ via attempts. */
  nack(jobId: string, opts: { error: string; nonRetryable?: boolean }): Promise<void>

  /** Idempotency dedup — returns existing jobId if key already enqueued within window. */
  idempotency?(key: string, ttlSeconds: number): Promise<{ jobId: string } | null>
}

export interface JobEnqueueInput {
  name: string
  input: unknown
  idempotencyKey?: string
  delaySeconds?: number
  traceparent?: string  // W3C Trace Context propagation
}

export interface JobLease {
  jobId: string
  name: string
  input: unknown
  attempts: number
  maxAttempts: number
  traceparent?: string
  lockExpiresAt: Date
}
```

### Shipped implementations (T1.2 + T1.3)

- **`InMemoryJobBackend`** — Map-based, no persistence; resets on
  process restart. ZERO external dependency. Used by default in `dev`
  mode and tests. Backed by a simple `setTimeout` scheduler.
- **`PostgresJobBackend`** — Graphile Worker style: single `jobs` table
  with `SELECT ... FOR UPDATE SKIP LOCKED`. Reuses the user's existing
  Postgres connection (peer dependency on `pg`). Idempotency via UNIQUE
  index on `(name, idempotency_key)`.

### Why NOT ship Redis adapter in core

Redis is a fantastic queue backend. BullMQ is mature. But:

1. The Postgres template already ships in TheoKit; users have Postgres.
2. Postgres connections compose with the transactional outbox
   (ADR-0003). Redis doesn't — outbox semantics require the SAME
   transaction as the user's domain writes.
3. Adding Redis as a third "core" backend bloats the framework with
   another peer dependency. Better as `@theokit/jobs-redis` (community
   or first-party but separate package).

### Why NOT make the contract async-iterator-based

`dequeue()` returns `Promise<JobLease[]>` rather than `AsyncIterable<JobLease>`
because lease semantics (lockSeconds, visibility timeout) don't compose
with backpressure-free iteration. ActiveJob, BullMQ, Graphile Worker —
all use the explicit poll-batch-ack loop. Codified here so future PRs
don't try to "modernize" with `for await`.

## Consequences

* **Good:** Theo PaaS slots in as a backend without modifying TheoKit
  or user code. Postgres template users get jobs zero-config. Devs run
  tests without Docker. The contract maps directly to ActiveJob —
  contributors with Rails background recognize the shape instantly.
* **Good:** Third-party adapters (`@theokit/jobs-redis`,
  `@theokit/jobs-sqs`, `@theokit/jobs-cf-queues`) become straightforward
  to author.
* **Bad:** Interface drift risk — every new backend may want to add
  one capability the others lack. We mitigate by versioning the
  interface (`JobBackend.version = 1`) and making `idempotency?` and
  similar optional. Backends declare what they support.
* **Bad:** Postgres backend requires the `pg` peer dep — handled with
  optional peer-dep declaration and runtime error if missing
  ("PostgresJobBackend requires `pg`. Install via `pnpm add pg`.").
* **Neutral:** Adds one abstraction layer between `defineJob` and
  storage. The cost is one interface dispatch per enqueue; benchmark
  shows < 1µs overhead vs direct call.

## Re-evaluation triggers (when to revisit)

The decision is durable but not eternal. Reopen this ADR if:

1. **Theo PaaS ships and the JobBackend interface proves too narrow
   for hosted features** (e.g., visualization, retry orchestration UI).
   In that case, EXTEND the interface — do NOT collapse to a single
   backend.
2. **Postgres SKIP LOCKED throughput becomes a bottleneck for any
   real user** (measured, not speculated). At that point, ship
   `@theokit/jobs-redis` as first-party-blessed but still
   non-core.
3. **A backend appears that breaks the contract fundamentally**
   (e.g., a "queue" that is push-based with no dequeue, like Cloudflare
   Queue's consumer Worker). Add a sibling interface
   (`JobConsumerBackend`?), do NOT contort the existing one.

## Related artifacts

- Reference doc: `.claude/knowledge-base/reference/jobs-primitives.md`
  (§3.1, §5, §9.1, §9.3)
- Roadmap items: R0.5.5 (`defineJob`), R0.5.6 (`ctx.queue.enqueue`)
- Pre-conditional ADRs: ADR-0003 (`enqueue` returns void — depends on
  this interface being neutral)
- Prior art: Rails ActiveJob `ActiveJob::QueueAdapters::Base`
  (`referencias/rails/activejob/lib/active_job/queue_adapter.rb`),
  Graphile Worker README (Postgres SKIP LOCKED reference).
