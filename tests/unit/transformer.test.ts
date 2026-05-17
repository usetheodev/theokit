import { describe, it, expect } from 'vitest'
import {
  superjsonTransformer,
  jsonTransformer,
  resolveTransformer,
  type TheoTransformer,
} from '../../packages/theo/src/server/transformer.js'

describe('TheoTransformer — built-in implementations', () => {
  it('superjson roundtrips Date', () => {
    const d = new Date('2026-05-17T12:00:00.000Z')
    const out = superjsonTransformer.deserialize(superjsonTransformer.serialize(d)) as Date
    expect(out).toBeInstanceOf(Date)
    expect(out.toISOString()).toBe(d.toISOString())
  })

  it('superjson roundtrips Map and Set', () => {
    const m = new Map([['a', 1]])
    const s = new Set([1, 2, 3])
    const outMap = superjsonTransformer.deserialize(superjsonTransformer.serialize(m)) as Map<string, number>
    const outSet = superjsonTransformer.deserialize(superjsonTransformer.serialize(s)) as Set<number>
    expect(outMap.get('a')).toBe(1)
    expect(Array.from(outSet)).toEqual([1, 2, 3])
  })

  it('json transformer roundtrips plain values', () => {
    const out = jsonTransformer.deserialize(jsonTransformer.serialize({ a: 1, b: 'two' }))
    expect(out).toEqual({ a: 1, b: 'two' })
  })

  it('json transformer drops Date richness (downgrades to string)', () => {
    const d = new Date('2026-05-17T12:00:00.000Z')
    const out = jsonTransformer.deserialize(jsonTransformer.serialize(d))
    expect(typeof out).toBe('string')
  })

  it('both transformers report their name', () => {
    expect(superjsonTransformer.name).toBe('superjson')
    expect(jsonTransformer.name).toBe('json')
  })
})

describe('resolveTransformer — config-driven selection', () => {
  it('returns json transformer when config.serialization === "json"', () => {
    const t = resolveTransformer('json')
    expect(t.name).toBe('json')
  })

  it('returns superjson transformer when config.serialization === "superjson"', () => {
    const t = resolveTransformer('superjson')
    expect(t.name).toBe('superjson')
  })

  it('accepts a custom transformer object directly', () => {
    const custom: TheoTransformer = {
      name: 'custom',
      serialize: (v) => JSON.stringify({ wrapped: v }),
      deserialize: (s) => JSON.parse(s).wrapped,
    }
    const t = resolveTransformer(custom)
    expect(t.name).toBe('custom')
    const out = t.deserialize(t.serialize({ x: 1 }))
    expect(out).toEqual({ x: 1 })
  })

  it('rejects unknown string with a clear error', () => {
    expect(() => resolveTransformer('xml' as never)).toThrow(/Unknown transformer/)
  })

  it('rejects an object missing serialize/deserialize', () => {
    expect(() => resolveTransformer({ name: 'broken' } as unknown as TheoTransformer)).toThrow(
      /must have serialize and deserialize/,
    )
  })
})
