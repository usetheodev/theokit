/**
 * T2.1 — HMR bridge unit tests.
 *
 * EC-25: a throwing callback MUST NOT propagate up to Vite's HMR client.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatcher } from '../../packages/theo/src/devtools/dispatcher.js'
import { subscribeToServerEvents } from '../../packages/theo/src/devtools/hmr-bridge.js'

type HotHandlers = Record<string, (data: unknown) => void>

function installFakeHot(): { handlers: HotHandlers; restore: () => void } {
  const handlers: HotHandlers = {}
  const fake = {
    on(event: string, cb: (data: unknown) => void) {
      handlers[event] = cb
    },
    off(event: string, _cb: (data: unknown) => void) {
      delete handlers[event]
    },
  }
  ;(globalThis as { __theoViteHotForTests?: unknown }).__theoViteHotForTests = fake
  return {
    handlers,
    restore() {
      ;(globalThis as { __theoViteHotForTests?: unknown }).__theoViteHotForTests = undefined
    },
  }
}

beforeEach(() => {
  dispatcher._reset()
  ;(globalThis as { __theoViteHotForTests?: unknown }).__theoViteHotForTests = undefined
})

afterEach(() => {
  dispatcher._reset()
  ;(globalThis as { __theoViteHotForTests?: unknown }).__theoViteHotForTests = undefined
})

describe('hmr-bridge', () => {
  it('no-op when import.meta.hot is undefined', () => {
    const sub = subscribeToServerEvents(dispatcher)
    expect(sub.unsubscribe).toBeInstanceOf(Function)
    // No throw on unsub
    expect(() => sub.unsubscribe()).not.toThrow()
  })

  it('subscribes to all 5 channels', () => {
    const { handlers, restore } = installFakeHot()
    subscribeToServerEvents(dispatcher)
    expect(handlers['theo:devtools:request']).toBeDefined()
    expect(handlers['theo:devtools:error']).toBeDefined()
    expect(handlers['theo:devtools:csrf.warn']).toBeDefined()
    expect(handlers['theo:devtools:manifest']).toBeDefined()
    expect(handlers['theo:devtools:route-matched']).toBeDefined()
    restore()
  })

  it('routes request event to dispatcher.onRequest', () => {
    const { handlers, restore } = installFakeHot()
    const d = vi.fn()
    dispatcher.setDispatch(d)
    subscribeToServerEvents(dispatcher)
    handlers['theo:devtools:request']!({
      id: '1',
      traceId: 't',
      method: 'GET',
      path: '/',
      status: 200,
      durationMs: 1,
      startedAt: 0,
    })
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'REQUEST_ADD' }))
    restore()
  })

  it('routes csrf.warn event to dispatcher.onCsrfWarn', () => {
    const { handlers, restore } = installFakeHot()
    const d = vi.fn()
    dispatcher.setDispatch(d)
    subscribeToServerEvents(dispatcher)
    handlers['theo:devtools:csrf.warn']!({
      event: 'csrf.warn',
      code: 'CSRF_STRICT_CUTOVER',
      docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover',
      method: 'POST',
      path: '/api/x',
      reason: 'missing',
    })
    expect(d).toHaveBeenCalledWith(expect.objectContaining({ type: 'CSRF_WARN' }))
    restore()
  })

  it('EC-25: a throwing dispatcher does NOT propagate to HMR (callback wrapped)', () => {
    const { handlers, restore } = installFakeHot()
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set a dispatch that throws
    dispatcher.setDispatch(() => {
      throw new Error('reducer-error')
    })

    subscribeToServerEvents(dispatcher)

    // Trigger via the bridge — bridge wraps in try/catch + dispatcher wraps too.
    // Either layer catches; the error must NOT bubble up to the HMR callback caller.
    expect(() =>
      handlers['theo:devtools:request']!({
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
    restore()
  })

  it('unsubscribe removes all handlers', () => {
    const { handlers, restore } = installFakeHot()
    const sub = subscribeToServerEvents(dispatcher)
    expect(Object.keys(handlers).length).toBeGreaterThan(0)
    sub.unsubscribe()
    expect(Object.keys(handlers).length).toBe(0)
    restore()
  })
})
