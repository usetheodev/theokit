import { describe, it, expect } from 'vitest'

import { getCacheControlHeader } from '../../packages/theo/src/cache/cache-control-header.js'

describe('getCacheControlHeader', () => {
  it('happy path: maxAge + swr', () => {
    expect(getCacheControlHeader({ maxAge: 60, swr: 300 })).toBe(
      's-maxage=60, stale-while-revalidate=300',
    )
  })

  it('no swr → only s-maxage', () => {
    expect(getCacheControlHeader({ maxAge: 60 })).toBe('s-maxage=60')
  })

  it('maxAge=0 yields strict no-cache directive (regardless of swr)', () => {
    expect(getCacheControlHeader({ maxAge: 0, swr: 60 })).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate',
    )
  })

  it('isPrivate flag prepends private', () => {
    expect(getCacheControlHeader({ maxAge: 60, isPrivate: true })).toBe('private, s-maxage=60')
  })

  it('swr=0 omits directive (treated as undefined)', () => {
    expect(getCacheControlHeader({ maxAge: 60, swr: 0 })).toBe('s-maxage=60')
  })

  it('maxAge=0 + isPrivate: zero wins', () => {
    expect(getCacheControlHeader({ maxAge: 0, isPrivate: true })).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate',
    )
  })

  it('isPrivate + maxAge + swr', () => {
    expect(getCacheControlHeader({ maxAge: 60, swr: 300, isPrivate: true })).toBe(
      'private, s-maxage=60, stale-while-revalidate=300',
    )
  })
})
