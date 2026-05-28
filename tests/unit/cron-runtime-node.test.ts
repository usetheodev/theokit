import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createCronScheduler } from '../../packages/theo/src/server/cron/cron-runtime-node.js'
import { defineCron } from '../../packages/theo/src/server/cron/define-cron.js'
import type { CronContext } from '../../packages/theo/src/server/cron/cron-types.js'

beforeEach(() => {
  vi.useFakeTimers()
  // Anchor to a known UTC time so cron-parser computes next fire deterministically.
  // 2026-05-24T12:00:00.000Z is a Sunday 12:00 UTC.
  vi.setSystemTime(new Date('2026-05-24T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createCronScheduler (T1.4)', () => {
  it('fires a cron at the scheduled time', async () => {
    const handler = vi.fn(() => {})
    const def = defineCron('every-minute', { schedule: '* * * * *', handler })
    const scheduler = createCronScheduler([def])
    scheduler.start()

    // Advance 65 seconds — should fire exactly once at the next minute boundary.
    await vi.advanceTimersByTimeAsync(65_000)
    expect(handler).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('passes a CronContext with traceId + scheduledAt + signal to handler', async () => {
    let captured: CronContext | undefined
    const def = defineCron('cap', {
      schedule: '* * * * *',
      handler: (ctx: CronContext) => {
        captured = ctx
      },
    })
    const scheduler = createCronScheduler([def])
    scheduler.start()
    await vi.advanceTimersByTimeAsync(65_000)
    expect(captured?.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(captured?.scheduledAt).toBeInstanceOf(Date)
    expect(captured?.signal).toBeInstanceOf(AbortSignal)
    scheduler.stop()
  })

  it('with concurrency: forbid skips overlapping ticks while previous still running', async () => {
    let resolve: (() => void) | null = null
    const handler = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    const def = defineCron('slow', {
      schedule: '* * * * *',
      handler,
      concurrency: 'forbid',
    })
    const scheduler = createCronScheduler([def])
    scheduler.start()

    // First tick fires; handler hangs (resolve not called).
    await vi.advanceTimersByTimeAsync(65_000)
    expect(handler).toHaveBeenCalledTimes(1)

    // Second + third tick attempts; both should be skipped because previous in-flight.
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(1)

    // Resolve the hanging handler; next tick fires.
    // TS narrows `resolve` as `never` after the assignment-inside-Promise pattern;
    // cast guards the call site.
    ;(resolve as unknown as (() => void) | null)?.()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('with concurrency: allow runs overlapping handlers concurrently', async () => {
    const handler = vi.fn(() => new Promise<void>(() => {}))
    const def = defineCron('overlap', {
      schedule: '* * * * *',
      handler,
      concurrency: 'allow',
    })
    const scheduler = createCronScheduler([def])
    scheduler.start()

    await vi.advanceTimersByTimeAsync(65_000)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(3)

    scheduler.stop()
  })

  it('fires abort signal when stop() is called', async () => {
    let captured: CronContext | undefined
    const def = defineCron('abort', {
      schedule: '* * * * *',
      handler: (ctx: CronContext) => {
        captured = ctx
        return new Promise(() => {}) // hang
      },
    })
    const scheduler = createCronScheduler([def])
    scheduler.start()
    await vi.advanceTimersByTimeAsync(65_000)
    expect(captured?.signal.aborted).toBe(false)
    scheduler.stop()
    expect(captured?.signal.aborted).toBe(true)
  })

  it('clears all pending timeouts on stop()', async () => {
    const handler = vi.fn(() => {})
    const def = defineCron('foo', { schedule: '* * * * *', handler })
    const scheduler = createCronScheduler([def])
    scheduler.start()
    scheduler.stop()
    // Advance well past when the next fire would have been.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(handler).not.toHaveBeenCalled()
  })

  // EC-109 — hanging handler must not block other crons
  it('a hanging handler in cron A does not block cron B', async () => {
    const handlerA = vi.fn(() => new Promise<void>(() => {})) // hang forever
    const handlerB = vi.fn(() => {})
    const a = defineCron('a-hang', {
      schedule: '* * * * *',
      handler: handlerA,
      concurrency: 'forbid',
    })
    const b = defineCron('b-ok', { schedule: '* * * * *', handler: handlerB })
    const scheduler = createCronScheduler([a, b])
    scheduler.start()

    // 5 ticks
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(60_000)
    }

    // A fired once (forbid + hang), B fired at least 4 times.
    expect(handlerA).toHaveBeenCalledTimes(1)
    expect(handlerB.mock.calls.length).toBeGreaterThanOrEqual(4)

    scheduler.stop()
  })
})
