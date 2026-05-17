import { describe, it, expect } from 'vitest'
import { renderDenoEntry } from '../../packages/theo/src/adapters/deno-deploy.js'

describe('Deno adapter — WS wiring (T3.3)', () => {
  it('template imports createDenoWsBridge from theokit/adapters/ws-shim', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain("from 'npm:theokit/adapters/ws-shim'")
    expect(out).toContain('createDenoWsBridge')
  })

  it('template detects upgrade requests', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain("upgrade")
    expect(out).toMatch(/websocket/i)
  })

  it('template invokes denoWs bridge handle(request) when upgrade detected', () => {
    const out = renderDenoEntry(8000)
    expect(out).toMatch(/\.handle\(request\)/)
  })

  it('template scans WS routes at cold start', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain('scanWebSocketRoutes')
  })
})
