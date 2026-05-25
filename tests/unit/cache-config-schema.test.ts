import { describe, it, expect } from 'vitest'

import { cacheSchema, theoConfigSchema } from '../../packages/theo/src/config/schema.js'

describe('cacheSchema', () => {
  it('accepts minimal {} with all defaults', () => {
    const result = cacheSchema.parse({})
    expect(result.enabled).toBe(true)
    expect(result.storage).toBe('memory')
    expect(result.maxEntries).toBe(1000)
    expect(result.defaults.maxAge).toBe(1)
    expect(result.defaults.cacheErrors).toBe(false)
  })

  it('rejects negative maxAge in defaults', () => {
    expect(() => cacheSchema.parse({ defaults: { maxAge: -1 } })).toThrow()
  })

  it('rejects non-finite maxAge', () => {
    expect(() => cacheSchema.parse({ defaults: { maxAge: Infinity } })).toThrow()
  })

  it('preserves route rules', () => {
    const result = cacheSchema.parse({
      routeRules: {
        '/api/**': { maxAge: 60 },
        '/static/**': { maxAge: 300, swr: 600 },
      },
    })
    expect(result.routeRules?.['/api/**']).toEqual({ maxAge: 60 })
    expect(result.routeRules?.['/static/**']).toEqual({
      maxAge: 300,
      swr: 600,
    })
  })

  it('rejects negative maxAge in route rule', () => {
    expect(() =>
      cacheSchema.parse({
        routeRules: { '/api/**': { maxAge: -1 } },
      }),
    ).toThrow()
  })

  it('accepts custom storage instance (passthrough)', () => {
    const fakeAdapter = { name: 'redis' }
    const result = cacheSchema.parse({ storage: fakeAdapter })
    expect(result.storage).toBe(fakeAdapter)
  })

  it('disabled cache: enabled=false', () => {
    const result = cacheSchema.parse({ enabled: false })
    expect(result.enabled).toBe(false)
  })

  it('preserves custom maxEntries', () => {
    const result = cacheSchema.parse({ maxEntries: 50 })
    expect(result.maxEntries).toBe(50)
  })

  it('rejects zero/negative maxEntries', () => {
    expect(() => cacheSchema.parse({ maxEntries: 0 })).toThrow()
    expect(() => cacheSchema.parse({ maxEntries: -1 })).toThrow()
  })
})

describe('theoConfigSchema with cache', () => {
  it('cache is optional (backward compatible)', () => {
    const result = theoConfigSchema.parse({})
    expect(result.cache).toBeUndefined()
  })

  it('cache passthrough when supplied', () => {
    const result = theoConfigSchema.parse({
      cache: { defaults: { maxAge: 60 } },
    })
    expect(result.cache?.defaults.maxAge).toBe(60)
  })
})
