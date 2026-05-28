# Reference: Cron Primitives

**Date:** 2026-05-24
**Depth:** standard
**Frameworks analyzed:** Nitro (`defineTask` + `scheduledTasks`), Hono / Cloudflare Workers (`scheduled` handler), Rails 8 (Solid Queue `config/recurring.yml`)
**Platforms analyzed:** Vercel Cron Jobs, Cloudflare Workers Cron Triggers, Deno Deploy `Deno.cron`, AWS EventBridge Scheduler, node-cron (in-process Node engine), Hermes Agent (natural-language scheduling reference)
**TheoKit package affected:** `packages/theo/src/server/cron/` (new module), `packages/theo/src/cli/build.ts` (emit `.theo/crons.json`), `packages/theo/src/adapters/*/cron-translate.ts` (per-adapter translators), `packages/theo/src/server/scan/` (cron file scan, extend existing route-scan walker)
**Related references:** [`webhook-signing.md`](./webhook-signing.md) (sibling primitive, shares CRON_SECRET-style auth pattern), [`caching-and-revalidation.md`](./caching-and-revalidation.md) (background revalidation is a natural cron consumer), [`enforcement-cutover.md`](./enforcement-cutover.md) (the cron HTTP endpoint must respect the post-0.3.0 CSRF strict default — see EC-7)

**Locked constraints (from CLAUDE.md R0.5.4 + ADR-0004 as proposed):**

1. **5-field UTC cron strict** (no timezone field, no 6-field seconds, no `@daily` shorthand in v1).
2. **Build emits `.theo/crons.json` manifest** — versioned, neutral, consumable by every adapter.
3. **Each adapter translates at build time** — no shared runtime cron engine in prod (Vercel/CF/Deno each fire their own triggers).
4. **NOT a workflow engine** — `defineCron` ships a single-fire handler. Multi-step orchestration is explicitly out of scope (see ADR-0006 reject in CLAUDE.md).
5. **Cron handler is HTTP-callable** — the underlying delivery vehicle on Vercel and on the TheoKit dev runtime is an HTTP route the adapter or the in-process scheduler hits. Cloudflare and Deno fire native primitives instead, but the user's `handler` shape is identical.

---

## 1. Problem statement

TheoKit today has zero scheduling primitives. A user who wants to send a morning summary email at 9am UTC, refresh a cached LLM benchmark every hour, or expire abandoned conversations nightly must either (a) wire the platform-specific surface themselves (`vercel.json` + a hand-rolled `/api/cron/*` route + `CRON_SECRET` middleware they author from scratch), or (b) install `node-cron` and pin the framework to a single Node deploy target. Neither path is what an agent-shaped app needs — agent apps frequently want time-triggered background work (digest emails, scheduled prompts, periodic webhook polls, KPI snapshots) and they want it to work across Vercel, Cloudflare, Deno, and Node hosts with the same source file.

The current state is verifiable: `find packages/theo/src -name "*cron*"` returns zero hits. `grep -rn "schedule" packages/theo/src/server/` returns rate-limit references only. The framework's two agent-flavored examples (`examples/agent-saas`, `examples/full-stack-agent`) have no cron usage. There is no manifest emitted at build time, no documentation, no test fixture. Every existing TheoKit user who needs scheduled work is reaching outside the framework.

R0.5.4 in CLAUDE.md commits to closing this gap in the 0.5.0 onda. This reference is the technical foundation for that commit: it audits how Nitro / Rails / Cloudflare / Vercel / Deno / AWS / node-cron solve the same problem, locks the design constraints, and lists every file the implementation plan must produce. The wedge is "the app the agent lives in" — and the app the agent lives in needs to do work at 9am whether anyone is watching or not.

## 2. Inventário

### Files deep-read

