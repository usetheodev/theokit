import { describe, it, expect } from 'vitest'
import { renderCloudflareWorkerEntry } from '../../packages/theo/src/adapters/cloudflare.js'

describe('Cloudflare adapter — WS wiring (T3.4)', () => {
  it('template imports createCloudflareWsBridge from theokit/adapters/ws-shim', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toContain("from 'theokit/adapters/ws-shim'")
    expect(out).toContain('createCloudflareWsBridge')
  })

  it('template detects upgrade requests', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toContain('upgrade')
    expect(out).toMatch(/websocket/i)
  })

  it('template scans WS routes at cold start', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toContain('scanWebSocketRoutes')
  })

  it('template returns webSocket upgrade response when wsRoute matched', () => {
    const out = renderCloudflareWorkerEntry()
    expect(out).toMatch(/\.handle\(request\)/)
  })
})
