import { describe, it, expect } from 'vitest'
import { renderBunEntry } from '../../packages/theo/src/adapters/bun.js'

describe('Bun adapter — WS wiring (T3.2)', () => {
  it('template imports createBunWsBridge from theokit/adapters/ws-shim', () => {
    const out = renderBunEntry(3000)
    expect(out).toContain("from 'theokit/adapters/ws-shim'")
    expect(out).toContain('createBunWsBridge')
  })

  it('template scans server/ws/ at cold start', () => {
    const out = renderBunEntry(3000)
    expect(out).toContain('scanWebSocketRoutes')
  })

  it('template configures Bun.serve with websocket field when WS routes exist', () => {
    const out = renderBunEntry(3000)
    expect(out).toMatch(/websocket:/)
  })

  it('template still handles HTTP requests (does not break existing path)', () => {
    const out = renderBunEntry(3000)
    expect(out).toContain('Bun.serve')
    expect(out).toContain('fetch')
  })
})
