import { describe, it, expect } from 'vitest'
import { generateRouteManifest } from '../../packages/theo/src/router/generate.js'
import type { RouteNode } from '../../packages/theo/src/router/types.js'

/**
 * Regression for nextjs-maturity T1.6.
 *
 * Original bug (previous session): the route manifest emitted
 *   `const Page_X = lazy(() => import(...))`
 * for every route. At hydration time, React rendered the outer Suspense
 * fallback (null) while the lazy chunks loaded, REPLACING the SSR DOM —
 * which made React fall back to client-only render and lose every
 * onClick handler.
 *
 * The fix uses static `import X from '...'` for every route component.
 * Trade-off: bigger initial bundle (Phase 4 of this plan re-introduces
 * code-splitting with an SSR-aware preload safeguard).
 *
 * These tests pin the static-import shape so a casual "let's add lazy()
 * back for code-splitting" PR fails loudly instead of silently breaking
 * hydration.
 */

function makeTree(): RouteNode {
  return {
    segment: '',
    path: '',
    children: [],
    page: '/app/page.tsx',
    layout: '/app/layout.tsx',
    error: '/app/error.tsx',
    loading: '/app/loading.tsx',
    notFound: '/app/not-found.tsx',
  }
}

describe('T1.6 — Route manifest uses static imports, never lazy()', () => {
  it('output contains zero `lazy(` calls', () => {
    const out = generateRouteManifest(makeTree())
    expect(out.includes('lazy(')).toBe(false)
  })

  it('output does not import lazy from react', () => {
    const out = generateRouteManifest(makeTree())
    // Imports `React, { Suspense }` — Suspense is still needed for loading.tsx
    expect(out).toMatch(/import React, \{ Suspense \} from 'react'/)
    expect(out).not.toMatch(/\blazy\b/)
  })

  it('emits one static `import X from` line per route file', () => {
    const tree = makeTree()
    const out = generateRouteManifest(tree)
    // tree above has 5 route files (page, layout, error, loading, notFound)
    const importLines = out.match(/^import [A-Z][a-zA-Z_]+ from '/gm) ?? []
    expect(importLines).toHaveLength(5)
  })

  it('Suspense is still imported (needed by loading.tsx wrapping)', () => {
    const out = generateRouteManifest(makeTree())
    expect(out).toContain('Suspense')
  })

  it('regression: future PR adding lazy() back to manifest fails this test', () => {
    // Belt-and-suspenders sanity. If anyone reverts generate.ts to use
    // lazy() this will fail.
    const out = generateRouteManifest(makeTree())
    expect(out).not.toContain('lazy(()')
    expect(out).not.toContain('() => import(')
  })
})
