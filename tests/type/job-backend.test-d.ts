import { describe, it, expectTypeOf } from 'vitest'

import type {
  JobBackend,
  JobEnqueueInput,
  JobLease,
} from '../../packages/theo/src/server/jobs/job-backend.js'
import type { JobRegistry } from '../../packages/theo/src/server/jobs/job-types.js'

// User-side module augmentation example.
declare module '../../packages/theo/src/server/jobs/job-types.js' {
  interface JobRegistry {
    'process-document': { documentId: string }
    'send-email': { to: string; subject: string }
  }
}

describe('JobBackend types (T2.1)', () => {
  it('JobBackend interface has expected method shape', () => {
    expectTypeOf<JobBackend>().toExtend<{
      readonly name: string
      enqueue: (input: JobEnqueueInput) => Promise<{ jobId: string }>
      dequeue: (opts: { batchSize?: number; lockSeconds?: number }) => Promise<JobLease[]>
      ack: (jobId: string) => Promise<void>
      nack: (jobId: string, opts: { error: string; nonRetryable?: boolean }) => Promise<void>
    }>()
  })

  it('JobEnqueueInput requires name + input', () => {
    expectTypeOf<JobEnqueueInput>().toExtend<{
      name: string
      input: unknown
    }>()
  })

  it('JobLease includes lockExpiresAt as Date', () => {
    expectTypeOf<JobLease['lockExpiresAt']>().toEqualTypeOf<Date>()
  })

  it('JobRegistry augmentation extends the type map', () => {
    type ProcessInput = JobRegistry['process-document']
    expectTypeOf<ProcessInput>().toEqualTypeOf<{ documentId: string }>()
  })
})
