# 0004. Cron schedule — 5-field UTC strict, no timezone field

* Status: accepted
* Date: 2026-05-24
* Accepted: 2026-05-24 (pre-condition for R0.5.4)
* Deciders: [TheoKit team]
* Tags: [cron, schedule-format, cross-platform, lowest-common-denominator]

## Context and Problem Statement

`defineCron(name, { schedule, handler })` (R0.5.4) accepts a cron
expression. Cron expressions vary across implementations:

| Variant | Format | Supports | Used by |
|---|---|---|---|
| **5-field standard** | `m h dom mon dow` | Minute precision, UTC | Vercel Cron, CF Workers, AWS EventBridge, node-cron, Solid Queue |
| **6-field with seconds** | `s m h dom mon dow` | Second precision | Quartz, NestJS schedule, node-cron (opt-in), Bun cron |
| **7-field with year** | `s m h dom mon dow y` | Year-specific | AWS Lambda legacy, Quartz |
| **5-field + timezone** | `m h dom mon dow` + `tz: 'America/Sao_Paulo'` | TZ-aware | AWS EventBridge Schedule (optional), node-cron (opt-in) |
| **Natural language** | `"every morning at 9am"` | Conversational | Hermes Agent, some Inngest helpers |
| **Shorthand** | `@daily`, `@hourly`, `@yearly` | Common cases | node-cron, BSD cron |
| **Step / range / list** | `*/7`, `1-5`, `1,3,5` | Sub-set selection | All standard cron variants |

The deep-dive reference (`.claude/knowledge-base/reference/cron-primitives.md`,
§5) catalogs platform-by-platform support. **5-field standard UTC** is
the only format ALL of Vercel + Cloudflare + AWS support without
caveats. Anything richer fails translation to ≥1 adapter.

This forces a choice: do we accept the richest format and reject at
build time per adapter, OR accept only the common denominator and let
users escalate via opt-out?

### Failure modes if we don't choose

1. User writes `*/30 * * * * *` (6-field, every 30 seconds). Local dev
   in Node + node-cron accepts it. Build for Vercel deploy emits a
   confusing error at deploy time, not at code time. Pit-of-failure.
2. User writes `0 9 * * * America/Sao_Paulo` (TZ-aware). Vercel rejects
   it but in a way that depends on the JSON schema validator order.
   CF rejects it with a different error. AWS accepts it with a
   different field. Three platforms = three errors.
3. User writes `@daily`. Vercel accepts; CF rejects (only accepts
   standard cron expressions per wrangler.toml schema). User picks
   adapter and discovers limitation at deploy time.

The framework can EITHER own the schedule format strictly OR own the
chaos of per-adapter translation errors. Owning the format is cheaper
to support and easier to test.

## Considered Options

