import { describe, it, expect } from 'vitest'
import { serializeResponse, deserializeResponse } from '../../packages/theo/src/server/serialization.js'

describe('serializeResponse / deserializeResponse', () => {
  it('should roundtrip Date objects', () => {
    const data = { createdAt: new Date('2026-01-01T00:00:00.000Z') }
    const serialized = serializeResponse(data)
    const result = deserializeResponse(serialized) as typeof data

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('should roundtrip Map objects', () => {
    const data = { map: new Map([['a', 1], ['b', 2]]) }
    const serialized = serializeResponse(data)
    const result = deserializeResponse(serialized) as typeof data

    expect(result.map).toBeInstanceOf(Map)
    expect(result.map.get('a')).toBe(1)
    expect(result.map.get('b')).toBe(2)
  })

  it('should roundtrip Set objects', () => {
    const data = { tags: new Set(['a', 'b', 'c']) }
    const serialized = serializeResponse(data)
    const result = deserializeResponse(serialized) as typeof data

    expect(result.tags).toBeInstanceOf(Set)
    expect(result.tags.has('a')).toBe(true)
    expect(result.tags.has('b')).toBe(true)
    expect(result.tags.size).toBe(3)
  })

  it('should roundtrip BigInt values', () => {
    const data = { big: BigInt('9007199254740993') }
    const serialized = serializeResponse(data)
    const result = deserializeResponse(serialized) as typeof data

    expect(typeof result.big).toBe('bigint')
    expect(result.big).toBe(BigInt('9007199254740993'))
  })

  it('should pass through plain JSON without meta', () => {
    const data = { name: 'John', age: 30 }
    const serialized = serializeResponse(data)

    // Plain objects should not have meta (or meta should be empty)
    expect(serialized.json).toEqual({ name: 'John', age: 30 })
  })

  it('should include meta for rich types', () => {
    const data = { createdAt: new Date() }
    const serialized = serializeResponse(data)

    // Should have meta to indicate Date type
    expect(serialized.meta).toBeDefined()
  })

  it('should handle nested complex types', () => {
    const data = {
      user: {
        name: 'John',
        createdAt: new Date('2026-06-15'),
        roles: new Set(['admin', 'user']),
        metadata: new Map([['key', 'value']]),
      },
    }
    const serialized = serializeResponse(data)
    const result = deserializeResponse(serialized) as typeof data

    expect(result.user.name).toBe('John')
    expect(result.user.createdAt).toBeInstanceOf(Date)
    expect(result.user.roles).toBeInstanceOf(Set)
    expect(result.user.metadata).toBeInstanceOf(Map)
  })

  it('should handle undefined values', () => {
    const data = { a: 1, b: undefined }
    const serialized = serializeResponse(data)
    const result = deserializeResponse(serialized) as typeof data

    expect(result.a).toBe(1)
    expect(result.b).toBeUndefined()
  })
})
