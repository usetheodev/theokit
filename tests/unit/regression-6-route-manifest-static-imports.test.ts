import { describe, it, expect } from 'vitest'
import { generateRouteManifest } from '../../packages/theo/src/router/generate.js'
import type { RouteNode } from '../../packages/theo/src/router/types.js'

/**
 * Regression for nextjs-maturity T1.6 — UPDATED for Phase 4 (2026-05-18).
 *
 * History:
 *   - Pre-Phase-4: pages were emitted as `lazy()` which broke hydration
 *     (outer Suspense fired during hydrate, SSR DOM wiped, onClick lost).
 *     T1.6 originally pinned "no lazy() anywhere".
 *   - Phase 4: code-splitting comes back, but only for PAGES (lazy + a
 *     preload map keyed by route path). Hydration is safe because the
 *     entry-client awaits the matched-route preloads BEFORE hydrate
 *     (EC-3 safeguard — see tests/unit/code-split-aware-hydrate.test.ts).
 *
 * What remains static:
 *   - Layouts (always needed at boot, regardless of route)
 *   - Errors / loading / not-found (defensive paths, must be available)
 *
 * What is lazy:
 *   - Pages (per-route code split)
 *
 * These tests pin THAT invariant so a future PR that lazy()s the layout
 * (which would re-introduce the hydration bug) fails loudly.
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

describe('T1.6 (post-Phase-4) — layouts/errors/loading stay static; pages are lazy', () => {
  it('layout is imported with `import X from` — NOT lazy', () => {
    const out = generateRouteManifest(makeTree())
    expect(out).toMatch(/import\s+Layout_root\s+from\s+['"]\/app\/layout\.tsx['"]/)
    expect(out).not.toMatch(/React\.lazy\([^)]*\/app\/layout\.tsx/)
  })

  it('error / loading / not-found are imported statically', () => {
    const out = generateRouteManifest(makeTree())
    expect(out).toMatch(/import\s+Error_root\s+from\s+['"]\/app\/error\.tsx['"]/)
    expect(out).toMatch(/import\s+Loading_root\s+from\s+['"]\/app\/loading\.tsx['"]/)
    expect(out).toMatch(/import\s+NotFound_root\s+from\s+['"]\/app\/not-found\.tsx['"]/)
  })

  it('pages use React.lazy() (Phase 4 — code-splitting back)', () => {
    const out = generateRouteManifest(makeTree())
    expect(out).toMatch(/React\.lazy\(\s*\(\)\s*=>\s*import\(['"]\/app\/page\.tsx['"]\s*\)\s*\)/)
  })

  it('Suspense is imported (needed because lazy() pages can suspend)', () => {
    const out = generateRouteManifest(makeTree())
    expect(out).toMatch(/import\s+React,\s*\{\s*Suspense\s*\}/)
  })

  it('regression: future PR lazying the LAYOUT fails this test (would re-introduce hydration bug)', () => {
    const out = generateRouteManifest(makeTree())
    // Layout-level lazy() would re-introduce the hydrate-then-Suspense
    // bug because the layout renders unconditionally on every route.
    expect(out).not.toMatch(/React\.lazy[^)]*layout/i)
  })

  it('emits the __theoPreloadMap export (Phase 4)', () => {
    const out = generateRouteManifest(makeTree())
    expect(out).toMatch(/export\s+const\s+__theoPreloadMap/)
  })
})