| Path | Category | LOC | What it shows |
|---|---|---|---|
| `referencias/nitro/src/runtime/internal/task.ts` | nitro core | 95 | `defineTask` / `runTask` / `startScheduleRunner` / `runCronTasks` — the canonical separation between **definition** (`defineTask`), **direct invocation** (`runTask`), **schedule-based dispatch** (`startScheduleRunner` using `croner`), and **adapter-fired schedule** (`runCronTasks` called from the platform's scheduled hook) |
| `referencias/nitro/src/presets/vercel/runtime/cron-handler.ts` | nitro adapter | 31 | Vercel cron HTTP receiver — pulls `x-vercel-cron-schedule` header, authenticates with `CRON_SECRET` via `timingSafeEqual` (constant-time string compare on the Bearer header), then calls `runCronTasks` with the schedule string as the dispatch key |
| `referencias/nitro/src/presets/vercel/utils.ts` (lines 315-326) | nitro adapter | 12 (slice) | Build-time emission — translates `nitro.options.scheduledTasks` into `config.crons = [{ path: '/_vercel/cron', schedule }, ...]` on the generated Vercel build config |
| `referencias/nitro/src/presets/cloudflare/runtime/_module-handler.ts` (lines 41-63) | nitro adapter | 23 (slice) | Cloudflare module handler — implements both `fetch(request, env, ctx)` and `scheduled(controller, env, ctx)`; the latter calls `ctx.waitUntil(runCronTasks(controller.cron, …))` and threads `env` + `ctx` into the task context |
| `referencias/nitro/src/presets/cloudflare/utils.ts` (lines 293-308) | nitro adapter | 16 (slice) | Build-time emission — writes `wrangler.json` with `triggers.crons: [...]` deduped against any user-provided crons |
| `referencias/nitro/docs/1.docs/50.tasks.md` | nitro docs | 282 | Full user-facing surface — file-based task scan from `tasks/`, config-based registration, `scheduledTasks: { 'cron': ['task1', 'task2'] }`, `/_nitro/tasks` dev endpoint for listing/firing, single-running-instance concurrency rule |
| `referencias/rails/guides/source/active_job_basics.md` (lines 455-479) | rails | 25 (slice) | Solid Queue `config/recurring.yml` — YAML config with `class` / `args` / `schedule` per task, schedule parsed by **Fugit** (accepts both natural-language like `every day at 9am` and cron expressions) |

### Discarded files

| Path | Why discarded |
|---|---|
| `referencias/rails/activejob/**` (broader job framework) | Cron is a thin layer on top of jobs; the recurring.yml format is the only TheoKit-relevant surface; queue internals are scoped to R0.5.5 not R0.5.4 |
| `referencias/nitro/src/runtime/task.ts` (1-line barrel) | Pure re-export |
| `referencias/nitro/docs/2.deploy/20.providers/vercel.md` + `cloudflare.md` | Restate `tasks.md`; no new info |
| `referencias/nitro/test/fixture/server/tasks/*` | Test fixtures, no algorithmic content |
| `referencias/nitro/src/presets/cloudflare/runtime/cloudflare-pages.ts` | Pages variant — identical scheduled handler |
| Hono codebase | `grep` confirmed zero matches for `scheduled|ScheduledEvent|cron` in the Hono source tree — Hono has no cron primitive of its own; users wire Cloudflare's `scheduled` export directly. **This is a finding, not a gap**: Hono's stance is "use the platform native handler." TheoKit's stance must be the opposite — wrap the platform |

## 3. Prior art deep dive

### 3.1 Nitro — `defineTask` + `scheduledTasks`

Nitro is the closest prior art to what TheoKit ships in 0.5.0. The model is a clean three-layer separation:

**Layer 1 — Definition** (`src/runtime/internal/task.ts:7-14`):
```ts
export function defineTask<RT = unknown>(def: Task<RT>): Task<RT> {
  if (typeof def.run !== "function") {
    def.run = () => { throw new TypeError("Task must implement a `run` method!"); };
  }
  return def;
}
```
`defineTask` is an identity function that ensures `run` exists. Zero ceremony. The handler signature is `(event: TaskEvent) => { result?: RT } | Promise<{ result?: RT }>` where `TaskEvent = { name, payload, context }`. The handler can return a `result`; it may also call `context.waitUntil(promise)` to extend the host process's lifetime in serverless environments (`tasks.md:131-146`).

**Layer 2 — Discovery** (`tasks.md:27-46`): file-based scan of `tasks/*.ts` with `:`-joined nested names (`tasks/db/migrate.ts` → name `db:migrate`). Programmatic registration via `nitro.config.ts` `tasks: { 'db:migrate': { handler: './path' } }` is also supported.

**Layer 3 — Schedule binding** (`tasks.md:104-115`):
```ts
scheduledTasks: {
  '* * * * *': ['cms:update'],       // array form
  '0 * * * *': 'db:cleanup'          // shorthand string form
}
```
The cron string maps to one or more task names. Multiple tasks under one schedule run **in parallel** (`tasks.md:117`).

**Layer 4 — Dispatch** (`task.ts:53-94`): two runners. `startScheduleRunner` uses `croner` (the engine, ~3 KB dependency) for in-process dev / Node / Bun / Deno servers. `runCronTasks(cron, ctx)` is the adapter-fired path — Vercel and Cloudflare call this from their platform-native scheduled hooks instead of running `croner` in-process.

**Concurrency rule** (`tasks.md:277-280`): one running instance per task name. Parallel calls dedupe by keeping the first promise in a `__runningTasks__` map (`task.ts:16, 22-25`). When two crons fire `db:migrate` at the same time, both callers get the same return value from the single execution.

**Adapter emission at build time** — Vercel (`presets/vercel/utils.ts:315-326`):
```ts
const cronEntries = Object.keys(nitro.options.scheduledTasks).map((schedule) => ({
  path: cronPath,           // default '/_vercel/cron'
  schedule,
}));
config.crons = [...cronEntries, ...(config.crons || [])];
```
Cloudflare (`presets/cloudflare/utils.ts:293-308`): dedup-merge into `wrangler.triggers.crons`.

**Vercel runtime auth** (`presets/vercel/runtime/cron-handler.ts:6-16`):
```ts
const cronSecret = process.env.CRON_SECRET;
if (cronSecret) {
  const authHeader = event.req.headers.get("authorization") || "";
  const expected = `Bearer ${cronSecret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HTTPError("Unauthorized", { status: 401 });
  }
}
```
This is the canonical `CRON_SECRET` pattern — Vercel injects an `Authorization: Bearer <secret>` header to every cron POST/GET when the project sets the env var. `timingSafeEqual` is mandatory: without it the comparison leaks information via timing.

**Cloudflare runtime path** (`presets/cloudflare/runtime/_module-handler.ts:41-63`):
```ts
scheduled(controller, env, context) {
  (globalThis as any).__env__ = env;
  context.waitUntil(
    nitroHooks.callHook("cloudflare:scheduled", { controller, env, context })
      || Promise.resolve()
  );
  if (import.meta._tasks) {
    context.waitUntil(
      runCronTasks(controller.cron, {
        context: { cloudflare: { env, context } },
        payload: {},
      })
    );
  }
}
```
Key detail: `controller.cron` is the **schedule string itself** (the one declared in `wrangler.toml`), which Nitro uses as the dispatch key into its `scheduledTasks` map. This is why the schedule string must be byte-identical between manifest and adapter config — see EC-8.

**Verdict for TheoKit:** Nitro's architecture is the right shape (definition / discovery / schedule-binding / dispatch separated, manifest emitted at build, adapter translates). TheoKit borrows the shape but flattens it — instead of "tasks" + "scheduledTasks", TheoKit's `defineCron(name, { schedule, handler })` collapses task + schedule into a single primitive. Reason: agent apps don't need the "fire this task on demand from a route" use case Nitro's `runTask` exposes (R0.5.5 `defineJob` covers that). Combining keeps the surface small.

### 3.2 Hono / Cloudflare Workers — `scheduled` handler

Hono itself ships **no cron primitive**. `grep -rln scheduled referencias/hono` returns nothing. The path Hono users take is to add `scheduled` to the same `ExportedHandler` they export `fetch` from, and call any Hono-internal logic from there:

```ts
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.text('hi'));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runMyCronWork(event.cron, env));
  },
};
```

`ScheduledEvent` properties (Cloudflare runtime, MDN-style):
- `event.cron` — the schedule string from `wrangler.toml` that triggered the invocation
- `event.scheduledTime` — Unix epoch ms of when the trigger fired
- `event.type === 'scheduled'`

`ctx.waitUntil(promise)` extends the worker's lifetime until the promise settles. Without it, the worker may return before background async work completes.

`wrangler.toml` config:
```toml
[triggers]
crons = [ "*/3 * * * *", "0 15 1 * *", "59 23 LW * *" ]
```
Five-field format only (CF docs: *"Cron Triggers execute on UTC time. Cloudflare supports cron expressions with five fields, along with most Quartz scheduler-like cron syntax extensions"* — note `LW` "last weekday" Quartz extension in the example).

**Local testing:** `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"` triggers the scheduled handler with a synthetic cron string against `wrangler dev`.

**Verdict for TheoKit:** the Cloudflare ScheduledEvent shape (cron string, scheduledTime) is what `CronContext` mirrors. The Hono pattern of "user wires platform-native handler" is exactly the friction TheoKit absorbs.

### 3.3 Rails — Solid Queue recurring (Rails 8 default)

Solid Queue is the queue/scheduler default in Rails 8 (`active_job_basics.md:152, 456-479`). Recurring tasks are declared in `config/recurring.yml`:

```yaml
production:
  a_periodic_job:
    class: MyJob
    args: [42, { status: "custom_status" }]
    schedule: every second
  a_cleanup_task:
    command: "DeletedStuff.clear_all"
    schedule: every day at 9am
```

