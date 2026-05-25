import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createJobRunner } from '../../packages/theo/src/server/jobs/job-runner.js'
import { defineJob } from '../../packages/theo/src/server/jobs/define-job.js'
import { InMemoryJobBackend } from '../../packages/theo/src/server/jobs/job-backend-memory.js'
import { createOutbox } from '../../packages/theo/src/server/jobs/outbox.js'
import {
  createOutboxDispatcher,
  createQueueClient,
} from '../../packages/theo/src/server/jobs/queue-client.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-24T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Job trace context propagation (T2.6 + R0.5.9)', () => {
  it('request traceparent → job ctx.traceId continuity', async () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
    const backend = new InMemoryJobBackend()
    const ob = createOutbox()
    const qc = createQueueClient(backend, ob, { traceparent })

    let captured = ''
    const jobDef = defineJob('cap', {
      handler: ({ traceId }) => {
        captured = traceId
      },
    })
    const runner = createJobRunner(backend, [jobDef])

    qc.enqueue('cap', {})
    await ob.flush(createOutboxDispatcher(backend))

    await runner.tick()
    expect(captured).toBe('0af7651916cd43dd8448eb211c80319c')

    backend.destroy()
  })

  it('job-to-job continuity preserves trace_id across enqueue boundary', async () => {
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

    const backend = new InMemoryJobBackend()
    const obA = createOutbox()
    const qcA = createQueueClient(backend, obA, { traceparent })

    const captured: string[] = []
    const jobA = defineJob('a', {
      handler: ({ traceId }) => {
        captured.push(traceId)
        // Job A enqueues Job B (using a fresh outbox per job invocation).
        const obB = createOutbox()
        const qcB = createQueueClient(backend, obB, {
          // Re-use trace_id; only span_id changes (handled by runner — see below).
          traceparent: `00-${traceId}-aaaaaaaaaaaaaaaa-01`,
        })
        qcB.enqueue('b', {})
        return obB.flush(createOutboxDispatcher(backend))
      },
    })
    const jobB = defineJob('b', {
      handler: ({ traceId }) => {
        captured.push(traceId)
      },
    })

    const runner = createJobRunner(backend, [jobA, jobB])

    qcA.enqueue('a', {})
    await obA.flush(createOutboxDispatcher(backend))

    await runner.tick()
    await runner.tick()

    expect(captured.length).toBe(2)
    // Both share the same trace_id
    expect(captured[0]).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(captured[1]).toBe('4bf92f3577b34da6a3ce929d0e0e4736')

    backend.destroy()
  })

  it('missing traceparent generates a new trace_id', async () => {
    const backend = new InMemoryJobBackend()
    const ob = createOutbox()
    const qc = createQueueClient(backend, ob) // no traceparent

    let captured = ''
    const jobDef = defineJob('cap', {
      handler: ({ traceId }) => {
        captured = traceId
      },
    })
    const runner = createJobRunner(backend, [jobDef])

    qc.enqueue('cap', {})
    await ob.flush(createOutboxDispatcher(backend))
    await runner.tick()

    expect(captured).toMatch(/^[0-9a-f]{32}$/)
    expect(captured).not.toBe('00000000000000000000000000000000')

    backend.destroy()
  })

  it('malformed traceparent falls back to generated trace (no throw)', async () => {
    const backend = new InMemoryJobBackend()
    const ob = createOutbox()
    const qc = createQueueClient(backend, ob, { traceparent: 'garbage' })

    let captured = ''
    const jobDef = defineJob('cap', {
      handler: ({ traceId }) => {
        captured = traceId
      },
    })
    const runner = createJobRunner(backend, [jobDef])

    qc.enqueue('cap', {})
    await ob.flush(createOutboxDispatcher(backend))
    await runner.tick()

    expect(captured).toMatch(/^[0-9a-f]{32}$/)
    backend.destroy()
  })

  it('runner invokes handler with attempt number', async () => {
    const backend = new InMemoryJobBackend()
    const ob = createOutbox()
    const qc = createQueueClient(backend, ob)

    let capturedAttempt = 0
    const jobDef = defineJob('cap', {
      handler: ({ attempt }) => {
        capturedAttempt = attempt
      },
    })
    const runner = createJobRunner(backend, [jobDef])

    qc.enqueue('cap', {})
    await ob.flush(createOutboxDispatcher(backend))
    await runner.tick()

    expect(capturedAttempt).toBe(1)
    backend.destroy()
  })

  it('NonRetryableError causes permanent removal', async () => {
    const { NonRetryableError } = await import('../../packages/theo/src/server/jobs/job-backend.js')
    const backend = new InMemoryJobBackend()
    const ob = createOutbox()
    const qc = createQueueClient(backend, ob)

    let calls = 0
    const jobDef = defineJob('cap', {
      maxAttempts: 5,
      handler: () => {
        calls++
        throw new NonRetryableError('do not retry')
      },
    })
    const runner = createJobRunner(backend, [jobDef])

    qc.enqueue('cap', {})
    await ob.flush(createOutboxDispatcher(backend))

    // First tick fires + nack(nonRetryable:true) → permanent remove.
    await runner.tick()
    vi.advanceTimersByTime(60_000)
    // Second tick should find no leases.
    await runner.tick()

    expect(calls).toBe(1)
    backend.destroy()
  })
})
