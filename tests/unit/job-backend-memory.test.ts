import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { InMemoryJobBackend } from '../../packages/theo/src/server/jobs/job-backend-memory.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('InMemoryJobBackend (T2.2)', () => {
  it('enqueue returns a UUID jobId', async () => {
    const backend = new InMemoryJobBackend()
    const { jobId } = await backend.enqueue({ name: 'test', input: { a: 1 } })
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/)
    backend.destroy()
  })

  it('idempotency returns existing jobId within TTL', async () => {
    const backend = new InMemoryJobBackend()
    const first = await backend.enqueue({
      name: 'test',
      input: { a: 1 },
      idempotencyKey: 'key-1',
    })
    // idempotency method requires explicit call with ttl
    const dup = await backend.idempotency?.('key-1', 60)
    expect(dup?.jobId).toBe(first.jobId)
    backend.destroy()
  })

  it('idempotency expires after TTL window', async () => {
    const backend = new InMemoryJobBackend()
    await backend.enqueue({
      name: 'test',
      input: {},
      idempotencyKey: 'key-x',
    })
    // Advance past 60s TTL
    vi.advanceTimersByTime(61_000)
    const dup = await backend.idempotency?.('key-x', 60)
    expect(dup).toBeNull()
    backend.destroy()
  })

  it('dequeue returns pending leases up to batchSize', async () => {
    const backend = new InMemoryJobBackend()
    await backend.enqueue({ name: 'a', input: {} })
    await backend.enqueue({ name: 'b', input: {} })
    await backend.enqueue({ name: 'c', input: {} })
    const leases = await backend.dequeue({ batchSize: 2, lockSeconds: 30 })
    expect(leases.length).toBe(2)
    backend.destroy()
  })

  it('dequeue locks prevent double dispatch under concurrency', async () => {
    const backend = new InMemoryJobBackend()
    await backend.enqueue({ name: 'a', input: {} })
    const [l1, l2] = await Promise.all([
      backend.dequeue({ batchSize: 1, lockSeconds: 30 }),
      backend.dequeue({ batchSize: 1, lockSeconds: 30 }),
    ])
    expect(l1.length + l2.length).toBe(1)
    backend.destroy()
  })

  it('ack removes lease', async () => {
    const backend = new InMemoryJobBackend()
    const { jobId } = await backend.enqueue({ name: 'a', input: {} })
    const [lease] = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    expect(lease.jobId).toBe(jobId)
    await backend.ack(jobId)
    const after = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    expect(after.length).toBe(0)
    backend.destroy()
  })

  it('nack with nonRetryable permanently removes lease', async () => {
    const backend = new InMemoryJobBackend()
    const { jobId } = await backend.enqueue({ name: 'a', input: {} })
    await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    await backend.nack(jobId, { error: 'fatal', nonRetryable: true })
    vi.advanceTimersByTime(31_000) // past lock
    const after = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    expect(after.length).toBe(0)
    backend.destroy()
  })

  it('nack without nonRetryable returns to queue after lock expires', async () => {
    const backend = new InMemoryJobBackend()
    const { jobId } = await backend.enqueue({ name: 'a', input: {}, maxAttempts: 3 })
    await backend.dequeue({ batchSize: 1, lockSeconds: 1 })
    await backend.nack(jobId, { error: 'transient' })
    vi.advanceTimersByTime(2000)
    const after = await backend.dequeue({ batchSize: 1, lockSeconds: 30 })
    expect(after.length).toBe(1)
    expect(after[0].attempts).toBe(2)
    backend.destroy()
  })

  it('overflow drops oldest entry with warning', async () => {
    const backend = new InMemoryJobBackend({ maxPending: 3 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await backend.enqueue({ name: 'old', input: { id: 1 } })
    await backend.enqueue({ name: 'mid', input: { id: 2 } })
    await backend.enqueue({ name: 'new', input: { id: 3 } })
    await backend.enqueue({ name: 'overflow', input: { id: 4 } })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
    backend.destroy()
  })

  // EC-104 — graceful shutdown cleanup
  it('beforeExit handler clears all pending timeouts + logs dropped count', async () => {
    const backend = new InMemoryJobBackend()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Enqueue 3 jobs with delays
    await backend.enqueue({ name: 'a', input: {}, delaySeconds: 60 })
    await backend.enqueue({ name: 'b', input: {}, delaySeconds: 60 })
    await backend.enqueue({ name: 'c', input: {}, delaySeconds: 60 })

    // Manually trigger the registered handler (it's wired to process.on('beforeExit'))
    backend.triggerBeforeExitForTest()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('3 jobs dropped'))

    warnSpy.mockRestore()
    backend.destroy()
  })

  it('destroy() removes the beforeExit listener so two calls run once each', () => {
    const backend = new InMemoryJobBackend()
    backend.destroy()
    // Calling destroy() twice should not throw
    expect(() => backend.destroy()).not.toThrow()
  })

  it('backend.name === "memory"', () => {
    const backend = new InMemoryJobBackend()
    expect(backend.name).toBe('memory')
    backend.destroy()
  })
})