Each task names either a `class` (an ActiveJob class) or a `command` (a Ruby expression). The `schedule` field is parsed by **Fugit** (https://github.com/floraison/fugit), a library that accepts:
- Natural-language strings (`every day at 9am`, `every Monday at 9 PM`, `every 5 minutes`)
- Standard cron strings (`30 9 * * *`)
- ISO 8601 durations

`args` may be a single value, an array, or include a kwargs hash as the last element.

**Verdict for TheoKit:** Rails proves natural-language scheduling is shippable (Fugit-style), but it doubles the parser surface area and creates a translation layer to the underlying platform crons (Vercel/CF cannot accept "every Monday at 9 PM" — they need `0 21 * * 1`). For v1, TheoKit rejects natural-language input (see ADR-0004) and emits a documentation pointer to `crontab.guru`. Re-evaluate post-0.6.0 if user demand surfaces. Open question #1 captures this.

### 3.4 Vercel Cron Jobs (platform layer)

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/morning-summary", "schedule": "0 9 * * *" }
  ]
}
```

**Trigger mechanism:** Vercel issues an HTTP **GET** to the declared path against the production deployment URL. User-Agent is `vercel-cron/1.0`. Authentication is the `CRON_SECRET` env var pattern: if set, Vercel includes `Authorization: Bearer <CRON_SECRET>` on every cron request; the handler MUST verify it (constant-time compare) and 401 otherwise.

**Cron expression rules** (vercel.com/docs/cron-jobs):
- Five fields: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6 Sun-Sat).
- Alternative tokens are **NOT** supported: no `MON`, `SUN`, `JAN`, `DEC`, no `@daily` / `@hourly`.
- Cannot configure both day-of-month and day-of-week simultaneously — one must be `*`.
- Timezone is always UTC.

**Plan limits** (vercel.com/docs/cron-jobs/usage-and-pricing):
- Hobby: 2 cron jobs total, minimum 24h frequency.
- Pro: 40 cron jobs total, minimum 1m frequency.
- Enterprise: 100 cron jobs total, minimum 1m frequency.

**Timeout:** Inherits the function's execution timeout (10s on Hobby default, up to 60s on Pro, up to 900s for serverless on Pro/Enterprise with `maxDuration` config).

**Verdict for TheoKit:** Vercel is the most opinionated and the most constrained adapter. Every cron declared via `defineCron` MUST translate cleanly to Vercel's 5-field UTC-only rules or the adapter MUST fail the build with a clear error (EC-6). The `CRON_SECRET` pattern becomes TheoKit's default secret name (env-variables-engineer applies — see open questions).

### 3.5 Cloudflare Cron Triggers (platform layer)

`wrangler.toml`:
```toml
[triggers]
crons = [ "*/3 * * * *", "0 15 1 * *", "59 23 LW * *" ]
```

**Trigger mechanism:** the Worker's `scheduled(controller, env, ctx)` export is invoked by the platform. No HTTP roundtrip, no `CRON_SECRET` (the invocation is internal to Cloudflare's runtime).

**Cron expression rules:**
- Five fields only.
- Quartz-scheduler extensions supported (`L` last, `W` weekday, `LW` last weekday).
- UTC only.

**Local testing:**
```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```
The `+` is URL-encoded space; the cron string must match a declared trigger.

**Timeout:** Standard Worker CPU time limits apply (~30s wall-clock on bundled plans, up to ~5 min on paid Workers with longer-running configurations).

**Verdict for TheoKit:** Cloudflare's `scheduled` export is the cleanest delivery. TheoKit's CF adapter ships a single generated `scheduled` function that dispatches on `controller.cron` to the matching `defineCron` handler — exactly Nitro's `runCronTasks(controller.cron, ...)` pattern.

### 3.6 `Deno.cron` (platform-native primitive)

```ts
Deno.cron("morning-summary", "0 9 * * *", async () => {
  await sendDigest();
});

// With backoff
Deno.cron(
  "flaky-poll",
  "*/5 * * * *",
  { backoffSchedule: [1000, 5000, 10000] },
  async () => { await pollUpstream(); }
);
```

**Restrictions** (docs.deno.com/deploy/kv/manual/cron):
- Must be declared at **top level of a module**. Nested or conditional `Deno.cron` calls are ignored or error.
- UTC only.
- Five-field cron string (no shorthand documented).
- Overlap protection: *"Deno will skip the next scheduled invocation in order to avoid overlapping executions."*
- Automatic retry on failure with optional `backoffSchedule` (array of ms).
- Per-deployment cron count limits are not publicly documented.

**Verdict for TheoKit:** `Deno.cron` is a primitive, not a config. The TheoKit Deno adapter generates a `crons.ts` module that imports each user's cron file and emits one `Deno.cron(name, schedule, handler)` call per. The top-level-only constraint means the generated file is mechanically simple. Overlap protection is **built into Deno** — TheoKit's `concurrency: 'forbid'` option on other adapters mirrors this default.

### 3.7 AWS EventBridge Scheduler (platform layer)

AWS supports two distinct expression types:
- `rate(value unit)` — `rate(5 minutes)`, `rate(2 hours)`, `rate(1 days)`.
- `cron(minutes hours day-of-month month day-of-week year)` — **6-field with year**, supports `JAN-DEC` and `SUN-SAT` aliases, `L` / `W` / `#` Quartz extensions, and `?` for "any" in day-of-month/day-of-week (one must be `?` if the other is set).

**Timezone:** EventBridge supports IANA timezone strings via `--schedule-expression-timezone "America/New_York"`. DST adjustments are automatic (spring-forward skip, fall-back single-fire).

**Frequency:** 60-second precision (a `cron(0 1 * * ? *)` schedule fires somewhere between `1:00:00` and `1:00:59`).

**Verdict for TheoKit:** AWS is the outlier — 6 fields, named months/days, timezone parameter. TheoKit's neutral 5-field UTC dialect doesn't map losslessly to AWS's 6-field. The AWS adapter (if shipped) translates a 5-field `m h dom M dow` → 6-field `m h dom M dow *` (year wildcard) and emits the `cron()` wrapper. Day-of-month vs day-of-week mutual exclusion (Vercel rule) also applies on AWS via the `?` wildcard. This adapter is **not** in the v1 R0.5.4 commitment — Vercel + CF + Deno + Node dev are.

### 3.8 Hermes Agent — natural-language cron

Hermes Agent (`hermes-agent.org`) advertises *"Built-in cron scheduler with delivery to any platform. Set up daily reports, nightly backups, weekly audits, and morning briefings — all running unattended."* The public site does **not** document whether the input is natural-language or cron-syntax, and provides no API examples. This is a marker that natural-language scheduling is a real product wedge in agent space — but Hermes hides the mechanism. For TheoKit's v1, the natural-language pathway stays out of scope (per ADR-0004 and §3.3 Rails verdict). Open question #1 tracks this.

## 4. Convergent patterns (≥5)

Patterns that hold across every framework and platform inventoried, ranked by load-bearing impact on the TheoKit design:

1. **5-field cron string is the lingua franca.** Vercel, Cloudflare, Nitro's neutral surface, Deno.cron, and most Node libraries all default to `minute hour day-of-month month day-of-week`. AWS adds year (6 fields) but accepts implicit-wildcard translation. node-cron extends to 6 fields with seconds (rare). **TheoKit choice:** 5 fields, validated at build time, UTC implicit — see Divergent §5.1.

2. **Build-time manifest emission + runtime fire are separate concerns.** Nitro builds `vercel.json crons` and `wrangler.toml triggers.crons` at preset-build time; the runtime is just a dispatcher keyed off the schedule string the platform passes back. Rails recurring.yml is a build-equivalent declaration. Deno is the exception — declaration and runtime are co-located via top-level `Deno.cron` calls, but the TheoKit Deno adapter still emits a generated module, preserving the separation. **TheoKit choice:** `.theo/crons.json` manifest as the build artifact, adapters consume it, no shared in-process scheduler in prod.

