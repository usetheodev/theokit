import { describe, it, expect } from 'vitest'
import { renderCloudflareWorkerEntry } from '../../packages/theo/src/adapters/cloudflare.js'

describe('renderCloudflareWorkerEntry — template (T2.1)', () => {
  it('imports from theokit/adapters/web-shim', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toContain("from 'theokit/adapters/web-shim'")
  })

  it('imports execute pipeline from theokit/server', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toContain('scanServerRoutes')
    expect(out).toContain('matchRoute')
    expect(out).toContain('executeRoute')
    expect(out).toContain("from 'theokit/server'")
  })

  it('does NOT contain inline shim definitions (writeHead/setHeader inline)', () => {
    const out = renderCloudflareWorkerEntry()
    // The old approach had an inline `req = { method, url, headers, ... }`
    // plain-object shim. We want createWebShim instead.
    expect(out).not.toMatch(/socket: \{ remoteAddress/)
    expect(out).not.toMatch(/_headers: \{\}/)
  })

  it('caches routes at cold start (no scan per request)', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toMatch(/routesCache|let.+routes/)
  })

  it('emits requirements header block (EC-3)', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toMatch(/nodejs_compat/)
    expect(out).toMatch(/dependencies/)
    expect(out).toMatch(/theokit/)
  })

  it('uses Web Standard fetch handler signature', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toContain('fetch(request')
    expect(out).toContain('export default')
  })
})

describe('cloudflare wrangler.toml emission', () => {
  it('includes nodejs_compat flag (EC-3)', async () => {
    const { renderWranglerToml } = await import('../../packages/theo/src/adapters/cloudflare.js')
    const toml = renderWranglerToml()
    expect(toml).toContain('nodejs_compat')
  })
})
