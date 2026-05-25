# Plan: Jobs + Crons + Webhooks + Cost Tracking (0.5.0 backbone)

> **Version 1.1** — Implement the four primitives that turn TheoKit from a "request/response framework" into a "framework for autonomous agent apps": `defineCron`, `defineJob` + `ctx.queue.enqueue`, `defineWebhook`, and `trackAgentRun`. Each ships with a neutral backend interface, a transactional outbox where applicable, W3C Trace Context propagation, fixtures, and per-adapter platform translation. The expected outcome: a TheoKit user can declare a time-triggered handler, a background job, a webhook from Stripe/GitHub/Slack, and per-user agent cost tracking — all in idiomatic TS files under `server/`, validated by Zod, deployable to Node/Vercel/Cloudflare/AWS without changing the user code.

## Context

What exists today (confirmed via grep on `2026-05-24`):

- **Zero cron primitives** in `packages/theo/src/`. The only "enqueue" in the codebase is `controller.enqueue(encodeSSE(...))` in `define-agent-endpoint.ts` (ReadableStream SSE — unrelated to job queues).
- **Zero job/queue primitives.** No `JobBackend`, no `ctx.queue`, no outbox machinery.
- **Zero webhook primitives.** `defineRoute` exposes `csrf: false` opt-out documented as "for endpoints that legitimately receive third-party POSTs (Stripe webhooks, GitHub webhooks, OAuth callbacks)" (`packages/theo/src/server/define/define-route.ts:14-22`), but every user has to manually parse signatures, re-read raw body, compute HMAC, handle timing-safe comparison, validate replay windows — security footgun territory.
- **Zero cost tracking** for agent runs. The client-side `<CostMeter>` from `@usetheo/ui` exists; server-side primitive does not.

Why now (evidence-driven):

1. **Mission gap (CLAUDE.md, locked 2026-05-21):** TheoKit is "the Next.js for agents — the framework where someone builds *their own* agent app." Agents are autonomous: they fire on time triggers ("every morning check HN"), process work in background ("ingest these 500 PDFs"), react to external events ("Stripe subscription approved"), and track per-user cost. Without these four primitives, TheoKit is — empirically — a Next.js clone with CSRF improvements.
2. **Competitive evidence (web research 2026-05-24):** Hermes Agent (Nous Research, MIT, Feb/2026) ships natural-language cron, `/background` subagent spawning, and 14 messaging gateway adapters as core capabilities. OpenCode required a community plugin (`opencode-scheduler`) AND an official issue #11232 to gain scheduling. Agents that lack these primitives are categorized as "chat wrappers" by their own communities.
3. **Roadmap commitment (CLAUDE.md §0.5.0):** R0.5.4 through R0.5.11 lock these as the 0.5.0 deliverable. The roadmap also identifies the prerequisites (R0.5.1-3) as blocking ship-to-latest — NOT blocking design/implementation.

Artifacts that fed this plan:

- `.claude/knowledge-base/reference/cron-primitives.md` (7601 words; 12 edge cases; 7 convergent patterns; 5 open questions)
- `.claude/knowledge-base/reference/jobs-primitives.md` (7658 words; 15 edge cases; 6 convergent patterns; 7 open questions)
- `.claude/knowledge-base/reference/webhook-signing.md` (11432 words; 16 edge cases; ≥5 convergent patterns; 5 open questions)
- ADRs `0002` through `0006` (1097 lines across 5 files)
- Edge-case review (`docs/reviews/edge-case-plan/jobs-crons-webhooks-cost-tracking-edge-cases-2026-05-24.md`) — 14 additional edge cases incorporated as EC-101..EC-114 below (4 MUST FIX folded into tasks, 4 SHOULD TEST added to TDD cycles, 6 DOCUMENT to be addressed in T6.3 concept docs)

## Objective

**Done** = a user clones a TheoKit project, declares `server/crons/morning-summary.ts`, `server/jobs/process-document.ts`, `server/webhooks/stripe.ts`, instruments `trackAgentRun(...)` in `server/routes/chat.ts`, runs `theokit dev` and `theokit build --target=vercel`, and ALL FOUR PRIMITIVES WORK in dev and produce correct manifest + platform translation for production.

Specific measurable goals:

- G1. `defineCron` validates 5-field UTC strict, scans `server/crons/`, emits `.theo/crons.json`, translates to Vercel + CF + AWS adapters at build time, fires in dev via in-memory Node scheduler.
- G2. `defineJob` + `ctx.queue.enqueue` declares typed jobs, persists via `JobBackend` interface, ships InMemory + Postgres adapters, outbox semantics drop jobs on request rollback, W3C Trace Context propagates request → enqueue → job handler.
- G3. `defineWebhook` accepts a `verify` function (helper factory pattern), ships Stripe/GitHub/Slack helpers, preserves raw body for HMAC, fails closed (401) on invalid signature.
- G4. `trackAgentRun` accumulates per-user usage via `UsageStorageAdapter` (InMemory default), surfaces `getUsage({ userId, period })` for tier enforcement, integrates with `defineAgentEndpoint` to auto-track on `Agent.prompt` completion.
- G5. Each primitive ships with a fixture project in `fixtures/`, a working example in `examples/full-stack-agent/`, and a concepts doc in `docs/concepts/`.
- G6. All 4 primitives covered by TDD strict cycle. Zero `any` in production code. `pnpm typecheck`, `pnpm lint`, `pnpm test`, dependency-cruiser, ls-lint all green. `/dogfood full` health ≥ 70.

## ADRs

| ID | Decision | Rationale | Consequences |
|---|---|---|---|
| **D1** | `JobBackend` interface is neutral; InMemory + Postgres in core; Redis/SQS as community packages | Rails ActiveJob `queue_adapter` is proven at 12+yr scale. Postgres composes with outbox (Redis can't). Zero-dep dev experience. | Theo PaaS slots in as a third backend without modifying core or user code. Third-party `@theokit/jobs-*` packages straightforward. Trade-off: interface drift risk mitigated via optional methods + versioning. (Codified in `docs/adr/0002-job-backend-interface-neutral-contract.md`.) |
| **D2** | `ctx.queue.enqueue` returns `void`; `enqueueWithId` overload for log correlation; transactional outbox semantics locked | Workflow API (`enqueue().then(result)`) reaches into Inngest/Trigger.dev territory; TheoKit's wedge is web framework, not workflow engine. `void` makes outbox tractable (caller can't await before res.commit). | Future PRs that want `Promise<Result>` hit a structural wall (would need to rewrite outbox + queue client simultaneously). Onboarding friction for users coming from Inngest mitigated via `docs/concepts/jobs.md`. (Codified in `docs/adr/0003-enqueue-returns-void-transactional-outbox.md`.) |
| **D3** | Cron schedule = 5-field UTC strict; no timezone, no shorthand, no 6-field | Vercel + CF + AWS all support exactly this subset. Anything richer fails translation to ≥1 adapter. Timezone semantics for cron are user-hostile across DST. | Every adapter translator is trivial (pass-through). Dev and prod never diverge. Users from NestJS/Quartz find rejection surprising — mitigated via docs migration table. (Codified in `docs/adr/0004-cron-schedule-5-field-utc-strict.md`.) |
| **D4** | Webhook `verify` is a helper-factory function (`verify: stripe(secret)`), not a class hierarchy | Matches `defineRoute`/`defineAction` "define" pattern. Tree-shakes perfectly. No new vocabulary (`new VerifierClass`). Custom verifiers cost zero framework code. | Three first-party helpers (Stripe, GitHub, Slack) cover ~95% of webhook deployments by volume. Others ship as `@theokit/webhook-*` packages or user `verify: async (req) => ...` inline. (Codified in `docs/adr/0005-webhook-verify-inline-function.md`.) |
| **D5** | `defineWorker` (stream consumer for Kafka/NATS/Redis Streams) REJECTED with 3 named reopen conditions | Stream semantics are a deep layer (ordering, consumer groups, exactly-once); no universal backend; crosses into agent-orchestration territory. KafkaJS/NATS.js fit perfectly alongside TheoKit without a `define-*` wrapper. | Scope-locked. Future PRs that add `defineWorker` "just for one backend" rejected with link to ADR. Users needing streams write raw consumer code that calls `ctx.queue.enqueue` (when in request context) or runs standalone. (Codified in `docs/adr/0006-define-worker-rejected.md`.) |
| **D6** | Prerequisites R0.5.1-3 (Vercel deploy validation + Playwright 3 templates + bundle CI) run on parallel release-engineer track; do NOT block this plan's local implementation | CLAUDE.md guidance "theoretical work on unvalidated foundation" applies to ship-to-`latest`, not to local development. Code and adapters are testable locally via unit + integration tests. Deploy validation is operational, not engineering. | This plan ships in dev + local CI without needing prod validation. Final ship of 0.5.0 minor blocks on R0.5.1-3 closing in parallel. Explicit dependency note in Final Phase. |
| **D7** | `trackAgentRun` accumulates via `UsageStorageAdapter` interface, InMemory default; Redis/Postgres recipes in 0.6.0 (R0.6.7) | Mirrors `JobBackend` pattern. Zero-dep dev. Production users pick storage. Theo PaaS can ship hosted backend later. | One more pluggable interface. Trade-off accepted because the analogy to JobBackend is exact and the costs are bounded. |
| **D8** | Outbox semantics apply to **routes only**, not actions (for now) | Routes have explicit `res.on('finish')` lifecycle to hook. Actions in TheoKit use the Web Response model — lifecycle differs. Open question Q4 in jobs reference doc tracks "extend to actions". | Users calling `ctx.queue.enqueue` from a server action get IMMEDIATE dispatch (not outbox). Documented as known limitation in `docs/concepts/jobs.md`. Revisited post-0.5.0 if user demand emerges. |

## Dependency Graph

```
Phase 0 — Foundation (shared helpers)
  │
  ├──▶ Phase 1 — Cron  (parallel with Phase 2-3)
  │      │
  │      └──▶ Phase 6 fixtures+docs (cron parts)
  │
  ├──▶ Phase 2 — Jobs Core (InMemory + outbox)
  │      │
  │      └──▶ Phase 3 — Jobs Postgres (depends on Phase 2)
  │             │
  │             └──▶ Phase 6 fixtures+docs (jobs parts)
  │
  ├──▶ Phase 4 — Webhook (parallel with Phase 1-3)
  │      │
  │      └──▶ Phase 6 fixtures+docs (webhook parts)
  │
  └──▶ Phase 5 — Cost Tracking (depends on Phase 0 only)
         │
         └──▶ Phase 6 fixtures+docs (cost parts)

Phase 6 — Fixtures + Examples + Docs + Cross-validation + Dogfood
  ▲
  └── runs AFTER Phases 1-5 complete

Parallelism: Phase 1, 2, 4, 5 can be implemented concurrently after Phase 0.
Phase 3 sequences after Phase 2 (needs JobBackend interface stable).
```

---

## Phase 0: Foundation — shared helpers

**Objective:** Establish three primitives shared by ≥2 downstream phases so each phase doesn't re-invent them.

### T0.1 — `timing-safe-equal` unified wrapper (Web Crypto + Node fallback)

#### Objective
A single function `timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean` that works in Node 18+ (using `node:crypto.timingSafeEqual`) and Cloudflare Workers/Deno/Bun (using a constant-time Uint8Array comparison fallback). Required by webhook signature verification (Phase 4) and reusable for any future HMAC operation.

#### Evidence
- Webhook reference §7, §8 EC-9: timing-attack on early-return string compare is the canonical webhook security bug.
- `node:crypto.timingSafeEqual` exists since Node 6.6.0 but is NOT available in Cloudflare Workers/Deno/Bun (different runtime).
- TheoKit ships 8 deploy adapters — all 4 webhook helpers must work everywhere.

#### Files to edit
```
packages/theo/src/server/webhook/timing-safe-equal.ts (NEW) — unified wrapper
tests/unit/timing-safe-equal.test.ts (NEW) — verify both code paths
```

#### Deep file dependency analysis
- `timing-safe-equal.ts` (NEW): exports one function. Imports `node:crypto` lazily (try-import pattern) to avoid breaking edge bundles. Falls back to constant-time XOR-accumulate loop when `crypto.timingSafeEqual` is unavailable.
- Downstream consumers: Phase 4 (`webhook/providers/stripe.ts`, `webhook/providers/github.ts`, `webhook/providers/slack.ts`).

#### Deep Dives
- **Algorithm (fallback path):** length-compare first (constant for given input), then XOR all bytes with `|=` into an accumulator, return `accumulator === 0`. NEVER short-circuit on mismatch.
- **Why not `crypto.subtle.verify` for everything:** Web Crypto's `verify` requires a CryptoKey object — for HMAC verification it's idiomatic but heavier than raw byte comparison when caller already has the computed digest.
- **Invariant:** function MUST take constant time relative to input length (not relative to mismatch position).