3. **HTTP-callable handler shape is the lowest common denominator.** Vercel hits an HTTP route. Nitro's Vercel runtime, Rails's recurring.yml + ActiveJob, and TheoKit's dev server all route the cron through an HTTP-style handler (even when the actual delivery is in-process). Cloudflare and Deno are exceptions but accept the same handler **shape** — `({ scheduledAt, traceId }) => Promise<void>`. **TheoKit choice:** the user writes one handler, the adapter wires it to either an HTTP route (Vercel) or a native primitive (CF/Deno) at build time.

4. **Auth via shared secret (`CRON_SECRET` pattern).** Vercel ships this as a first-class env var. Nitro's Vercel adapter implements it with `timingSafeEqual`. Cloudflare doesn't need it (native dispatch). The pattern is convergent across every framework that uses HTTP-callable crons. **TheoKit choice:** `process.env.CRON_SECRET` is the default secret name; the cron route handler verifies it with constant-time compare; Cloudflare/Deno adapters skip the check (no public endpoint exposed).

5. **Idempotency is the user's responsibility but the framework documents it loudly.** Every prior art (Nitro, Vercel docs, Cloudflare docs, AWS docs) explicitly states that scheduled invocations are at-most-once-after-retry — duplicate fires are possible (cold start, retry storms, manual triggers, time-zone edge cases). Handlers MUST be idempotent. **TheoKit choice:** documented in `docs/concepts/crons.md`, called out in `defineCron` JSDoc, and the `CronContext` includes `scheduledAt: Date` so handlers can dedupe on the scheduled-time key (e.g., "did I already process the 2026-05-24T09:00Z slot?").

6. **Overlap protection has three regimes** (Deno auto-skip, Vercel allow-overlap, Cloudflare deprioritize-overlap) — and the user needs to opt into the strictest. **TheoKit choice:** `concurrency: 'forbid' | 'allow'` option on `defineCron`. Default `'allow'` matches Vercel's behavior (least surprise on the largest deploy target); `'forbid'` is implemented by a per-name lock the framework holds (in-memory for Node, KV-backed lock for CF — future R0.6.x).

7. **Schedule string is the dispatch key, not a numeric id.** Both Nitro's Cloudflare runtime and Nitro's Vercel runtime use `event.cron` / `x-vercel-cron-schedule` as the map key into the user's tasks. This means **the schedule string emitted in the manifest must be byte-identical to the schedule string the platform sends back** — whitespace, case, every character. Drift here = silent miss. **TheoKit choice:** the build emits the exact 5-field string the user wrote (after validation), no normalization. The manifest stores it verbatim. The dev runtime uses the same string. EC-8 pins this.

## 5. Divergent patterns + TheoKit choice

### 5.1 Cron expression dialect

| Platform | Fields | Aliases | Quartz extensions | Timezone | Shorthand (@daily) |
|---|---|---|---|---|---|
| Vercel | 5 | No | No | UTC | No |
| Cloudflare | 5 | No | Yes (`L`, `W`, `#`) | UTC | No |
| Deno.cron | 5 | No | No | UTC | No (undocumented) |
| AWS EventBridge | 6 + year | `JAN-DEC`, `SUN-SAT` | Yes | IANA tz parameter | `rate(...)` |
| node-cron | 5 or 6 (seconds) | No | No | Optional (host TZ) | No |
| Nitro | 5 (UTC) | Delegates to `croner` | `croner` supports `L` | UTC | No |
| Rails Fugit | Natural language + cron | All | All | Local TZ | Yes |

