import { describe, it, expect } from 'vitest'
import {
  stableQueryKey,
  buildUseTheoQueryConfig,
} from '../../packages/theokit-react-query/src/index.js'

describe('@theokit/react-query package — public surface', () => {
  it('exposes stableQueryKey', () => {
    const k1 = stableQueryKey('/api/users', { query: { a: 1, b: 2 } })
    const k2 = stableQueryKey('/api/users', { query: { b: 2, a: 1 } })
    expect(k1).toEqual(k2)
  })

  it('exposes buildUseTheoQueryConfig with the expected shape', () => {
    const cfg = buildUseTheoQueryConfig(
      '/api/users',
      { query: { a: 1 } },
      async () => ({ ok: true }),
    )
    expect(Array.isArray(cfg.queryKey)).toBe(true)
    expect(typeof cfg.queryFn).toBe('function')
  })

  it('queryFn invokes the supplied fetcher', async () => {
    let calledWith: { path: string; opts: unknown } | null = null
    const cfg = buildUseTheoQueryConfig(
      '/api/x',
      { query: { z: 1 } },
      async (path, opts) => {
        calledWith = { path, opts }
        return { data: 'ok' }
      },
    )
    const result = await cfg.queryFn()
    expect(calledWith!.path).toBe('/api/x')
    expect(calledWith!.opts).toEqual({ query: { z: 1 } })
    expect(result).toEqual({ data: 'ok' })
  })
})
