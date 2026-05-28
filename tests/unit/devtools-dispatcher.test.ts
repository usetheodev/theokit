/**
 * T2.1 — dispatcher unit tests.
 *
 * EC-23: queue cap at MAX_QUEUE_SIZE (FIFO eviction).
 * EC-24: setDispatch idempotency (StrictMode-safe).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatcher } from '../../packages/theo/src/devtools/dispatcher.js'
import { MAX_QUEUE_SIZE } from '../../packages/theo/src/devtools/shared.js'

beforeEach(() => {
  dispatcher._reset()
})

afterEach(() => {
  dispatcher._reset()
})

describe('dispatcher — queue (Pattern F)', () => {
  it('queues events before setDispatch is called', () => {
    dispatcher.onRequest({
      id: '1',
      traceId: 't',
      method: 'GET',
      path: '/',
      status: 200,
      durationMs: 1,
      startedAt: 0,
    })
    dispatcher.onRequest({
      id: '2',
      traceId: 't',
      method: 'POST',
      path: '/x',
      status: 201,
      durationMs: 5,
      startedAt: 0,
    })
    expect(dispatcher._queueLength()).toBe(2)
  })

  it('flushes queue on setDispatch (NULL → non-null)', () => {
    const d = vi.fn()
    dispatcher.onRequest({
      id: '1',
      traceId: 't',
      method: 'GET',
      path: '/',
      status: 200,
      durationMs: 1,
      startedAt: 0,
    })
    dispatcher.onError({ id: 'e1', type: 'console', message: 'boom', timestamp: 0 })
    expect(dispatcher._queueLength()).toBe(2)

    dispatcher.setDispatch(d)

    expect(d).toHaveBeenCalledTimes(2)
    expect(d).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'REQUEST_ADD' }))
    expect(d).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'ERROR_ADD' }))
    expect(dispatcher._queueLength()).toBe(0)
  })

  it('passes through directly when dispatch is registered', () => {
    const d = vi.fn()
    dispatcher.setDispatch(d)
    dispatcher.onError({ id: 'e', type: 'unhandled', message: 'oops', timestamp: 0 })
    expect(d).toHaveBeenCalledOnce()
    expect(dispatcher._queueLength()).toBe(0)
  })

  it('queues again after setDispatch(null)', () => {
    dispatcher.setDispatch(vi.fn())
    dispatcher.setDispatch(null)
    dispatcher.onError({ id: 'e', type: 'console', message: 'x', timestamp: 0 })
    expect(dispatcher._queueLength()).toBe(1)
  })

  it('EC-23: queue capped at MAX_QUEUE_SIZE (FIFO eviction)', () => {
    // 200 events, MAX_QUEUE_SIZE = 100 → only newest 100 kept
    for (let i = 0; i < MAX_QUEUE_SIZE * 2; i++) {
      dispatcher.onRequest({
        id: `r-${i}`,
        traceId: 't',
        method: 'GET',
        path: `/${i}`,
        status: 200,
        durationMs: 1,
        startedAt: i,
      })
    }
    expect(dispatcher._queueLength()).toBe(MAX_QUEUE_SIZE)
  })

  it('EC-24: setDispatch idempotent — flush only on NULL → non-null transition', () => {
    const d1 = vi.fn()
    const d2 = vi.fn()
    dispatcher.onRequest({
      id: '1',
      traceId: 't',
      method: 'GET',
      path: '/',
      status: 200,
      durationMs: 1,
      startedAt: 0,
    })
    // First non-null set — flushes queue to d1
    dispatcher.setDispatch(d1)
    expect(d1).toHaveBeenCalledTimes(1)
    // Replace with d2 WITHOUT going through null. Queue is empty; no flush.
    dispatcher.setDispatch(d2)
    expect(d2).toHaveBeenCalledTimes(0)
    // New events go to d2 directly
    dispatcher.onError({ id: 'e', type: 'console', message: 'm', timestamp: 0 })
    expect(d2).toHaveBeenCalledTimes(1)
    expect(d1).toHaveBeenCalledTimes(1) // d1 NOT called again
  })

  it('dispatcher onCsrfWarn → CSRF_WARN action', () => {
    const d = vi.fn()
    dispatcher.setDispatch(d)
    dispatcher.onCsrfWarn({
      event: 'csrf.warn',
      code: 'CSRF_STRICT_CUTOVER',
      docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover',
      method: 'POST',
      path: '/api/x',
      reason: 'missing header',
    })
    expect(d).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CSRF_WARN',
        payload: expect.objectContaining({ code: 'CSRF_STRICT_CUTOVER' }),
      }),
    )
  })

  it('dispatcher swallows reducer errors and logs (EC-25 alignment)', () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = vi.fn(() => {
      throw new Error('reducer blew up')
    })
    dispatcher.setDispatch(d)
    expect(() =>
      dispatcher.onRequest({
        id: '1',
        traceId: 't',
        method: 'GET',
        path: '/',
        status: 200,
        durationMs: 1,
        startedAt: 0,
      }),
    ).not.toThrow()
    expect(consoleErrSpy).toHaveBeenCalled()
    consoleErrSpy.mockRestore()
  })
})
