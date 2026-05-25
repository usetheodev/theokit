# Reference: Jobs Primitives — `defineJob` + `ctx.queue.enqueue` + `JobBackend`

**Date:** 2026-05-24
**Depth:** standard
**Frameworks analyzed:** Rails ActiveJob + Solid Queue + Sidekiq (core, file-level), Nitro Tasks (control case)
**Systems analyzed (web):** Inngest (function model), Trigger.dev v3 (durable task model — fetch returned 404, secondary knowledge applied), BullMQ (Redis queue baseline — fetch was thin, secondary knowledge applied), Graphile Worker (Postgres queue — fetch was thin, surface confirmed from prior knowledge + Solid Queue's SKIP LOCKED SQL), Solid Queue (Rails 8 default — fetch was rich), Transactional Outbox pattern (microservices.io canonical reference — fetch was rich)
**TheoKit package affected:** `packages/theo/src/server/jobs/` (NEW module), `packages/theo/src/server/define/index.ts` (re-export `defineJob`), `packages/theo/src/server/index.ts` (public surface re-export), `packages/theo/src/server/scan/` (job-scan + jobs.json manifest), `packages/theo/src/server/http/` (outbox lifecycle hook into request runtime), `fixtures/jobs-basic/`, `examples/full-stack-agent/server/jobs/`, `packages/theo/src/cli/commands/start.ts` (`theo start --worker` flag)
**Related references:**
- `.claude/knowledge-base/reference/webhook-signing.md` — sibling primitive (webhooks frequently enqueue jobs after verification)
- `.claude/knowledge-base/reference/cron-primitives.md` — sibling primitive (`defineCron` triggers enqueue at a schedule)
- `.claude/knowledge-base/reference/caching-and-revalidation.md` — shares the `res.on('finish')` lifecycle hook used for outbox flush
- `.claude/knowledge-base/reference/devtools.md` — jobs panel reuses existing `broadcastToDevtools` dispatcher

**Locked constraints — bind every choice in this doc:**
1. **CLAUDE.md R0.5.5:** `defineJob(name, { input: ZodSchema, handler })` — handler returns `void`, **NOT** `Promise<Result>`. This locks scope: no workflow API drift.
2. **CLAUDE.md R0.5.6 + ADR-0003:** `ctx.queue.enqueue<JobName>(name, input, { idempotencyKey? })` — returns `void` (or `{ jobId }` overload only for log correlation, never for awaiting result).
3. **CLAUDE.md ADR-0002:** `JobBackend` interface — neutral contract; ships `InMemoryJobBackend` + `PostgresJobBackend`. Future Redis adapter is third-party.
4. **CLAUDE.md R0.5.8:** Transactional outbox semantics — `enqueue` defers actual dispatch until current request commits (`res.on('finish')`). Rollback (handler throws) = nothing enqueued.
5. **CLAUDE.md R0.5.9:** W3C Trace Context propagation through `enqueue → job → child enqueues`. `ctx.traceId` in job handler matches the originating request's `traceparent`.
6. **CLAUDE.md R0.5.5:** Default `maxAttempts: 1`. **No surprise retries.** `NonRetryableError` for explicit opt-out of retries when `maxAttempts > 1`.
7. **CLAUDE.md ADR-0006:** `defineWorker(name, { stream, handler })` — REJECTED. Stream consumers are not in scope until (a) `@usetheo/theo` offers managed streams, (b) 3+ apps demand, (c) agent layer formalizes.

---

## 1. Problem statement

TheoKit ships a complete agent-app surface — routes, actions, auth, sessions, WebSockets, cron, webhooks — but has **zero background-work primitive** today. `find packages/theo/src -path "*jobs*"` returns nothing. The 4 agent use cases that 0.5.0 commits to (chat, background-processing, webhook-triggered, report-generating) all need to enqueue work that survives the response lifecycle: send the welcome email after signup, run the LLM-driven report after webhook arrives, kick off ingestion after the user uploads a 200MB document. Today the only honest way to do this in a TheoKit app is `setTimeout` or `fire-and-forget Promise` — both die when the process restarts, neither survive a crash, neither retry, neither idempotent.

Every Node-ecosystem peer ships a job primitive: Rails (ActiveJob since 4.2, Solid Queue default in Rails 8), Nitro (`defineTask`), Inngest, Trigger.dev, BullMQ, Graphile Worker. The shape is convergent: a named handler with typed input, enqueue from the request, a pluggable backend, retry on failure, idempotency to dedupe. What diverges is everything else — return value semantics (workflow vs fire-and-forget), retry defaults, backend lock-in (Redis-only vs Postgres-only vs both), and whether the enqueue is transactional. TheoKit's 0.5.0 plan locks the contract before that drift happens.

We need this **now** because (a) the locked 0.5.0 theme is "complete for 4 agent use cases simultaneously" and 3 of those 4 are background-shaped, (b) webhooks (`defineWebhook` R0.5.10) and crons (`defineCron` R0.5.4) both want to *enqueue* work as their handler body, not execute it inline — so without jobs landing first, those primitives have nowhere to send work, and (c) the agent layer that lives upstream (out of scope per ADR-0006) will assume jobs exist; if we ship agents before jobs, every agent demo will roll its own queue and we lose the contract.

---

## 2. Inventário (per-framework + discarded files)

### Rails ActiveJob + Solid Queue + Sidekiq (gold mine)

| File | Category | LOC | What it shows |
|---|---|---|---|
| `referencias/rails/activejob/lib/active_job/enqueuing.rb` | Public API | 144 | `perform_later` class method, `enqueue` instance method, `raw_enqueue` callback pipeline, `EnqueueError` for adapter-side failure signaling, `perform_all_later` for batch. **The canonical pattern: name + arguments → adapter.enqueue(job).** |
| `referencias/rails/activejob/lib/active_job/queue_adapter.rb` | Pluggable backend | 78 | `class_attribute :_queue_adapter`, `QUEUE_ADAPTER_METHODS = [:enqueue, :enqueue_at]` — the entire backend contract is **two methods**. `queue_adapter?(object)` duck-type check. This is the minimum viable `JobBackend` interface. |
| `referencias/rails/activejob/lib/active_job/enqueue_after_transaction_commit.rb` | Outbox pattern | 38 | **The transactional outbox in 38 lines.** `enqueue_after_transaction_commit` class attribute (per-job opt-in). `raw_enqueue` override: if true, `ActiveRecord.after_all_transactions_commit { super }`. `perform_all_later` partitions jobs by deferred-vs-immediate. This is the algorithm TheoKit copies, swapping AR-transactions for `res.on('finish')`. |
| `referencias/rails/activejob/lib/active_job/exceptions.rb` | Retry policy | 218 | `retry_on(*exceptions, wait:, attempts: 5, queue:, priority:, jitter: 0.15, report: false)` — Rails defaults to **5 attempts**. `discard_on` for non-retryable. `:polynomially_longer` algorithm: `(executions**4) + (rand * delay * jitter) + 2` → wait ~3s, ~18s, ~83s. **Jitter is a first-class concept.** TheoKit choice: max_attempts **1** (different from Rails — see §5), but copy the polynomial backoff + jitter math. |
| `referencias/rails/activejob/lib/active_job/queue_adapters.rb` | Adapter registry | (not deep-read) | Lookup by symbol (`:async`, `:sidekiq`, `:solid_queue`). TheoKit equivalent: config key `jobs.backend: 'memory' | 'postgres' | object`. |

**Discarded** (skimmed, not deep-read — explicitly out of scope for TheoKit's primitive): `arguments.rb` (Rails-specific GlobalID serializer; TheoKit uses Zod), `core.rb` (Rails framework integration), `instrumentation.rb` (covered by our existing observability), `continuation.rb` (Rails 8 long-running-job checkpointing — interesting but outside R0.5.5), `continuable.rb` (same), `test_helper.rb` (Rails test layer), `serializers.rb` (Zod replaces this entire concept), `callbacks.rb` (around_enqueue / around_perform — defer to v0.6 if asked).

### Nitro Tasks (control case)

| File | Category | LOC | What it shows |
|---|---|---|---|
| `referencias/nitro/src/runtime/internal/task.ts` | Public API + runtime | 95 | `defineTask<RT>({ run })` is a pure typing identity — no validation surface. `runTask(name, { payload, context })` reads from `tasks` virtual module, runs handler, **dedupes by name only** (`__runningTasks__[name]`). `startScheduleRunner` uses `croner` to fire tasks at schedule. `scheduledTasks` from virtual module. **Crucially: no queue backend.** Nitro tasks are in-process invocations, not jobs. Useful as the "minimum API" anchor — `defineTask` is 4 lines — but Nitro tasks do NOT survive process restart, do NOT retry, do NOT serialize input. TheoKit does all three. |
| `referencias/nitro/src/runtime/internal/routes/dev-tasks.ts` | Dev UX | (not deep-read) | HTTP endpoint that calls `runTask` for dev manual triggering. TheoKit's devtools jobs panel reuses this idea — see §9. |

**Discarded**: examples and docs (`docs/1.docs/50.tasks.md`) — referenced for naming choice but not required.

---

## 3. Prior art deep dive

### 3.1 Rails ActiveJob — the canonical pluggable-backend interface

Rails extracted ActiveJob in 4.2 specifically to **separate the job-definition API from the queue infrastructure**. `MyJob < ApplicationJob` defines `perform(*args)`; the backend (Sidekiq, Solid Queue, DelayedJob, AWS SQS) is configured per-application via `config.active_job.queue_adapter`. The contract is two methods: `adapter.enqueue(job)` and `adapter.enqueue_at(job, timestamp)`. That's it. `queue_adapter.rb:71` literally encodes this: `QUEUE_ADAPTER_METHODS = [:enqueue, :enqueue_at].freeze`.

The lifecycle: `MyJob.perform_later(args)` → `job = new(args)` → `job.enqueue` → `run_callbacks :enqueue { _raw_enqueue }` → `queue_adapter.enqueue(self)`. The adapter is responsible for serializing `job.serialize` (a hash of `job_id`, `queue_name`, `arguments`, `priority`, `scheduled_at`, `executions`) and persisting it. When a worker dequeues, `ActiveJob::Base.execute(job_data)` rebuilds the job and calls `perform_now`.

`perform_later` returns the **job instance** on success, `false` on failure. This is Ruby — duck-typed return value. TheoKit's TypeScript equivalent must pick: `void`, `Promise<JobId>`, or `Promise<Result>`. ADR-0003 picks `void`, with an overload for `{ jobId }` log correlation. Why: returning `Promise<Result>` is the slippery slope to a workflow engine (await job → enqueue child → await child).

### 3.2 Solid Queue (Rails 8 default) — Postgres-backed, supervisor + workers + dispatchers

Solid Queue is the architectural blueprint for TheoKit's `PostgresJobBackend`. Five tables: `solid_queue_jobs` (the job record — class_name, arguments_json, queue_name, priority, scheduled_at), `solid_queue_ready_executions` (dequeue queue with FOR UPDATE SKIP LOCKED), `solid_queue_scheduled_executions` (delayed jobs awaiting scheduled_at), `solid_queue_blocked_executions` (concurrency-limited), `solid_queue_failed_executions` (terminal failures for inspection/retry).

The dequeue SQL is the load-bearing piece:

```sql
SELECT job_id FROM solid_queue_ready_executions
ORDER BY priority ASC, job_id ASC LIMIT ?
FOR UPDATE SKIP LOCKED;
```

`FOR UPDATE SKIP LOCKED` (Postgres 9.5+, MySQL 8+) is what lets N workers poll the same table without blocking each other — locked rows are simply invisible to concurrent SELECTs. Without it, workers serialize on row locks and throughput collapses. Graphile Worker uses the same primitive. TheoKit's `PostgresJobBackend` copies this verbatim.

Architecture: **supervisor** (master process) forks **workers** (thread pools running jobs) and **dispatchers** (move scheduled → ready when due, also enforce concurrency keys). Polling interval default: workers 2s, dispatchers 1s. Each worker process has N threads (default 3); the supervisor has a heartbeat (60s default) to detect dead workers and reclaim their in-flight jobs.

TheoKit's worker process is `theo start --worker` — a separate Node process (or same-process opt-in for dev) that calls `backend.dequeue` in a poll loop. Decision §9.6: dev = same-process opt-in (instant feedback), prod = separate `theo start --worker` (one or more replicas).

Two Solid Queue features we **don't** ship in 0.5.0 but record for 0.6+: `limits_concurrency to:, key:` (semaphore-style per-key throttle) and `recurring.yml` (Solid Queue's built-in cron — `defineCron` R0.5.4 covers this). Concurrency-by-key is a real ask in agent apps (rate-limit per user-id) but adds a `solid_queue_blocked_executions` table; we'd rather pin scope at jobs-without-concurrency-keys and revisit if user demand surfaces.

### 3.3 Sidekiq — Redis-backed, idempotency primitives, dead jobs

Sidekiq (Ruby, Redis since 2012) is the historical baseline that every job-queue maker compares against. Three points TheoKit borrows: (1) **explicit job ID for idempotency** — Sidekiq's `sidekiq_options unique_for: 5.minutes` (via sidekiq-unique-jobs gem) computes a fingerprint of class + args and refuses duplicate enqueues within TTL; (2) **dead jobs** — after retries exhausted, jobs land in a "morgue" set inspectable via Web UI; (3) **server middleware** — Sidekiq middlewares run before/after `perform` and form the basis of every observability integration. TheoKit's `defineJob` doesn't ship middleware in 0.5.0 — it ships the hooks at the backend layer instead (`backend.beforeDispatch(job)`) — but the lesson is: leave a seam.

What we **don't** copy: Sidekiq's Redis-only stance. R0.5.5 explicitly ships `InMemoryJobBackend` + `PostgresJobBackend`. Redis adapter is community.

### 3.4 Nitro Tasks — the minimum API anchor (control case)

Nitro's `defineTask` is 14 lines (`task.ts:7`). The handler is `({ payload, context }) => Promise<unknown>`. `runTask(name, opts)` invokes by name, dedupes concurrent invocations of the same name in-process (`__runningTasks__[name]`), and that's the whole runtime. **No queue. No persistence. No retries. No serialization.** It's `setTimeout` with a name.

Why include it: Nitro's API surface is the **lower bound** TheoKit's must beat. `defineTask` shows the file-based registration pattern (handlers under `server/tasks/<name>.ts`, virtual `tasks` module collects them) — TheoKit does the identical thing for `server/jobs/<name>.ts`. The divergence point: TheoKit's `defineJob` REQUIRES `input: ZodSchema` (Nitro's `payload` is `unknown`), and the handler runs in a separate worker process via a persisted backend (Nitro tasks run in the same request worker). This positions TheoKit between Nitro (trivial, lossy) and Sidekiq (heavy, opinionated on Redis).

