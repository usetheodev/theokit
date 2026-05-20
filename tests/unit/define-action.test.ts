import { describe, it, expect } from 'vitest'
import { defineAction } from 'theokit/server'
import { z } from 'zod'

describe('defineAction', () => {
  it('should return the action config unchanged (same reference)', () => {
    const config = {
      input: z.object({ name: z.string() }),
      handler: ({ input }: { input: { name: string } }) => ({ id: '1', name: input.name }),
    }
    const result = defineAction(config)
    expect(result).toBe(config)
  })

  it('should preserve input schema', () => {
    const schema = z.object({ email: z.string().email() })
    const config = {
      input: schema,
      handler: ({ input: _input }: { input: { email: string } }) => ({ ok: true }),
    }
    const result = defineAction(config)
    expect(result.input).toBe(schema)
  })

  it('should accept complex nested input', () => {
    const config = {
      input: z.object({
        user: z.object({
          name: z.string(),
          address: z.object({ city: z.string() }),
        }),
      }),
      handler: () => ({ ok: true }),
    }
    const result = defineAction(config)
    expect(result).toBe(config)
  })
})
