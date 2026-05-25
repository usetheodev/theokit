import { describe, it, expect } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const DOC_PATH = resolve(__dirname, '../../docs/concepts/caching.md')

describe('docs/concepts/caching.md', () => {
  it('exists', async () => {
    const s = await stat(DOC_PATH)
    expect(s.isFile()).toBe(true)
  })

  it('covers all 5 primitives', async () => {
    const content = await readFile(DOC_PATH, 'utf8')
    expect(content).toMatch(/defineCachedRoute/)
    expect(content).toMatch(/defineCachedFunction/)
    expect(content).toMatch(/revalidateTag/)
    expect(content).toMatch(/revalidatePath/)
    expect(content).toMatch(/updateTag/)
  })

  it('mentions all 4 patterns', async () => {
    const content = await readFile(DOC_PATH, 'utf8')
    expect(content).toMatch(/Cache a JSON response/i)
    expect(content).toMatch(/Cache a Stripe API call/i)
    expect(content).toMatch(/Bust user data/i)
    expect(content).toMatch(/Bust by route path/i)
  })

  it('documents accepted edge cases (EC-2/EC-3/EC-4/D7/D9/EC-19)', async () => {
    const content = await readFile(DOC_PATH, 'utf8')
    expect(content).toMatch(/Set-Cookie/i)
    expect(content).toMatch(/cacheErrors/)
    expect(content).toMatch(/maxEntrySize/)
    expect(content).toMatch(/middleware runs AFTER/)
    expect(content).toMatch(/BigInt/)
    expect(content).toMatch(/varies.*cookie|cookie.*varies/i)
  })

  it('has comparison table with other frameworks', async () => {
    const content = await readFile(DOC_PATH, 'utf8')
    expect(content).toMatch(/Next\.js/)
    expect(content).toMatch(/Nitro/)
    expect(content).toMatch(/Astro/)
    expect(content).toMatch(/TanStack/)
  })

  it('shows custom storage adapter recipe (Redis)', async () => {
    const content = await readFile(DOC_PATH, 'utf8')
    expect(content).toMatch(/RedisCacheAdapter/)
    expect(content).toMatch(/CacheStorageAdapter/)
  })

  it('is substantial (>= 200 lines)', async () => {
    const content = await readFile(DOC_PATH, 'utf8')
    const lines = content.split('\n').length
    expect(lines).toBeGreaterThanOrEqual(200)
  })
})
