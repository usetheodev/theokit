import { CronExpressionParser } from 'cron-parser'

import { generateNewTraceContext } from '../observability/trace-context-propagation.js'

import type { CronContext, CronDefinition } from './cron-types.js'

/**
 * In-memory cron scheduler for `theokit dev` (T1.4).
 *
 * Algorithm:
 *   - For each cron, compute `nextFireAt = cron-parser.next()`.
 *   - Schedule a `setTimeout(handler, nextFireAt - now)`.
 *   - After handler invocation (sync return or Promise scheduled), recompute
 *     next fire from CURRENT time (drift-free vs scheduled time).
 *
 * Per-cron isolation (EC-109):
 *   - Each cron's handler invocation is fire-and-forget (`void` scheduled).
 *     A hanging handler does NOT block the scheduler loop nor other crons.
 *   - `concurrency: 'forbid'` (default) tracks an in-flight flag per-cron;
 *     subsequent ticks skip + warn while the in-flight flag is set.
 *   - `concurrency: 'allow'` runs handlers concurrently — caller's responsibility.
 *
 * Production deploys use platform-native triggers (T1.5 adapter translators);
 * this scheduler exists only for local dev iteration.
 */

export interface CronScheduler {
  start(): void
  stop(): void
}

interface CronJobState {
  readonly def: CronDefinition
  inFlight: boolean
  timer: NodeJS.Timeout | null
  abortController: AbortController | null
}

export function createCronScheduler(definitions: readonly CronDefinition[]): CronScheduler {
  const states: CronJobState[] = definitions.map((def) => ({
    def,
    inFlight: false,
    timer: null,
    abortController: null,
  }))

  let started = false

  const fireAndReschedule = (state: CronJobState, scheduledAt: Date): void => {
    state.timer = null

    if (state.inFlight && state.def.concurrency === 'forbid') {
      console.warn(
        `[theokit:cron] "${state.def.name}" skipped tick at ${scheduledAt.toISOString()} ` +
          '— previous handler still running (concurrency: forbid).',
      )
      scheduleNext(state)
      return
    }

    state.inFlight = true
    state.abortController = new AbortController()
    const traceCtx = generateNewTraceContext()
    const ctx: CronContext = {
      traceId: traceCtx.trace_id,
      scheduledAt,
      signal: state.abortController.signal,
    }

    // Fire-and-forget: EC-109 — never await here so a hanging handler
    // can't block the scheduler loop or other crons.
    void Promise.resolve()
      .then(() => state.def.handler(ctx))
      .catch((err: unknown) => {
        console.error(
          `[theokit:cron] "${state.def.name}" handler error:`,
          err instanceof Error ? err.message : err,
        )
      })
      .finally(() => {
        state.inFlight = false
      })

    scheduleNext(state)
  }

  const scheduleNext = (state: CronJobState): void => {
    if (!started) return
    const interval = CronExpressionParser.parse(state.def.schedule, {
      tz: 'UTC',
      currentDate: new Date(),
    })
    const next = interval.next().toDate()
    const delayMs = Math.max(0, next.getTime() - Date.now())
    state.timer = setTimeout(() => {
      fireAndReschedule(state, next)
    }, delayMs)
    // setTimeout returns a Timeout object; in Node, .unref() is available but
    // we DO want this to keep the event loop alive in dev — explicit no-unref.
  }

  return {
    start(): void {
      if (started) return
      started = true
      for (const state of states) {
        scheduleNext(state)
      }
    },
    stop(): void {
      started = false
      for (const state of states) {
        if (state.timer) {
          clearTimeout(state.timer)
          state.timer = null
        }
        state.abortController?.abort()
        state.abortController = null
      }
    },
  }
}