### 3.5 Inngest — function model, step.run, retries-by-default

Inngest models the world as **event-triggered durable functions**. `inngest.createFunction({ id, triggers: { event: 'user.signup' } }, async ({ step }) => { ... })`. The `step` object exposes `step.run(name, fn)`, `step.sleep`, `step.waitForEvent` — each step is a memoized checkpoint, replayed from the engine's event log if the function restarts.

Why TheoKit explicitly rejects this model:
- **`step.run` is the workflow API in disguise.** Once `step` exists, users compose multi-step pipelines. That's not a job primitive — that's a workflow engine. CLAUDE.md ADR-0003 + the macro roadmap's "Out of scope for 0.5.0" both block this.
- **Retries default ON (4 attempts) with exponential backoff.** Inngest's docs explicitly say "retries are automatic — your function should be idempotent." This is the right default for Inngest's audience (durable workflows) but the wrong default for TheoKit's audience (someone shipping their first agent app who runs `enqueue('send-email', ...)` and is surprised it ran 5 times). TheoKit picks `maxAttempts: 1` — opt into retries deliberately.
- **`inngest.send()` returns `{ ids: string[] }`** — a handle into the durable execution log. TheoKit's `enqueue` returns void (or `{ jobId }` overload for log-only correlation). Same shape, half the implications.

