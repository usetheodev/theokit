import { describe, it, expect } from 'vitest'

import {
  DEFAULT_EXCLUDED_QUERY_PARAMS,
  deriveKey,
} from '../../packages/theo/src/cache/key-derivation.js'

describe('DEFAULT_EXCLUDED_QUERY_PARAMS', () => {
  it('contains ≥ 25 tracking params (matches Astro)', () => {
    expect(DEFAULT_EXCLUDED_QUERY_PARAMS.length).toBeGreaterThanOrEqual(25)
    expect(DEFAULT_EXCLUDED_QUERY_PARAMS).toContain('utm_source')
    expect(DEFAULT_EXCLUDED_QUERY_PARAMS).toContain('fbclid')
    expect(DEFAULT_EXCLUDED_QUERY_PARAMS).toContain('_ga')
  })
})

describe('deriveKey', () => {
  it('happy path: returns URL with sorted query', async () => {
    const req = new Request('https://example.com/api/users?id=1&sort=desc')
    const key = await deriveKey(req)
    expect(key).toBe('https://example.com/api/users?id=1&sort=desc')
  })

  it('excludes default tracking params', async () => {
    const req = new Request('https://example.com/api/users?utm_source=email&id=1')
    const key = await deriveKey(req)
    expect(key).not.toContain('utm_source')
    expect(key).toContain('id=1')
  })

  it('sorts query alphabetically', async () => {
    const req = new Request('https://example.com/api/?z=1&a=2')
    const key = await deriveKey(req)
    expect(key).toBe('https://example.com/api/?a=2&z=1')
  })

  it('lowercases host', async () => {
    const req = new Request('https://EXAMPLE.COM/foo')
    const key = await deriveKey(req)
    expect(key).toBe('https://example.com/foo')
  })

  it('getKey override: bypasses all internal logic', async () => {
    const req = new Request('https://example.com/api/?utm_source=x')
    const key = await deriveKey(req, { getKey: () => 'custom-key' })
    expect(key).toBe('custom-key')
  })

  it('vary suffix uses \\0 separator', async () => {
    const req = new Request('https://example.com/api', {
      headers: { accept: 'application/json' },
    })
    const key = await deriveKey(req, { varies: ['accept'] })
    expect(key).toBe('https://example.com/api\0accept=application/json')
  })

  it('empty query: no trailing ?', async () => {
    const req = new Request('https://example.com/foo')
    const key = await deriveKey(req)
    expect(key).toBe('https://example.com/foo')
  })

  it('only tracking params: no query suffix at all', async () => {
    const req = new Request('https://example.com/api?utm_source=x&fbclid=y')
    const key = await deriveKey(req)
    expect(key).toBe('https://example.com/api')
  })

  it('prefix namespacing', async () => {
    const req = new Request('https://example.com/api')
    const key = await deriveKey(req, { prefix: 'users' })
    expect(key).toBe('users:https://example.com/api')
  })

  it('missing vary header → empty value', async () => {
    const req = new Request('https://example.com/api')
    const key = await deriveKey(req, { varies: ['accept'] })
    expect(key).toBe('https://example.com/api\0accept=')
  })

  it('async getKey is awaited', async () => {
    const req = new Request('https://example.com/api')
    const key = await deriveKey(req, {
      getKey: async () => 'async-key',
    })
    expect(key).toBe('async-key')
  })

  it('EC-7: getKey returning non-string throws clear error', async () => {
    const req = new Request('https://example.com/api')
    await expect(deriveKey(req, { getKey: () => 42 as unknown as string })).rejects.toThrow(
      /getKey must return a string, got number/,
    )
  })

  it('EC-6: getKey returning string is trusted (no URL validation on override path)', async () => {
    const req = new Request('https://example.com/api')
    const key = await deriveKey(req, { getKey: () => '::not-a-url::' })
    expect(key).toBe('::not-a-url::')
  })

  it('sortQuery=false preserves order', async () => {
    const req = new Request('https://example.com/api?z=1&a=2')
    const key = await deriveKey(req, { sortQuery: false })
    expect(key).toBe('https://example.com/api?z=1&a=2')
  })

  it('custom excludeQuery overrides default list', async () => {
    const req = new Request('https://example.com/api?utm_source=email&sessionId=x')
    const key = await deriveKey(req, { excludeQuery: ['sessionId'] })
    // utm_source should NOT be excluded (we replaced the default list)
    expect(key).toContain('utm_source=email')
    expect(key).not.toContain('sessionId')
  })
})
