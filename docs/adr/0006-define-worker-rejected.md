# 0006. `defineWorker` (stream consumer) — REJECTED with 3 reopen conditions

* Status: rejected
* Date: 2026-05-24
* Decided: 2026-05-24 (codifies scope review, blocks future "let's add `defineWorker`" PRs from re-litigating)
* Deciders: [TheoKit team]
* Tags: [scope-lock, anti-feature, streams, kafka, nats, redis-streams, agent-orchestration]

## Context and Problem Statement

`defineCron` (R0.5.4) handles time-triggered work. `defineJob` (R0.5.5)
handles request-triggered async work via outbox+queue. `defineWebhook`
(R0.5.10) handles HTTP-triggered external events. The conspicuous gap:
**stream-triggered work**.

The "missing primitive" would look like:

```typescript
// HYPOTHETICAL — explicitly rejected
export default defineWorker('order-events', {
  stream: 'orders.placed',
  handler: async ({ message, ack }) => {
    // process Kafka/NATS/Redis Streams message
    await ack()
  }
})
```

Stream-triggered handlers are widely used in agent platforms (Hermes
spawns subagent off message bus events; Mastra orchestrates agent
hand-offs via stream channels) and in production microservices
(Kafka consumers, NATS subscribers, Redis Streams XREADGROUP). The
question: should TheoKit ship `defineWorker` alongside cron + job +
webhook?

The temptation is high. Frameworks that aspire to "agent app" cover
either pull (`defineJob`) OR push (`defineWorker`) — covering both
feels like completing the matrix. Three concrete proposals have
surfaced in scoping reviews:

1. **`defineWorker({ stream, handler })`** consuming from a pluggable
   `StreamBackend` (Kafka/NATS/Redis Streams/Cloudflare Queues consumer)
