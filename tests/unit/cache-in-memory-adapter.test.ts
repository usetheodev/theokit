import { describe, it, expect, beforeEach } from 'vitest'

import { InMemoryCacheAdapter } from '../../packages/theo/src/cache/in-memory-adapter.js'
import type { CacheEntry } from '../../packages/theo/src/cache/storage-adapter.js'

function makeEntry(tags: string[] = []): CacheEntry {
  return {
    body: 'x',
    status: 200,
    headers: [],
    storedAt: Date.now(),
    maxAge: 60,
    swr: 0,
    tags,
  }
}

describe('InMemoryCacheAdapter', () => {
  let adapter: InMemoryCacheAdapter
  beforeEach(() => {
    adapter = new InMemoryCacheAdapter()
  })

  it('set then get returns entry', async () => {
    const entry = makeEntry()
    await adapter.set('a', entry)
    expect(await adapter.get('a')).toEqual(entry)
  })

  it('get missing returns undefined', async () => {
    expect(await adapter.get('nope')).toBeUndefined()
  })

  it('delete returns true when existed', async () => {
    await adapter.set('a', makeEntry())
    expect(await adapter.delete('a')).toBe(true)
    expect(await adapter.get('a')).toBeUndefined()
  })

  it('delete returns false when missing', async () => {
    expect(await adapter.delete('nope')).toBe(false)
  })

  it('LRU evicts oldest at capacity', async () => {
    const small = new InMemoryCacheAdapter({ maxEntries: 2 })
    await small.set('a', makeEntry())
    await small.set('b', makeEntry())
    await small.set('c', makeEntry())
    expect(await small.get('a')).toBeUndefined()
    expect(await small.get('b')).toBeDefined()
    expect(await small.get('c')).toBeDefined()
  })

  it('LRU bumps on get', async () => {
    const small = new InMemoryCacheAdapter({ maxEntries: 2 })
    await small.set('a', makeEntry())
    await small.set('b', makeEntry())
    await small.get('a') // bump a to MRU
    await small.set('c', makeEntry())
    expect(await small.get('b')).toBeUndefined() // b evicted
    expect(await small.get('a')).toBeDefined()
    expect(await small.get('c')).toBeDefined()
  })

  it('deleteByTag removes all entries with tag', async () => {
    await adapter.set('k1', makeEntry(['user:1', 'prod']))
    await adapter.set('k2', makeEntry(['user:1']))
    await adapter.set('k3', makeEntry(['prod']))
    const removed = await adapter.deleteByTag('user:1')
    expect(removed).toBe(2)
    expect(await adapter.get('k1')).toBeUndefined()
    expect(await adapter.get('k2')).toBeUndefined()
    expect(await adapter.get('k3')).toBeDefined()
  })

  it('deleteByTag cleans other tags for removed keys', async () => {
    await adapter.set('k1', makeEntry(['x', 'y']))
    await adapter.set('k2', makeEntry(['y']))
    await adapter.deleteByTag('x')
    // After deleting by 'x', k1 is gone. Tag 'y' should NOT still reference k1.
    const removedY = await adapter.deleteByTag('y')
    expect(removedY).toBe(1) // only k2 left under 'y'
  })

  it('deleteByTag unknown returns 0', async () => {
    expect(await adapter.deleteByTag('nope')).toBe(0)
  })

  it('set overwrite cleans old tags from index', async () => {
    await adapter.set('k', makeEntry(['old']))
    await adapter.set('k', makeEntry(['new']))
    // 'old' tag should no longer reference 'k'
    expect(await adapter.deleteByTag('old')).toBe(0)
    expect(await adapter.deleteByTag('new')).toBe(1)
  })

  it('size reports count', async () => {
    await adapter.set('a', makeEntry())
    await adapter.set('b', makeEntry())
    await adapter.set('c', makeEntry())
    expect(await adapter.size()).toBe(3)
  })

  it('clear empties both entries and tag index', async () => {
    await adapter.set('k', makeEntry(['x']))
    await adapter.clear()
    expect(await adapter.size()).toBe(0)
    expect(await adapter.deleteByTag('x')).toBe(0)
  })

  it('keys() iterator yields all keys', async () => {
    await adapter.set('a', makeEntry())
    await adapter.set('b', makeEntry())
    await adapter.set('c', makeEntry())
    const keys: string[] = []
    for await (const k of adapter.keys()) keys.push(k)
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(['a', 'b', 'c'])
  })

  it('keys() prefix filter', async () => {
    await adapter.set('foo:1', makeEntry())
    await adapter.set('foo:2', makeEntry())
    await adapter.set('bar:1', makeEntry())
    const keys: string[] = []
    for await (const k of adapter.keys('foo:')) keys.push(k)
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(['foo:1', 'foo:2'])
  })

  it('LRU eviction also cleans tag index (no leak)', async () => {
    const small = new InMemoryCacheAdapter({ maxEntries: 2 })
    await small.set('a', makeEntry(['shared']))
    await small.set('b', makeEntry(['shared']))
    await small.set('c', makeEntry(['shared']))
    // 'a' evicted. Tag 'shared' should only reference b + c now.
    const removed = await small.deleteByTag('shared')
    expect(removed).toBe(2)
  })
})
