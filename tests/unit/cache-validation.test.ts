import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  CACHE_TAG_MAX_ITEMS,
  CACHE_TAG_MAX_LENGTH,
  DEFAULT_MAX_AGE,
  THEO_T_PREFIX,
} from '../../packages/theo/src/cache/constants.js'
import {
  validateExpire,
  validateMaxAge,
  validateTags,
} from '../../packages/theo/src/cache/validation.js'

describe('cache constants', () => {
  it('exports correct limits matching ADR D6', () => {
    expect(CACHE_TAG_MAX_LENGTH).toBe(256)
    expect(CACHE_TAG_MAX_ITEMS).toBe(128)
    expect(THEO_T_PREFIX).toBe('_THEO_T_')
    expect(DEFAULT_MAX_AGE).toBe(1)
  })
})

describe('validateTags', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('happy path: returns valid passthrough', () => {
    const result = validateTags(['foo', 'bar'], 'test')
    expect(result.valid).toEqual(['foo', 'bar'])
    expect(result.dropped).toEqual([])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('drops long tag (>256 chars) with warn', () => {
    const long = 'x'.repeat(300)
    const result = validateTags([long], 'test')
    expect(result.valid).toEqual([])
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]?.reason).toContain('exceeded max length')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('drops non-string tag with warn', () => {
    const result = validateTags([42, 'ok'], 'test')
    expect(result.valid).toEqual(['ok'])
    expect(result.dropped).toEqual([{ value: 42, reason: 'invalid type, must be a string' }])
  })

  it('drops reserved prefix _THEO_T_ tag with warn', () => {
    const result = validateTags(['_THEO_T_foo'], 'test')
    expect(result.valid).toEqual([])
    expect(result.dropped).toEqual([{ value: '_THEO_T_foo', reason: 'reserved prefix "_THEO_T_"' }])
  })

  it('truncates overflow at CACHE_TAG_MAX_ITEMS (128)', () => {
    const tags = Array.from({ length: 200 }, (_, i) => `tag-${i}`)
    const result = validateTags(tags, 'test')
    expect(result.valid).toHaveLength(128)
    expect(result.dropped).toHaveLength(72)
    expect(result.dropped[0]?.reason).toContain('overflow')
  })

  it('EC-1: non-array input returns dropped (does not throw)', () => {
    const result = validateTags(undefined, 'test')
    expect(result.valid).toEqual([])
    expect(result.dropped).toEqual([{ value: undefined, reason: 'expected array, got undefined' }])
  })

  it('EC-1: string input does not throw', () => {
    const result = validateTags('not-an-array', 'test')
    expect(result.valid).toEqual([])
    expect(result.dropped[0]?.reason).toContain('expected array')
  })

  it('empty array returns empty valid + no warn', () => {
    const result = validateTags([], 'test')
    expect(result.valid).toEqual([])
    expect(result.dropped).toEqual([])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('symbol entries dropped as non-string', () => {
    const result = validateTags([Symbol('s'), 'ok'], 'test')
    expect(result.valid).toEqual(['ok'])
    expect(result.dropped[0]?.reason).toContain('invalid type')
  })
})

describe('validateMaxAge', () => {
  it('default: undefined returns DEFAULT_MAX_AGE', () => {
    expect(validateMaxAge(undefined, 'test')).toBe(DEFAULT_MAX_AGE)
  })

  it('accepts zero', () => {
    expect(validateMaxAge(0, 'test')).toBe(0)
  })

  it('accepts positive finite number', () => {
    expect(validateMaxAge(60, 'test')).toBe(60)
    expect(validateMaxAge(0.5, 'test')).toBe(0.5)
  })

  it('rejects negative with clear error', () => {
    expect(() => validateMaxAge(-1, 'test')).toThrow(/Invalid maxAge/)
  })

  it('rejects NaN', () => {
    expect(() => validateMaxAge(Number.NaN, 'test')).toThrow(/Invalid maxAge/)
  })

  it('rejects Infinity', () => {
    expect(() => validateMaxAge(Number.POSITIVE_INFINITY, 'test')).toThrow(/Invalid maxAge/)
  })

  it('rejects string', () => {
    expect(() => validateMaxAge('60', 'test')).toThrow(/Invalid maxAge/)
  })

  it('error message includes description', () => {
    expect(() => validateMaxAge(-1, 'myRoute')).toThrow(/myRoute/)
  })
})

describe('validateExpire', () => {
  it('undefined passes through', () => {
    expect(validateExpire(undefined, 60, 'test')).toBeUndefined()
  })

  it('accepts greater than revalidate', () => {
    expect(validateExpire(120, 60, 'test')).toBe(120)
  })

  it('accepts equal to revalidate', () => {
    expect(validateExpire(60, 60, 'test')).toBe(60)
  })

  it('rejects less than revalidate', () => {
    expect(() => validateExpire(30, 60, 'test')).toThrow(
      /must be greater than or equal to revalidate/,
    )
  })

  it('rejects negative', () => {
    expect(() => validateExpire(-1, undefined, 'test')).toThrow(/Invalid expire/)
  })

  it('rejects NaN', () => {
    expect(() => validateExpire(Number.NaN, undefined, 'test')).toThrow(/Invalid expire/)
  })

  it('passes when revalidate undefined', () => {
    expect(validateExpire(30, undefined, 'test')).toBe(30)
  })
})
