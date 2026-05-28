import { describe, it, expect, vi } from 'vitest'

import {
  createOutboxDispatcher,
  createQueueClient,
} from '../../packages/theo/src/server/jobs/queue-client.js'
import { createOutbox } from '../../packages/theo/src/server/jobs/outbox.js'
import { InMemoryJobBackend } from '../../packages/theo/src/server/jobs/job-backend-memory.js'

describe('QueueClient (T2.4)', () => {
  it('enqueue returns void synchronously', () => {
    const ob = createOutbox()
    const backend = new InMemoryJobBackend()
    const qc = createQueueClient(backend, ob)
    const result = qc.enqueue('test-job', { a: 1 })
    expect(result).toBeUndefined()
    backend.destroy()
  })

  it('enqueue buffers to outbox (does NOT call backend on hot path)', () => {
    const ob = createOutbox()
    const backend = new InMemoryJobBackend()
    const enqueueSpy = vi.spyOn(backend, 'enqueue')
    const qc = createQueueClient(backend, ob)
    qc.enqueue('test-job', { a: 1 })
    expect(ob.size()).toBe(1)
    expect(enqueueSpy).not.toHaveBeenCalled()
    backend.destroy()
  })

  it('enqueue forwards idempotencyKey to the outbox entry', () => {
    const ob = createOutbox()
    const backend = new InMemoryJobBackend()
    const qc = createQueueClient(backend, ob)
    qc.enqueue('test-job', {}, { idempotencyKey: 'k1' })
    const [entry] = ob.drain()
    expect(entry.idempotencyKey).toBe('k1')
    backend.destroy()
  })

  it('enqueue forwards delaySeconds', () => {
    const ob = createOutbox()
    const backend = new InMemoryJobBackend()
    const qc = createQueueClient(backend, ob)
    qc.enqueue('test-job', {}, { delaySeconds: 30 })
    const [entry] = ob.drain()
    expect(entry.delaySeconds).toBe(30)
    backend.destroy()
  })

  it('enqueueWithId returns Promise resolving to {jobId}', async () => {
    const ob = createOutbox()
    const backend = new InMemoryJobBackend()
    const qc = createQueueClient(backend, ob)
    const promise = qc.enqueueWithId('test-job', { a: 1 })
    expect(promise).toBeInstanceOf(Promise)
    // Flush the outbox using the dispatcher that bridges the jobId promise
    await ob.flush(createOutboxDispatcher(backend))
    const { jobId } = await promise
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/)
    backend.destroy()
  })

  it('attaches traceparent from options', () => {
    const ob = createOutbox()
    const backend = new InMemoryJobBackend()
    const qc = createQueueClient(backend, ob, {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    })
    qc.enqueue('test-job', {})
    const [entry] = ob.drain()
    expect(entry.traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')
    backend.destroy()
  })
})