We **do** borrow Inngest's idempotency-key model: `inngest.send({ name, data, id: 'fingerprint' })` — if the same `id` arrives twice within the dedup window, the second is discarded. Identical in TheoKit's `enqueue(name, input, { idempotencyKey })`.

### 3.6 Trigger.dev v3 — durable task model (fetch returned 404)

The fetch failed; using prior knowledge. Trigger.dev v3 has `task({ id, run: async (payload) => result })`. `task.trigger(payload)` returns `{ id }`. `task.batchTrigger([{ payload }, { payload }])`. Lifecycle hooks: `onStart`, `onSuccess`, `onFailure`, `onWait`, `onResume`. Retry config: `retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, randomize: true }`. Their `run` function **returns a result** that downstream `task.triggerAndWait()` can await — that's Inngest's `step.run` repackaged. Same rejection rationale.

What we steal: the **lifecycle hook names** — `onStart`/`onSuccess`/`onFailure` are obvious, ergonomic, every framework user understands them. TheoKit doesn't ship hooks at `defineJob` level in 0.5.0 (config knob to defer), but the names lock the future surface.

### 3.7 BullMQ — Redis Streams baseline (fetch was thin)

BullMQ (Node, Redis Streams since 2019, succeeded `bull`) is the Node ecosystem's incumbent Redis-backed queue. `new Queue('emails').add('welcome', { userId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, delay: 60000, jobId: 'welcome-42', removeOnComplete: { age: 3600 }, repeat: { pattern: '0 * * * *' } })`. `new Worker('emails', async job => { ... }, { concurrency: 5 })`. Job options that TheoKit's `EnqueueOptions` mirrors: `attempts`, `backoff`, `delay`, `jobId` (explicit idempotency key), `removeOnComplete`. Worker `concurrency` mirrors Solid Queue's `threads:`.

Reject from BullMQ: the **Redis-only** stance, the **separate package per primitive** (`@bullmq/pro` for groups, rate limiting, telemetry — all paid). TheoKit ships the same shape in one package with two backends.

### 3.8 Graphile Worker — Postgres SKIP LOCKED reference

Graphile Worker is the precedent that Solid Queue post-dates by 6 years. Same architecture: Postgres `graphile_worker.jobs` table, dequeue via `FOR UPDATE SKIP LOCKED`, file-based task definition (`tasks/<name>.js`), `add_job('task_name', payload, { job_key: 'fingerprint', max_attempts: 25, run_at: '+1 hour' })`. The `job_key` is the idempotency primitive: same key + replace mode = upsert, no-conflict mode = ignore second enqueue.

Their default `max_attempts` is **25** — bonkers high for our taste, but it reflects Postgres-as-queue's high availability (a temporary network blip shouldn't kill a job). TheoKit picks `1` because we want the default to be "ran exactly once, succeeded or surfaced loudly", not "kept retrying for 6 hours then died silently". Users with idempotent handlers opt into higher counts via `maxAttempts: N` in `defineJob`.

What we copy verbatim: the **Postgres schema sketch**. TheoKit's `PostgresJobBackend` will create three tables (`theo_jobs`, `theo_jobs_idempotency`, `theo_jobs_failed`) via a single migration emitted by `theo migrate jobs`. The dequeue SQL is the Solid Queue SQL.

### 3.9 Transactional Outbox — why TheoKit's enqueue MUST defer

The microservices.io reference is clear: the outbox solves the **dual-write problem**. If you `INSERT INTO orders` then `queue.enqueue('send-confirmation')`, three failure modes drop the message:
1. INSERT commits, enqueue request never reaches the queue (network fails) → no email, customer thinks order failed.
2. INSERT rolls back (constraint violation), but enqueue already fired → email sent for an order that doesn't exist.
3. INSERT commits, enqueue succeeds, process dies before returning success → user retries, two enqueues happen.

The outbox solves (1) and (2) by storing the pending message in the same transaction as the business data. A separate publisher polls the outbox and dispatches. (3) is the consumer's job to idempotently handle.

