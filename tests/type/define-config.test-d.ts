import { describe, it, expectTypeOf } from 'vitest'
import { defineConfig } from 'theo'
import type { TheoConfig } from 'theo'

describe('defineConfig type inference', () => {
  it('should accept partial TheoConfig', () => {
    const config = defineConfig({ port: 4000 })
    expectTypeOf(config).toMatchTypeOf<Partial<TheoConfig>>()
  })

  it('should accept empty config', () => {
    const config = defineConfig({})
    expectTypeOf(config).toMatchTypeOf<Partial<TheoConfig>>()
  })

  it('should reject invalid property types at compile time', () => {
    // @ts-expect-error — port must be number
    defineConfig({ port: 'abc' })
  })
})
