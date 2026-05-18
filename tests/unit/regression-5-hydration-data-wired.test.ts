import { describe, it, expect } from 'vitest'
import { generateEntryClient } from '../../packages/theo/src/router/entry.js'

/**
 * Regression for nextjs-maturity T1.5.
 *
 * Original bug (previous session): `createBrowserRouter(routes)` was called
 * without `hydrationData`. The client router booted fresh, ignored the
 * server-emitted `window.__staticRouterHydrationData`, and refetched
 * everything — causing a DOM mismatch with the SSR-rendered HTML.
 *
 * The fix wires `hydrationData: window.__staticRouterHydrationData` ONLY
 * when ssr=true. These tests pin both branches.
 */

describe('T1.5 — Entry-client passes hydrationData to createBrowserRouter (ssr=true only)', () => {
  it('ssr=true emits the hydrationData option', () => {
    const out = generateEntryClient(true)
    expect(out).toContain(
      'createBrowserRouter(routes, { hydrationData: window.__staticRouterHydrationData })',
    )
  })

  it('ssr=false emits a plain createBrowserRouter(routes) call', () => {
    const out = generateEntryClient(false)
    expect(out).toContain('createBrowserRouter(routes)')
    expect(out).not.toContain('hydrationData')
  })

  it('createBrowserRouter is called in BOTH modes', () => {
    expect(generateEntryClient(true)).toContain('createBrowserRouter(')
    expect(generateEntryClient(false)).toContain('createBrowserRouter(')
  })

  it('the SSR-only branch carries the hydrate flow (hydrationData + matchRoutes preload)', () => {
    // Post-Phase-4 (2026-05-18): the SSR entry-client is deliberately
    // richer than the CSR one — it imports `matchRoutes`, awaits the
    // matched-route preloads, and only then calls hydrateRoot. The CSR
    // path stays a simple synchronous render.
    //
    // We assert the shape rather than counting line diffs, since the
    // line count grows with the preload block.
    const ssr = generateEntryClient(true)
    const csr = generateEntryClient(false)

    // SSR-only signals
    expect(ssr).toContain('hydrationData')
    expect(ssr).toContain('matchRoutes')
    expect(ssr).toContain('Promise.all')

    // CSR must NOT have those (no SSR HTML to hydrate against)
    expect(csr).not.toContain('hydrationData')
    expect(csr).not.toContain('matchRoutes')
    expect(csr).not.toContain('Promise.all')
  })
})
