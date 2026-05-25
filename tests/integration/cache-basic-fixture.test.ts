import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const FIXTURE_DIR = resolve(__dirname, '../../fixtures/cache-basic')

/**
 * Integration test for fixtures/cache-basic.
 * Verifies the fixture is well-formed + the public API is importable from theokit/server.
 *
 * NOTE: this does NOT boot a dev server (out of scope for unit/integration tests).
 * The fixture is intended to be booted manually OR by a future Playwright spec
 * (Phase 8 of caching-and-revalidation-plan).
 */
describe('fixtures/cache-basic — structure + import smoke', () => {
  it('has all expected files', async () => {
    const files = [
      'package.json',
      'theo.config.ts',
      'app/page.tsx',
      'server/routes/users.ts',
      'server/routes/admin-revalidate.ts',
      'server/lib/stripe.ts',
      'README.md',
    ]
    for (const f of files) {
      const content = await readFile(resolve(FIXTURE_DIR, f), 'utf8')
      expect(content.length, `${f} should be non-empty`).toBeGreaterThan(0)
    }
  })

  it('theo.config.ts declares cache.enabled: true', async () => {
    const config = await readFile(resolve(FIXTURE_DIR, 'theo.config.ts'), 'utf8')
    expect(config).toMatch(/enabled:\s*true/)
    expect(config).toMatch(/storage:\s*'memory'/)
    expect(config).toMatch(/routeRules/)
  })

  it('users.ts uses defineCachedRoute with tags', async () => {
    const route = await readFile(resolve(FIXTURE_DIR, 'server/routes/users.ts'), 'utf8')
    expect(route).toMatch(/defineCachedRoute/)
    expect(route).toMatch(/tags:\s*\[['"]users['"]\]/)
    expect(route).toMatch(/maxAge:\s*5/)
  })

  it('admin-revalidate.ts uses revalidateTag + revalidatePath', async () => {
    const route = await readFile(resolve(FIXTURE_DIR, 'server/routes/admin-revalidate.ts'), 'utf8')
    expect(route).toMatch(/revalidateTag/)
    expect(route).toMatch(/revalidatePath/)
  })

  it('stripe.ts uses defineCachedFunction with dynamic tags', async () => {
    const lib = await readFile(resolve(FIXTURE_DIR, 'server/lib/stripe.ts'), 'utf8')
    expect(lib).toMatch(/defineCachedFunction/)
    expect(lib).toMatch(/name:\s*['"]stripe-subs['"]/)
    expect(lib).toMatch(/tags:\s*\(userId\)/) // dynamic tags as function
  })

  it('README documents all 5 scenarios', async () => {
    const readme = await readFile(resolve(FIXTURE_DIR, 'README.md'), 'utf8')
    expect(readme).toMatch(/defineCachedRoute/)
    expect(readme).toMatch(/route rule/i)
    expect(readme).toMatch(/revalidateTag/)
    expect(readme).toMatch(/defineCachedFunction/)
    expect(readme).toMatch(/bypassWhen/)
  })

  it('all 5 cache primitives importable from theokit/server', async () => {
    const mod = await import('../../packages/theo/src/server/index.js')
    expect(typeof mod.defineCachedRoute).toBe('function')
    expect(typeof mod.defineCachedFunction).toBe('function')
    expect(typeof mod.revalidateTag).toBe('function')
    expect(typeof mod.revalidatePath).toBe('function')
    expect(typeof mod.updateTag).toBe('function')
    expect(typeof mod.InMemoryCacheAdapter).toBe('function')
    expect(typeof mod.createCacheEngine).toBe('function')
  })
})