#### Tasks
1. Create `timing-safe-equal.ts` exporting `timingSafeEqual(a, b): boolean`.
2. Lazy-import `node:crypto`; cache the resolved fn at module-load.
3. Implement constant-time XOR fallback for non-Node runtimes.
4. Add JSDoc with rationale and Web Crypto + Node API references.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED: test_equal_buffers_returns_true — Given two identical 32-byte arrays, When timingSafeEqual called, Then returns true.
RED: test_different_buffers_returns_false — Given two different 32-byte arrays, When called, Then returns false.
RED: test_different_lengths_returns_false — Given arrays of length 32 and 31, When called, Then returns false (length-mismatch fast-path).
RED: test_empty_buffers_returns_true — Given two zero-length arrays, When called, Then returns true.
RED (timing): test_constant_time_no_early_return — Given two 1024-byte arrays differing at byte 0 vs differing at byte 1023, When timed across 10k iterations, Then median wall-clock delta is < 5% (statistical assertion).
GREEN: Implement lazy-import + constant-time XOR fallback.
REFACTOR: None expected.
VERIFY: npx vitest run tests/unit/timing-safe-equal.test.ts
```

BDD scenarios:
- Happy path: equal buffers → true
- Validation error: different lengths → false
- Edge case: empty buffers → true
- Error scenario: non-Uint8Array input → throws TypeError

#### Acceptance Criteria
- [ ] All 5 RED tests pass after GREEN
- [ ] Function exported from `packages/theo/src/server/webhook/timing-safe-equal.ts`
- [ ] JSDoc references node:crypto + Web Crypto fallback
- [ ] Pass: TypeScript strict check
- [ ] Pass: Lint check
- [ ] Pass: Type tests pass

#### DoD
- [ ] All tasks completed and validated
- [ ] All tests green
- [ ] Zero TS errors / lint warnings
- [ ] `pnpm exec dependency-cruiser` 0 violations
- [ ] No new runtime dependency (pure Node + Web Crypto built-ins)

---

### T0.2 — Raw body preservation helper (with body size limit)

#### Objective
A helper that reads a Web `Request`'s body as a string EXACTLY ONCE and exposes it to both the verification step and the handler, without breaking the existing body-parser pipeline. Required by webhook (Phase 4) — must be reusable by jobs (Phase 2-3) if a future feature consumes raw body. **EC-101: enforces `maxBodyBytes` cap to prevent OOM via gigantic POST.**

#### Evidence
- Webhook reference §8 EC-7: "body parsed before verify" is the canonical webhook bug.
- TheoKit's existing `parseRequestBody` in `packages/theo/src/server/body-parser.ts` consumes the Web Request body and returns parsed form/JSON — destroys the raw bytes needed for HMAC.
- Fastify ships `fastify-raw-body` for the same reason; Nitro provides `getRawBody(event)`. Webhook helper MUST preserve raw bytes BEFORE any JSON.parse.

#### Files to edit
```
packages/theo/src/server/webhook/raw-body.ts (NEW) — preserves request body across read
packages/theo/src/server/body-parser.ts (MODIFY — minor) — accept `rawBody?: string` skip flag if caller pre-read
tests/unit/webhook-raw-body.test.ts (NEW)
```

#### Deep file dependency analysis
- `raw-body.ts` (NEW): exports `readRawBody(req: Request): Promise<{ rawBody: string; bodyClone: Request }>`. Clones request via `req.clone()`, reads `.text()` from clone, returns the original (intact) request alongside the bytes.
- `body-parser.ts` (MODIFY): unchanged for non-webhook routes. If `defineWebhook` invokes `readRawBody` first then passes the original Request to `body-parser`, no modification needed — verify and adjust if needed.

#### Deep Dives
- **Algorithm:** `const clone = req.clone(); const rawBody = await readWithLimit(clone, maxBodyBytes); return { rawBody, bodyClone: req }`. The clone consumes its own body; the original is intact.
- **EC-101 (MUST FIX) — body size limit:** `readWithLimit` reads chunks from `clone.body.getReader()`, accumulating into a buffer. If accumulated bytes exceed `maxBodyBytes`, abort read + throw `BodyTooLargeError` with status 413. Default `maxBodyBytes = 1_000_000` (1MB) — covers Stripe (256KB max), Slack (4MB but compressed payloads are smaller), and is well below Node memory thresholds. GitHub webhooks up to 25MB MUST be opt-in by passing `maxBodyBytes: 25_000_000`.
- **Invariant:** the returned `bodyClone` MUST be readable by downstream code (the cache test for this: `await bodyClone.text()` resolves correctly after `readRawBody`).
- **Edge case:** `Request.clone()` throws if body was already consumed. The webhook pipeline MUST call `readRawBody` FIRST, before any middleware that reads body.
- **Edge case:** `Content-Length` header is NOT trusted — attackers can lie. The size check is on actually-read bytes, not the header.

#### Tasks
1. Create `raw-body.ts` with `readRawBody(req, opts?: { maxBodyBytes?: number }): Promise<{ rawBody, bodyClone }>`.
2. Implement `readWithLimit(stream, maxBytes)` chunk loop that throws `BodyTooLargeError` (status 413, code `BODY_TOO_LARGE`) on overflow.
3. Default `maxBodyBytes` to 1_000_000 (1MB).
4. Verify that `body-parser.ts` doesn't need changes (Webhook handler will receive `bodyClone` as `request`).
5. Document the "call FIRST in pipeline" invariant in JSDoc.

#### TDD + BDD

```
RED: test_raw_body_preserves_bytes — Given a Request with JSON body, When readRawBody called, Then rawBody === '{"a":1}' verbatim.
RED: test_clone_still_readable — Given a Request post-readRawBody, When bodyClone.text() awaited, Then resolves with same content.
RED: test_empty_body — Given Request with no body, When called, Then rawBody === ''.
RED: test_binary_body_preserved — Given a Request with binary payload (image bytes), When called, Then rawBody bytes match input bytes exactly.
RED (error): test_already_consumed_throws — Given a Request whose body was already read, When readRawBody called, Then throws TypeError with actionable message.
RED (EC-101): test_rejects_body_over_maxBodyBytes — Given Request with 2MB body and maxBodyBytes=1_000_000, When readRawBody called, Then throws BodyTooLargeError with status 413, code 'BODY_TOO_LARGE'.
RED (EC-101): test_opt_in_higher_limit — Given Request with 5MB body and maxBodyBytes=10_000_000, When readRawBody called, Then succeeds.
RED (EC-101): test_lying_content_length_caught — Given Request with Content-Length:100 but actual 2MB body and maxBodyBytes=1_000_000, When readRawBody called, Then throws (actual bytes counted).
GREEN: Implement Request.clone() + chunk-loop with size limit.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/webhook-raw-body.test.ts
```

BDD scenarios:
- Happy path: JSON body → rawBody exactly equals original
- Validation error: already-consumed Request → throws
- Edge case: empty body → rawBody = ''
- Error scenario: body > maxBodyBytes → BodyTooLargeError 413 (EC-101)

#### Acceptance Criteria
- [ ] All 8 RED tests pass after GREEN (5 base + 3 EC-101)
- [ ] Helper exported from `packages/theo/src/server/webhook/raw-body.ts`
- [ ] `BodyTooLargeError` exported with status=413, code='BODY_TOO_LARGE'
- [ ] Default `maxBodyBytes` = 1_000_000 documented in JSDoc
- [ ] `body-parser.ts` unchanged OR documented modification
- [ ] Pass: TypeScript strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Zero TS/lint
- [ ] dependency-cruiser 0 violations

---

### T0.3 — W3C Trace Context propagation helper (enqueue boundary)

#### Objective
A pair of helpers `extractTraceContext(headers: Headers): TraceContext | null` and `injectTraceContext(headers: Headers, ctx: TraceContext): void` that read/write the `traceparent` header per the W3C Trace Context spec. Required for jobs (Phase 2) and webhook (Phase 4) to propagate trace IDs across queue/webhook boundaries.

#### Evidence
- Jobs reference §7.4, §8 EC-6: trace context broken across enqueue boundary surfaces as "new trace, not continuation" — debugging nightmare in production.
- Existing TheoKit code already extracts trace context for HTTP requests (`packages/theo/src/server/http/trace-context.ts:1` — verified exists per architecture-review-remediation-plan T0.1).
- W3C spec: `traceparent: 00-{trace-id}-{span-id}-{flags}` (55 chars total, hyphen-separated).

#### Files to edit
```
packages/theo/src/server/observability/trace-context-propagation.ts (NEW) — extract + inject pair
tests/unit/trace-context-propagation.test.ts (NEW)
```

#### Deep file dependency analysis
- `trace-context-propagation.ts` (NEW): re-uses parsing logic from existing `http/trace-context.ts`. Adds the `inject` direction (currently only `extract` is needed for HTTP).
- Downstream: jobs (`jobs/trace-propagation.ts`), webhook (passes traceparent to handler ctx via `WebhookContext.traceId`).

#### Deep Dives
- **Format spec:** `version-trace_id-parent_id-trace_flags` where:
  - `version` = `00` (current)
  - `trace_id` = 32 hex chars (128-bit)
  - `parent_id` = 16 hex chars (64-bit)
  - `trace_flags` = 2 hex chars (sampled bit)
- **Invariant:** `extractTraceContext` returns `null` for malformed input — NEVER throws (would crash pipeline). `injectTraceContext` always succeeds (constructs a new traceparent if input ctx is malformed — defensive write).
- **Why a separate module from `http/trace-context.ts`:** that file is request-scoped and HTTP-only. This module is queue-scoped and works for any header carrier (job lease, webhook reply, agent SSE).

#### Tasks
1. Create `trace-context-propagation.ts` with `extract` + `inject` + `generateNewTraceContext()` (for outbox originating without parent).
2. Re-export parsing primitive from `http/trace-context.ts` if available; otherwise duplicate and document.
3. Add JSDoc with W3C spec reference + version=00 hardcoded assumption.

#### TDD + BDD

```
RED: test_extract_valid_traceparent — Given headers with valid W3C traceparent, When extracted, Then returns TraceContext object with trace_id + span_id + flags fields.
RED: test_extract_missing_header_returns_null — Given headers without traceparent, When extracted, Then returns null.
RED: test_extract_malformed_returns_null — Given headers with traceparent="invalid", When extracted, Then returns null (no throw).
RED: test_inject_writes_canonical_format — Given a TraceContext, When injected into empty Headers, Then headers.get('traceparent') matches W3C 55-char pattern.
RED: test_extract_inject_roundtrip — Given a TraceContext, When injected then extracted, Then result is structurally equal to input.
RED (edge): test_generate_new_returns_valid_traceparent — Given no input, When generateNewTraceContext called, Then returns ctx with 32-hex trace_id + 16-hex span_id.
GREEN: Implement extract/inject/generate trio.
REFACTOR: Share parsing primitive with http/trace-context.ts if possible.
VERIFY: npx vitest run tests/unit/trace-context-propagation.test.ts
```

BDD scenarios:
- Happy path: valid header → parses correctly
- Validation error: malformed → returns null
- Edge case: missing header → returns null
- Error scenario: inject writes canonical 55-char form even when input has anomalies

#### Acceptance Criteria
- [ ] All 6 RED tests pass after GREEN
- [ ] Exported from `packages/theo/src/server/observability/trace-context-propagation.ts`
- [ ] Pass: TS strict, lint, vitest, type tests

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Zero TS/lint
- [ ] No duplicated parsing logic with `http/trace-context.ts` (refactor shares)

---

## Phase 1: Cron primitives (R0.5.4)

**Objective:** Ship `defineCron(name, opts)`, build-time manifest emission, in-memory Node dev scheduler, and 4 adapter translators (Vercel, Cloudflare, AWS Lambda, Deno Deploy).

### T1.1 — 5-field UTC cron validator

#### Objective
Implement `validateCronSchedule(schedule: string): void` that throws actionable errors on invalid input per ADR-0004 (D3).

#### Evidence
Cron reference §5, §8 EC-6, §8 EC-11. ADR-0004 §"Validation rules". Without strict validation at `defineCron` call site, the user discovers errors at deploy time, not code time.

#### Files to edit
```
packages/theo/src/server/cron/cron-validate.ts (NEW)
tests/unit/cron-validate.test.ts (NEW)
package.json (MODIFY) — add `cron-parser` to deps
```

#### Deep file dependency analysis
- `cron-validate.ts` (NEW): exports `validateCronSchedule`. Uses `cron-parser` for grammar validation. Adds custom checks for 5-field count + UTC-only enforcement.
- Downstream: T1.2 (`defineCron`) calls validator at definition time.

#### Deep Dives
- **Why cron-parser:** mature, 13M weekly downloads, zero runtime deps beyond Node built-ins, supports `parseExpression` with `utc: true` flag.
- **Edge case:** parser accepts shorthand like `@daily`. We MUST reject before parser sees it (count fields manually first).
- **Invariant:** every error thrown includes the input schedule, position of error, and actionable fix.

#### Tasks
1. Add `cron-parser` to `packages/theo/package.json` dependencies.
2. Create `cron-validate.ts` with `validateCronSchedule(schedule): void`.
3. Reject non-5-field input with custom error BEFORE calling parser.
4. Wrap parser errors with actionable messages.

#### TDD + BDD

```
RED: test_valid_5_field_passes — Given "0 9 * * *", When validated, Then no throw.
RED: test_step_range_list_pass — Given "*/15 1-5 * * MON,TUE,FRI", When validated, Then no throw.
RED: test_6_field_rejected — Given "* * * * * *", When validated, Then throws Error containing "5 fields".
RED: test_shorthand_rejected — Given "@daily", When validated, Then throws Error containing "shorthand not supported".
RED: test_malformed_rejected — Given "bad bad bad bad bad", When validated, Then throws Error with column-level info.
RED (edge): test_empty_string_rejected — Given "", When validated, Then throws.
RED (edge): test_whitespace_only_rejected — Given "   ", When validated, Then throws.
GREEN: Implement field-count check + cron-parser wrapping.
REFACTOR: Extract error message template to constant.
VERIFY: npx vitest run tests/unit/cron-validate.test.ts
```

BDD scenarios:
- Happy path: standard 5-field with step/range/list
- Validation error: 6-field rejected with actionable error
- Edge case: empty string / whitespace
- Error scenario: shorthand `@daily` explicitly rejected

#### Acceptance Criteria
- [ ] All 7 RED tests pass after GREEN
- [ ] `cron-parser` listed in `packages/theo/package.json` deps
- [ ] Every error message includes input + actionable fix
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Zero TS/lint
- [ ] `pnpm install` runs clean

---

### T1.2 — `defineCron` primitive + types

#### Objective
Implement `defineCron(name: string, opts: CronOptions): CronDefinition` per cron reference §9.3.

#### Evidence
Cron reference §1 (problem statement), §9 (Implementation Guide). Roadmap R0.5.4 acceptance criteria (a)+(c).

#### Files to edit
```
packages/theo/src/server/cron/define-cron.ts (NEW)
packages/theo/src/server/cron/cron-types.ts (NEW) — Zod + TS types
packages/theo/src/server/define/index.ts (MODIFY) — re-export defineCron
packages/theo/src/server/index.ts (MODIFY) — public surface
tests/unit/define-cron.test.ts (NEW)
tests/type/define-cron.test-d.ts (NEW)
```

#### Deep file dependency analysis
- `define-cron.ts` (NEW): exports `defineCron`. Validates `name` (kebab-case alphanumeric), validates `schedule` via T1.1, returns `CronDefinition` identity object.
- `cron-types.ts` (NEW): exports `CronOptions`, `CronContext`, `CronDefinition` interfaces + `CronOptionsZodSchema`.
- `define/index.ts` (MODIFY): adds `export { defineCron } from '../cron/define-cron.js'`.
- `server/index.ts` (MODIFY): re-exports for `theokit/server` public surface.

#### Deep Dives
- **Data structure `CronDefinition`:**
  ```typescript
  interface CronDefinition {
    readonly name: string
    readonly schedule: string
    readonly handler: (ctx: CronContext) => unknown
    readonly concurrency: 'forbid' | 'allow'  // default 'forbid'
  }
  ```
- **Data structure `CronContext`:**
  ```typescript
  interface CronContext {
    readonly traceId: string
    readonly scheduledAt: Date
    readonly signal: AbortSignal
  }
  ```
- **Invariant:** `defineCron` is a pure identity function — no side effects, no global registration. Scan + manifest emission (T1.4) discovers definitions via file scan.

#### Tasks
1. Create `cron-types.ts` with `CronOptions`, `CronContext`, `CronDefinition`, Zod schema.
2. Create `define-cron.ts` with identity-style impl.
3. Add name validation (kebab-case alphanumeric, max 64 chars).
4. Wire re-exports in `define/index.ts` and `server/index.ts`.
5. Write `define-cron.test-d.ts` for type inference assertion.

#### TDD + BDD

```
RED: test_valid_definition — Given valid name + schedule + handler, When defineCron called, Then returns identity object with all fields.
RED: test_invalid_name_rejected — Given name with whitespace ("my cron"), When called, Then throws.
RED: test_invalid_schedule_propagated — Given "@daily" schedule, When called, Then throws (delegated to T1.1).
RED: test_concurrency_default_forbid — Given opts without concurrency field, When called, Then result.concurrency === 'forbid'.
RED: test_handler_passed_through — Given handler fn, When called, Then result.handler === input handler (reference equality).
RED (type test): test_inferred_handler_signature — Given defineCron({ handler: (ctx) => {...} }), When TS-checked, Then ctx is CronContext with traceId/scheduledAt/signal fields.
GREEN: Implement identity defineCron + validation.
REFACTOR: Extract name validation to shared util if reused.
VERIFY: npx vitest run tests/unit/define-cron.test.ts && npx vitest run tests/type/define-cron.test-d.ts
```

BDD scenarios:
- Happy path: valid name + schedule
- Validation error: invalid name → throws
- Edge case: concurrency default applied
- Error scenario: invalid schedule propagated from T1.1

#### Acceptance Criteria
- [ ] All 6 RED tests pass after GREEN
- [ ] `defineCron` importable from `theokit/server`
- [ ] Type test verifies inference
- [ ] Pass: TS strict, lint, vitest, type tests

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Zero TS/lint
- [ ] Public API surface in `server/index.ts`

---

### T1.3 — Scan `server/crons/` + emit `.theo/crons.json`

#### Objective
Build-time scanner that walks `server/crons/`, imports each module, validates the default export is a `CronDefinition`, emits `.theo/crons.json` manifest with versioned schema.

#### Evidence
Cron reference §9.1-9.2, R0.5.4 acceptance (b). Mirrors existing `packages/theo/src/server/scan/*` patterns (route-scan, action-scan, ws-scan).

#### Files to edit
```
packages/theo/src/server/cron/cron-scan.ts (NEW)
packages/theo/src/server/cron/cron-manifest.ts (NEW)
packages/theo/src/cli/commands/build.ts (MODIFY) — invoke cron scan + manifest emit
tests/unit/cron-scan.test.ts (NEW)
tests/integration/cron-manifest-emit.test.ts (NEW)
```

#### Deep file dependency analysis
- `cron-scan.ts` (NEW): uses `walkSourceFiles` from `server/_internal/scan-walker.ts` (already exists). Returns `CronNode[]` with `{ name, filePath, schedule, concurrency }`.
- `cron-manifest.ts` (NEW): emits JSON file with `{ schemaVersion: 1, generatedAt: ISO8601, crons: CronManifestEntry[] }`.
- `build.ts` (MODIFY): adds `scanCrons(serverDir) → writeCronManifest(.theo/crons.json)` step alongside existing route/action/ws manifests.

#### Deep Dives
- **Manifest schema (versioned):**
  ```json
  {
    "schemaVersion": 1,
    "generatedAt": "2026-05-24T12:00:00.000Z",
    "crons": [
      {
        "name": "morning-summary",
        "filePath": "server/crons/morning-summary.ts",
        "schedule": "0 9 * * *",
        "concurrency": "forbid"
      }
    ]
  }
  ```
- **Invariant:** manifest is **neutral** — no theo-specific fields. Vercel, CF, AWS adapters all consume the same JSON.
- **Edge case (EC-12):** two `server/crons/*.ts` files exporting `defineCron('same-name', ...)`. Scan throws `DuplicateCronNameError` with both file paths.
- **Edge case:** module imports fail at scan time — scanner reports filepath + import error, doesn't crash build silently.
- **EC-106 (SHOULD TEST) — atomic write:** writing `.theo/crons.json` MUST be atomic to avoid partial reads (parallel build + dev). Implementation: write to `.theo/crons.json.tmp` then `fs.rename()` (POSIX atomic). Test asserts that a concurrent read NEVER sees partial JSON.

#### Tasks
1. Create `cron-scan.ts` using `walkSourceFiles`.
2. Implement `loadCronModule(filePath)` dynamic import + default-export check.
3. Throw `DuplicateCronNameError` on name collision.
4. Create `cron-manifest.ts` with `writeCronManifest(path, crons): void`.
5. Hook into `cli/commands/build.ts`.

#### TDD + BDD

```
RED: test_scan_empty_dir_returns_empty_manifest — Given empty server/crons/, When scanned, Then crons: [].
RED: test_scan_one_cron_writes_correct_manifest — Given server/crons/foo.ts exporting defineCron('foo', { schedule: '0 9 * * *', ... }), When scanned + written, Then manifest.crons[0] matches.
RED: test_scan_two_crons_correct_order — Given two crons, When scanned, Then both in manifest sorted by name (deterministic for snapshot tests).
RED: test_duplicate_name_throws — Given two crons with same name, When scanned, Then throws DuplicateCronNameError with both filePaths.
RED: test_missing_default_export_throws — Given server/crons/bad.ts without default export, When scanned, Then throws with filepath.
RED: test_schemaVersion_pinned_to_1 — Given any scan, When manifest written, Then schemaVersion === 1.
RED (edge): test_ignores_dotfiles_and_underscore_files — Given server/crons/_helper.ts and .DS_Store, When scanned, Then both skipped.
RED (EC-106): test_manifest_write_atomic — Given concurrent write to .theo/crons.json from 5 parallel calls, When all complete, Then file is always valid JSON (never partial) — implementation MUST use write-tmp + rename.
GREEN: Implement scan + manifest emit + build hook + atomic write.
REFACTOR: Extract scan-pattern shared util if duplicating route-scan logic too much.
VERIFY: npx vitest run tests/unit/cron-scan.test.ts && npx vitest run tests/integration/cron-manifest-emit.test.ts
```

BDD scenarios:
- Happy path: 1+ cron files → manifest
- Validation error: duplicate name → throws
- Edge case: empty dir → empty manifest (not error); atomic concurrent writes never produce partial JSON (EC-106)
- Error scenario: bad module (no default export) → actionable error

#### Acceptance Criteria
- [ ] All 8 RED tests pass after GREEN (7 base + 1 EC-106)
- [ ] `.theo/crons.json` emitted at build time
- [ ] Schema version pinned to 1
- [ ] Atomic write verified (tmp + rename)
- [ ] Pass: TS strict, lint, vitest, integration tests

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] `pnpm --filter theokit build` includes cron manifest in `.theo/`
- [ ] dependency-cruiser 0 violations

---

### T1.4 — In-memory Node dev scheduler

#### Objective
For `theokit dev`, run a process-local cron scheduler that fires each declared cron at its scheduled time. Production deploys use platform-native triggers (Phase 1 T1.5).

#### Evidence
Cron reference §9.1 (Architecture), §9.6 (Phases of rollout). Without dev scheduler, users can't iterate on cron handlers locally — friction kills adoption.

#### Files to edit
```
packages/theo/src/server/cron/cron-runtime-node.ts (NEW)
packages/theo/src/cli/commands/dev.ts (MODIFY) — start scheduler in dev mode
tests/unit/cron-runtime-node.test.ts (NEW)
```

#### Deep file dependency analysis
- `cron-runtime-node.ts` (NEW): exports `createCronScheduler(crons: CronDefinition[]): { start(); stop() }`. Uses `cron-parser` to compute next fire time + `setTimeout` recursion (NOT `setInterval` — drift accumulates).
- `dev.ts` (MODIFY): on dev server start, invoke scan + create scheduler + start.

#### Deep Dives
- **Algorithm (non-drift):** for each cron, compute `nextFireTime = cron-parser.next()`, set `setTimeout(handler, nextFireTime - Date.now())`. After fire, recompute next from current time (not from scheduled time — handles long handlers + system sleep).
- **Concurrency control (EC-4):** if cron has `concurrency: 'forbid'`, track in-flight handler via WeakSet; skip next fire if previous still running. Log warning.
- **Invariant:** stopping the scheduler clears ALL pending timeouts (prevents test leaks).
- **Edge case (EC-3 cold start):** Node scheduler doesn't fire "missed" crons (if process was down at 9am, doesn't catch up at 9:05 startup). Documented behavior.
- **EC-109 (SHOULD TEST) — handler hang doesn't block scheduler:** if one cron handler returns a Promise that never resolves (bug, deadlock), the scheduler MUST continue firing OTHER crons. Implementation: each handler invocation is `void`-scheduled (fire-and-forget from scheduler's perspective). Independent of in-flight tracking for the SAME cron. Test: cron A with hanging handler + cron B with normal handler → B still fires every tick.

#### Tasks
1. Create `cron-runtime-node.ts` with scheduler class.
2. Implement non-drift setTimeout recursion.
3. Implement `concurrency: 'forbid'` via in-flight set.
4. Add abort signal propagation to handlers.
5. Wire into `dev.ts`.

#### TDD + BDD

```
RED: test_cron_fires_at_scheduled_time — Given cron "*/1 * * * *", When 65 seconds pass (use fake timers), Then handler called once.
RED: test_cron_concurrency_forbid_skips_overlapping — Given handler that takes 90s + cron */1, When second tick arrives, Then handler NOT called (skipped + warning logged).
RED: test_cron_concurrency_allow_runs_overlapping — Given concurrency: 'allow' + slow handler, When second tick arrives, Then handler called concurrently.
RED: test_cron_abort_signal_fires_on_stop — Given long-running handler + stop() called, When awaited, Then ctx.signal.aborted === true.
RED (edge): test_invalid_schedule_throws_at_scheduler_creation — Given invalid schedule, When createCronScheduler called, Then throws (delegated to T1.1).
RED (edge): test_clear_timeouts_on_stop — Given scheduler with pending timeout, When stopped, Then no further handler calls (use vitest fake timers + advance past scheduled time).
RED (EC-109): test_hanging_handler_doesnt_block_other_crons — Given cron A with `() => new Promise(() => {})` and cron B with normal handler + both schedules `*/1`, When 5 ticks pass, Then B handler called ≥4 times AND A handler called 1 time (didn't re-fire due to concurrency:forbid) AND scheduler emitted warning about A.
GREEN: Implement scheduler with void-scheduled handlers (no await blocks scheduler loop).
REFACTOR: Extract in-flight tracking to helper if reusable.
VERIFY: npx vitest run tests/unit/cron-runtime-node.test.ts
```

BDD scenarios:
- Happy path: cron fires at scheduled time
- Validation error: invalid schedule throws at creation
- Edge case: concurrency forbid prevents overlap; one hanging cron doesn't block others (EC-109)
- Error scenario: stop() clears all pending timeouts

#### Acceptance Criteria
- [ ] All 7 RED tests pass after GREEN (6 base + 1 EC-109, uses vitest fake timers — `vi.useFakeTimers()`)
- [ ] `theokit dev` boots cron scheduler automatically
- [ ] Independent cron isolation verified (hang in A doesn't affect B)
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Dev server `pnpm --filter theokit dev` fires test cron
- [ ] No timer leaks (vitest reports clean tear-down)

---

### T1.5 — Adapter translators (Vercel + Cloudflare + AWS Lambda + Deno Deploy)

#### Objective
At build time, for `theokit build --target=<X>`, emit platform-native cron config from `.theo/crons.json`.

#### Evidence
Cron reference §3, §5. R0.5.4 acceptance (c) — "8 adapters translate or document N/A".

#### Files to edit
```
packages/theo/src/adapters/vercel/cron-translate.ts (NEW)
packages/theo/src/adapters/cloudflare/cron-translate.ts (NEW)
packages/theo/src/adapters/aws-lambda/cron-translate.ts (NEW)
packages/theo/src/adapters/deno-deploy/cron-translate.ts (NEW)
packages/theo/src/adapters/{vercel,cloudflare,aws-lambda,deno-deploy}/build.ts (MODIFY) — invoke cron-translate
tests/integration/cron-vercel-translate.test.ts (NEW)
tests/integration/cron-cf-translate.test.ts (NEW)
tests/integration/cron-aws-translate.test.ts (NEW)
tests/integration/cron-deno-translate.test.ts (NEW)
```

#### Deep file dependency analysis
- Each `cron-translate.ts` (NEW): reads `.theo/crons.json`, emits platform-specific config:
  - **Vercel**: appends to `vercel.json` `crons[]` array — each entry `{ path: '/api/__crons/<name>', schedule }`. Adds `/api/__crons/<name>` route stub that invokes the handler.
  - **Cloudflare**: appends to `wrangler.toml` `[triggers] crons = ["0 9 * * *", ...]`. Worker `scheduled()` export dispatches to handler by matching `event.cron`.
  - **AWS Lambda**: emits `serverless.yml` `functions.<fn>.events.- schedule: cron(0 9 * * ? *)` (note AWS quirk: requires `?` in either DOM or DOW field, not both `*`). Translate at emit time.
  - **Deno Deploy**: emits `Deno.cron(name, schedule, handler)` registration in entry file.
- Each `build.ts` (MODIFY): invokes the translator after the existing route/action build steps.

#### Deep Dives
- **AWS quirk:** EventBridge cron requires `cron(0 9 * * ? *)` (6-field with `?`) where TheoKit's 5-field `0 9 * * *` maps to. Translator inserts `?` in DOW field when DOM is `*`, otherwise inserts `?` in DOM.
- **CF dispatch:** the `scheduled(event, env, ctx)` Worker handler receives `event.cron` (the schedule string). Translator generates a switch/case dispatching by schedule string. Edge case: two crons with same schedule — translator concatenates `event.scheduledTime + jobName` discriminator.
- **Vercel auth:** crons route MUST validate `CRON_SECRET` Bearer header (EC-7). Translator injects auth check in the route stub.
- **Edge case (manifest drift EC-8):** cron declared at build but adapter doesn't support → emit warning to stdout AND include in `.theo/manifest-warnings.json`.
- **EC-105 (MUST FIX) — preserve user config on merge:** each translator does NOT overwrite the existing config file. Algorithm: (1) read existing `vercel.json` / `wrangler.toml` / `serverless.yml` if present; (2) parse to AST; (3) replace ONLY the relevant field (`crons[]` for Vercel, `[triggers] crons` for CF, `functions.*.events[].schedule` for AWS) — preserve all other fields verbatim; (4) write back. If parsing the existing file fails → throw `ExistingConfigUnparseableError` with file path + parse error + actionable hint ("rename or fix `vercel.json` before re-running build"). NEVER silently overwrite. Tests assert that custom fields outside the cron-managed slice are preserved byte-for-byte (where possible — comments may be lost on JSON round-trip; documented).

#### Tasks
1. Create `vercel/cron-translate.ts` — read-merge-write `vercel.json` mutation + route stub generation (EC-105 preserve other fields).
2. Create `cloudflare/cron-translate.ts` — read-merge-write `wrangler.toml` mutation + `scheduled` export dispatch (EC-105 preserve other sections).
3. Create `aws-lambda/cron-translate.ts` — read-merge-write `serverless.yml` mutation + AWS cron syntax `?` quirk (EC-105 preserve other functions/events).
4. Create `deno-deploy/cron-translate.ts` — `Deno.cron` registration emit.
5. Implement `ExistingConfigUnparseableError` with actionable message + file path.
6. Wire each into its adapter's `build.ts`.
7. Document `--target=bun` / `--target=netlify` / `--target=static` as N/A in adapter README.

#### TDD + BDD

```
RED: test_vercel_emits_crons_array — Given manifest with 2 crons, When vercel translator runs, Then vercel.json contains crons:[{path,schedule},{path,schedule}].
RED: test_vercel_route_stub_validates_CRON_SECRET — Given vercel route stub, When request without Bearer header, Then 401.
RED: test_cf_emits_triggers_array — Given manifest, When CF translator runs, Then wrangler.toml [triggers] crons array contains all schedules.
RED: test_cf_scheduled_dispatches_by_event_cron — Given CF Worker built, When scheduled(event) invoked with event.cron='0 9 * * *', Then correct handler called.
RED: test_aws_inserts_question_mark_DOW — Given "0 9 * * *", When AWS translator runs, Then output is "cron(0 9 * * ? *)".
RED: test_aws_inserts_question_mark_DOM — Given "0 9 * * MON", When AWS translator runs, Then output is "cron(0 9 ? * MON *)".
RED: test_deno_emits_cron_register — Given manifest, When deno translator runs, Then entry file contains Deno.cron("name", "schedule", handler).
RED: test_duplicate_schedule_disambiguated_for_cf — Given two crons with same schedule, When CF translator runs, Then dispatch uses name discriminator.
RED (edge): test_n_a_target_warns — Given --target=bun, When invoked, Then warning logged but build succeeds.
RED (EC-105): test_vercel_preserves_existing_fields — Given vercel.json with {functions, headers, redirects} pre-existing, When translator runs with new crons, Then result.functions/headers/redirects unchanged byte-for-byte AND crons[] populated.
RED (EC-105): test_cf_preserves_existing_sections — Given wrangler.toml with [vars], [r2_buckets], When translator runs, Then [vars] and [r2_buckets] preserved verbatim AND [triggers] crons added.
RED (EC-105): test_aws_preserves_other_functions — Given serverless.yml with `functions.userAuth.handler: ...`, When translator runs, Then userAuth function preserved AND cron schedule added to its dedicated cron function.
RED (EC-105): test_unparseable_existing_throws_actionable — Given vercel.json with invalid JSON, When translator runs, Then throws ExistingConfigUnparseableError mentioning file path + parse error.
GREEN: Implement all 4 translators + build hooks + read-merge-write pattern.
REFACTOR: Extract common JSON/TOML/YAML mutation helpers.
VERIFY: npx vitest run tests/integration/cron-*-translate.test.ts
```

BDD scenarios:
- Happy path: each adapter emits valid config
- Validation error: vercel route stub rejects missing CRON_SECRET (401)
- Edge case: AWS `?` quirk in DOM/DOW; existing user fields preserved (EC-105)
- Error scenario: duplicate schedule for CF disambiguated by name; unparseable existing config → actionable error (EC-105)

#### Acceptance Criteria
- [ ] All 13 RED tests pass after GREEN (9 base + 4 EC-105)
- [ ] 4 adapter translator files exist + wired
- [ ] User config preservation verified for all 3 mutable formats (JSON / TOML / YAML)
- [ ] N/A adapters (bun, netlify, static) documented
- [ ] Pass: TS strict, lint, vitest, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] `theokit build --target=vercel` emits valid vercel.json with crons
- [ ] `theokit build --target=cloudflare` emits valid wrangler.toml triggers

---

## Phase 2: Jobs Core — InMemory backend + outbox (R0.5.5 + R0.5.6 + R0.5.7 + R0.5.8 + R0.5.9)

**Objective:** Ship `defineJob`, `ctx.queue.enqueue` typed client, `JobBackend` interface, InMemory implementation, transactional outbox, W3C Trace Context propagation. NOT Postgres (Phase 3).

### T2.1 — `JobBackend` interface + types

#### Objective
Define the neutral contract per ADR-0002 (D1).

#### Evidence
Jobs reference §9.1, §9.3. ADR-0002 §"Interface contract (final shape)".

#### Files to edit
```
packages/theo/src/server/jobs/job-backend.ts (NEW)
packages/theo/src/server/jobs/job-types.ts (NEW) — JobRegistry, Zod schemas
tests/unit/job-backend-interface.test.ts (NEW)
tests/type/job-backend.test-d.ts (NEW)
```

#### Deep file dependency analysis
- `job-backend.ts` (NEW): exports `JobBackend` interface + `JobEnqueueInput`, `JobLease`, `NonRetryableError` class.
- `job-types.ts` (NEW): exports `JobDefinition`, `JobOptions`, `JobContext`, `JobRegistry` (module-augmentation-friendly type map).
- Downstream: T2.2 (InMemory), T2.3 (`defineJob`), T2.4 (queue client), Phase 3 (Postgres backend).

#### Deep Dives
- **Interface shape** (final — locked in ADR-0002):
  ```typescript
  interface JobBackend {
    readonly name: string
    enqueue(input: JobEnqueueInput): Promise<{ jobId: string }>
    dequeue(opts: { batchSize?: number; lockSeconds?: number }): Promise<JobLease[]>
    ack(jobId: string): Promise<void>
    nack(jobId: string, opts: { error: string; nonRetryable?: boolean }): Promise<void>
    idempotency?(key: string, ttlSeconds: number): Promise<{ jobId: string } | null>
  }
  ```
- **`JobRegistry`** uses module augmentation pattern (mirrors TanStack Router's typed registry):
  ```typescript
  // User's project:
  // declare module 'theokit/server' {
  //   interface JobRegistry {
  //     'process-document': { documentId: string }
  //     'send-email': { to: string; subject: string }
  //   }
  // }
  ```
- **Invariant:** `NonRetryableError` extends `Error` with `readonly code = 'NON_RETRYABLE'`. Backend uses this for nack with `nonRetryable: true` (skips retry).

#### Tasks
1. Create `job-backend.ts` interface + supporting types.
2. Create `job-types.ts` with `JobRegistry`, `JobDefinition`, `JobOptions`, `JobContext` + Zod schemas.
3. Create `NonRetryableError` class.
4. Write type test asserting `JobRegistry` augmentation works.

#### TDD + BDD

```
RED: test_NonRetryableError_constructible — Given message, When new NonRetryableError(msg) called, Then result.code === 'NON_RETRYABLE' && result.message === msg.
RED (type): test_JobRegistry_extends_via_augmentation — Given module augmentation in test file, When JobRegistry['process-document'] referenced, Then type is { documentId: string }.
RED (type): test_JobBackend_interface_implementable — Given a class implementing JobBackend, When TS-checked, Then no errors.
RED (type): test_JobEnqueueInput_required_fields — Given JobEnqueueInput, When name/input omitted, Then TS error.
RED (type): test_JobLease_includes_lockExpiresAt — Given JobLease, When lockExpiresAt accessed, Then type is Date.
GREEN: Define types + NonRetryableError class.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/job-backend-interface.test.ts && npx vitest run tests/type/job-backend.test-d.ts
```

BDD scenarios:
- Happy path: implementable interface
- Validation error: missing required fields in input → TS error
- Edge case: module augmentation extends registry
- Error scenario: NonRetryableError carries correct code

#### Acceptance Criteria
- [ ] All 5 RED tests pass
- [ ] `JobBackend`, `NonRetryableError`, `JobRegistry` exported from `theokit/server`
- [ ] Pass: TS strict, lint, type tests

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Type tests pass (`pnpm test:types`)

---

### T2.2 — InMemory JobBackend implementation

#### Objective
Process-local backend: stores leases in a Map, dispatch via setTimeout. Zero external dependency. Default for `theokit dev` and tests.

#### Evidence
Jobs reference §3.1 (ActiveJob adapter pattern), §6 (lean deps).

#### Files to edit
```
packages/theo/src/server/jobs/job-backend-memory.ts (NEW)
tests/unit/job-backend-memory.test.ts (NEW)
```

#### Deep file dependency analysis
- `job-backend-memory.ts` (NEW): class `InMemoryJobBackend implements JobBackend`. Two Maps: `pending: Map<jobId, JobLease>`, `idempotencyMap: Map<key, { jobId, expiresAt }>`. Optional `dispatcher: (lease) => void` callback for tests + dev scheduler.

#### Deep Dives
- **Algorithm `enqueue`:**
  ```
  1. If input.idempotencyKey provided AND idempotencyMap has unexpired entry → return existing jobId
  2. Generate UUID (crypto.randomUUID())
  3. Insert into pending Map
  4. If idempotencyKey → record in idempotencyMap with expiresAt
  5. Schedule dispatcher via setTimeout(input.delaySeconds * 1000)
  6. Return { jobId }
  ```
- **Algorithm `dequeue`:** return up to `batchSize` pending leases whose `availableAt <= now`. Set `lockExpiresAt = now + lockSeconds`.
- **Edge case (EC-5):** concurrent `dequeue` calls — protect with simple mutex (Promise-chain) since this is single-process.
- **Memory limit:** cap pending map at 10000 entries; emit warning + drop oldest on overflow (visible bug, not silent leak).
- **EC-104 (MUST FIX) — graceful shutdown:** the InMemory backend uses `setTimeout` for delayed dispatch. On SIGTERM (deploy/restart), pending timeouts may fire AFTER process is partially torn down — callback executes against stale state. Constructor registers `process.on('beforeExit')` handler that clears all pending timeouts AND logs "N jobs dropped on shutdown — use PostgresJobBackend for durability". This is the explicit visible failure mode (not silent corruption). Cleanup handler removable via `backend.destroy()` for test isolation.

#### Tasks
1. Create `job-backend-memory.ts` with class.
2. Implement `enqueue` with idempotency.
3. Implement `dequeue` with batch + lock semantics.
4. Implement `ack` / `nack` (nack with `nonRetryable: true` permanently removes).
5. Add overflow guard with warning.
6. Implement `beforeExit` cleanup hook (clear timeouts + log dropped count) + `destroy()` method for test teardown.

#### TDD + BDD

```
RED: test_enqueue_returns_uuid_jobId — Given valid input, When enqueued, Then result.jobId matches UUID regex.
RED: test_idempotency_returns_existing_jobId — Given same idempotencyKey twice within TTL, When second enqueue, Then result.jobId === first jobId.
RED: test_idempotency_expires — Given key with TTL=1, When enqueue → wait 2s → enqueue, Then second returns new jobId (use fake timers).
RED: test_dequeue_returns_pending_leases — Given 3 enqueued, When dequeue({batchSize:2}), Then returns 2 leases.
RED: test_dequeue_locks_prevent_double_dispatch — Given 1 lease + 2 concurrent dequeues, When awaited, Then total leases returned across both calls === 1.
RED: test_ack_removes_lease — Given dequeued lease, When ack(jobId), Then subsequent dequeue doesn't return it.
RED: test_nack_with_nonRetryable_permanent_remove — Given lease, When nack(jobId, {nonRetryable:true}), Then permanently removed.
RED: test_nack_without_nonRetryable_returns_to_queue — Given lease, When nack(jobId, {}), Then becomes dequeueable after lockExpiresAt.
RED (edge): test_overflow_drops_oldest_with_warning — Given 10001 enqueues, When 10001st called, Then oldest dropped + console.warn called.
RED (EC-104): test_pending_jobs_cleared_on_beforeExit — Given backend with 3 pending setTimeout dispatches, When process emits 'beforeExit', Then all timeouts cleared (vi.advanceTimers past delay → no callbacks fire) AND logger.warn called with "3 jobs dropped".
RED (EC-104): test_destroy_removes_beforeExit_listener — Given backend + destroy() called, When emit beforeExit twice, Then handler runs once (test isolation).
GREEN: Implement class.
REFACTOR: Extract lock-protect helper if reused.
VERIFY: npx vitest run tests/unit/job-backend-memory.test.ts
```

BDD scenarios:
- Happy path: enqueue → dequeue → ack flow
- Validation error: missing required input → throws
- Edge case: idempotency within TTL returns existing
- Error scenario: overflow drops oldest with warning (and beforeExit clears pending — EC-104)

#### Acceptance Criteria
- [ ] All 11 RED tests pass (9 base + 2 EC-104)
- [ ] Class implements `JobBackend` interface (TS checked)
- [ ] Zero external dependency
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] dependency-cruiser 0 violations

---

### T2.3 — `defineJob` primitive + scan + manifest

#### Objective
`defineJob(name, opts)` identity helper + `server/jobs/` scanner + `.theo/jobs.json` manifest emission.

#### Evidence
Jobs reference §9.2, R0.5.5 acceptance criteria.

#### Files to edit
```
packages/theo/src/server/jobs/define-job.ts (NEW)
packages/theo/src/server/jobs/job-scan.ts (NEW)
packages/theo/src/server/jobs/job-manifest.ts (NEW)
packages/theo/src/server/define/index.ts (MODIFY) — re-export defineJob
packages/theo/src/server/index.ts (MODIFY) — public surface
packages/theo/src/cli/commands/build.ts (MODIFY) — invoke job scan + manifest emit
tests/unit/define-job.test.ts (NEW)
tests/unit/job-scan.test.ts (NEW)
tests/integration/job-manifest-emit.test.ts (NEW)
```

#### Deep file dependency analysis
- `define-job.ts` (NEW): exports `defineJob(name, opts): JobDefinition`. Identity function. Validates name (kebab-case alphanumeric).
- `job-scan.ts` (NEW): uses `walkSourceFiles` to discover `server/jobs/*.ts`. Returns `JobNode[]`.
- `job-manifest.ts` (NEW): writes `.theo/jobs.json` with `{ schemaVersion: 1, jobs: JobManifestEntry[] }`.
- `build.ts` (MODIFY): adds job scan + manifest emit step.

#### Deep Dives
- **Manifest schema:**
  ```json
  {
    "schemaVersion": 1,
    "generatedAt": "ISO8601",
    "jobs": [
      { "name": "process-document", "filePath": "server/jobs/process-document.ts", "maxAttempts": 1, "hasInputSchema": true }
    ]
  }
  ```
- **Invariant:** `maxAttempts` defaults to 1 (D2 lock — no retry surprise).
- **Edge case:** Zod input schema is NOT serialized to manifest (only `hasInputSchema: boolean` flag) — manifest is platform-neutral; schemas live in code.
- **EC-106 (shared with T1.3):** `.theo/jobs.json` write uses same tmp+rename atomic pattern as cron manifest. Share helper from T1.3 in `server/_internal/atomic-write.ts`.

#### Tasks
1. Create `define-job.ts`.
2. Create `job-scan.ts`.
3. Create `job-manifest.ts`.
4. Wire scan + manifest emit into `build.ts`.
5. Re-export in `define/index.ts` and `server/index.ts`.

#### TDD + BDD

```
RED: test_defineJob_identity — Given name + opts, When defineJob called, Then returns input opts unchanged with name added.
RED: test_defineJob_invalid_name_throws — Given name "Bad Name", When called, Then throws.
RED: test_defineJob_defaults_maxAttempts_1 — Given opts without maxAttempts, When called, Then result.maxAttempts === 1.
RED: test_job_scan_returns_jobs — Given server/jobs/foo.ts exporting defineJob, When scanned, Then returns 1 JobNode.
RED: test_job_manifest_emit — Given JobNode[], When written, Then JSON has schemaVersion:1, jobs[0] correct.
RED: test_duplicate_job_name_throws — Given two jobs with same name, When scanned, Then throws.
RED: test_hasInputSchema_true_when_zod_provided — Given defineJob with `input: z.object(...)`, When scanned, Then manifest.jobs[0].hasInputSchema === true.
GREEN: Implement identity + scan + manifest.
REFACTOR: Reuse cron-scan pattern.
VERIFY: npx vitest run tests/unit/define-job.test.ts tests/unit/job-scan.test.ts tests/integration/job-manifest-emit.test.ts
```

BDD scenarios:
- Happy path: define + scan + manifest emit
- Validation error: duplicate name → throws
- Edge case: defaults applied (maxAttempts=1)
- Error scenario: invalid name rejected

#### Acceptance Criteria
- [ ] All 7 RED tests pass
- [ ] `.theo/jobs.json` emitted at build time
- [ ] `defineJob` importable from `theokit/server`
- [ ] Pass: TS strict, lint, vitest, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] `pnpm --filter theokit build` includes jobs manifest

---

### T2.4 — `ctx.queue.enqueue` typed client

#### Objective
Typed `ctx.queue.enqueue<JobName>(name, input, opts?)` method on request context. Returns `void` (D2). `enqueueWithId` variant returns `{ jobId }`.

#### Evidence
Jobs reference §9.3, R0.5.6 acceptance. ADR-0003 final shape.

#### Files to edit
```
packages/theo/src/server/jobs/queue-client.ts (NEW)
packages/theo/src/server/context.ts (MODIFY) — inject `queue` into request context
tests/unit/queue-client.test.ts (NEW)
tests/type/queue-client.test-d.ts (NEW)
```

#### Deep file dependency analysis
- `queue-client.ts` (NEW): exports `createQueueClient(backend: JobBackend, outbox: Outbox): QueueClient`. The QueueClient buffers to outbox; outbox flushes on `res.on('finish')` (T2.5).
- `context.ts` (MODIFY): adds `queue: QueueClient` to `RequestContext` shape. Constructs via `createQueueClient` per request.

#### Deep Dives
- **Type inference (key UX win):**
  ```typescript
  // user side
  declare module 'theokit/server' {
    interface JobRegistry {
      'process-document': { documentId: string }
    }
  }
  // In a route:
  ctx.queue.enqueue('process-document', { documentId: 'abc' }) // OK
  ctx.queue.enqueue('unknown', { ... })                         // TS error
  ctx.queue.enqueue('process-document', { wrong: 'shape' })     // TS error
  ```
- **Invariant:** `enqueue` returns `void` (not `Promise<void>`). Internal buffer write is sync; backend dispatch is async but invisible.
- **Edge case:** caller in non-request context (e.g., cron handler) — `ctx.queue` MUST be available (constructed from same backend). Per D8 outbox is route-scoped only; cron `enqueue` dispatches immediately.

#### Tasks
1. Create `queue-client.ts` with `createQueueClient(backend, outbox)` factory.
2. Modify `context.ts` to inject `queue` per request.
3. Implement `enqueue` (void) + `enqueueWithId` (returns Promise).
4. Type-test the inference path.

#### TDD + BDD

```
RED: test_enqueue_returns_void — Given valid input, When enqueue called, Then return value === undefined.
RED: test_enqueueWithId_returns_promise_of_jobId — Given valid input, When enqueueWithId called, Then resolves with {jobId: string}.
RED: test_enqueue_buffers_to_outbox_not_backend — Given outbox spy + backend spy, When enqueue called, Then outbox.push called && backend.enqueue NOT called.
RED: test_idempotency_key_passed_through — Given enqueue with idempotencyKey, When outbox flushed, Then backend.enqueue receives the key.
RED (type): test_unknown_job_name_TS_error — Given enqueue('unknown', ...), When TS-checked, Then error.
RED (type): test_wrong_input_shape_TS_error — Given enqueue('process-document', { wrong: 'x' }), When TS-checked, Then error.
GREEN: Implement queue client + context wiring.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/queue-client.test.ts tests/type/queue-client.test-d.ts
```

BDD scenarios:
- Happy path: typed enqueue buffers correctly
- Validation error: wrong shape → TS error (not runtime)
- Edge case: idempotency key passed through
- Error scenario: unknown job name → TS error

#### Acceptance Criteria
- [ ] All 6 RED tests pass
- [ ] `ctx.queue.enqueue` typed via `JobRegistry`
- [ ] Pass: TS strict, lint, vitest, type tests

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Type inference works in fixture (verified Phase 6)

---

### T2.5 — Transactional outbox lifecycle hook

#### Objective
Buffer `enqueue` calls during request; flush to backend on `res.on('finish')` if statusCode < 400; discard on `res.on('close')` (aborted) or statusCode >= 400.

#### Evidence
Jobs reference §7.1 (centerpiece algorithm), §8 EC-1/EC-2. ADR-0003 §"Why this composes with outbox".

#### Files to edit
```
packages/theo/src/server/jobs/outbox.ts (NEW)
packages/theo/src/server/http/execute.ts (MODIFY) — wire outbox lifecycle to req/res
tests/unit/outbox.test.ts (NEW)
tests/integration/job-outbox-rollback.test.ts (NEW) — KEY TEST
```

#### Deep file dependency analysis
- `outbox.ts` (NEW): exports `createOutbox(): Outbox` with `push(entry)`, `discard()`, `drain(): OutboxEntry[]`.
- `execute.ts` (MODIFY): in request handler, create per-request outbox; attach `res.on('finish', ...)` + `res.on('close', ...)` listeners to drain or discard.

#### Deep Dives
- **Lifecycle:**
  ```
  1. Request enters → create outbox
  2. Handler calls ctx.queue.enqueue → outbox.push(entry)
  3a. Response committed (res.on('finish'), statusCode < 400) → for entry in outbox.drain(): await backend.enqueue(entry)
  3b. Response error (statusCode >= 400 OR res.on('close') without finish) → outbox.discard()
  ```
- **Invariant:** ZERO orphan jobs after handler throws. The KEY TEST (`job-outbox-rollback.test.ts`) verifies this.
- **Edge case (EC-12):** streaming response — `res.on('finish')` fires AT END of stream, not at start. Outbox flush is correctly deferred to stream end.
- **Edge case (EC-2):** handler succeeds but `res.end()` fails (rare, e.g., client disconnect during write) — outbox correctly discarded because `res.on('close')` fires before `finish`.
- **EC-107 (SHOULD TEST) — backend.enqueue throws during flush:** the response is already committed; the outbox can't roll back. Policy: log each failed entry with full context (entry name + input shape, NOT input data — privacy), continue with remaining entries (don't fail-fast — partial dispatch is better than zero), increment a metric `outbox.flush.errors`. The response is unaffected since it already went out.

#### Tasks
1. Create `outbox.ts`.
2. Modify `execute.ts` to attach lifecycle listeners.
3. Add trace context propagation: outbox entries carry `traceparent` from request.
4. Write integration test for rollback semantics.

#### TDD + BDD

```
RED: test_outbox_push_drain — Given outbox + 3 pushes, When drained, Then returns 3 entries + outbox is empty.
RED: test_outbox_discard_clears — Given outbox + 3 pushes, When discarded, Then drain returns [].
RED (integration): test_throwing_handler_zero_dispatched — Given route that enqueues then throws, When hit, Then 0 jobs in backend.
RED (integration): test_success_handler_flushed — Given route that enqueues + returns 200, When hit, Then 1 job in backend after res.finish.
RED (integration): test_4xx_response_discards — Given route that enqueues + returns 400, When hit, Then 0 jobs dispatched.
RED (integration): test_client_disconnect_discards — Given route with long delay + abort mid-flight, When awaited, Then 0 jobs dispatched.
RED (integration): test_streaming_flushes_at_end — Given streaming route that enqueues, When stream ends, Then job dispatched.
RED (EC-107): test_backend_throw_during_flush_logs_continues — Given outbox with 3 entries + backend.enqueue throwing on entry index 1, When res.on('finish') fires, Then entries 0 + 2 dispatched, entry 1 logged with error (entry name visible, input data NOT logged), `outbox.flush.errors` metric incremented, response status unaffected.
GREEN: Implement outbox + lifecycle wiring + flush error handling.
REFACTOR: Extract res-lifecycle helper if reusable.
VERIFY: npx vitest run tests/unit/outbox.test.ts tests/integration/job-outbox-rollback.test.ts
```

BDD scenarios:
- Happy path: 2xx response flushes outbox
- Validation error: 4xx response discards outbox
- Edge case: streaming flushes at stream end; backend.enqueue throws → partial dispatch + log (EC-107)
- Error scenario: handler throws → discards (THE KEY guarantee)

#### Acceptance Criteria
- [ ] All 8 RED tests pass (7 base + 1 EC-107, including the KEY rollback test)
- [ ] Outbox lifecycle wired in `execute.ts`
- [ ] Pass: TS strict, lint, vitest, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] KEY rollback test gives ZERO orphan jobs in fault scenarios

---

### T2.6 — W3C Trace Context propagation through enqueue → handler

#### Objective
Job handler `ctx.traceId` matches the originating request's traceId. Three-deep enqueue chain preserves the trace.

#### Evidence
Jobs reference §7.4, §8 EC-6. R0.5.9 acceptance.

#### Files to edit
```
packages/theo/src/server/jobs/trace-propagation.ts (NEW)
packages/theo/src/server/jobs/job-runner.ts (NEW) — worker loop that dequeues + invokes handler with trace ctx
tests/integration/job-trace-propagation.test.ts (NEW)
```

#### Deep file dependency analysis
- `trace-propagation.ts` (NEW): wraps T0.3's helpers to attach `traceparent` on `enqueue` and extract on `dequeue → handler invocation`.
- `job-runner.ts` (NEW): worker loop. `while (true) { leases = await backend.dequeue(); for lease: invoke handler with ctx including traceId from lease.traceparent }`.

#### Deep Dives
- **Algorithm:**
  ```
  1. Request handler has trace ctx (extracted from incoming traceparent or generated)
  2. enqueue() writes outbox entry with traceparent
  3. Outbox flushes → backend.enqueue(input with traceparent)
  4. Worker dequeues lease (includes traceparent)
  5. Handler invoked with ctx.traceId from lease.traceparent
  6. If handler enqueues again → propagates same trace_id (new span_id)
  ```
- **Invariant:** traceId continuity across 3-deep chain (request → job1 → job2 → job3). Test asserts trace_id constant, span_id varies.

#### Tasks
1. Create `trace-propagation.ts`.
2. Create `job-runner.ts` worker loop.
3. Wire trace propagation through outbox + dequeue.
4. Write integration test for 3-deep chain.

#### TDD + BDD

```
RED (integration): test_request_to_job_trace_continuity — Given request with traceparent, When handler enqueues + worker runs, Then job ctx.traceId.trace_id matches request trace_id.
RED (integration): test_job_to_job_trace_continuity — Given job1 that enqueues job2, When job2 runs, Then trace_id same, span_id different.
RED (integration): test_3_deep_chain_preserves_trace — Given request → job1 → job2 → job3, When all complete, Then all 4 share trace_id.
RED (edge): test_request_without_traceparent_generates_new — Given request without traceparent header, When handler enqueues, Then job gets new trace_id.
RED (edge): test_malformed_traceparent_generates_new — Given request with invalid traceparent, When handler enqueues, Then job gets new trace_id (no throw).
GREEN: Implement propagation + runner.
REFACTOR: None.
VERIFY: npx vitest run tests/integration/job-trace-propagation.test.ts
```

BDD scenarios:
- Happy path: traceId continuity request → job
- Validation error: malformed traceparent → defensive generation
- Edge case: missing traceparent → new generation
- Error scenario: 3-deep chain preserves trace_id

#### Acceptance Criteria
- [ ] All 5 RED tests pass
- [ ] Worker loop + propagation in place
- [ ] Pass: TS strict, lint, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Trace continuity verified in integration

---

## Phase 3: Jobs Postgres backend (R0.5.5 second adapter)

**Objective:** Production-grade Postgres backend using SKIP LOCKED dequeue per Graphile Worker pattern.

### T3.1 — `PostgresJobBackend` implementation

#### Objective
Implement `PostgresJobBackend implements JobBackend` using a single `jobs` table + SKIP LOCKED for concurrent worker safety.

#### Evidence
Jobs reference §7.2, §3.8 (Graphile Worker prior art). ADR-0002 §"Shipped implementations".

#### Files to edit
```
packages/theo/src/server/jobs/job-backend-postgres.ts (NEW)
packages/theo/src/server/jobs/postgres-schema.sql (NEW) — DDL for `jobs` table
packages/theo/src/server/jobs/postgres-migrations.ts (NEW) — emit migration on first use
packages/theo/package.json (MODIFY) — add `pg` as optionalPeerDependency
tests/integration/job-backend-postgres.test.ts (NEW) — requires testcontainers Postgres
```

#### Deep file dependency analysis
- `job-backend-postgres.ts` (NEW): class implementing JobBackend. Constructor takes `pg.Pool`. Lazy-requires `pg` (throws actionable error if missing).
- `postgres-schema.sql` (NEW): table DDL.
- `postgres-migrations.ts` (NEW): runs `CREATE TABLE IF NOT EXISTS jobs (...)` on backend init.

#### Deep Dives
- **DDL:**
  ```sql
  CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    input JSONB NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 1,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ,
    locked_by TEXT,
    traceparent TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency_key_idx ON jobs (name, idempotency_key) WHERE idempotency_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS jobs_available_at_idx ON jobs (available_at) WHERE locked_until IS NULL;
  ```
- **Dequeue SQL (SKIP LOCKED):**
  ```sql
  WITH next_jobs AS (
    SELECT id FROM jobs
    WHERE locked_until IS NULL AND available_at <= NOW()
    ORDER BY available_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE jobs SET locked_until = NOW() + INTERVAL '$2 seconds', locked_by = $3
  WHERE id IN (SELECT id FROM next_jobs)
  RETURNING *;
  ```
- **Edge case (EC-5):** concurrent worker race resolved by SKIP LOCKED at SQL level.
- **Edge case (EC-9):** connection lost during dispatch — caller (worker loop) catches + logs + retries.
- **EC-108 (SHOULD TEST) — connection pool exhaustion:** long-running job handlers can hold connections for the entire `lockSeconds`. With small pools (e.g., 2 connections + 3 concurrent dequeue calls), the third call blocks until a connection frees. Test asserts pool config has `connectionTimeoutMillis` set so the third call EITHER waits with bounded delay OR errors with clear message (depending on `pg.Pool` config). Document recommended pool size: `min(JobBackend workers * 1.5, 20)`.

#### Tasks
1. Create DDL + migration emitter.
2. Create `PostgresJobBackend` class.
3. Implement all 5 interface methods using SQL above.
4. Add `pg` to `optionalPeerDependency` + runtime require check.
5. Write integration test with testcontainers Postgres.

#### TDD + BDD

```
RED (integration): test_enqueue_inserts_row — Given backend + valid input, When enqueued, Then jobs table has 1 row with correct fields.
RED (integration): test_dequeue_marks_locked — Given enqueued + dequeue, When awaited, Then locked_until is set + lease returned.
RED (integration): test_concurrent_dequeue_no_double — Given 1 job + 2 concurrent dequeues, When awaited, Then total leases === 1 (SKIP LOCKED).
RED (integration): test_idempotency_unique_index — Given two enqueues with same (name, idempotencyKey), When second called, Then returns existing jobId (no duplicate row).
RED (integration): test_ack_deletes — Given lease, When ack, Then row deleted.
RED (integration): test_nack_increments_attempts — Given lease + nack, When dequeued again after locked_until, Then attempts === 2.
RED (integration): test_nack_nonRetryable_deletes — Given lease + nack(nonRetryable:true), When called, Then row deleted.
RED (edge): test_pg_missing_throws_actionable — Given pg not installed, When backend constructed, Then throws Error containing "pnpm add pg".
RED (EC-108): test_pool_exhaustion_bounded — Given pg.Pool {max: 2, connectionTimeoutMillis: 5000} + 3 concurrent dequeue calls each holding lease for 30s, When awaited, Then 3rd call either (a) queues + completes within 30s OR (b) errors with TimeoutError within 5s — NEVER deadlocks indefinitely.
GREEN: Implement class + migrations + pool config recommendation.
REFACTOR: Extract SQL queries to constants for testability.
VERIFY: npx vitest run tests/integration/job-backend-postgres.test.ts
```

BDD scenarios:
- Happy path: enqueue → dequeue → ack
- Validation error: idempotency dedups via UNIQUE index
- Edge case: SKIP LOCKED resolves concurrent dequeue race; pool exhaustion bounded by timeout (EC-108)
- Error scenario: missing `pg` package → actionable error

#### Acceptance Criteria
- [ ] All 9 RED tests pass (8 base + 1 EC-108) (testcontainers Postgres in CI)
- [ ] `PostgresJobBackend` exported from `theokit/server`
- [ ] `pg` is optional peer dep
- [ ] Pool size recommendation documented in JSDoc
- [ ] Pass: TS strict, lint, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Migration runs idempotent (re-run doesn't error)

---

## Phase 4: Webhook primitives (R0.5.10)

**Objective:** `defineWebhook` + 3 provider helpers (Stripe, GitHub, Slack) with fixtures per provider.

### T4.1 — `defineWebhook` primitive

#### Objective
Identity helper that wraps `{ verify, handler }` with raw body preservation + verification short-circuit.

#### Evidence
Webhook reference §9.1, §9.3. ADR-0005 final shape.

#### Files to edit
```
packages/theo/src/server/webhook/define-webhook.ts (NEW)
packages/theo/src/server/webhook/webhook-types.ts (NEW)
packages/theo/src/server/define/index.ts (MODIFY) — re-export
packages/theo/src/server/index.ts (MODIFY) — public surface
tests/unit/define-webhook.test.ts (NEW)
tests/type/define-webhook.test-d.ts (NEW)
```

#### Deep file dependency analysis
- `define-webhook.ts` (NEW): exports `defineWebhook(opts)`. Returns a `WebhookDefinition` that the route runner invokes: `readRawBody → verify → if !ok: 401 → invoke handler with ctx including rawBody + traceId`.
- `webhook-types.ts` (NEW): `WebhookOptions`, `WebhookContext`, `VerifyResult`, `WebhookDefinition`.

#### Deep Dives
- **Algorithm:**
  ```
  1. Pre-handler: readRawBody(req, { maxBodyBytes }) → { rawBody, bodyClone }
     - If BodyTooLargeError → 413 (EC-101)
  2. Try { result = await verify(bodyClone) } Catch (err) { result = { ok: false, reason: `verify threw: ${err.message}` } }  (EC-103)
  3a. If !result.ok → send 401 with reason header, log warning, do NOT invoke handler
  3b. If ok → invoke handler({ request: bodyClone, rawBody, traceId, signal })
  4. Response handling: handler return value treated like defineRoute response
  ```
- **Invariant:** verify failure NEVER invokes handler. Failure logged for auditability.
- **EC-103 (MUST FIX) — verify that throws:** if user-supplied or first-party `verify` throws unexpectedly (bug, malformed input, runtime fault), the framework MUST treat it as `{ ok: false, reason: 'verify threw: <message>' }`. Without this guard, the exception could bubble in a way that bypasses the verify check (depending on downstream middleware). Fail closed always.
- **Edge case (EC-7):** body must be raw — `readRawBody` MUST run before any body parser.

#### Tasks
1. Create `webhook-types.ts`.
2. Create `define-webhook.ts` identity helper.
3. Wire raw body + verification + handler dispatch.
4. **EC-103: wrap `verify` call in try/catch — any thrown exception treated as `{ok:false, reason:'verify threw: <msg>'}`.**
5. Re-export from `theokit/server`.
6. Type test for inference.

#### TDD + BDD

```
RED: test_definition_identity_with_runner_attached — Given verify + handler, When defineWebhook called, Then result.verify === verify && result.handler === handler.
RED (integration): test_verify_failure_returns_401 — Given verify returning {ok:false,reason:'x'}, When request hit, Then response status 401, handler NOT called.
RED (integration): test_verify_success_invokes_handler — Given verify returning {ok:true}, When request, Then handler called with WebhookContext having rawBody.
RED (integration): test_rawBody_preserved_for_handler — Given JSON body '{"a":1}', When handler called, Then ctx.rawBody === '{"a":1}' verbatim.
RED (integration): test_async_verify_supported — Given verify as async function, When request, Then awaited correctly.
RED (type): test_handler_ctx_typed — Given handler, When ctx.rawBody accessed, Then type === string.
RED (EC-103): test_verify_throws_treated_as_failure — Given verify that synchronously throws Error("oops"), When request hit, Then response 401 with reason containing "verify threw: oops" AND handler NOT called.
RED (EC-103): test_verify_async_rejects_treated_as_failure — Given verify async fn that rejects with Error("async oops"), When request hit, Then response 401 with reason containing "verify threw: async oops" AND handler NOT called.
RED (EC-101): test_body_over_limit_returns_413 — Given Request with 2MB body and webhook with default 1MB maxBodyBytes, When request hit, Then response 413 AND verify NOT called.
GREEN: Implement identity + runner pipeline with try/catch.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/define-webhook.test.ts tests/type/define-webhook.test-d.ts
```

BDD scenarios:
- Happy path: verify success → handler invoked
- Validation error: verify failure → 401 (NOT 500, NOT 200)
- Edge case: rawBody preserved byte-for-byte
- Error scenario: verify throws sync/async → 401 with reason (EC-103); body > limit → 413 (EC-101)

#### Acceptance Criteria
- [ ] All 9 RED tests pass (6 base + 2 EC-103 + 1 EC-101)
- [ ] `defineWebhook` importable from `theokit/server`
- [ ] Verify exceptions NEVER reach handler — audit via grep `try/catch` around verify call
- [ ] Pass: TS strict, lint, vitest, type, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Handler NEVER invoked on verify failure (audit confirmed)

---

### T4.2 — Stripe provider helper

#### Objective
`stripe(opts): (req) => Promise<VerifyResult>` per ADR-0005 + webhook reference §3 (Stripe).

#### Evidence
Webhook reference §3 Stripe, §9.3. Stripe official docs (canonical).

#### Files to edit
```
packages/theo/src/server/webhook/providers/stripe.ts (NEW)
packages/theo/src/server/webhook/providers/index.ts (NEW)
tests/unit/webhook-providers-stripe.test.ts (NEW)
```

#### Deep file dependency analysis
- `stripe.ts` (NEW): exports `stripe(opts: { secret: string | string[]; toleranceSeconds?: number }): VerifyFn`. Uses T0.1's `timingSafeEqual` + Web Crypto HMAC-SHA256.
- `providers/index.ts` (NEW): barrel re-exports `stripe`, `github`, `slack`.

#### Deep Dives
- **Algorithm (Stripe spec):**
  ```
  1. Parse stripe-signature header: t=<ts>, v1=<sig1>[, v1=<sig2>]...
  2. Reject if header missing → {ok:false, reason:'missing header'}
  3. Reject if |now - t| > toleranceSeconds → {ok:false, reason:'timestamp out of window'}
  4. For each secret in [secret].flat():
     basestring = `${t}.${rawBody}`
     expectedSig = hex(HMAC-SHA256(secret, basestring))
     For each v1=sig in header:
       if timingSafeEqual(sig, expectedSig) → return {ok:true}
  5. → {ok:false, reason:'signature mismatch'}
  ```
- **Default `toleranceSeconds`:** 300 (Stripe default).
- **Multi-key support:** `secret: string | string[]` for rotation.
- **Edge case (EC-4):** multiple `t=` in header — reject (malformed per Stripe spec).
- **Edge case (EC-8):** secret rotation — try all secrets, return ok on first match.

#### Tasks
1. Create `stripe.ts`.
2. Implement header parser (t + v1 entries).
3. Implement HMAC-SHA256 via Web Crypto.
4. Implement multi-key try loop.
5. Tolerance window check.

#### TDD + BDD

```
RED: test_valid_signature_returns_ok — Given correct sig within tolerance, When verify, Then {ok:true}.
RED: test_expired_timestamp_rejected — Given timestamp older than tolerance, When verify, Then {ok:false, reason includes 'timestamp'}.
RED: test_missing_header_rejected — Given no stripe-signature header, When verify, Then {ok:false, reason includes 'missing'}.
RED: test_wrong_signature_rejected — Given wrong secret used to sign, When verify, Then {ok:false, reason includes 'mismatch'}.
RED: test_multi_key_rotation_ok — Given secret=[old,new] and req signed with new, When verify, Then {ok:true}.
RED: test_malformed_header_rejected — Given header "garbage", When verify, Then {ok:false}.
RED (edge): test_empty_body_signed_correctly — Given empty rawBody signed, When verify, Then {ok:true}.
RED (edge): test_duplicate_t_field_rejected — Given header with two t=, When verify, Then {ok:false}.
GREEN: Implement Stripe verifier.
REFACTOR: Extract header parser to helper.
VERIFY: npx vitest run tests/unit/webhook-providers-stripe.test.ts
```

BDD scenarios:
- Happy path: valid sig within tolerance
- Validation error: expired timestamp
- Edge case: multi-key rotation
- Error scenario: missing header → 401

#### Acceptance Criteria
- [ ] All 8 RED tests pass
- [ ] `stripe` exported from `theokit/server/webhook/providers`
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Timing-safe comparison verified (no early return)

---

### T4.3 — GitHub provider helper

#### Objective
`github(opts): VerifyFn` for `X-Hub-Signature-256` per webhook reference §3 (GitHub).

#### Evidence
Webhook reference §3 GitHub. GitHub official docs.

#### Files to edit
```
packages/theo/src/server/webhook/providers/github.ts (NEW)
tests/unit/webhook-providers-github.test.ts (NEW)
```

#### Deep Dives
- **Algorithm:** simpler than Stripe — no timestamp tolerance, single signature.
  ```
  1. Read X-Hub-Signature-256 header, format "sha256=<hex>"
  2. expectedSig = hex(HMAC-SHA256(secret, rawBody))
  3. timingSafeEqual(headerSig, expectedSig)
  ```
- **Multi-key:** same `secret: string | string[]` pattern.
- **No tolerance:** GitHub doesn't include timestamp — replay protection is caller's job.

#### Tasks
1. Create `github.ts`.
2. Implement header parsing + HMAC.
3. Multi-key try loop.

#### TDD + BDD

```
RED: test_valid_sha256_signature — Given correct sig, When verify, Then {ok:true}.
RED: test_wrong_secret_rejected — Given wrong secret, When verify, Then {ok:false}.
RED: test_missing_header_rejected — Given no X-Hub-Signature-256, When verify, Then {ok:false}.
RED: test_malformed_header_rejected — Given "garbage" instead of "sha256=...", When verify, Then {ok:false}.
RED: test_multi_key_rotation — Given secrets array, When verify, Then tries all.
RED (edge): test_empty_body — Given empty rawBody, When verify with correct sig, Then {ok:true}.
GREEN: Implement.
REFACTOR: Share helpers with stripe.ts.
VERIFY: npx vitest run tests/unit/webhook-providers-github.test.ts
```

BDD scenarios:
- Happy path: valid sig
- Validation error: wrong secret
- Edge case: empty body
- Error scenario: missing header

#### Acceptance Criteria
- [ ] All 6 RED tests pass
- [ ] `github` exported
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green

---

### T4.4 — Slack provider helper

#### Objective
`slack(opts): VerifyFn` for `X-Slack-Signature` per webhook reference §3 (Slack).

#### Evidence
Webhook reference §3 Slack.

#### Files to edit
```
packages/theo/src/server/webhook/providers/slack.ts (NEW)
tests/unit/webhook-providers-slack.test.ts (NEW)
```

#### Deep Dives
- **Algorithm:**
  ```
  1. Read X-Slack-Request-Timestamp + X-Slack-Signature headers
  2. Reject if missing → {ok:false}
  3. Reject if |now - ts| > toleranceSeconds (default 300) → {ok:false}
  4. basestring = `v0:${ts}:${rawBody}`
  5. expectedSig = `v0=${hex(HMAC-SHA256(signingSecret, basestring))}`
  6. timingSafeEqual(header, expectedSig)
  ```
- **NO multi-key:** Slack doesn't support key rotation natively (per webhook reference §5). `signingSecret` is single string only.
- **Replay window:** 5 min default.

#### Tasks
1. Create `slack.ts`.
2. Implement basestring concat + HMAC.
3. Tolerance check.

#### TDD + BDD

```
RED: test_valid_v0_signature — Given correct sig + ts within window, When verify, Then {ok:true}.
RED: test_expired_ts_rejected — Given ts > 5min old, When verify, Then {ok:false}.
RED: test_missing_header_rejected — Given no signature header, When verify, Then {ok:false}.
RED: test_wrong_secret_rejected — Given wrong signingSecret, When verify, Then {ok:false}.
RED: test_modified_body_rejected — Given valid sig but rawBody modified, When verify, Then {ok:false}.
RED (edge): test_empty_body_signed — Given empty rawBody signed, When verify, Then {ok:true}.
GREEN: Implement.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/webhook-providers-slack.test.ts
```

BDD scenarios:
- Happy path: valid sig + recent ts
- Validation error: expired ts
- Edge case: empty body
- Error scenario: modified body → mismatch

#### Acceptance Criteria
- [ ] All 6 RED tests pass
- [ ] `slack` exported
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green

---

## Phase 5: Cost Tracking (R0.5.11)

**Objective:** `trackAgentRun` + `UsageStorageAdapter` interface + InMemory default + auto-integration with `defineAgentEndpoint`.

### T5.1 — `UsageStorageAdapter` interface + InMemory impl

#### Objective
Pluggable storage for per-user agent usage accumulation. Mirrors `JobBackend` pattern.

#### Evidence
R0.5.11 acceptance. ADR-0007 (D7 in this plan).

#### Files to edit
```
packages/theo/src/server/cost/usage-storage.ts (NEW) — interface
packages/theo/src/server/cost/usage-storage-memory.ts (NEW) — InMemory impl
packages/theo/src/server/cost/cost-types.ts (NEW)
tests/unit/usage-storage-memory.test.ts (NEW)
```

#### Deep Dives
- **Interface:**
  ```typescript
  interface UsageStorageAdapter {
    readonly name: string
    record(input: { userId: string; model: string; tokens: { input: number; output: number }; costUsd: number; timestamp: Date }): Promise<void>
    getUsage(query: { userId: string; period: { from: Date; to: Date } }): Promise<{ totalTokens: number; totalCostUsd: number; runs: number }>
  }
  ```
- **InMemory:** simple `Array<UsageRecord>` with filter on getUsage. Acceptable for dev + tests + small deployments.

#### Tasks
1. Create interface + types.
2. Create InMemory impl.

#### TDD + BDD

```
RED: test_record_stores_entry — Given input, When recorded, Then getUsage returns matching totals.
RED: test_getUsage_filters_by_userId — Given 2 users, When getUsage for one, Then only that user's records.
RED: test_getUsage_filters_by_period — Given records across days, When getUsage with period, Then only within-period records.
RED: test_empty_query_returns_zeros — Given user with no records, When queried, Then {totalTokens:0, totalCostUsd:0, runs:0}.
RED (edge): test_concurrent_records_no_loss — Given 100 concurrent records, When awaited, Then getUsage shows 100 runs.
GREEN: Implement.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/usage-storage-memory.test.ts
```

BDD scenarios:
- Happy path: record + query roundtrip
- Validation error: empty query → zeros
- Edge case: period filter
- Error scenario: concurrent records (no race loss)

#### Acceptance Criteria
- [ ] All 5 RED tests pass
- [ ] Interface + InMemory exported
- [ ] Pass: TS strict, lint, vitest

#### DoD
- [ ] All tasks completed
- [ ] Tests green

---

### T5.2 — `trackAgentRun` + `defineAgentEndpoint` integration

#### Objective
`trackAgentRun(input)` invokes adapter.record. `defineAgentEndpoint` auto-tracks on Agent.prompt completion when `usageStorage` configured.

#### Evidence
R0.5.11 acceptance (b).

#### Files to edit
```
packages/theo/src/server/cost/track-agent-run.ts (NEW)
packages/theo/src/server/define/define-agent-endpoint.ts (MODIFY) — auto-track on completion
tests/unit/track-agent-run.test.ts (NEW)
tests/integration/agent-endpoint-cost-tracking.test.ts (NEW)
```

#### Deep Dives
- **`trackAgentRun(opts)`:** thin wrapper that calls `adapter.record`. Adapter resolved from `theo.config.ts > cost.storage` (default `InMemoryUsageStorage`).
- **`defineAgentEndpoint` integration:** when SDK `Agent.prompt` returns with token/cost data, framework calls `trackAgentRun` automatically. User opts out via `trackUsage: false`.

#### Tasks
1. Create `track-agent-run.ts`.
2. Modify `define-agent-endpoint.ts` to inject tracking.
3. Wire config resolution.

#### TDD + BDD

```
RED: test_trackAgentRun_calls_record — Given adapter spy + valid input, When trackAgentRun called, Then adapter.record called once with input.
RED (integration): test_agent_endpoint_auto_tracks_on_completion — Given endpoint with usageStorage configured, When Agent.prompt completes, Then adapter.record called.
RED: test_trackUsage_false_opts_out — Given endpoint with trackUsage:false, When prompt completes, Then adapter.record NOT called.
RED (edge): test_missing_adapter_no_error — Given no adapter configured, When trackAgentRun called, Then no-op (does not throw).
RED (edge): test_track_failure_doesnt_break_response — Given adapter.record throws, When endpoint completes, Then response still succeeds (error logged).
GREEN: Implement.
REFACTOR: None.
VERIFY: npx vitest run tests/unit/track-agent-run.test.ts tests/integration/agent-endpoint-cost-tracking.test.ts
```

BDD scenarios:
- Happy path: auto-track on completion
- Validation error: opt-out via config
- Edge case: missing adapter → no-op
- Error scenario: tracking failure doesn't break response

#### Acceptance Criteria
- [ ] All 5 RED tests pass
- [ ] `trackAgentRun` exported
- [ ] `defineAgentEndpoint` auto-tracks
- [ ] Pass: TS strict, lint, vitest, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green

---

## Phase 6: Fixtures + Examples + Docs + Cross-validation + Dogfood

**Objective:** Produce reproducible fixture projects, working examples in `examples/full-stack-agent/`, concept docs, and validate via cross-validation + dogfood.

### T6.1 — Fixtures: `fixtures/cron-basic/`, `fixtures/jobs-basic/`, `fixtures/webhook-stripe/`, `fixtures/webhook-github/`, `fixtures/webhook-slack/`

#### Objective
Minimal isolated TheoKit projects exercising each primitive end-to-end. Reusable for tests.

#### Files to edit
```
fixtures/cron-basic/ (NEW)
  package.json
  theo.config.ts
  server/crons/morning-summary.ts
  README.md
fixtures/jobs-basic/ (NEW)
  package.json, theo.config.ts
  server/jobs/process-document.ts
  server/routes/upload.ts (uses ctx.queue.enqueue)
  README.md
fixtures/webhook-stripe/ (NEW)
  package.json, theo.config.ts
  server/webhooks/stripe.ts
  README.md
fixtures/webhook-github/ (NEW) — similar
fixtures/webhook-slack/ (NEW) — similar
tests/integration/cron-basic-fixture.test.ts (NEW)
tests/integration/jobs-basic-fixture.test.ts (NEW)
tests/integration/webhook-stripe-fixture.test.ts (NEW)
```

#### Deep Dives
- Each fixture is workspace-linked (`"theokit": "workspace:*"`).
- README explains the demo + expected output.
- Tests boot the fixture and assert behavior.

#### Tasks
1. Scaffold 5 fixtures from templates.
2. Write 1 representative handler per primitive.
3. Write integration tests that exercise each fixture.

#### TDD + BDD (per fixture)

For `cron-basic`:
```
RED: test_cron_basic_fixture_imports — Given fixture, When TS-checked, Then no errors.
RED: test_cron_basic_manifest_emit — Given fixture built, When .theo/crons.json read, Then has expected cron.
RED: test_cron_basic_handler_invocable — Given runtime + fake timers, When scheduled time, Then handler invoked.
GREEN: Make fixtures correct.
REFACTOR: None.
VERIFY: npx vitest run tests/integration/cron-basic-fixture.test.ts
```

(Same shape for jobs-basic, webhook-stripe, webhook-github, webhook-slack.)

#### Acceptance Criteria
- [ ] All 5 fixtures present
- [ ] Each fixture has integration test
- [ ] Tests pass

#### DoD
- [ ] All fixtures importable
- [ ] All integration tests green

---

### T6.2 — Examples in `examples/full-stack-agent/`

#### Objective
Wire all 4 primitives into the existing `examples/full-stack-agent/` so a visitor can see them in action.

#### Files to edit
```
examples/full-stack-agent/server/crons/morning-summary.ts (NEW)
examples/full-stack-agent/server/jobs/process-document.ts (NEW)
examples/full-stack-agent/server/jobs/process-document.test.ts (NEW)
examples/full-stack-agent/server/webhooks/stripe.ts (NEW)
examples/full-stack-agent/server/routes/chat.ts (MODIFY) — add trackAgentRun
examples/full-stack-agent/README.md (MODIFY) — document new features
```

#### Deep Dives
- Each new file is realistic, not toy. The Stripe webhook handler updates a per-user subscription tier; the cron summarizes HN; the job processes uploaded PDFs.
- README sections explain how to run each.

#### Tasks
1. Add cron file with morning HN summary handler.
2. Add job file with PDF processing.
3. Add Stripe webhook file with tier update.
4. Modify chat route to trackAgentRun.
5. Update README.

#### TDD + BDD

```
RED: test_example_files_typecheck — Given examples, When TS-checked, Then no errors.
RED: test_example_cron_handler_invocable — Given fixture + cron, When fired, Then runs without error.
RED: test_example_job_handler_invocable — Given fixture + job, When enqueued + dequeued, Then handler runs.
RED: test_example_webhook_verify — Given Stripe sig fixture, When verify, Then {ok:true}.
GREEN: Make examples correct.
REFACTOR: None.
VERIFY: npx vitest run tests/integration/example-full-stack-agent-*.test.ts
```

BDD scenarios:
- Happy path: all examples typecheck and invoke correctly
- Validation error: missing env var → actionable error
- Edge case: real-shaped data (HN API, PDF binary)
- Error scenario: invalid webhook → 401

#### Acceptance Criteria
- [ ] All examples present and typecheck
- [ ] Tests pass
- [ ] README explains each feature

#### DoD
- [ ] All examples runnable
- [ ] Tests green

---

### T6.3 — Concept docs

#### Objective
Four new docs in `docs/concepts/` explaining each primitive for end-users. Each MUST document the relevant DOCUMENT-level edge cases (EC-110, EC-111, EC-112, EC-113, EC-114) so users understand the framework's boundaries.

#### Files to edit
```
docs/concepts/crons.md (NEW)
docs/concepts/jobs.md (NEW) — includes ADR-0003 link + outbox explanation + "I want chaining" guidance + EC-111 (HMR limitation) + EC-112 (CF Workers outbox limitation)
docs/concepts/webhooks.md (NEW) — includes custom verify template + EC-113 (gzip body warning) + EC-101 maxBodyBytes config + EC-103 verify-throws behavior
docs/concepts/cost-tracking.md (NEW) — includes EC-114 (InMemory accumulator limitation) + production storage recommendation
```

#### Required edge-case sections per doc

**docs/concepts/crons.md MUST include:**
- "## Local development limitations" section covering EC-111 (HMR + dynamic import cache — restart `theokit dev` after editing cron handlers)

**docs/concepts/jobs.md MUST include:**
- "## TypeScript JobRegistry setup" section covering EC-110 (`declare module 'theokit/server' { interface JobRegistry { ... } }` requirement + example showing the "Type 'X' is not assignable to type 'never'" error users see when they forget)
- "## I want to chain steps" section per ADR-0003 (workflow API rejection rationale)
- "## Adapter limitations" section covering EC-112 (outbox does not apply on Cloudflare Workers / edge runtimes — `res.on('finish')` doesn't exist; on edge, `enqueue` dispatches immediately with no rollback)
- "## Local development limitations" section covering EC-111

**docs/concepts/webhooks.md MUST include:**
- "## Custom verify template" code block showing the inline `verify: async (req) => ...` pattern
- "## Body size limits" section covering EC-101 (`maxBodyBytes` default 1MB; raise for GitHub up to 25MB)
- "## Verify failures" section covering EC-103 (verify exceptions treated as `{ok:false}`; framework fails closed)
- "## Proxy / compression warning" section covering EC-113 (HMAC against wire bytes; do NOT decompress before TheoKit)

**docs/concepts/cost-tracking.md MUST include:**
- "## Production storage" section covering EC-114 (InMemoryUsageStorage unbounded; MUST swap for Postgres/Redis in production; recipes in R0.6.7)

#### Tasks
1. Write `crons.md` with: API surface, basic example, common patterns, deploy notes, EC-111 section.
2. Write `jobs.md` with: API surface, basic example, outbox semantics, JobRegistry setup (EC-110), chaining rejection rationale, adapter limitations (EC-112), local dev limitations (EC-111).
3. Write `webhooks.md` with: API surface, basic example, 3 first-party providers, custom verify template, body size limits (EC-101), verify failures (EC-103), proxy/compression warning (EC-113).
4. Write `cost-tracking.md` with: API surface, basic example, production storage recommendation (EC-114).

#### TDD + BDD (docs use grep-based tests)

```
RED: test_docs_link_to_api — Given crons.md, When grepped, Then mentions `defineCron`.
RED: test_jobs_doc_addresses_chaining — Given jobs.md, When read, Then has section "I want to chain steps" with recommended pattern.
RED: test_webhook_doc_shows_custom_template — Given webhooks.md, When read, Then has working custom verifier code block.
RED (EC-110): test_jobs_doc_explains_JobRegistry — Given jobs.md, When grepped, Then mentions "declare module 'theokit/server'" + "JobRegistry" + "never" (the error users see when forgotten).
RED (EC-111): test_crons_doc_local_dev_section — Given crons.md, When grepped, Then has "Local development limitations" section mentioning HMR + restart.
RED (EC-111): test_jobs_doc_local_dev_section — Given jobs.md, When grepped, Then has "Local development limitations" section.
RED (EC-112): test_jobs_doc_cf_workers_limitation — Given jobs.md, When grepped, Then has "Adapter limitations" mentioning Cloudflare Workers + outbox behavior.
RED (EC-101): test_webhook_doc_body_size_limits — Given webhooks.md, When grepped, Then has "Body size limits" mentioning maxBodyBytes + 1MB default + 25MB GitHub opt-in.
RED (EC-103): test_webhook_doc_verify_failure_behavior — Given webhooks.md, When grepped, Then has "Verify failures" mentioning exceptions treated as ok:false.
RED (EC-113): test_webhook_doc_gzip_warning — Given webhooks.md, When grepped, Then has warning about proxy decompression.
RED (EC-114): test_cost_tracking_doc_production_storage — Given cost-tracking.md, When grepped, Then has "Production storage" section recommending Postgres/Redis swap.
GREEN: Write docs correctly with all EC sections.
REFACTOR: None.
VERIFY: grep-based assertion via tests/integration/docs-presence.test.ts
```

BDD scenarios:
- Happy path: each doc explains its primitive
- Validation error: each doc covers common errors (JobRegistry forgotten, gzip proxy, body too large)
- Edge case: chaining workaround in jobs.md; HMR limitations in crons + jobs
- Error scenario: each doc has "when this fails" section (verify throws, pool exhaustion, cron handler hang)

#### Acceptance Criteria
- [ ] All 4 docs present (crons.md, jobs.md, webhooks.md, cost-tracking.md)
- [ ] Cross-reference ADRs (0002, 0003, 0004, 0005, 0006)
- [ ] All 10 grep-tests pass (3 base + 7 EC-driven)
- [ ] All 6 DOCUMENT edge cases (EC-110 through EC-114 + EC-101/EC-103) covered

#### DoD
- [ ] 4 docs present
- [ ] grep-tests pass
- [ ] Manual review confirms doc readability for new TheoKit users

---

### T6.4 — Cross-validation gate

#### Objective
Run `/cross-validation jobs-crons-webhooks-cost-tracking` to verify every task, ADR, TDD cycle, acceptance criterion, and DoD against actual code.

#### Evidence
This plan declares 24 implementation tasks with TDD+BDD. The skill `/cross-validation` reads the plan line-by-line and asserts every claim against `git ls-files` + `pnpm test` + ESLint + dependency-cruiser. It is the most rigorous gate before dogfood.

#### Files to edit
```
docs/reviews/cross-validation/jobs-crons-webhooks-cost-tracking-xval-2026-MM-DD.md (output of skill)
```

#### Deep file dependency analysis
- The cross-validation report is the SOLE artifact of this task. It does NOT modify code. It produces a verdict (APROVADO / REPROVADO / APROVADO COM RESSALVAS) and a list of divergences.
- Downstream: this report gates whether T6.5 (Dogfood) runs.

#### Deep Dives
- **Verdict semantics:** APROVADO = every task implemented as declared; REPROVADO = at least one CRITICAL divergence; APROVADO COM RESSALVAS = only LOW or MEDIUM divergences.
- **Invariant:** the plan does NOT advance to Dogfood while REPROVADO. CRITICALs MUST be fixed and re-validated.

#### Tasks
1. Invoke `/cross-validation jobs-crons-webhooks-cost-tracking`.
2. Read the generated report.
3. If APROVADO → proceed to Dogfood Final Phase.
4. If REPROVADO → fix divergences; re-run `/cross-validation`.
5. If APROVADO COM RESSALVAS → fix CRITICAL items; proceed.

#### TDD + BDD (⛔ OBRIGATÓRIO — meta-task variant)

> This task is a **meta-task** (invokes a validation skill). The "test" is the verdict produced by the skill itself. The 4 BDD scenarios map to the 4 possible verdicts.

```
RED (gate): assert_report_exists — Given /cross-validation invoked, When complete, Then docs/reviews/cross-validation/{slug}-xval-{date}.md exists with non-empty body.
RED (gate): assert_verdict_present — Given report file, When grepped, Then matches /^Verdict:\s*(APROVADO|REPROVADO|APROVADO COM RESSALVAS)/.
RED (gate): assert_no_critical_unresolved — Given verdict, When critical-count parsed, Then count === 0 OR each critical has companion "RESOLVED" marker.
RED (gate): assert_every_phase_audited — Given report sections, When grepped for Phase 0-6, Then all 7 phase headings present in report.
GREEN: invoke skill; if verdict is REPROVADO, fix root cause + re-run.
REFACTOR: None (meta-task).
VERIFY: cat docs/reviews/cross-validation/jobs-crons-webhooks-cost-tracking-xval-*.md | head -50
```

BDD scenarios:
- Happy path: APROVADO verdict → proceed to dogfood
- Validation error: REPROVADO → fix + re-invoke skill
- Edge case: APROVADO COM RESSALVAS → fix CRITICALs only, low/medium are documented
- Error scenario: skill itself errors out → re-invoke after fixing skill prerequisites

#### Acceptance Criteria
- [ ] Cross-validation report file exists at `docs/reviews/cross-validation/jobs-crons-webhooks-cost-tracking-xval-{YYYY-MM-DD}.md`
- [ ] Verdict line present in report
- [ ] Either APROVADO OR (APROVADO COM RESSALVAS with all CRITICALs marked RESOLVED)
- [ ] Every Phase 0-6 audited
- [ ] No silent skips (every task heading from this plan appears in the report)

#### DoD
- [ ] Skill invoked successfully
- [ ] Report saved to expected path
- [ ] Verdict is APROVADO or APROVADO COM RESSALVAS
- [ ] All CRITICAL divergences resolved before proceeding to Dogfood
- [ ] Report committed to git (not just local)

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | R0.5.4 `defineCron` primitive | T1.1, T1.2 | 5-field UTC validator + identity helper |
| 2 | R0.5.4 manifest emission | T1.3 | `.theo/crons.json` with schemaVersion:1 |
| 3 | R0.5.4 8 adapter translators | T1.5 | 4 active + 4 documented N/A |
| 4 | R0.5.4 dev scheduler | T1.4 | In-memory Node setTimeout-based |
| 5 | R0.5.5 `defineJob` | T2.3 | Identity + scan + manifest |
| 6 | R0.5.5 `JobBackend` interface | T2.1, T2.2, T3.1 | Interface + InMemory + Postgres |
| 7 | R0.5.5 `NonRetryableError` | T2.1 | Class with code='NON_RETRYABLE' |
| 8 | R0.5.6 `ctx.queue.enqueue` typed | T2.4 | Module-augmentation `JobRegistry` |
| 9 | R0.5.6 idempotency key | T2.2, T3.1 | TTL window dedup |
| 10 | R0.5.7 manifest neutral schema | T1.3, T2.3 | schemaVersion field on both |
| 11 | R0.5.8 transactional outbox | T2.5 | `res.on('finish')` lifecycle hook |
| 12 | R0.5.9 W3C Trace Context | T0.3, T2.6 | extract/inject pair + 3-deep chain test |
| 13 | R0.5.10 `defineWebhook` | T4.1 | Identity + verify pipeline |
| 14 | R0.5.10 Stripe helper | T4.2 | `stripe(opts): VerifyFn` |
| 15 | R0.5.10 GitHub helper | T4.3 | `github(opts): VerifyFn` |
| 16 | R0.5.10 Slack helper | T4.4 | `slack(opts): VerifyFn` |
| 17 | R0.5.10 raw body preservation | T0.2 | `readRawBody` helper |
| 18 | R0.5.10 timing-safe comparison | T0.1 | Web Crypto + Node fallback |
| 19 | R0.5.11 `trackAgentRun` | T5.2 | Wrapper + auto-integration |
| 20 | R0.5.11 `UsageStorageAdapter` | T5.1 | Interface + InMemory |
| 21 | R0.5.11 rate-limit-by-tier fixture | T6.2 | Wired into chat route |
| 22 | ADR-0002 JobBackend neutral | T2.1, T3.1 | Interface + 2 impls |
| 23 | ADR-0003 enqueue returns void | T2.4 | void return + enqueueWithId variant |
| 24 | ADR-0004 5-field UTC strict | T1.1 | Validator rejects 6-field, shorthand, TZ |
| 25 | ADR-0005 verify = inline function | T4.1, T4.2, T4.3, T4.4 | No class hierarchy |
| 26 | ADR-0006 defineWorker rejected | (negative scope — codified in ADR) | No `defineWorker` in implementation |
| 27 | Fixtures per primitive | T6.1 | 5 fixtures present |
| 28 | Examples in full-stack-agent | T6.2 | All 4 primitives wired |
| 29 | Concepts docs | T6.3 | 3 docs in docs/concepts/ |
| 30 | Cross-validation gate | T6.4 | Skill invoked, report saved |
| 31 | Dogfood QA | Final Phase | `/dogfood full` ≥ 70 |
| 32 | EC-101 raw body OOM via giant POST | T0.2 | `maxBodyBytes` opt + BodyTooLargeError 413 |
| 33 | EC-103 verify throws → bypass risk | T4.1 | try/catch wrap → treat as {ok:false} |
| 34 | EC-104 InMemory pending jobs lost on shutdown | T2.2 | `process.on('beforeExit')` cleanup + warn |
| 35 | EC-105 adapter translator overwrites user config | T1.5 | read-merge-write per format + ExistingConfigUnparseableError |
| 36 | EC-106 manifest write race | T1.3, T2.3 | atomic write (tmp + rename) shared helper |
| 37 | EC-107 outbox flush when backend throws | T2.5 | log per-entry + continue + metric |
| 38 | EC-108 Postgres pool exhaustion | T3.1 | connectionTimeoutMillis + recommendation in JSDoc |
| 39 | EC-109 cron handler hang blocks scheduler | T1.4 | void-scheduled handlers; isolation per-cron |
| 40 | EC-110 JobRegistry augmentation forgotten | T6.3 jobs.md | explicit doc section + error example |
| 41 | EC-111 HMR + dynamic import cache | T6.3 crons.md + jobs.md | "Local development limitations" section |
| 42 | EC-112 outbox on CF Workers | T6.3 jobs.md | "Adapter limitations" section |
| 43 | EC-113 gzip body proxy warning | T6.3 webhooks.md | "Proxy / compression" section |
| 44 | EC-114 InMemoryUsageStorage unbounded | T6.3 cost-tracking.md | "Production storage" recommendation |

**Coverage: 44/44 requirements covered (100%)**

## Global Definition of Done

- [ ] All 6 phases completed (Phase 0–5)
- [ ] All RED → GREEN tests passing (~80+ new tests across phases)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean)
- [ ] Zero ESLint warnings (`pnpm lint` exit 0)
- [ ] Backward compatibility preserved (`theokit/server` exports add-only)
- [ ] `pnpm exec dependency-cruiser packages/theo/src/ --validate` 0 violations
- [ ] `pnpm exec ls-lint` 0 violations
- [ ] All 2300+ pre-existing tests still pass
- [ ] CHANGELOG `[Unreleased]` documents each primitive
- [ ] **Fixture proof** — 5 fixtures in `fixtures/` + 4 examples in `examples/full-stack-agent/`
- [ ] **Cross-validation PASS** — `/cross-validation jobs-crons-webhooks-cost-tracking` APROVADO
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70, zero CRITICAL plan-caused issues
- [ ] **Architecture diff** — `/architecture-docs server` re-run; user confirms doc update

### Plan-specific criteria

- [ ] Transactional outbox: KEY test `tests/integration/job-outbox-rollback.test.ts` verifies ZERO orphan jobs on handler throw, on 4xx response, on client abort
- [ ] W3C Trace Context: 3-deep enqueue chain preserves trace_id across `request → job1 → job2 → job3`
- [ ] Webhook security: every provider verifier uses `timingSafeEqual` (no early-return comparisons); audit via grep
- [ ] Cron adapter parity: same `.theo/crons.json` produces equivalent fire behavior on Vercel + CF + AWS + Deno (verified by integration tests against mocked platform configs)
- [ ] Zero `any` introduced in production code
- [ ] **EC-101**: `defineWebhook` rejects POST > 1MB with 413 by default
- [ ] **EC-103**: `verify` exceptions audited via grep — every code path wraps verify in try/catch; handler NEVER called when verify throws
- [ ] **EC-104**: `InMemoryJobBackend` registers `beforeExit` cleanup; `destroy()` method for test isolation
- [ ] **EC-105**: integration tests assert `vercel.json` / `wrangler.toml` / `serverless.yml` preserved fields outside cron-managed slice
- [ ] **EC-106**: manifest writes verified atomic (tmp + rename) via shared `server/_internal/atomic-write.ts` helper
- [ ] All 14 EC-101..EC-114 either implemented (MUST FIX), tested (SHOULD TEST), or documented (DOCUMENT) per the coverage matrix above

## Final Phase: Dogfood QA (MANDATORY)

> Runs AFTER all 6 implementation phases complete + cross-validation APROVADO.

**Objective:** Validate that the four primitives work end-to-end as a real user would experience them.

### Execution

```
/dogfood full
```

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced by this plan
- [ ] Zero HIGH issues in cron/jobs/webhook/cost-tracking flows
- [ ] Pre-existing issues documented (not caused by this plan)

### Plan-specific dogfood smoke

Beyond the standard 22 phases:

1. **Cron**: scaffold project + add `server/crons/test.ts` with `*/1 * * * *` + run `theokit dev` for 2 minutes + verify handler fired ≥ 1 time in logs.
2. **Jobs**: scaffold + add `server/jobs/echo.ts` + add `server/routes/enqueue.ts` that calls `ctx.queue.enqueue('echo', { msg: 'hi' })` + POST to `/api/enqueue` + verify job dispatched within 1s (in-memory backend).
3. **Webhook**: scaffold + add `server/webhooks/stripe.ts` using `stripe({secret: 'whsec_test'})` + send request with valid Stripe-formatted signature + verify 200; send invalid → verify 401.
4. **Cost tracking**: scaffold + configure `usageStorage: new InMemoryUsageStorage()` + invoke `defineAgentEndpoint` chat + verify `usageStorage.getUsage({userId, period})` returns non-zero after call.

### If Dogfood Fails

1. Identify plan-caused vs pre-existing issues.
2. Fix all plan-caused CRITICAL + HIGH before declaring complete.
3. Re-run `/dogfood full`.
4. Pre-existing issues logged but DO NOT block plan completion.

### Post-Dogfood: Architecture Diff

After dogfood APROVADO, run `/architecture-docs server` and ask user to confirm replacement of main docs with diff version.

---

## Notes on Skill Process

- **`/architecture-docs server` BEFORE skipped** — reason: greenfield modules (`cron/`, `jobs/`, `webhook/`, `cost/`) don't exist yet in `packages/theo/src/server/`. AFTER snapshot will capture the new modules + dependencies.
- **`/edge-case-plan jobs-crons-webhooks-cost-tracking`** — invoke immediately after this plan is saved. The 3 reference docs already enumerate 43 edge cases across the 3 primitives; the edge-case-plan skill cross-checks the PLAN against the docs to surface anything missed.
- **`/cross-validation jobs-crons-webhooks-cost-tracking`** — invoke AFTER implementation completes, BEFORE dogfood.
