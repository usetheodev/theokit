import { describe, it, expect } from 'vitest'
import {
  stableQueryKey,
  buildUseTheoQueryConfig,
} from '../../packages/theo/src/client/react-query-adapter.js'

describe('stableQueryKey (EC-10)', () => {
  it('returns identical key when called twice with same inline object', () => {
    const a = stableQueryKey('/api/users', { query: { search: 'alice' } })
    const b = stableQueryKey('/api/users', { query: { search: 'alice' } })
    expect(a).toEqual(b)
  })

  it('returns identical key regardless of property order', () => {
    const a = stableQueryKey('/api/users', { query: { a: 1, b: 2 } })
    const b = stableQueryKey('/api/users', { query: { b: 2, a: 1 } })
    expect(a).toEqual(b)
  })

  it('includes path as first element', () => {
    const k = stableQueryKey('/api/users', {})
    expect(k[0]).toBe('/api/users')
  })

  it('serializes body and query deterministically', () => {
    const a = stableQueryKey('/api/posts', {
      query: { tag: 'rust' },
      body: { author: 'alice' },
    })
    const b = stableQueryKey('/api/posts', {
      body: { author: 'alice' },
      query: { tag: 'rust' },
    })
    expect(a).toEqual(b)
  })

  it('handles missing query/body (omits them from key without crashing)', () => {
    const k = stableQueryKey('/api/me', {})
    expect(k).toEqual(['/api/me'])
  })

  it('preserves equality for nested keys regardless of order', () => {
    const a = stableQueryKey('/api/x', {
      query: { filters: { a: 1, b: 2 } },
    })
    const b = stableQueryKey('/api/x', {
      query: { filters: { b: 2, a: 1 } },
    })
    expect(a).toEqual(b)
  })
})

describe('buildUseTheoQueryConfig', () => {
  it('returns a queryKey + queryFn pair', () => {
    const fetcher = async (): Promise<unknown> => ({ users: [] })
    const cfg = buildUseTheoQueryConfig('/api/users', { query: { search: 'a' } }, fetcher)
    expect(Array.isArray(cfg.queryKey)).toBe(true)
    expect(typeof cfg.queryFn).toBe('function')
  })

  it('the queryFn invokes the supplied fetcher with the path + options', async () => {
    let receivedPath = ''
    let receivedOpts: unknown = null
    const fetcher = async (path: string, opts: unknown): Promise<unknown> => {
      receivedPath = path
      receivedOpts = opts
      return { ok: true }
    }
    const cfg = buildUseTheoQueryConfig('/api/users', { query: { z: 1 } }, fetcher)
    const result = await cfg.queryFn()
    expect(receivedPath).toBe('/api/users')
    expect(receivedOpts).toEqual({ query: { z: 1 } })
    expect(result).toEqual({ ok: true })
  })
})
