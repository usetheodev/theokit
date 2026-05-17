import { describe, it, expect } from 'vitest'
import {
  stableQueryKey,
  buildUseTheoQueryConfig,
  buildUseTheoQueryInternals,
  type Fetcher,
  type FetcherFn,
  type UseTheoQueryConfig,
  type UseTheoQueryInternals,
} from '../../packages/theo/src/react-query/index.js'

/**
 * `theokit/react-query` subpath — public surface.
 *
 * This used to be a separate npm package (`@theokit/react-query`) but was
 * consolidated into a subpath of `theokit` for consistency with
 * `theokit/server`, `theokit/client`, etc. The aliases
 * `buildUseTheoQueryInternals` / `FetcherFn` / `UseTheoQueryInternals`
 * preserve the names that the never-published standalone package
 * exposed during development.
 */

describe('theokit/react-query subpath — canonical exports', () => {
  it('exposes stableQueryKey', () => {
    const k1 = stableQueryKey('/api/users', { query: { a: 1, b: 2 } })
    const k2 = stableQueryKey('/api/users', { query: { b: 2, a: 1 } })
    expect(k1).toEqual(k2)
  })

  it('exposes buildUseTheoQueryConfig with the expected shape', () => {
    const cfg: UseTheoQueryConfig<{ ok: boolean }> = buildUseTheoQueryConfig(
      '/api/users',
      { query: { a: 1 } },
      async () => ({ ok: true }),
    )
    expect(Array.isArray(cfg.queryKey)).toBe(true)
    expect(typeof cfg.queryFn).toBe('function')
  })

  it('queryFn invokes the supplied fetcher', async () => {
    let calledWith: { path: string; opts: unknown } | null = null
    const fetcher: Fetcher<{ data: string }> = async (path, opts) => {
      calledWith = { path, opts }
      return { data: 'ok' }
    }
    const cfg = buildUseTheoQueryConfig('/api/x', { query: { z: 1 } }, fetcher)
    const result = await cfg.queryFn()
    expect(calledWith!.path).toBe('/api/x')
    expect(calledWith!.opts).toEqual({ query: { z: 1 } })
    expect(result).toEqual({ data: 'ok' })
  })
})

describe('theokit/react-query subpath — back-compat aliases', () => {
  it('buildUseTheoQueryInternals is the same function as buildUseTheoQueryConfig', () => {
    expect(buildUseTheoQueryInternals).toBe(buildUseTheoQueryConfig)
  })

  it('FetcherFn alias works structurally', () => {
    const fn: FetcherFn<string> = async (path, _opts) => `done:${path}`
    expect(typeof fn).toBe('function')
  })

  it('UseTheoQueryInternals alias works structurally', () => {
    const cfg: UseTheoQueryInternals<number> = {
      queryKey: ['/x'],
      queryFn: async () => 42,
    }
    expect(cfg.queryKey).toEqual(['/x'])
  })
})