* **Option 1 — Accept 5-field UTC strict only (recommended).** Validate
  at `defineCron(...)` parse time using `cron-parser` (or own
  minimalist parser). Reject everything else with actionable error
  ("TheoKit cron uses 5-field UTC strict. To run in São Paulo time,
  convert: `0 12 * * *` UTC = `0 9 * * *` America/Sao_Paulo").
* **Option 2 — Accept rich format, validate per-adapter at build.**
  Parser accepts 5/6/7-field + TZ + shorthand. Each adapter translator
  attempts conversion and fails with adapter-specific error if
  unsupported. Worst-of-both-worlds.
* **Option 3 — Accept natural language ("every morning at 9am").**
  Hermes-style. Requires NL parser dep + ambiguity (timezone? Asia/?).
  Out of scope for 0.5.0; deferred (see Re-evaluation).
* **Option 4 — Two formats: `schedule: string` (5-field) AND
  `schedule: { cron: string; tz: string }` opt-in object form.** TZ
  becomes adapter-decision: AWS uses native; Vercel + CF emit a
  precomputed "rotated" 5-field. Complexity vs payoff isn't clear yet.

## Decision Outcome

Chosen option: **Option 1 — 5-field UTC strict, validate at
`defineCron`.**

### Validation rules (final shape)

```typescript
// packages/theo/src/server/cron/cron-validate.ts
export function validateCronSchedule(schedule: string): void {
  const parts = schedule.trim().split(/\s+/)

  if (parts.length !== 5) {
    throw new Error(
      `TheoKit cron uses 5-field UTC strict format: "minute hour dayOfMonth month dayOfWeek". ` +
      `Got ${parts.length} fields: "${schedule}". ` +
      `For shorthand like "@daily", use the equivalent 5-field: "0 0 * * *". ` +
      `For timezone, convert at definition time — TheoKit treats all schedules as UTC.`
    )
  }

  // Parse each field strictly via cron-parser (validates step/range/list)
  try {
    parseExpression(schedule, { utc: true })
  } catch (err) {
    throw new Error(`Invalid cron expression "${schedule}": ${err.message}`)
  }
}
```

### What's explicitly REJECTED

| Input | Error |
|---|---|
| `* * * * * *` (6-field) | "got 6 fields, expected 5" |
| `@daily`, `@hourly` | "shorthand not supported; use '0 0 * * *' / '0 * * * *'" |
| `0 9 * * *` with `{ tz: 'America/Sao_Paulo' }` | TypeScript rejects `tz` field; runtime error if forced |
| `*/0.5 * * * *` (sub-minute) | cron-parser rejects |
| Malformed like `bad bad bad bad bad` | cron-parser rejects with column-level error |

### What's accepted

- All standard 5-field expressions with step (`*/15`), range (`1-5`),
  list (`MON,TUE,FRI`), and `*`
- Day-of-month and day-of-week using both numeric (`0-6`) and named
  (`MON`, `TUE`, `JAN`, `FEB`) forms — cron-parser handles both
- The full minute precision cron grammar from POSIX cron

### Why UTC strict (no timezone field)

The non-trivial reason: **timezone semantics for cron are user-hostile
even when supported.**

- DST skip days exist (3am on the day clocks spring forward — does
  the 3am cron fire? In which timezone?). AWS EventBridge has explicit
  rules for this; CF and Vercel don't.
- "Send the morning email at 9am for users in São Paulo" — when DST
  changes, do users in SP get the email an hour earlier or later?
  Neither answer is correct; the question is malformed.
- The right answer is: store the schedule in UTC, compute the target
  time per-user at fire time, NOT bake the timezone into the cron.

This decision pushes that complexity to USER CODE where it belongs (the
handler computes per-user time using the user's stored timezone). The
framework owns scheduling; the user owns time-of-day semantics.

Edge case: a single global cron meant to fire "at 9am Brazil time"
forever. The user writes `0 12 * * *` (12:00 UTC = 09:00 BRT). When
Brazil DST ends, they update to `0 13 * * *` (13:00 UTC = 09:00 BRT).
Annoying, but explicit. The alternative — TheoKit silently shifting
the fire time across DST — is worse.

### Why no `@daily` shorthand

It's a 1-character savings (`@daily` vs `0 0 * * *`). It introduces
ambiguity ("does `@daily` mean midnight UTC, midnight server-local,
or midnight user-time?") and the docs that explain it would be longer
than just having users write `0 0 * * *`. KISS wins.

If user complaints arrive (Open question Q1 in the reference doc), we
can add `@daily`/`@hourly` as a pure macro expansion at validate time —
no semantic change, no platform impact. That's an additive change, not
a re-evaluation of this ADR.

### Internal use of cron-parser (or zero-dep alternative)

The implementation may use the `cron-parser` npm package OR an own
minimal 5-field validator. The reference doc §6 catalogs both. The
choice does NOT affect this ADR — the contract is "5-field UTC strict
or error". Either dependency satisfies it.

## Consequences

* **Good:** Every adapter translator becomes trivial. The schedule
  string passes through verbatim to Vercel's `vercel.json crons[]`, to
  CF's `wrangler.toml [triggers] crons`, to AWS EventBridge's `cron(...)`
  expression. Zero per-adapter validation logic.
* **Good:** The dev-mode Node scheduler (`cron-runtime-node.ts`) uses
  the same parser as production validation. Dev and prod never diverge.
* **Good:** Errors are caught at `defineCron(...)` call site — TypeScript
  + parser validation — NOT at build time, NOT at deploy time, NOT in
  production at fire time.
* **Bad:** Users coming from Crontab.guru, NestJS, Quartz find the
  rejection of shorthand and second-precision surprising. Docs MUST
  state the rule prominently. Migration guide for users from
  `@nestjs/schedule` shows the conversion table.
* **Bad:** No native timezone support means morning-email-by-timezone
  pushes work into user code. Docs MUST show the recommended pattern
  ("don't bake timezone into cron; fan out per-user inside the handler").
* **Neutral:** Sub-minute precision (every 30s) is impossible. For
  use cases needing higher resolution, the answer is "use a long-lived
  worker, not cron" — which is the right answer regardless of platform.

## Re-evaluation triggers

Reopen this ADR if:

1. **Hermes-style natural-language cron** becomes a genuine product
   asset and ≥3 users request "I want to write English". At that point,
   ADD natural-language parsing as a STRICT layer ON TOP of 5-field UTC
   (i.e., parse English to 5-field UTC at definition time, store the
   canonical form). The validation layer doesn't change; the entry
   point gains a sibling.
2. **AWS EventBridge becomes a primary deploy target AND users
   demand native timezone support** strongly enough that the
   per-adapter-divergence cost is worth paying. Reopen with new option:
   "accept timezone as opt-in field, document that Vercel + CF translate
   by rotating the cron at build time".
3. **A future platform (e.g., Cloudflare Cron v2) supports
   sub-minute precision uniformly across 3+ platforms.** Add 6-field
   opt-in with the same lowest-common-denominator validation.

## Related artifacts

- Reference doc: `.claude/knowledge-base/reference/cron-primitives.md`
  (§5, §7.1, §8 EC-1/EC-2/EC-11)
- Roadmap items: R0.5.4 (`defineCron`)
- Sibling ADRs: ADR-0002, ADR-0003 (cron may enqueue jobs via the same
  outbox; the schedule format choice is independent of the job
  primitive)
- Prior art: Vercel Cron docs (5-field UTC strict), Cloudflare Workers
  Cron Triggers (5-field UTC strict via wrangler.toml), AWS EventBridge
  Schedule (5/6/7-field + TZ), node-cron README.
