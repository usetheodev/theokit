import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import { defineJob } from '../../packages/theo/src/server/jobs/define-job.js'

describe('defineJob (T2.3)', () => {
  it('returns a JobDefinition with name + handler + defaults', () => {
    const handler = async (): Promise<void> => {}
    const def = defineJob('process-document', { handler })
    expect(def.name).toBe('process-document')
    expect(def.maxAttempts).toBe(1)
    expect(def.hasInputSchema).toBe(false)
    expect(def.handler).toBe(handler)
  })

  it('captures inputSchema when provided', () => {
    const schema = z.object({ id: z.string() })
    const def = defineJob('send-email', {
      input: schema,
      handler: async () => {},
    })
    expect(def.hasInputSchema).toBe(true)
    expect(def.inputSchema).toBe(schema)
  })

  it('respects explicit maxAttempts', () => {
    const def = defineJob('retry-job', {
      maxAttempts: 5,
      handler: async () => {},
    })
    expect(def.maxAttempts).toBe(5)
  })

  it('rejects invalid name (whitespace)', () => {
    expect(() => defineJob('bad name', { handler: async () => {} })).toThrow(/invalid name/i)
  })

  it('rejects empty name', () => {
    expect(() => defineJob('', { handler: async () => {} })).toThrow(/invalid name/i)
  })

  it('rejects over-long name', () => {
    expect(() => defineJob('a'.repeat(65), { handler: async () => {} })).toThrow(/invalid name/i)
  })
})
