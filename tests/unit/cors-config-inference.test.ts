import { describe, it, expect, expectTypeOf } from 'vitest'
import type { z } from 'zod'

import { corsSchema } from '../../packages/theo/src/config/schema.js'
import type { CorsConfig } from '../../packages/theo/src/server/http/cors.js'

describe('CorsConfig inference post-Zod-fix (T0.2)', () => {
  it('z.infer<typeof corsSchema>["origins"] is required (not optional)', () => {
    type Inferred = z.infer<typeof corsSchema>
    // The KEY assertion: origins MUST be a required field. If it's
    // optional, the original DTS error at vite-plugin/index.ts:192 reappears.
    expectTypeOf<Inferred>().toExtend<{ origins: unknown }>()
    // Strictly required: NOT { origins?: ... }
    type OriginsRequired = Required<Pick<Inferred, 'origins'>>['origins']
    expectTypeOf<OriginsRequired>().not.toBeUndefined()
  })

  it('corsSchema.parse rejects input without origins (runtime)', () => {
    expect(() => corsSchema.parse({ methods: ['GET'] })).toThrow()
  })

  it('corsSchema.parse accepts string origin', () => {
    const result = corsSchema.parse({ origins: 'https://example.com' })
    expect(result.origins).toBe('https://example.com')
  })

  it('corsSchema.parse accepts wildcard origin', () => {
    const result = corsSchema.parse({ origins: '*' })
    expect(result.origins).toBe('*')
  })

  it('corsSchema.parse accepts array of origins', () => {
    const result = corsSchema.parse({
      origins: ['https://example.com', 'https://api.example.com'],
    })
    expect(Array.isArray(result.origins)).toBe(true)
  })

  it('CorsConfig.origins type is required (compile-time)', () => {
    expectTypeOf<Pick<CorsConfig, 'origins'>>().toExtend<{ origins: unknown }>()
  })
})