**TheoKit's twist:** we don't have a "user transaction" the framework owns (Rails has ActiveRecord, we don't pick an ORM). What we **do** own is the request lifecycle. So the analog is: `enqueue` queues into a per-request in-memory list; `res.on('finish')` flushes that list to the backend; `res.on('close')` (request errored, never finished) drops the list. This gives the same semantic — handler succeeds → jobs enqueued; handler throws → no jobs. The user does not need to know an outbox exists; they call `ctx.queue.enqueue()` and it does the right thing. See §7.1 for the algorithm.

Edge: if the handler succeeds but `backend.enqueueBatch(...)` itself fails on flush, we have the (3) case. TheoKit logs the failure to `dispatcher` (the existing structured-event channel), the response has already been sent to the client (200 OK), but the job didn't enqueue. **This is the unavoidable failure mode of any outbox-without-2PC.** Documenting it explicitly per the macro roadmap's R0.5.8 line "documented invariant."

---

## 4. Convergent patterns ≥5

These patterns appear in **3+ of the analyzed systems** and TheoKit adopts them without deviation.

1. **Pluggable backend interface, neutral contract.** Rails ActiveJob (`QUEUE_ADAPTER_METHODS = [:enqueue, :enqueue_at]`), BullMQ (`Queue` + `Worker` as separate classes — implicit Redis backend), Inngest (proprietary engine), Graphile Worker (Postgres-only but exposes a `JobHelpers` interface for handlers). TheoKit's `JobBackend` interface has 6 methods: `enqueue`, `enqueueBatch`, `dequeue`, `ack`, `nack`, `prune`. See §9.3.

2. **Named handler with serializable input.** Rails `MyJob.perform_later(args)`, Nitro `defineTask({ run })` + `runTask(name, { payload })`, Inngest `event: 'user.signup'` → handler bound to event, BullMQ `queue.add('jobName', data)`, Graphile `add_job('taskName', payload)`. The name is the routing key; the input must serialize (JSON, no functions, no class instances). TheoKit makes serialization explicit via Zod schema validation at both enqueue and dequeue time.

3. **Idempotency via explicit caller-supplied key.** Inngest (`send({ id })`), BullMQ (`add({ jobId })`), Graphile Worker (`job_key`), Sidekiq (via sidekiq-unique-jobs gem). The framework's role: dedup within a TTL window. TheoKit: `enqueue(name, input, { idempotencyKey: 'order-42' })`. If the same `(name, idempotencyKey)` tuple arrives within the dedup window (default 24h), the second is silently dropped (logs a `job.idempotent_dropped` event).

4. **Structured retry policy: max attempts + backoff function + dead destination.** Rails (`retry_on Exception, wait: :polynomially_longer, attempts: 5`), Inngest (`retries: 4` default), BullMQ (`{ attempts, backoff: { type: 'exponential', delay } }`), Graphile (`max_attempts: 25`), Solid Queue (delegates to ActiveJob). The shape is universal: cap + backoff + terminal sink. TheoKit ships the cap (`maxAttempts: 1` default), polynomial backoff with 15% jitter (copying Rails math), and `theo_jobs_failed` table as the dead sink.

5. **Postgres `FOR UPDATE SKIP LOCKED` for concurrent dequeue.** Solid Queue (`solid_queue_ready_executions`), Graphile Worker (verbatim in `graphile_worker.get_job` stored procedure), DelayedJob with Postgres backend (same). This is **the** correct way to run N workers against a Postgres queue table. TheoKit's `PostgresJobBackend.dequeue()` uses it.

6. **File-based registration via build-time scan.** Nitro (`server/tasks/<name>.ts` → virtual `tasks` module), Rails (`app/jobs/*.rb` autoload), Trigger.dev (`trigger/<name>.ts` collected by their CLI), Inngest (functions in `inngest/` discovered by their dev server). TheoKit copies its existing pattern from `server/routes/` + `server/actions/`: scan `server/jobs/` at build, emit `.theo/jobs.json` manifest (shape per R0.5.7), runtime imports lazily by name.

---

## 5. Divergent patterns + TheoKit choice (rationale per row)

| Choice | Rails/Sidekiq | Inngest | Trigger.dev | Nitro | TheoKit | Rationale |
|---|---|---|---|---|---|---|
| Enqueue return value | job instance or `false` | `{ ids: string[] }` | `{ id: string }` | `Promise<RT>` | **`void`**, overload `{ jobId }` for logs | ADR-0003. Returning anything awaitable is the slippery slope to workflows. `void` makes "enqueue → forget" the only call site. The `{ jobId }` overload is for the log line, never for `await`. |
| Retry default | 5 attempts, polynomial | 4 attempts, exponential | 3 attempts, exponential | 0 (no retries) | **`maxAttempts: 1`** | Surprise retries cause silent double-charges, double-emails, double-anything. Default of 1 says "did it once, told you loudly if it failed." Users opt in deliberately. Polynomial backoff math is copied from Rails for users who set `maxAttempts > 1`. |
| Retry opt-out signal | `discard_on ExcClass` | `NonRetriableError` class | `AbortTaskRunError` | n/a | **`NonRetryableError` class** | Class-based matches Inngest's name and TS-friendly. `throw new NonRetryableError('user_deleted')` → job goes straight to `theo_jobs_failed`, no retry, regardless of `maxAttempts`. |
| Backend lock-in | Multi-backend via adapter | Inngest-engine only | Trigger.dev cloud only | n/a (in-process) | **Two backends: InMemory + Postgres** | Rails won. Locking to Redis (Sidekiq, BullMQ) excludes apps that want zero-Redis (which is most TheoKit apps — agent indies don't want to run a second datastore). Postgres is the realistic prod backend; InMemory is dev + tests. ADR-0002. |
| Transactional behavior | Per-job `enqueue_after_transaction_commit` (Rails 7.1+, default `false`) | Engine-handled (events fire on send) | Engine-handled | None | **Outbox via `res.on('finish')`, default ON, no opt-out** | Rails made it per-job-opt-in because changing the default broke existing apps. TheoKit has no installed base — we get to ship the right default day one. Outbox is the default; if a handler wants fire-and-forget bypass, they can `backend.enqueue` directly (escape hatch, not advertised). |
| Workflow API (`step.run`, chaining, `triggerAndWait`) | None | Core feature | Core feature | None | **Explicitly forbidden** | Per ADR-0006 + macro roadmap "Out of scope for 0.5.0." Workflow engines are a separate product category (Mastra, Inngest, Trigger.dev). TheoKit's job primitive does ONE thing: durable single-shot handler. Users who need workflows compose: enqueue child jobs from inside the handler (each is its own atomic job), OR adopt an upstream workflow tool. |
| Stream consumer (`defineWorker`) | Sidekiq has nothing native | n/a | n/a | n/a | **Rejected — ADR-0006** | The 3 reopen conditions are codified. Adding stream consumers without a managed stream backend in `@usetheo/theo` is premature abstraction. |

---

## 6. Dependency inventory (lean)

| Dependency | Where | Required? | Why | Bundle/runtime cost |
|---|---|---|---|---|
| `zod` | server-side, runtime | already in TheoKit | input validation on `defineJob({ input })` and on dequeue | already paid |
| `pg` (node-postgres) | `PostgresJobBackend` only | **peer dependency, optional** | Postgres driver | 0 cost if user picks InMemory; only loaded on `backend: 'postgres'` |
| (none for InMemory) | `InMemoryJobBackend` | core | uses only `Map<string, Job[]>` and `setTimeout` for visibility | ~150 LOC, zero deps |
| `pino` (or `console`) | observability | already in TheoKit | structured logs for `job.enqueued`, `job.started`, `job.completed`, `job.failed`, `job.idempotent_dropped` | already paid |

**No Redis. No BullMQ. No external queue lib.** This is a deliberate position. Adopting a queue lib (BullMQ, Bee-Queue, Graphile Worker as lib) would let us ship in days but bind us to that lib's design (Redis-only, or Postgres-only, or its lifecycle conventions). Two-backend native is ~600 LOC total + the migration SQL. Worth the budget for the contract control.

**Future:** `@theokit/jobs-redis` adapter as a separate package if/when demand surfaces. Same pattern as auth providers (delegated, not bundled — see `oauth-oidc-delegation.md`).

---

## 7. Algorithms

### 7.1 Transactional outbox via `res.on('finish')` hook (centerpiece)

```typescript
// pseudocode — see §9.2 for actual file
type PendingJob = {
  name: string;
  input: unknown;        // validated against the registered Zod at enqueue time
  options?: EnqueueOptions;
  traceparent?: string;  // captured at enqueue, propagated to job ctx
};

function createRequestOutbox(req: Request, res: Response, backend: JobBackend, dispatcher: Dispatcher) {
  const pending: PendingJob[] = [];
  let committed = false;
  let aborted = false;

  res.on('finish', async () => {
    if (aborted) return;
    committed = true;
    if (pending.length === 0) return;
    try {
      await backend.enqueueBatch(pending);
      dispatcher.send({ kind: 'job.outbox_flushed', count: pending.length });
    } catch (err) {
      // Cannot retry — response already sent. Document this failure mode loudly.
      dispatcher.send({
        kind: 'job.outbox_flush_failed',
        count: pending.length,
        error: serializeError(err),
        names: pending.map(p => p.name),
      });
    }
  });

  res.on('close', () => {
    if (committed) return;       // already flushed
    aborted = true;
    if (pending.length > 0) {
      dispatcher.send({ kind: 'job.outbox_dropped', count: pending.length, reason: 'request_aborted' });
    }
  });

  return {
    enqueue(name, input, options) {
      pending.push({ name, input, options, traceparent: getCurrentTraceparent(req) });
      return; // void per ADR-0003
    },
  };
}
```

The contract:
- Handler throws → response is the error page → `'finish'` does NOT fire (Express/h3 emit `'close'` only on aborted requests). Outbox drops. **No jobs enqueued.**
- Handler succeeds → `res.end()` fires → `'finish'` fires → batch flush. Jobs enqueued.
- Streaming response — `'finish'` fires when the last chunk is written. Jobs flush at end-of-stream.
- Backend flush fails after response sent → logged loudly, response already client-side, request-side outbox is gone. This is the unavoidable failure mode (§3.9, §8 EC-9).

### 7.2 Postgres SKIP LOCKED dequeue (Graphile / Solid Queue pattern)

```sql
-- Schema: theo_jobs (job_id PK, name, input JSONB, run_at TIMESTAMPTZ DEFAULT now(),
--   priority INT DEFAULT 0, attempts INT DEFAULT 0, max_attempts INT DEFAULT 1,
--   idempotency_key TEXT, traceparent TEXT, locked_at TIMESTAMPTZ, locked_by TEXT)
-- INDEX: (run_at, priority) WHERE locked_at IS NULL

-- Dequeue (atomic claim of N jobs by worker_id):
WITH claimed AS (
  SELECT job_id FROM theo_jobs
  WHERE run_at <= now()
    AND locked_at IS NULL
  ORDER BY priority ASC, run_at ASC
  LIMIT $1                 -- batch size, e.g. 10
  FOR UPDATE SKIP LOCKED
)
UPDATE theo_jobs SET locked_at = now(), locked_by = $2  -- $2 = worker_id
WHERE job_id IN (SELECT job_id FROM claimed)
RETURNING job_id, name, input, attempts, max_attempts, traceparent;

-- Visibility timeout sweep (run every N seconds by one process):
UPDATE theo_jobs SET locked_at = NULL, locked_by = NULL
WHERE locked_at IS NOT NULL
  AND locked_at < now() - INTERVAL '5 minutes';  -- default visibility timeout

-- Ack (success):
DELETE FROM theo_jobs WHERE job_id = $1;

-- Nack (failure, may retry):
UPDATE theo_jobs
SET locked_at = NULL, locked_by = NULL,
    attempts = attempts + 1,
    run_at = now() + (interval '1 second' * polynomial_backoff(attempts + 1))
WHERE job_id = $1 AND attempts + 1 < max_attempts;
-- If attempts + 1 >= max_attempts, separate query moves row to theo_jobs_failed.
```

The `SKIP LOCKED` clause is what makes this safe under N concurrent workers — each worker SELECTs only rows it can lock, others are skipped (not blocked). The `INTERVAL '5 minutes'` visibility-timeout sweep recovers jobs whose worker crashed mid-execute (EC-7).

### 7.3 Idempotency dedup with TTL window

**InMemory:** `Map<idempotencyKey, expiresAt>`. On enqueue, check map; if present and `expiresAt > now()`, drop (log). Else write and continue. Sweep every minute.

**Postgres:** Unique index on `theo_jobs_idempotency(idempotency_key)` with `expires_at TIMESTAMPTZ`. INSERT ... ON CONFLICT (idempotency_key) DO NOTHING. RETURNING tells caller whether the insert happened. Garbage-collect expired rows in the same sweep that handles visibility timeout (§7.2).

Default TTL: 24h. Configurable via `defineJob({ idempotency: { ttl: '7d' } })`. Open question: should TTL be per-job or per-enqueue? See §10.

### 7.4 W3C Trace Context propagation

TheoKit already has `traceparent` plumbing (`packages/theo/src/server/http/trace-context.ts` per CLAUDE.md 0.2.0 line). At enqueue, capture current `ctx.traceparent`. Persist in the job row (`traceparent TEXT` column). At dequeue, the worker reconstructs `ctx.traceId` from the job's `traceparent`. Result: log lines from the originating request, the job execution, and any child enqueues all share the same trace chain.

Caveat: cron-triggered jobs have no originating request → fresh trace ID. Document as expected behavior in `docs/concepts/jobs.md`. EC-6.

---

## 8. Edge cases ≥10 with source

| ID | Edge case | Source / pattern | TheoKit handling |
|---|---|---|---|
| EC-1 | **Enqueue inside throwing handler → outbox MUST drop** | microservices.io transactional outbox §3.9; Rails `enqueue_after_transaction_commit.rb:25-36` defers `super` to `after_all_transactions_commit` so a rollback skips the enqueue | §7.1: `res.on('close')` fires before `'finish'` when handler throws; pending list dropped. Integration test `tests/integration/job-outbox-rollback.test.ts` asserts 0 jobs dispatched. |
| EC-2 | **Enqueue inside successful handler that fails on `res.end()`** (e.g. stream backpressure error after data sent) | Same outbox — Rails treats AR transaction commit as the boundary; if commit fails, no enqueue | `'finish'` does not fire if write errors. `'close'` fires with `aborted=true`. Outbox drops. Documented invariant. |
| EC-3 | **Idempotency key collision within TTL window** | Inngest `id` dedup; BullMQ `jobId` upsert behavior | §7.3: Postgres unique-index ON CONFLICT DO NOTHING; second enqueue logs `job.idempotent_dropped` and returns void normally (caller sees success). |
| EC-4 | **Same idempotency key after TTL expiry → re-enqueue allowed** | Inngest dedup window expires; BullMQ jobId reusable after job removed | §7.3 sweep deletes expired rows in `theo_jobs_idempotency`; next enqueue with same key inserts fresh row. |
| EC-5 | **Concurrent dequeue race (N workers)** | Solid Queue `FOR UPDATE SKIP LOCKED`; Graphile Worker `get_job` stored proc | §7.2: Postgres backend uses `SKIP LOCKED`. InMemory backend wraps dequeue in a sync flag (single-process anyway). Test: spawn 4 workers, enqueue 100 jobs, assert each processed exactly once. |
| EC-6 | **Trace context broken — cron-triggered job has new trace, not continuation** | W3C Trace Context spec — root spans start new traces | Documented behavior. `defineCron` (R0.5.4) handler runs in a "root trace" context. Children jobs inherit. Test asserts that within one cron run, child enqueues share the cron's trace ID. |
| EC-7 | **Worker crash mid-execute → job lost?** | Solid Queue `process_alive_threshold` 5min; Graphile Worker job locking timeout | §7.2: visibility timeout sweep returns jobs whose `locked_at < now() - 5min` to ready state. Attempts counter does NOT increment on visibility recovery (it's not the job's fault the worker died) — separate `recovered_count` column for observability. |
| EC-8 | **Infinite retry loop** (handler always throws) | Rails `:unlimited` attempts option (opt-in); Inngest caps at 4 by default | Default `maxAttempts: 1` makes this impossible without explicit opt-in. With higher cap: after `attempts >= maxAttempts`, row moves to `theo_jobs_failed` (terminal, requires manual inspection). `NonRetryableError` short-circuits at any attempt count. |
| EC-9 | **Backend flush fails after response sent** | microservices.io: "may publish duplicates" failure mode of outbox-without-2PC §3.9 | §7.1 logs `job.outbox_flush_failed` with names + count. **Cannot recover** — response already gone. Documented as the known failure mode. Mitigation: PostgresJobBackend's flush is one INSERT, very unlikely to fail; InMemory cannot fail. |
| EC-10 | **Job declared at build but handler removed** (manifest drift) | Trigger.dev: deployment-time validation; Inngest: function ID stays in event log; Graphile Worker: dequeues unknown task → error logged | Worker dequeues a row with `name = 'job-X'`, no handler registered for it. Default: nack with `NonRetryableError('handler_not_found')` → moves to `theo_jobs_failed` immediately. Logs `job.handler_missing` with name. Operator-visible. |
| EC-11 | **Enqueue from action vs route — does outbox apply to both?** | Rails ActiveJob hooks into `after_commit` regardless of where called from | §7.1: yes. Both routes and actions run inside the same request lifecycle (`res.on('finish')` works identically). Defined in `defineAction` and `defineRoute` already share `ctx` plumbing. Open question §10 about whether `defineCron` handlers also use outbox — current answer: no (no `res` to hook). |
| EC-12 | **Enqueue during streaming response** | h3 / Express streams: `'finish'` event fires when the response is fully written, including streamed chunks | §7.1: outbox flushes at end-of-stream when the writable ends. Long-lived SSE streams (chat) → jobs flush at stream close (could be many minutes). Document as expected. For SSE-stream-internal enqueues, alternative: opt-out with `ctx.queue.enqueueImmediate(...)` escape hatch — defer to 0.6 if asked. |
| EC-13 | **Input fails Zod validation at enqueue time** | Trigger.dev validates payload schema at trigger | Throw synchronously from `enqueue` with structured error (zod-style `issues[]`). Outbox not appended. Handler author sees the same Zod errors they'd see for a route body. Test: `enqueue('send-email', { to: 'not-an-email' })` rejects. |
| EC-14 | **Input fails Zod validation at dequeue time** (schema changed since enqueue, persisted data is stale) | Rails `DeserializationError` → discard | Worker logs `job.input_invalid` with both old shape and new schema's issues, moves to `theo_jobs_failed`. Documented: schema changes to job inputs need migration plan (same as DB column changes). |
| EC-15 | **Postgres connection lost during dispatch** | BullMQ Redis reconnect logic; pg-pool reconnect | `pg` Pool auto-reconnects. Enqueue returns rejected promise (outbox logs failure, see EC-9). Worker poll loop catches and retries with exponential backoff (3s, 9s, 27s, capped). Does NOT count toward job's `maxAttempts`. |

---

## 9. Implementation Guide (8 subsections — all filled)

### 9.1 Architecture

```
defineJob(name, { input, handler })  ──► registers in server/jobs/<name>.ts file-scan
       │                                        │
       │                                        ▼
       │                          job-scan.ts builds .theo/jobs.json (manifest, R0.5.7)
       │                                        │
       ▼                                        ▼
ctx.queue.enqueue<Name>(name, input, opts) ──► outbox per request (in-memory list)
       │                                        │
       │                                        ▼  res.on('finish')
       │                          JobBackend.enqueueBatch(pending) ──► InMemory | Postgres
       │                                                                    │
       ▼                                                                    ▼  poll
   typed via Manifest<Name>                                          worker process: dequeue → run handler → ack/nack
```

8 boxes, 4 lifecycle hops. Each layer single-responsibility.

### 9.2 Files to create

| Path | Purpose |
|---|---|
| `packages/theo/src/server/jobs/define-job.ts` | `defineJob<Name, Input>(name, { input, handler, maxAttempts?, idempotency?, hooks? })`. Validates `input` is Zod schema. Registers in module-level map for build-time scan. |
| `packages/theo/src/server/jobs/job-types.ts` | Type-level: `JobRegistry`, `JobName`, `JobInput<Name>`, `JobHandler<Input>`, `EnqueueOptions`, `JobDefinition`. Re-exported via `define/index.ts`. |
| `packages/theo/src/server/jobs/job-backend.ts` | `interface JobBackend { enqueue, enqueueBatch, dequeue, ack, nack, prune }`. Plus `JobRecord` type. |
| `packages/theo/src/server/jobs/job-backend-memory.ts` | `InMemoryJobBackend` — `Map<jobId, Record>` + `setTimeout` for delayed runs + per-key idempotency Map + visibility-timeout sweep. ~250 LOC. |
| `packages/theo/src/server/jobs/job-backend-postgres.ts` | `PostgresJobBackend` — uses `pg` peer dep. Implements §7.2 SQL. Migration SQL embedded as constant + exposed via `theo migrate jobs` CLI subcommand. ~400 LOC. |
| `packages/theo/src/server/jobs/job-scan.ts` | Scans `server/jobs/**/*.ts`, imports each, collects via `defineJob` side-effect into registry. Mirrors `action-scan.ts` pattern. |
| `packages/theo/src/server/jobs/job-manifest.ts` | Emits `.theo/jobs.json` per R0.5.7. Schema: `{ schemaVersion: 1, jobs: [{ name, file, inputSchemaHash, maxAttempts }] }`. Neutral spec (no `theo`-specific fields). |
| `packages/theo/src/server/jobs/queue-client.ts` | `ctx.queue.enqueue` impl. Closure over per-request outbox (§7.1). Type-narrows `name` against `JobRegistry`. |
| `packages/theo/src/server/jobs/outbox.ts` | `createRequestOutbox(req, res, backend, dispatcher)` per §7.1. Hooks `'finish'` / `'close'`. |
| `packages/theo/src/server/jobs/trace-propagation.ts` | `captureTraceparent(ctx)` + `applyTraceparent(ctx, traceparent)`. Wraps existing `trace-context.ts`. |
| `packages/theo/src/server/jobs/non-retryable-error.ts` | `class NonRetryableError extends Error`. ~10 LOC. |
| `packages/theo/src/server/jobs/index.ts` | Public re-exports: `defineJob`, `NonRetryableError`, `JobBackend` (interface only — implementations are internal). |
| `packages/theo/src/server/define/index.ts` | Add `export { defineJob } from '../jobs/index.js'`. |
| `packages/theo/src/server/index.ts` | Public surface re-export. |
| `packages/theo/src/cli/commands/start.ts` | Add `--worker` flag → spawns worker poll loop instead of HTTP server (or in addition, with `--worker --serve`). |
| `tests/unit/define-job.test.ts` | `defineJob` validates name format, requires Zod input, registers handler. |
| `tests/unit/job-backend-memory.test.ts` | Enqueue, dequeue, ack, nack, idempotency dedup, visibility timeout, retry exhaustion. |
| `tests/integration/job-outbox-rollback.test.ts` | **KEY test** — enqueue inside throwing handler, assert 0 jobs in backend. Enqueue in successful handler, assert N jobs. |
| `tests/integration/job-trace-propagation.test.ts` | Enqueue from request with `traceparent: 00-trace-X-...`, dequeue, assert handler `ctx.traceId == X`. |
| `tests/integration/job-backend-postgres.test.ts` | Requires Postgres testcontainer (`@testcontainers/postgresql`). Enqueue 100 jobs across 4 workers, assert each dequeues exactly once. |
| `fixtures/jobs-basic/` | Minimal scaffold with `server/jobs/send-email.ts` and `server/routes/signup.ts` showing the canonical pattern. |
| `examples/full-stack-agent/server/jobs/process-document.ts` | Real-world example: webhook enqueues `process-document`, handler runs LLM extraction, persists result. |

### 9.3 Public API TypeScript signatures

```typescript
// define-job.ts
export interface DefineJobOptions<TInput> {
  input: z.ZodType<TInput>;
  handler: (input: TInput, ctx: JobContext) => Promise<void>;
  maxAttempts?: number;            // default 1
  idempotency?: { ttl?: string };  // default '24h'
  hooks?: {
    onStart?: (ctx: JobContext) => void | Promise<void>;
    onSuccess?: (ctx: JobContext) => void | Promise<void>;
    onFailure?: (ctx: JobContext, error: unknown) => void | Promise<void>;
  };
}

export function defineJob<TName extends string, TInput>(
  name: TName,
  options: DefineJobOptions<TInput>,
): JobDefinition<TName, TInput>;

// job-types.ts (augmented via module declaration in user code or generated)
export interface JobRegistry { /* extended via declaration merging from .theo/jobs.d.ts */ }
export type JobName = keyof JobRegistry & string;
export type JobInput<N extends JobName> = JobRegistry[N];

// queue-client.ts (attached to ctx)
export interface QueueClient {
  enqueue<N extends JobName>(
    name: N,
    input: JobInput<N>,
    options?: EnqueueOptions,
  ): void;
}

export interface EnqueueOptions {
  idempotencyKey?: string;
  delay?: number | string;  // ms or duration string '5m'
  priority?: number;        // smaller = higher (Solid Queue convention)
}

// job-backend.ts
export interface JobBackend {
  enqueue(job: JobRecord): Promise<void>;
  enqueueBatch(jobs: JobRecord[]): Promise<void>;
  dequeue(workerId: string, batchSize: number): Promise<JobRecord[]>;
  ack(jobId: string): Promise<void>;
  nack(jobId: string, error: Error, retryable: boolean): Promise<void>;
  prune(): Promise<void>;  // sweep visibility timeouts + expired idempotency
}

// non-retryable-error.ts
export class NonRetryableError extends Error {
  readonly code: string;
  constructor(code: string, message?: string);
}

// job context (passed to handler)
export interface JobContext {
  jobId: string;
  jobName: string;
  attempt: number;       // 1-based
  maxAttempts: number;
  traceId: string;
  logger: Logger;
  enqueue: QueueClient['enqueue'];  // child enqueues, also outboxed
  signal: AbortSignal;
}
```

### 9.4 Deps

- **No new runtime deps** for `InMemoryJobBackend` + core.
- `pg` declared as **optional peer dependency** in `packages/theo/package.json`. Only loaded when user sets `config.jobs.backend = 'postgres'`.
- Test-only: `@testcontainers/postgresql` in `devDependencies` for `job-backend-postgres.test.ts`.

### 9.5 Test strategy (BDD scenarios)

```gherkin
Feature: Outbox rollback (EC-1)
  Scenario: Enqueue inside throwing route handler
    Given a defined job 'send-welcome' with InMemoryJobBackend
    And a route '/signup' whose handler calls ctx.queue.enqueue('send-welcome', { userId: '42' }) then throws
    When the client posts to /signup
    Then the response is 500
    And the backend contains 0 jobs

  Scenario: Enqueue inside successful handler
    Given a defined job 'send-welcome' with InMemoryJobBackend
    And a route '/signup' whose handler calls ctx.queue.enqueue('send-welcome', { userId: '42' }) and returns 200
    When the client posts to /signup
    Then the response is 200
    And the backend contains exactly 1 job named 'send-welcome' with input.userId === '42'

Feature: Idempotency dedup (EC-3, EC-4)
  Scenario: Same key within TTL window
    Given idempotency TTL is 1h
    When ctx.queue.enqueue('send-welcome', { userId: '42' }, { idempotencyKey: 'k1' }) is called twice
    Then exactly 1 job is persisted
    And the second call logs 'job.idempotent_dropped'

  Scenario: Same key after TTL expiry
    Given idempotency TTL is 100ms
    When ctx.queue.enqueue(..., { idempotencyKey: 'k1' }) is called, then sleep 200ms, then called again
    Then 2 jobs are persisted

Feature: Trace propagation (R0.5.9)
  Scenario: Trace continues from request through job to child enqueue
    Given a route that receives traceparent '00-aaa-bbb-01'
    And the route enqueues 'parent-job', whose handler enqueues 'child-job'
    When both jobs complete
    Then parent-job's ctx.traceId == 'aaa' AND child-job's ctx.traceId == 'aaa'

Feature: Retry exhaustion (EC-8) + NonRetryableError
  Scenario: maxAttempts=3, handler always throws
    Then job is attempted 3 times with polynomial backoff, then row appears in theo_jobs_failed

  Scenario: maxAttempts=5, handler throws NonRetryableError('user_deleted')
    Then job is attempted exactly 1 time, then row appears in theo_jobs_failed with code='user_deleted'

Feature: Backend swap
  Scenario: Same test suite passes against InMemory and Postgres
    Then every test in tests/unit/job-backend-memory.test.ts runs identically via shared contract test against PostgresJobBackend
```

### 9.6 Phases of rollout (3 sub-deliverables of R0.5.5)

**Phase 1 — Core primitive + InMemory + outbox** (1 week)
- `defineJob`, `JobBackend` interface, `InMemoryJobBackend`, `outbox.ts`, `queue-client.ts`, `non-retryable-error.ts`
- `tests/unit/define-job.test.ts`, `tests/unit/job-backend-memory.test.ts`, `tests/integration/job-outbox-rollback.test.ts`
- `fixtures/jobs-basic/` + Playwright spec verifying outbox rollback in real browser
- Dev: same-process worker poll loop (default `theo dev` runs jobs inline)
- Acceptance: signup-enqueues-email flow works end-to-end in fixture; outbox test green

**Phase 2 — Trace context + manifest + scan** (3 days)
- `trace-propagation.ts`, `job-scan.ts`, `job-manifest.ts`
- Manifest schema published to `docs/concepts/jobs-manifest.md` per R0.5.7
- `tests/integration/job-trace-propagation.test.ts`
- CLI: `theo build` emits `.theo/jobs.json`; `theo dev` lists registered jobs in startup log
- Acceptance: traceparent flows; manifest is byte-stable across builds (snapshot test)

**Phase 3 — Postgres backend + worker process** (1 week)
- `job-backend-postgres.ts` + migration SQL
- `theo migrate jobs` CLI subcommand
- `theo start --worker` mode in `cli/commands/start.ts`
- `tests/integration/job-backend-postgres.test.ts` with testcontainer
- Contract test: shared suite runs against both backends
- Acceptance: 4-worker Postgres test green; `examples/full-stack-agent/server/jobs/process-document.ts` runs against Postgres

### 9.7 Acceptance criteria (gates R0.5.5 done)

1. `defineJob` + `ctx.queue.enqueue` shipped with both backends.
2. Outbox rollback test green (EC-1).
3. Trace propagation test green (EC-6 happy path).
4. Idempotency dedup test green (EC-3, EC-4).
5. Postgres backend passes contract test with 4 concurrent workers (EC-5).
6. `theo start --worker` documented and runs in `examples/full-stack-agent/`.
7. `.theo/jobs.json` manifest emitted with versioned schema (R0.5.7 contract).
8. `NonRetryableError` short-circuits retries (EC-8 second scenario).
9. README "What you get" line added: "Background work that survives the response — enqueue from any route, run on a worker, idempotent by key."
10. CHANGELOG `[Unreleased]` entry under `Added` referencing R0.5.5/6/7/8/9.
11. Zero new runtime deps in `dependencies` (only optional peer `pg`).
12. Devtools panel "Jobs" tab shows enqueue events + worker status (reuses `dispatcher` from existing devtools infrastructure).

### 9.8 Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Outbox `'finish'` semantics differ between Node http and h3/Hono adapters | Medium | High | Test against all 8 deploy adapters' lifecycle (Phase 3 prep). Fallback: explicit `ctx.commit()` opt-in if `'finish'` is unreliable on a given runtime. |
| Users assume `enqueue` is synchronous → write code that depends on it | Low | Medium | Type signature returns `void`; docs lead with "enqueue queues, worker runs". Lint rule (future): warn on `await ctx.queue.enqueue(...)`. |
| Postgres backend's `pg` peer dep confuses dev who expected zero-config | Medium | Low | InMemory is default. Postgres requires both `config.jobs.backend = 'postgres'` AND `pg` installed → actionable error message if missing. |
| Workflow-API pressure ("can I await the job result?") | High | High | ADR-0003 codified. Maintainer responds with link, not implementation. README explicitly says "single-shot, no workflows — see Inngest/Trigger.dev/Mastra for workflows." |
| Migration drift — user adds column to job's input Zod, old persisted jobs fail validation at dequeue (EC-14) | Medium | Medium | Document "input schemas are like DB columns — additive changes are safe, removals/renames need migration." Schema hash in manifest helps detect drift. |
| Postgres `SKIP LOCKED` not available on user's MySQL/SQLite | Low | Low | Document Postgres 9.5+ as minimum. SQLite/MySQL fallback to InMemory or future MySQL backend (out of 0.5.0). |
| Visibility timeout default (5min) too aggressive for slow LLM jobs | Medium | Medium | Per-job `visibilityTimeout` option in `defineJob({ visibilityTimeout: '30m' })`. Default fits most webhook + email workloads. |

---

## 10. Open questions ≥3

1. **Does outbox apply to actions, cron handlers, and webhook handlers, or only routes?** Routes and actions have `res.on('finish')`. Cron handlers (R0.5.4) and standalone scheduled work do NOT — they run in a worker, not a request. Decision needed: do cron handlers enqueue directly (no outbox) or also adopt a per-invocation outbox-equivalent? Current leaning: cron handlers enqueue directly (no outbox) because they don't have a "user transaction" to defer to. Document explicitly. Webhook handlers (R0.5.10) are routes → use outbox.

2. **Should we expose `enqueueDelayed(ms)` or force users to use `defineCron` for delay?** Trigger.dev has `task.trigger(payload, { delay: '5m' })`. BullMQ has `add(..., { delay })`. Rails has `wait_until:`. Argument for: deferred enqueues are a common pattern (retry-in-15-minutes, send-reminder-tomorrow). Argument against: scope creep — if you need "in 24h" you probably want cron. Current leaning: ship `{ delay }` option in `EnqueueOptions` (the SQL already supports `run_at`); reserve recurring patterns for `defineCron`. Decide before Phase 1 lands.

3. **Idempotency dedup window — config-level (per backend), per-job (in `defineJob`), or per-enqueue (caller-set)?** All three are possible:
   - Per-backend: `config.jobs.idempotency.ttl = '7d'` — simplest, but inflexible.
   - Per-job: `defineJob({ idempotency: { ttl: '7d' } })` — schema-time, fits per-job semantics.
   - Per-enqueue: `enqueue(..., { idempotencyKey, idempotencyTtl: '7d' })` — most flexible, easiest to misuse.
   
   Current leaning: per-job default `'24h'`, with per-backend global override. Per-enqueue TTL deferred.

4. **`{ jobId }` overload for log correlation — opt-in via second-arg or opt-in via separate method `enqueueWithJobId`?** ADR-0003 says `void` is the default return. Need a way to get the jobId for log lines (`logger.info('enqueued job', { jobId })`). Option A: `const { jobId } = ctx.queue.enqueue(name, input, { withJobId: true })` (type narrows). Option B: separate method `enqueueTraced(name, input) → { jobId }`. Option C: jobId always emitted as a structured-log event, never returned — callers correlate via `dispatcher` not return value. Option C is most aligned with the void contract but worst DX.

5. **Per-job `concurrency` key (Solid Queue's `limits_concurrency`) — defer to 0.6 or include in 0.5.0?** Real ask in agent apps ("don't run 2 LLM jobs for the same user simultaneously"). Adding it now means a `theo_jobs_blocked` table and dispatcher logic. Probably defer — out of scope as documented in §3.2.

6. **Trigger.dev fetch returned 404 → are there v3 task semantics we missed?** Need to re-fetch from `https://trigger.dev/docs/tasks` (without `triggers/overview` subpath). Likely confirms what we have from prior knowledge (`task()`, `task.trigger()`, retry config, lifecycle hooks) — but should be verified before Phase 1 locks the API.

7. **AWS SQS / Cloudflare Queues / W3C Trace Context detail** — listed as optional in research scope, not fetched. SQS would inform `visibility timeout` defaults (their default is 30s, ours is 5min — worth comparing). CF Queues would inform whether the W3C trace `traceparent` header propagates through their wire format. Defer to a follow-up reference doc if/when we ship a managed-queue adapter.

---

## 11. Referências citadas

| Ref | Source | What it anchors |
|---|---|---|
| Rails 1 | `referencias/rails/activejob/lib/active_job/enqueuing.rb:81-88` | `perform_later` shape |
| Rails 2 | `referencias/rails/activejob/lib/active_job/queue_adapter.rb:71` | `QUEUE_ADAPTER_METHODS = [:enqueue, :enqueue_at]` — minimum backend contract |
| Rails 3 | `referencias/rails/activejob/lib/active_job/enqueue_after_transaction_commit.rb:25-36` | Transactional outbox in Rails — the pattern TheoKit copies, swapping AR commit for `res.on('finish')` |
| Rails 4 | `referencias/rails/activejob/lib/active_job/exceptions.rb:66-85` | `retry_on` API surface, `:polynomially_longer` backoff math, default 5 attempts |
| Nitro 1 | `referencias/nitro/src/runtime/internal/task.ts:7-14` | `defineTask` minimal signature (control case) |
| Nitro 2 | `referencias/nitro/src/runtime/internal/task.ts:19-51` | `runTask` in-process invocation + same-name dedup (control case) |
| Web 1 | https://www.inngest.com/docs/learn/inngest-functions | Inngest `createFunction` + `step.run` model (rejected for TheoKit per ADR-0003) |
| Web 2 | https://microservices.io/patterns/data/transactional-outbox.html | Canonical outbox pattern — dual-write problem, idempotent consumer requirement |
| Web 3 | https://github.com/rails/solid_queue (README) | Solid Queue architecture: supervisor + workers + dispatchers, `FOR UPDATE SKIP LOCKED` SQL, default polling intervals, `limits_concurrency`, `recurring.yml` |
| Web 4 | Trigger.dev v3 docs (404 on `/triggers/overview` — prior-knowledge backfill) | `task()` + `task.trigger()` shape, lifecycle hook names |
| Web 5 | https://docs.bullmq.io (thin response — prior-knowledge backfill) | `Queue.add` options shape (`attempts`, `backoff`, `delay`, `jobId`, `repeat`), Worker concurrency |
| Web 6 | https://github.com/graphile/worker (thin response — Solid Queue SQL confirms shared pattern) | Postgres `FOR UPDATE SKIP LOCKED` precedent, `job_key` idempotency, `add_job` shape |
| TheoKit 1 | `packages/theo/src/server/define/` (existing structure) | Confirms `define-*.ts` naming + re-export pattern |
| TheoKit 2 | `packages/theo/src/server/scan/` (existing structure) | Confirms scan + manifest pattern (`action-scan.ts`, `ws-scan.ts`, `manifest.ts`) |
| TheoKit 3 | `CLAUDE.md` Architectural decisions on record → ADR-0002/0003/0006 | Locked constraints on backend interface, enqueue return value, defineWorker rejection |
| TheoKit 4 | `CLAUDE.md` Roadmap 0.5.0 R0.5.5–R0.5.9 | Locked scope this doc implements |
| TheoKit 5 | `.claude/knowledge-base/reference/webhook-signing.md` | Sibling primitive — `defineWebhook` handlers will enqueue jobs |
| TheoKit 6 | `.claude/knowledge-base/reference/cron-primitives.md` | Sibling primitive — `defineCron` handlers will enqueue jobs |
| TheoKit 7 | `.claude/knowledge-base/reference/caching-and-revalidation.md` | Shares `res.on('finish')` lifecycle hook pattern |
