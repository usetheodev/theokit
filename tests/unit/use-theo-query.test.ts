import { describe, it, expect } from 'vitest'
import {
  stableQueryKey,
  buildUseTheoQueryInternals,
  type FetcherFn,
} from '../../packages/theo/src/react-query/index.js'

describe('useTheoQuery internals (T4.1)', () => {
  it('exposes the queryKey via stableQueryKey', () => {
    const fetcher: FetcherFn = async () => ({ ok: true })
    const internals = buildUseTheoQueryInternals('/api/users', { query: { search: 'a' } }, fetcher)
    expect(internals.queryKey).toEqual(stableQueryKey('/api/users', { query: { search: 'a' } }))
  })

  it('queryFn invokes the supplied fetcher with path + options', async () => {
    let receivedPath = ''
    let receivedOpts: unknown = null
    const fetcher: FetcherFn = async (path, opts) => {
      receivedPath = path
      receivedOpts = opts
      return { ok: true }
    }
    const internals = buildUseTheoQueryInternals('/api/x', { query: { z: 1 } }, fetcher)
    const result = await internals.queryFn()
    expect(receivedPath).toBe('/api/x')
    expect(receivedOpts).toEqual({ query: { z: 1 } })
    expect(result).toEqual({ ok: true })
  })

  it('produces stable keys for re-renders with same logical query (EC-10)', () => {
    const fetcher: FetcherFn = async () => null
    const a = buildUseTheoQueryInternals('/api/x', { query: { a: 1, b: 2 } }, fetcher)
    const b = buildUseTheoQueryInternals('/api/x', { query: { b: 2, a: 1 } }, fetcher)
    expect(a.queryKey).toEqual(b.queryKey)
  })

  it('propagates fetcher errors', async () => {
    const fetcher: FetcherFn = async () => {
      throw new Error('boom')
    }
    const internals = buildUseTheoQueryInternals('/api/x', {}, fetcher)
    await expect(internals.queryFn()).rejects.toThrow('boom')
  })

  it('handles options-less calls (no query/body)', () => {
    const fetcher: FetcherFn = async () => null
    const internals = buildUseTheoQueryInternals('/api/me', {}, fetcher)
    expect(internals.queryKey[0]).toBe('/api/me')
  })
})
