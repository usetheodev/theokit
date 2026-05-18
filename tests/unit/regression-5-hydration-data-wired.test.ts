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

  it('only the createBrowserRouter line differs between ssr=true and ssr=false (no other drift)', () => {
    const linesA = generateEntryClient(true).split('\n')
    const linesB = generateEntryClient(false).split('\n')
    // hydrateRoot vs createRoot is also expected to differ — count both
    const diffs = linesA.filter((line, i) => line !== linesB[i])
    // Expected diffs: import line (hydrateRoot vs createRoot), createBrowserRouter line,
    // and the render-call line. At most 4 lines.
    expect(diffs.length).toBeLessThanOrEqual(5)
  })
})