**TheoKit choice (ADR-0004 as proposed):** 5-field UTC strict. Rejects 6-field, rejects aliases, rejects `@daily`/`@hourly` shorthand, rejects IANA timezone parameter. The lowest common denominator across Vercel + Cloudflare + Deno is the only safe portable surface. Quartz `L`/`W`/`#` are also rejected in v1 (Vercel doesn't support them). This is the strictest possible policy; weakening it later is non-breaking, tightening it later is breaking.

### 5.2 Delivery mechanism per adapter

| Adapter | Trigger mechanism | Schedule string source |
|---|---|---|
| Vercel | HTTP GET to `/api/_cron/[name]` (TheoKit's generated route) | `x-vercel-cron-schedule` header |
| Cloudflare | `scheduled(controller, env, ctx)` export | `controller.cron` |
| Deno Deploy | Top-level `Deno.cron(name, schedule, handler)` in generated module | Bound at registration |
| Node (dev + node-server preset) | In-process scheduler over `node-cron` or `croner` | Bound at registration |
| AWS Lambda (post-v1) | EventBridge → Lambda → HTTP-compat handler | Custom header (TBD by AWS adapter) |

**TheoKit choice:** the user declares once via `defineCron`. The four supported adapters each translate at build time. The user never sees the platform-specific surface. The build fails loudly if the user targets a platform the framework cannot translate to (e.g., a `defineCron` exists but the adapter is `static-site` — build error: "Cron triggers are not supported on the `static-site` adapter").

### 5.3 Schedule expression syntax — natural language vs strict cron

Rails (Fugit), Hermes (probably), and friendly node libraries (e.g., `later.js`) accept natural language. Vercel / CF / Deno reject everything that isn't 5-field cron.

**TheoKit choice:** strict cron in v1. The doc page links to crontab.guru. Open question #1 captures the natural-language follow-up.

### 5.4 Concurrency / overlap semantics

| Platform | Default behavior on overlap |
|---|---|
| Vercel | Allows overlap; both invocations run |
| Cloudflare | Deprioritizes the new fire but does not guarantee skip |
| Deno.cron | Auto-skips the next fire if previous is running |
| Nitro `runTask` | Deduplicates by name — second caller gets first promise (`task.ts:23-25`) |
| node-cron | Allows overlap by default; `noOverlap` option available |

**TheoKit choice:** the `concurrency` option on `defineCron`:
- `'allow'` (default, matches Vercel) — both fires run.
- `'forbid'` — second fire is skipped; on Node the framework holds an in-memory lock per name; on Cloudflare/Deno the platform's behavior is used (Deno auto-skip is exactly `'forbid'`; CF gets a `KV`-backed lock in R0.6.x or a documented limitation in v1).

### 5.5 Per-name lookup key

Nitro uses the **schedule string** as the dispatch key (one schedule → array of task names). TheoKit uses the **cron name** as the dispatch key (one name → one schedule). Reason: agent apps want named crons (`morning-summary`, `nightly-cleanup`) for log readability, not schedules-as-keys.

This means TheoKit's Cloudflare adapter generates a `scheduled` export that maps `controller.cron` back to the cron name(s) via the manifest:

```ts
// generated
const dispatch: Record<string, string[]> = {
  '0 9 * * *': ['morning-summary'],
  '*/15 * * * *': ['poll-upstream'],
};
scheduled(controller, env, ctx) {
  const names = dispatch[controller.cron] ?? [];
  ctx.waitUntil(Promise.all(names.map((n) => runCron(n, ctx))));
}
```

Multiple crons sharing the same schedule string fan out — same as Nitro.

## 6. Dependency inventory

**Goal: zero new runtime deps.** Two paths considered:

| Path | Dep | Bundle cost | Trade-off |
|---|---|---|---|
| A | `cron-parser` | ~15 KB minified | Battle-tested validator + iterator; produces "next fire" timestamps; supports more dialects than TheoKit accepts |
| B | `croner` | ~8 KB minified (used by Nitro) | Validator + in-process scheduler in one; smaller; supports the Quartz `L` extension TheoKit rejects |
| C | Zero-dep 5-field validator + use `node-cron` only in dev | 0 KB prod (dev-dep), ~5 KB dev | Smallest prod footprint; we own the parser surface; loses "next fire" calculation |
| D | Zero-dep 5-field validator + zero-dep dev scheduler | 0 KB total | Full control; ~150 LOC scheduler + 50 LOC validator; we own everything |

**Decision:** **Path C** — zero-dep validator for build-time (the entire parser is ~50 LOC for the strict 5-field grammar), `node-cron` (~5 KB, MIT, 0 transitive deps) as a `devDependencies` entry for the in-process dev runtime. Prod adapters (Vercel/CF/Deno) don't need any cron parser at runtime — the platform fires the trigger, TheoKit just dispatches by name.

**Rationale:**
- 5-field strict grammar is trivially hand-rollable. Spec is ~40 lines of pseudocode (§7.1).
- Owning the validator means the error messages match the rest of TheoKit's dx-error-message-specialist taste.
- node-cron is dev-only — never reaches the user's prod bundle. If we ever need "next fire" calculation outside dev (e.g., for the devtools panel), we add `cron-parser` then.
- Avoiding `croner` despite Nitro's choice: croner supports more dialects than we accept, which makes it a foot-gun (users could write a `L`-clause that parses locally and fails at deploy).

## 7. Algorithms

### 7.1 5-field strict validator (pseudocode)

```
function validateCron(input: string): { ok: true } | { ok: false; error: string } {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return { ok: false, error: `Expected 5 space-separated fields, got ${parts.length}` };
  }
  const fields = [
    { name: 'minute',       parts[0], min: 0, max: 59 },
    { name: 'hour',         parts[1], min: 0, max: 23 },
    { name: 'day-of-month', parts[2], min: 1, max: 31 },
    { name: 'month',        parts[3], min: 1, max: 12 },
    { name: 'day-of-week',  parts[4], min: 0, max: 6  },
  ];
  for (const f of fields) {
    const r = validateField(f.value, f.min, f.max, f.name);
    if (!r.ok) return r;
  }
  // Vercel rule: cannot set both day-of-month and day-of-week
  if (parts[2] !== '*' && parts[4] !== '*') {
    return { ok: false, error: 'Cannot specify both day-of-month and day-of-week; one must be "*"' };
  }
  // Reject Quartz extensions and aliases
  if (/[A-Za-z]/.test(trimmed)) {
    return { ok: false, error: 'Aliases (MON, JAN, @daily, L, W, #) are not supported. Use numeric 5-field cron only.' };
  }
  return { ok: true };
}

function validateField(value: string, min: number, max: number, name: string): Result {
  // Accept: *  |  N  |  N-N  |  */N  |  N,N,N  |  combinations
  // Reject: anything with letters, anything outside [min, max]
  // Implementation: split on ',', for each segment apply the */N and N-N grammar.
}
```

Total: ~50 LOC TypeScript. Tested with a table of (input, expected) pairs covering valid + invalid in `tests/unit/cron-validate.test.ts`.

### 7.2 Manifest emission flow

```
1. Build step `cron-scan.ts` walks `server/crons/**/*.ts`
   - Each file MUST default-export a `CronDefinition` (the return of defineCron)
   - File path → cron name (e.g. server/crons/morning-summary.ts → 'morning-summary')
   - Nested: server/crons/billing/invoice-reminder.ts → 'billing:invoice-reminder'
2. For each definition:
   - Call validateCron(definition.schedule)
   - If invalid, fail the build with file path + error
   - If name collision across files, fail the build
3. Write .theo/crons.json:
   {
     "schemaVersion": 1,
     "crons": [
       { "name": "morning-summary", "schedule": "0 9 * * *", "concurrency": "allow", "source": "server/crons/morning-summary.ts" },
       ...
     ]
   }
4. Each adapter reads .theo/crons.json and emits its platform-specific artifact.
```

### 7.3 Per-adapter translation tables

**Vercel** — write `.vercel/output/config.json` (Build Output API v3):
```ts
const vercelConfig = {
  crons: manifest.crons.map((c) => ({
    path: `/api/_cron/${c.name}`,
    schedule: c.schedule,
  })),
  // ... other vercel config
};
```
Generate `/api/_cron/[name]` route that validates `CRON_SECRET` + dispatches to the cron's handler.

**Cloudflare** — write `wrangler.json`:
```ts
wranglerConfig.triggers = {
  crons: [...new Set(manifest.crons.map((c) => c.schedule))],
};
```
Generate `scheduled` export in the worker entry that dispatches `controller.cron` → name(s) → handler(s).

**Deno Deploy** — write `.theo/crons.gen.ts`:
```ts
import * as morningSummary from './server/crons/morning-summary';
Deno.cron('morning-summary', '0 9 * * *', () => runCron(morningSummary.default, ...));
```
Import this generated file from the deno entry.

**Node (dev + node-server)** — at server start, read `.theo/crons.json`, register each with `node-cron`:
```ts
for (const c of manifest.crons) {
  cron.schedule(c.schedule, () => runCron(c, ctx), { timezone: 'UTC' });
}
```

## 8. Edge cases

Each anchored to source or platform docs.

**EC-1 DST skip (spring-forward).** Schedule `0 2 * * *` in `America/New_York` skips on the day clocks jump from 1:59 to 3:00. AWS EventBridge explicitly documents this behavior (*"When time shifts forward in the Spring, if a cron expression falls on a non-existent date and time, your schedule invocation is skipped"*). **TheoKit:** UTC-only policy sidesteps the problem entirely (UTC has no DST). Documented in `docs/concepts/crons.md`.

**EC-2 DST double-fire (fall-back).** Schedule `0 1 * * *` in a TZ that observes DST fires twice on the fall-back day. AWS dedupes (*"runs the schedule only once"*); node-cron does not. **TheoKit:** UTC-only sidesteps; if a future version adds timezone support (open question #1), the doc page MUST call out this case.

**EC-3 Cold start missed fire.** A Cloudflare Worker that hasn't been invoked for 24 hours has no in-memory state. The scheduled trigger still fires (it's external to the Worker), but if the user assumed in-memory caches/connections were warm, they're not. **TheoKit:** `CronContext` provides no in-memory state across invocations by design; cron handlers must not depend on `globalThis` warmth.

**EC-4 Overlap of long-running cron.** Vercel allows overlap (a 90-second handler triggered every minute creates pile-up). Cloudflare deprioritizes. Deno auto-skips. **TheoKit:** `concurrency: 'forbid'` opt-in. On the Vercel adapter, `'forbid'` is implemented by writing a lock to a TheoKit-managed cache backend (R0.5.x cache primitive); without that, `'forbid'` on Vercel is documented as best-effort and falls back to `'allow'` with a build-time warning.

**EC-5 Plan limit overshoot.** A user on Vercel Hobby declares 5 crons — Vercel rejects deploy. **TheoKit:** the Vercel adapter does NOT preemptively check Hobby limits (it cannot know the user's plan at build time). The error surfaces from the Vercel deploy itself. Documented in `docs/deploy/vercel.md` with the plan-limit table.

**EC-6 Schedule expression that platform doesn't support.** A user writes `*/7 * * * *` ("every 7 min"). Vercel + CF + Deno all support this (slash increments are universal). **But:** a user who tries `@daily` shorthand is caught at validate time by the strict-numeric rule (§7.1). A user who tries `30 9 1 * MON` is caught by the no-aliases rule. **TheoKit:** all rejection happens at build time with clear file/line errors. Nothing platform-specific leaks to deploy-time.

**EC-7 CRON_SECRET leak (publicly callable endpoint without auth).** The Vercel adapter generates `/api/_cron/[name]`. If `CRON_SECRET` is unset, the route accepts any caller. This is a CRITICAL security finding pinned by the security-baseline-engineer. **TheoKit mitigation:** when `CRON_SECRET` is unset at build time AND `defineCron` calls exist, the build emits a WARNING (or in 0.3.0 strict mode, a build ERROR — see `enforcement-cutover.md`). The cron route always checks for the env var at runtime and 401s if expected but missing.

**EC-8 Manifest drift (declared cron not deployed).** A user adds a cron file but the adapter translator skipped it (e.g., the scan didn't pick up the file because of a glob mismatch). The cron is in `.theo/crons.json` but missing from `vercel.json crons`. **Symptom:** silent. **TheoKit mitigation:** the build asserts that the count and the schedule-string-set of `.theo/crons.json` matches what each adapter emitted. A snapshot test pins this — `tests/integration/cron-vercel-translate.test.ts` asserts byte-equality of the emitted `crons` array against the manifest.

**EC-9 Trace context propagation.** A cron fires at 9am. It creates a new request trace, not a continuation of any user-flow trace. **TheoKit:** the cron route handler issues a fresh `traceId` (W3C Trace Context standard, same as the existing `server/http/trace-context.ts` pattern from 0.2.0). The handler logs include `cron.name`, `cron.schedule`, `cron.scheduledAt` for correlation.

**EC-10 Cron handler timeout.** Vercel default is 10s on Hobby, 60s on Pro (300s with `maxDuration` config). Cloudflare ~30s wall-clock standard. The user writes a cron that does heavy LLM work — exceeds timeout, gets killed mid-flight. **TheoKit mitigation:** the cron documentation states "handlers MUST complete within the platform's request timeout. For long work, the cron should enqueue an async job (R0.5.5 `defineJob`) and return immediately." The `CronContext` exposes `ctx.signal: AbortSignal` so the handler can cooperatively cancel.

**EC-11 Time precision of "1 minute" crons.** AWS docs say *"60-second precision"* — `cron(0 1 * * ? *)` fires between `1:00:00` and `1:00:59`. Vercel and Cloudflare do not guarantee sub-minute precision either. **TheoKit:** documented — `*/1 * * * *` does NOT mean "exactly on the minute mark."

**EC-12 Cron name collision across nested directories.** `server/crons/billing/reminder.ts` and `server/crons/reminder.ts` both emit name `reminder` if the framework uses basename. **TheoKit choice:** use the Nitro-style `:`-separated nested name (`billing:reminder` vs `reminder`). The scan rejects any collision with a build-time error.

## 9. Implementation Guide

### 9.1 Architecture ASCII

```
server/crons/*.ts ── scan ──► .theo/crons.json
   (user files)               (neutral manifest)
                                       │
        ┌──────────────┬───────────────┼───────────────┬─────────────┐
        ▼              ▼               ▼               ▼             ▼
   vercel.json    wrangler.json   .theo/crons.gen.ts  node-cron   dev runtime
   (cron HTTP)    (scheduled())   (Deno.cron calls)   (in-proc)   (HMR-aware)
```

### 9.2 Files to create

Source:
- `packages/theo/src/server/cron/define-cron.ts` (NEW) — public API
- `packages/theo/src/server/cron/cron-types.ts` (NEW) — `CronOptions` / `CronContext` / `CronDefinition` / Zod schemas
- `packages/theo/src/server/cron/cron-validate.ts` (NEW) — 5-field strict validator
- `packages/theo/src/server/cron/cron-scan.ts` (NEW) — file-based discovery
- `packages/theo/src/server/cron/cron-manifest.ts` (NEW) — emit `.theo/crons.json`
- `packages/theo/src/server/cron/cron-runtime-node.ts` (NEW) — dev + node-server in-process scheduler (uses `node-cron`)
- `packages/theo/src/server/cron/cron-dispatch.ts` (NEW) — shared `runCron(name, ctx)` used by every adapter's generated entry
- `packages/theo/src/server/cron/cron-auth.ts` (NEW) — `CRON_SECRET` constant-time verify
- `packages/theo/src/adapters/vercel/cron-translate.ts` (NEW) — emit `crons[]` into Vercel build config + generate `/api/_cron/[name]` route
- `packages/theo/src/adapters/cloudflare/cron-translate.ts` (NEW) — emit `triggers.crons[]` into `wrangler.json` + generate `scheduled()` export
- `packages/theo/src/adapters/deno-deploy/cron-translate.ts` (NEW) — emit `.theo/crons.gen.ts` with `Deno.cron` calls
- `packages/theo/src/adapters/node-server/cron-translate.ts` (NEW) — wire `cron-runtime-node.ts` into the node-server entry

Tests:
- `tests/unit/cron-validate.test.ts` — 30+ table-driven cases (valid 5-field, invalid 6-field, aliases rejected, day-of-month vs day-of-week mutual exclusion, whitespace tolerance)
- `tests/unit/cron-scan.test.ts` — file walker, nested names, collision detection
- `tests/unit/cron-manifest.test.ts` — manifest snapshot test
- `tests/unit/cron-auth.test.ts` — constant-time compare correctness, 401 on bad header, no-secret-no-check pathway
- `tests/integration/cron-vercel-translate.test.ts` — fixture → manifest → vercel config byte-equality
- `tests/integration/cron-cf-translate.test.ts` — fixture → manifest → wrangler.json byte-equality
- `tests/integration/cron-dev-runtime.test.ts` — register cron with synthetic schedule (`* * * * *`), assert handler fires within ~70s real time or via injected fake timer

Fixtures + examples:
- `fixtures/cron-basic/server/crons/morning-summary.ts` (NEW)
- `fixtures/cron-basic/server/crons/billing/reminder.ts` (NEW) — nested name
- `fixtures/cron-basic/theo.config.ts` (NEW)
- `examples/full-stack-agent/server/crons/morning-summary.ts` (NEW) — real LLM-flavored cron sending a digest

Docs:
- `docs/concepts/crons.md` (NEW) — user-facing surface, EC-7 secret warning, EC-10 timeout guidance, link to crontab.guru
- `docs/concepts/jobs-manifest.md` (NEW per R0.5.7) — neutral schema spec for `.theo/crons.json` + `.theo/jobs.json` (shared)

### 9.3 Public API surface

```ts
// packages/theo/src/server/cron/define-cron.ts

import type { CronOptions, CronDefinition } from './cron-types';

export function defineCron(opts: CronOptions): CronDefinition;
```

```ts
// packages/theo/src/server/cron/cron-types.ts

export interface CronOptions {
  schedule: string;                                  // 5-field UTC cron
  handler: (ctx: CronContext) => unknown | Promise<unknown>;
  concurrency?: 'forbid' | 'allow';                  // default 'allow'
}

export interface CronContext {
  /** W3C Trace Context id for this invocation */
  traceId: string;
  /** UTC time the platform scheduled this fire */
  scheduledAt: Date;
  /** Cancel signal — fires when the platform indicates timeout is imminent */
  signal: AbortSignal;
  /** The cron's name as resolved from the file path */
  name: string;
}

export interface CronDefinition {
  __type: 'cron';
  schedule: string;
  concurrency: 'forbid' | 'allow';
  handler: (ctx: CronContext) => unknown | Promise<unknown>;
}
```

File convention: `server/crons/<name>.ts` default-exports the result of `defineCron({...})`. The cron name is derived from the file path (`server/crons/morning-summary.ts` → `morning-summary`; nested with `:` separator).

User example:
```ts
// server/crons/morning-summary.ts
import { defineCron } from 'theo/server/cron';
import { sendDigest } from '~/lib/digest';

export default defineCron({
  schedule: '0 9 * * *',     // 9am UTC daily
  concurrency: 'forbid',
  async handler(ctx) {
    ctx.signal.addEventListener('abort', () => console.warn('approaching timeout'));
    await sendDigest({ traceId: ctx.traceId });
  },
});
```

### 9.4 Deps

**Runtime production:** zero new deps. The 5-field validator is hand-rolled (§7.1). Adapters emit text into existing config files (`vercel.json`, `wrangler.json`).

**Dev / node-server:** `node-cron@^4` added to `dependencies` (NOT devDependencies — node-server users need it in prod). ~5 KB, MIT, zero transitive deps. dependency-hygiene-auditor approves: small, mature (~5M weekly downloads), single-maintainer-stable. The alternative `croner` ships more functionality than we need and supports dialects we explicitly reject. node-cron's 5-field-default mode aligns with TheoKit's policy.

### 9.5 Test strategy — BDD scenarios

**Validator unit tests:**
- GIVEN `"0 9 * * *"` WHEN validateCron THEN ok
- GIVEN `"0 9 * * * *"` (6 fields) WHEN validateCron THEN error "Expected 5 space-separated fields, got 6"
- GIVEN `"@daily"` WHEN validateCron THEN error "Aliases ... are not supported"
- GIVEN `"60 9 * * *"` (minute out of range) WHEN validateCron THEN error "minute: 60 outside [0, 59]"
- GIVEN `"0 9 15 * 1"` (both day-of-month and day-of-week set) WHEN validateCron THEN error "Cannot specify both day-of-month and day-of-week"
- GIVEN `"30 9 * * MON"` (alphabetic alias) WHEN validateCron THEN error

**Scan + manifest tests:**
- GIVEN fixture with `server/crons/a.ts` and `server/crons/b/c.ts` WHEN scan THEN manifest has 2 entries with names `a` and `b:c`
- GIVEN two files producing same name WHEN scan THEN build error
- GIVEN one file with invalid schedule WHEN scan THEN build error with file path

**Vercel translation roundtrip:**
- GIVEN manifest `[{ name: 'x', schedule: '0 9 * * *' }]` WHEN vercel-translate THEN generated vercel config has `crons: [{ path: '/api/_cron/x', schedule: '0 9 * * *' }]` byte-equal

**CF translation roundtrip:**
- GIVEN manifest `[{ name: 'x', schedule: '0 9 * * *' }, { name: 'y', schedule: '0 9 * * *' }]` WHEN cf-translate THEN wrangler has `triggers.crons: ['0 9 * * *']` (deduped) and `scheduled()` dispatches both names

**Auth tests:**
- GIVEN `CRON_SECRET=foo` and request without `Authorization` WHEN auth THEN 401
- GIVEN `CRON_SECRET=foo` and request with `Authorization: Bearer bar` WHEN auth THEN 401
- GIVEN `CRON_SECRET=foo` and request with `Authorization: Bearer foo` WHEN auth THEN ok
- GIVEN no `CRON_SECRET` env WHEN auth THEN ok (warn logged once at startup)
- Property test: timing variance between mismatch and match cases is below 1ms threshold (constant-time)

**Playwright (post-v1):** dev server fixture registers a cron with `* * * * *`, fake timers advance, handler fires.

### 9.6 Phases of rollout

**Phase 1 — Validator + types + manifest** (1.5 days):
- Ship `define-cron.ts`, `cron-types.ts`, `cron-validate.ts`, `cron-scan.ts`, `cron-manifest.ts`.
- All unit tests green. No adapter wiring yet — manifest is emitted but consumed by nobody.
- Build still succeeds for projects without crons (zero regression).

**Phase 2 — Node + Vercel adapters + auth** (1.5 days):
- Ship `cron-runtime-node.ts` (dev + node-server), `cron-auth.ts`, `adapters/vercel/cron-translate.ts`.
- Vercel cron route generator emits `/api/_cron/[name]` that calls `cron-dispatch.ts`.
- Integration test: fixture deploys to local Vercel dev runtime, fake fire via HTTP with `Bearer CRON_SECRET`, handler runs.
- `examples/full-stack-agent/server/crons/morning-summary.ts` ships as the canonical demo.

**Phase 3 — Cloudflare + Deno adapters** (1 day):
- Ship `adapters/cloudflare/cron-translate.ts` (generates `scheduled` export) and `adapters/deno-deploy/cron-translate.ts` (generates `Deno.cron` module).
- CF integration test uses `wrangler dev` + the `/cdn-cgi/handler/scheduled?cron=...` URL trick.
- Deno integration test uses a `deno run` smoke against the generated module.

**Phase 4 — Docs + R0.5.7 manifest spec freeze** (0.5 day):
- `docs/concepts/crons.md` with EC-1 / EC-7 / EC-10 callouts.
- `docs/concepts/jobs-manifest.md` documents the `.theo/crons.json` schema as a versioned external contract (R0.5.7 dependency).
- README entry under "What you get".

**Total: 4.5 days of focused work** — well within the R0.5.4 ~1 day estimate IF Phase 1 and 2 are scoped together (Phase 3 + 4 land in a follow-up minor if necessary).

### 9.7 Acceptance criteria

A working `0.5.0` ships iff:

- [ ] `defineCron` is exported from `theo/server/cron` and consumed by a fixture
- [ ] `tests/unit/cron-validate.test.ts` covers ≥30 cases (valid + invalid + edge) and is GREEN
- [ ] `tests/unit/cron-scan.test.ts` covers nested names, collision, missing default export
- [ ] `tests/integration/cron-vercel-translate.test.ts` asserts byte-equal output (EC-8 pin)
- [ ] `tests/integration/cron-cf-translate.test.ts` asserts byte-equal output (EC-8 pin)
- [ ] `tests/unit/cron-auth.test.ts` covers constant-time + missing-secret + bad-bearer
- [ ] `examples/full-stack-agent/server/crons/morning-summary.ts` exists and is exercised in the example's Playwright suite (fire via dev HTTP endpoint, assert behaviour)
- [ ] `docs/concepts/crons.md` written and links from README
- [ ] `docs/concepts/jobs-manifest.md` documents `.theo/crons.json` schemaVersion=1
- [ ] CHANGELOG `[Unreleased]` has `### Added — defineCron primitive (...)` entry
- [ ] dependency-hygiene-auditor signs off on `node-cron` addition
- [ ] security-baseline-engineer signs off on EC-7 build-time warn behavior
- [ ] No regression in existing 1974/1974 unit tests
- [ ] Bundle size delta < 8 KB gzipped for default template (no crons declared → tree-shake to zero)

### 9.8 Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Schedule string drift between manifest and adapter (EC-8) silent miss | Medium | High | Byte-equal snapshot test per adapter (acceptance criterion above) |
| `CRON_SECRET` unset in prod → publicly callable endpoint (EC-7) | High | Critical | Build-time WARN in 0.5.0; build ERROR in 0.6.0 (track with `enforcement-cutover.md` follow-up) |
| User declares cron, but adapter is `static-site` / `bun-server` (no support) | Medium | Medium | Build-time error: "The `<adapter>` adapter does not support cron triggers. Supported adapters: vercel, cloudflare, deno-deploy, node-server. See [docs link]." |
| Vercel Hobby plan limit (2 crons) exceeded | Low | Medium | Documented; cannot be checked at build (plan info not available). Vercel deploy itself returns the error. |
| node-cron in-process scheduler doesn't fire while dev server is restarting (HMR window) | Medium | Low | Documented as known dev-only behavior. Production paths (Vercel/CF/Deno) are unaffected since the platform fires externally. |
| User writes long-running handler that exceeds platform timeout (EC-10) | Medium | High | Doc page; `CronContext.signal` is documented as the cancellation hook |
| Cron name collision with route name (`server/crons/health.ts` + `server/routes/health.ts`) | Low | Low | Independent namespaces — cron files map to `/api/_cron/<name>`, routes to `/api/<path>`. No clash. |

## 10. Open questions

**OQ-1 — Natural-language scheduling.** Rails and Hermes prove there's demand for "every Monday at 9am" style input. TheoKit's v1 rejects this (ADR-0004). Do we add a `defineCron({ schedule: { humanize: 'every Monday at 9am' }})` opt-in in 0.6.0, or do we keep the strict-only policy permanently? **Trigger to re-evaluate:** ≥5 user requests in the GitHub discussions or a community PR proving the parser is cheap.

**OQ-2 — Does the cron handler share `ctx.queue.enqueue` (R0.5.5)?** A natural pattern is "morning summary cron → enqueue 1000 per-user digest jobs". Should `CronContext` expose the queue handle, or should the cron call into a shared `ctx`-builder helper? **Inclination:** expose `ctx.queue` directly on `CronContext`, matching what `defineRoute` handlers see — but this couples R0.5.4 to R0.5.5. Confirm the ordering during the R0.5.5 plan.

**OQ-3 — Timezone parameter as 0.6.0 follow-up?** UTC-only is the right v1 stance. But Rails / AWS users will ask. Do we add `defineCron({ schedule: '0 9 * * *', timezone: 'America/New_York' })` later? **Inclination:** yes in 0.6.0, opt-in, validate against IANA tz database; document the DST behavior precisely (EC-1 + EC-2). The Vercel adapter would still need to shim by computing the UTC offset at build time and emitting a UTC-equivalent schedule — which fails on schedules that cross DST boundaries. Honest answer: probably stays UTC-only forever.

**OQ-4 — Should `concurrency: 'forbid'` work on Vercel without a cache backend?** v1 says no (documented limitation). Is there a path via Vercel KV or a TheoKit-managed distributed lock? **Inclination:** defer to R0.5.x cache primitive; if cache lands first, `'forbid'` works everywhere by piggybacking.

**OQ-5 — Devtools panel surface.** Should the 0.4.0 devtools surface a "Crons" tab showing declared crons + next fire time + last fire result? **Inclination:** yes, post-v1. Requires "next fire" calculation, which needs `cron-parser`. Acceptable cost for a dev-only panel.

## 11. Referências citadas

| Claim | Source |
|---|---|
| Nitro `defineTask` API | `referencias/nitro/src/runtime/internal/task.ts:7-14` |
| Nitro single-running-instance concurrency | `referencias/nitro/src/runtime/internal/task.ts:16, 22-25`; `referencias/nitro/docs/1.docs/50.tasks.md:277-280` |
| Nitro `scheduledTasks` config format | `referencias/nitro/docs/1.docs/50.tasks.md:104-115` |
| Nitro uses `croner` for in-process schedule runner | `referencias/nitro/src/runtime/internal/task.ts:1, 67-79`; `tasks.md:126` |
| Nitro Vercel cron handler with `timingSafeEqual` | `referencias/nitro/src/presets/vercel/runtime/cron-handler.ts:1-31` |
| Nitro Vercel build emits `config.crons` | `referencias/nitro/src/presets/vercel/utils.ts:315-326` |
| Nitro Cloudflare `scheduled` handler with `runCronTasks(controller.cron, ...)` | `referencias/nitro/src/presets/cloudflare/runtime/_module-handler.ts:41-63` |
| Nitro Cloudflare build emits `wrangler.triggers.crons` | `referencias/nitro/src/presets/cloudflare/utils.ts:293-308` |
| Rails Solid Queue recurring.yml format | `referencias/rails/guides/source/active_job_basics.md:455-479` |
| Rails Fugit parser accepts natural language and cron | same file, line 471-472 |
| Vercel cron expression rules (5 fields, no aliases, day-of-month vs day-of-week mutual exclusion, UTC only) | `https://vercel.com/docs/cron-jobs` |
| Vercel triggers via HTTP GET, User-Agent `vercel-cron/1.0` | `https://vercel.com/docs/cron-jobs` |
| Cloudflare wrangler `[triggers] crons` format | `https://developers.cloudflare.com/workers/configuration/cron-triggers/` |
| Cloudflare `scheduled(controller, env, ctx)` signature | same |
| Cloudflare 5-field, UTC, Quartz extensions | same |
| Cloudflare local test via `/cdn-cgi/handler/scheduled?cron=*+*+*+*+*` | same |
| Deno.cron API + top-level-only constraint | `https://docs.deno.com/deploy/kv/manual/cron/` |
| Deno.cron auto-skip on overlap | same |
| Deno.cron `backoffSchedule` array | same |
| AWS EventBridge 6-field cron with year + aliases + `?` mutual exclusion | `https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html` |
| AWS EventBridge IANA timezone support | same |
| AWS EventBridge DST behavior (skip on spring-forward, single-fire on fall-back) | same |
| AWS EventBridge 60-second precision | same |
| node-cron 5- or 6-field optional seconds | `https://github.com/node-cron/node-cron` README |
| Hermes Agent advertised cron scheduler (no docs on natural-language) | `https://hermes-agent.org/` |
| CLAUDE.md R0.5.4 roadmap commitment | `/home/paulo/Projetos/usetheo/theokit/CLAUDE.md` (roadmap section) |
| ADR-0004 5-field UTC strict (proposed) | `/home/paulo/Projetos/usetheo/theokit/CLAUDE.md` (architectural decisions to land in 0.5.0 table) |

---

**End of reference.** Anyone re-opening the design decisions above reads this document first. Updates land via PR with a one-line rationale.