2. **`defineSubscriber({ topic, handler })`** for pub/sub primitives
3. **Inlining stream consumption into `defineWebhook`** ("treat the
   stream as an HTTP webhook") — collapsing the primitive

This ADR rejects all three for 0.5.0 AND lists the conditions under
which the rejection becomes revisitable.

## Considered Options

* **Option 1 — Ship `defineWorker` with pluggable `StreamBackend`.**
  Symmetric with `defineJob`. Backends for Kafka, NATS, Redis Streams,
  CF Queues consumer. Full feature.
* **Option 2 — Ship `defineSubscriber` for pub/sub semantics only
  (no consumer-group/ordering/exactly-once).** Simpler than full
  stream consumer. Still picks a backend.
* **Option 3 — Inline stream consumption into `defineWebhook`.**
  Treat the stream message as "HTTP POST from the broker". Awkward
  semantically; doesn't solve the consumer-group problem.
* **Option 4 — Reject; document the boundary; users plug stream
  consumers as ordinary Node code outside TheoKit's `define-*` family
  (recommended).** TheoKit owns request-shaped primitives. Stream
  consumption is its own discipline — KafkaJS, NATS clients, BullMQ
  workers all run alongside TheoKit perfectly.

## Decision Outcome

Chosen option: **Option 4 — REJECT for 0.5.0.**

### Reasons

1. **Stream semantics are a DEEP layer.** Real stream consumers handle:
   - Ordering guarantees (per-partition for Kafka; per-subject for NATS;
     none for Redis pub/sub; per-stream for Redis Streams)
   - Consumer-group rebalancing on member join/leave
   - Exactly-once vs at-least-once delivery
   - Offset management (commit-after-process vs commit-before-process)
   - Dead-letter routing on poison messages
   - Lag monitoring + scaling triggers
   - Backpressure
   These are NOT solved problems. Every backend treats them differently.
   KafkaJS abstracts Kafka. NATS.js abstracts NATS. They are not
   interchangeable behind a single `StreamBackend` interface.
2. **No universal backend.** Unlike jobs (Postgres SKIP LOCKED works
   for ~all use cases), there is no "default in-memory" stream that
   shares semantics with Kafka or NATS. An "InMemoryStreamBackend"
   would either lie about ordering (and surprise users at deploy) OR
   require so much config that it becomes a teaching tool, not a
   primitive.
3. **Crosses into agent-orchestration territory.** Multi-agent
   coordination over a message bus (Hermes subagent spawning, Mastra
   hand-offs) IS the use case for stream consumers. TheoKit's locked
   mission ("Build the app your agent lives in") explicitly delegates
   agent orchestration to upstream layers (`@usetheo/sdk`, Mastra,
   LangGraph). Adding `defineWorker` reopens that boundary.
4. **Existing tools fit perfectly alongside.** Users who need a stream
   consumer write:

   ```typescript
   // server/lib/stream-consumer.ts — NOT a TheoKit primitive
   import { Kafka } from 'kafkajs'

   const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKERS!] })
   const consumer = kafka.consumer({ groupId: 'orders-worker' })

   await consumer.connect()
   await consumer.subscribe({ topic: 'orders.placed' })
   await consumer.run({
     eachMessage: async ({ message }) => {
       // process message
     },
   })
   ```

   This runs in the same Node process as `theokit start`. It uses
   TheoKit's `ctx.queue.enqueue` to fan messages into jobs if the work
   should compose with outbox semantics. The integration is one
   `kafka.consumer({...}).run()` call. Wrapping it in `defineWorker`
   adds ceremony without adding capability.
5. **Adapter translation problem.** `defineCron` translates to platform
   triggers (Vercel JSON, CF wrangler, EventBridge). `defineWorker`
   has no analogous translation — Kafka doesn't deploy to Vercel; CF
   Queues consumer is its own thing; AWS MSK is configured externally.
   The "build-time emit a manifest entry" pattern doesn't apply.
6. **Scope hygiene.** The ondas budget for 0.5.0 already covers 11
   roadmap items + 5 ADRs. Adding `defineWorker` (with even one
   backend) inflates the wave by 30-40%. Better to ship 0.5.0 tight
   and add `defineWorker` ONLY if conditions below trigger.

## Re-evaluation triggers (the 3 named conditions)

This ADR REOPENS only if ALL of the following become TRUE:

1. **`theo` platform offers a hosted, managed stream backend** with a
   stable contract (`StreamBackend` interface implementable). Without a
   hosted reference, "InMemory" backend ships unfair semantics.
2. **≥3 real TheoKit users in production demand `defineWorker`** with
   measurable pain — they currently consume streams with raw KafkaJS /
   NATS / Redis Streams code AND request first-class framework support
   AND wouldn't be satisfied by docs showing the integration pattern.
3. **TheoKit formalizes an "agent layer" runtime** (beyond
   `defineAgentEndpoint` + `defineAgentTool` + `createConversationHistory`)
   where stream-triggered handoff becomes a CORE concern, not an
   external concern.

If only ONE or TWO of those become true, this ADR stays rejected.
The framework adds a guide ("how to consume streams alongside
TheoKit") and points to external libs (KafkaJS, NATS.js, BullMQ,
ioredis), NOT a new `define-*` primitive.

### Anti-pattern to watch for

If a PR shows up titled "Add minimal `defineWorker` for one backend
(just Kafka, just CF Queues, just BullMQ)", the answer is **NO** unless
all 3 conditions above are met. The "just one backend" framing creates
exactly the lock-in problem ADR-0002 spent words avoiding. We do NOT
adopt the streams category piecemeal.

### What we DO support alongside streams

| User need | TheoKit primitive | Pattern |
|---|---|---|
| Stream message triggers job | `ctx.queue.enqueue` from raw consumer | Consumer code runs; fans into outbox-free `enqueue` (no `ctx` available outside request — see Open Q in jobs reference doc) |
| Stream message triggers HTTP | Internal HTTP route + raw consumer POSTs to it | Consumer becomes a webhook sender to TheoKit's own route |
| Stream message updates cache | `revalidatePath` or `revalidateTag` from consumer | Cache API is callable from non-request context |
| Stream message renders agent response | Raw consumer + `defineAgentEndpoint` orchestration | The agent SDK owns the LLM call; consumer fans events |

All of these work TODAY (post-0.5.0) without a `defineWorker` primitive.

## Consequences

* **Good:** 0.5.0 ships on its ondas budget without stream-consumer
  inflation.
* **Good:** The "agent app" wedge stays sharp — TheoKit doesn't
  reach into agent-orchestration territory. Mastra, LangGraph, Hermes
  remain the answer for multi-agent coordination over message buses.
* **Good:** The reopen criteria are NAMED. Future PRs that try to
  add stream consumers in disguise get pointed back here.
* **Bad:** Users who genuinely want streams have to write raw consumer
  code. Docs page (`docs/concepts/integration-streams.md`) MUST exist
  to show the canonical pattern.
* **Neutral:** If theo PaaS eventually ships managed streams, this ADR
  becomes the entry point for that scoping discussion.

## Related artifacts

- Reference doc: `.claude/knowledge-base/reference/jobs-primitives.md`
  (§3.9 — explicit out-of-scope notes; §5 — divergent patterns
  including stream consumers)
- Roadmap entry: CLAUDE.md "Out of scope for 0.5.0" table — first
  row codifies the rejection
- Sibling ADRs: ADR-0002 (`JobBackend` neutral — pull side; stream is
  push side, intentionally absent), ADR-0003 (`enqueue` returns void —
  same anti-scope discipline applied to the request side)
- Boundary docs: CLAUDE.md "Out of scope — intentionally" section under
  Roadmap declares "Built-in agent orchestration" out of scope — stream
  consumers cross this boundary
