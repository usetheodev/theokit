# Crons

Time-triggered handlers for TheoKit agent apps. One file per cron in `server/crons/`.

## API surface

```ts
// server/crons/morning-summary.ts
import { defineCron } from 'theokit/server'

export default defineCron('morning-summary', {
  schedule: '0 9 * * *', // 09:00 UTC daily
  async handler({ traceId, scheduledAt, signal }) {
    // ... work
  },
})
```

`defineCron` is a pure identity helper. The build-time scanner walks `server/crons/`, validates each definition, and emits `.theo/crons.json` — a neutral manifest your deploy adapter translates to platform-native triggers (Vercel cron, CF Workers `[triggers]`, AWS EventBridge schedule, Deno.cron).

## Schedule format (ADR-0004)

**5-field UTC strict.** Always. No timezone. No shorthand. No second precision.

```
minute  hour  day-of-month  month  day-of-week
  *      *         *          *         *
```

Examples:

| Schedule | Meaning |
|---|---|
| `0 9 * * *` | 09:00 UTC every day |
| `*/15 * * * *` | every 15 minutes |
| `0 0 * * MON` | midnight UTC every Monday |
| `0 0 1 * *` | midnight UTC on the 1st of every month |

### What's rejected

- 6-field with seconds (`* * * * * *`) → use a worker, not cron
- Shorthand (`@daily`, `@hourly`) → use 5-field equivalents
- Timezone suffix (`0 9 * * * America/Sao_Paulo`) → compute the UTC equivalent at definition time

### Why no timezone

DST semantics for cron are user-hostile. The right answer is: store schedules in UTC; compute per-user time inside the handler if you need user-local time. See ADR-0004 for the full rationale.

## Concurrency policy

```ts
defineCron('slow-job', {
  schedule: '*/5 * * * *',
  concurrency: 'forbid', // default — skip next tick if previous still running
  // OR
  concurrency: 'allow',  // run concurrently
})
```

Default `'forbid'` prevents a slow handler from piling up. The scheduler logs a warning when it skips a tick.

## Local development limitations

> **EC-111**: Vite HMR and dynamic import caching mean that **editing a cron handler during `theokit dev` may not pick up the new code immediately**. The cron-scan loads each module once at startup. To test handler changes, restart `theokit dev`.
>
> Production deploys are unaffected — the adapter translates the manifest at build time.

## Adapter translation

The build emits `.theo/crons.json`. Adapter translators read this manifest and generate platform configs:

| Adapter | Emits |
|---|---|
| Vercel | `vercel.json crons[]` array + `/api/__crons/<name>` route stubs |
| Cloudflare Workers | `wrangler.toml [triggers] crons = [...]` + `scheduled()` Worker handler |
| AWS Lambda | `serverless.yml functions.<fn>.events: - schedule: cron(...)` (with the `?` quirk for DOM/DOW exclusivity) |
| Deno Deploy | Generated entry file with `Deno.cron(...)` registrations |
| Bun / Netlify / static | Not supported — documented N/A; cron skipped at build |

**EC-105 (config preservation):** translators NEVER overwrite your `vercel.json` / `wrangler.toml` / `serverless.yml`. They read existing config, merge only the cron-managed slice, write back. Unparseable existing config throws `ExistingConfigUnparseableError` — fix the file before re-running build.

## When this fails

| Symptom | Cause | Fix |
|---|---|---|
| Cron declared but never fires in prod | Adapter doesn't support cron (Bun, Netlify, static) | Use a supported adapter |
| `ExistingConfigUnparseableError` at build | Your `vercel.json` is invalid JSON | Fix the JSON before re-build |
| Handler runs but immediately times out | Vercel/CF have per-fire timeouts (10s/30s) | Enqueue a job from the cron handler; let the job do the long work |
| Cron fires multiple times for the same minute | Multiple adapter targets active | Use only one deploy target per environment |

## Production handler patterns

```ts
// Cron handler that enqueues a job — keeps cron itself fast
export default defineCron('hourly-cleanup', {
  schedule: '0 * * * *',
  async handler({ traceId }) {
    // Don't do the heavy work HERE — enqueue it.
    // ctx.queue is NOT available in cron context yet (R0.5.x);
    // for now use a backend directly:
    const { backend } = await import('../lib/jobs.js')
    await backend.enqueue({
      name: 'cleanup-stale-rows',
      input: { initiatedBy: 'cron', traceparent: traceId },
    })
  },
})
```

## See also

- [ADR-0004](../adr/0004-cron-schedule-5-field-utc-strict.md) — 5-field UTC strict
- [`.claude/knowledge-base/reference/cron-primitives.md`](../../.claude/knowledge-base/reference/cron-primitives.md) — full deep-dive (7600 words)
- [Jobs](./jobs.md) — the right tool for long-running work
