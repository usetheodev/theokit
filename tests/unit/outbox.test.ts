import { describe, it, expect, vi } from 'vitest'

import { createOutbox } from '../../packages/theo/src/server/jobs/outbox.js'
import type { JobEnqueueInput } from '../../packages/theo/src/server/jobs/job-backend.js'

const entry = (name: string): JobEnqueueInput => ({ name, input: {} })

describe('Outbox (T2.5)', () => {
  it('push then drain returns entries in insertion order', () => {
    const ob = createOutbox()
    ob.push(entry('a'))
    ob.push(entry('b'))
    ob.push(entry('c'))
    const drained = ob.drain()
    expect(drained.map((e) => e.name)).toEqual(['a', 'b', 'c'])
  })

  it('drain leaves outbox empty', () => {
    const ob = createOutbox()
    ob.push(entry('a'))
    ob.drain()
    expect(ob.drain()).toEqual([])
  })

  it('discard clears buffered entries', () => {
    const ob = createOutbox()
    ob.push(entry('a'))
    ob.push(entry('b'))
    ob.discard()
    expect(ob.drain()).toEqual([])
  })

  it('size reflects buffered count', () => {
    const ob = createOutbox()
    expect(ob.size()).toBe(0)
    ob.push(entry('a'))
    expect(ob.size()).toBe(1)
    ob.push(entry('b'))
    expect(ob.size()).toBe(2)
    ob.discard()
    expect(ob.size()).toBe(0)
  })

  it('flush dispatches each entry to backend.enqueue in order', async () => {
    const ob = createOutbox()
    ob.push(entry('a'))
    ob.push(entry('b'))

    const calls: string[] = []
    await ob.flush(async (e) => {
      calls.push(e.name)
      return Promise.resolve()
    })
    expect(calls).toEqual(['a', 'b'])
    expect(ob.size()).toBe(0)
  })

  // EC-107 — backend throw during flush
  it('flush logs + continues when backend throws on one entry', async () => {
    const ob = createOutbox()
    ob.push(entry('a'))
    ob.push(entry('throws'))
    ob.push(entry('c'))

    const dispatched: string[] = []
    const errors: { name: string; error: string }[] = []
    await ob.flush(
      async (e) => {
        if (e.name === 'throws') throw new Error('backend boom')
        dispatched.push(e.name)
        return Promise.resolve()
      },
      {
        onError: (entryName, errMsg) => {
          errors.push({ name: entryName, error: errMsg })
        },
      },
    )

    expect(dispatched).toEqual(['a', 'c'])
    expect(errors.length).toBe(1)
    expect(errors[0].name).toBe('throws')
    expect(errors[0].error).toContain('boom')
  })

  it('flush uses default error handler (console.warn) when no onError', async () => {
    const ob = createOutbox()
    ob.push(entry('throws'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await ob.flush(async () => {
      throw new Error('boom')
    })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
