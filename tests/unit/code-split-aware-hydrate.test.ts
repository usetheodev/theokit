import { describe, it, expect } from 'vitest'
import { generateRouteManifest } from '../../packages/theo/src/router/generate.js'
import { generateEntryClient } from '../../packages/theo/src/router/entry.js'
import type { RouteNode } from '../../packages/theo/src/router/types.js'

/**
 * Phase 4 — Code-splitting + matchRoutes safeguard (EC-3).
 *
 * The goal: per-route lazy loading WITHOUT re-introducing the hydration
 * bug we fixed last session. The recipe (per the plan + EC-3 review):
 *
 *   1. generate.ts emits React.lazy() for PAGES (per-route code split).
 *   2. Layouts / errors / loading / not-found stay STATIC (always-needed).
 *   3. A `__theoPreloadMap` is exported, keyed by route path.
 *   4. entry-client computes the matched routes via `matchRoutes(routes,
 *      location.pathname)` (NOT a server hint — EC-3 safeguard against
 *      URL-drift races) and awaits the preload promises BEFORE calling
 *      `hydrateRoot`. By then the React.lazy modules are resolved, so
 *      no Suspense fallback fires during hydration → DOM matches SSR.
 *   5. Preload has a 1500ms timeout — on slow networks the framework
 *      falls back to client-only render instead of breaking the page.
 */

function singlePageTree(): RouteNode {
  return {
    segment: '',
    path: '',
    children: [],
    page: '/app/page.tsx',
    layout: '/app/layout.tsx',
    error: undefined,
    loading: undefined,
    notFound: undefined,
  }
}

function multiPageTree(): RouteNode {
  return {
    segment: '',
    path: '',
    children: [
      {
        segment: 'conversations',
        path: 'conversations',
        children: [],
        page: '/app/conversations/page.tsx',
        layout: undefined,
        error: undefined,
        loading: undefined,
        notFound: undefined,
      },
      {
        segment: 'settings',
        path: 'settings',
        children: [],
        page: '/app/settings/page.tsx',
        layout: undefined,
        error: undefined,
        loading: undefined,
        notFound: undefined,
      },
    ],
    page: '/app/page.tsx',
    layout: '/app/layout.tsx',
    error: undefined,
    loading: undefined,
    notFound: undefined,
  }
}

describe('Phase 4 — generate.ts emits lazy() for pages', () => {
  it('Given a single-page tree, When the manifest is generated, Then the page uses React.lazy', () => {
    const out = generateRouteManifest(singlePageTree())
    expect(out).toMatch(/React\.lazy\(\s*\(\)\s*=>\s*import\(/)
  })

  it('Given a multi-page tree, When the manifest is generated, Then EVERY page uses React.lazy', () => {
    const out = generateRouteManifest(multiPageTree())
    const lazyCount = (out.match(/React\.lazy\(/g) ?? []).length
    expect(lazyCount).toBeGreaterThanOrEqual(3) // root page + conversations + settings
  })

  it('Given a tree with a layout, When the manifest is generated, Then the layout stays a STATIC import', () => {
    const out = generateRouteManifest(singlePageTree())
    // Layout must remain `import X from '/app/layout.tsx'` — NOT lazy.
    expect(out).toMatch(/import\s+Layout_root\s+from\s+['"]\/app\/layout\.tsx['"]/)
    expect(out).not.toMatch(/React\.lazy.*\/app\/layout\.tsx/)
  })
})

describe('Phase 4 — preload map for client-driven hydration', () => {
  it('Given a tree with N pages, When the manifest is generated, Then __theoPreloadMap exports an entry per page', () => {
    const out = generateRouteManifest(multiPageTree())
    expect(out).toMatch(/export\s+const\s+__theoPreloadMap/)
    // Each route path is a key in the map.
    expect(out).toContain("'/'")
    expect(out).toContain("'/conversations'")
    expect(out).toContain("'/settings'")
  })

  it('Each preload map entry is a function returning an import() promise', () => {
    const out = generateRouteManifest(singlePageTree())
    // Pattern: `() => import('/app/page.tsx')` somewhere inside the preload map block.
    expect(out).toMatch(/__theoPreloadMap[\s\S]*?\(\s*\)\s*=>\s*import\(['"]\/app\/page\.tsx['"]/)
  })

  it('Routes without pages do NOT appear in the preload map (only pages can be preloaded)', () => {
    // Synthesize a tree with a layout-only intermediate node.
    const tree: RouteNode = {
      segment: '',
      path: '',
      children: [
        {
          segment: 'admin',
          path: 'admin',
          children: [
            {
              segment: 'users',
              path: 'users',
              children: [],
              page: '/app/admin/users/page.tsx',
              layout: undefined,
              error: undefined,
              loading: undefined,
              notFound: undefined,
            },
          ],
          page: undefined,
          layout: '/app/admin/layout.tsx',
          error: undefined,
          loading: undefined,
          notFound: undefined,
        },
      ],
      page: '/app/page.tsx',
      layout: undefined,
      error: undefined,
      loading: undefined,
      notFound: undefined,
    }
    const out = generateRouteManifest(tree)
    // The intermediate /admin (layout-only) must NOT be a preload key.
    expect(out).toMatch(/'\/admin\/users'/)
    expect(out).not.toMatch(/'\/admin'\s*:/)
  })
})

describe('Phase 4 — entry-client awaits preloads with matchRoutes safeguard', () => {
  it('Given SSR mode, When the entry-client is generated, Then it imports matchRoutes from react-router', () => {
    const out = generateEntryClient(true)
    expect(out).toMatch(/import\s+\{[^}]*\bmatchRoutes\b/)
  })

  it('entry-client calls matchRoutes(routes, location.pathname) — does NOT trust a server hint', () => {
    const out = generateEntryClient(true)
    // EC-3 safeguard: re-match on the client to avoid URL-drift races.
    expect(out).toMatch(/matchRoutes\(routes,\s*(?:window\.)?location\.pathname/)
    // We must NOT read a window-attached SSR hint for the IDs.
    expect(out).not.toMatch(/window\.__theoMatchedRouteIds/)
  })

  it('entry-client awaits Promise.all of preload entries BEFORE hydrateRoot', () => {
    const out = generateEntryClient(true)
    // The hydration CALL must come AFTER the preload await. We match
    // `hydrateRoot(` (the call) — not the bare identifier which appears
    // earlier in the import line.
    const hydrateCallIdx = out.indexOf('hydrateRoot(')
    const promiseAllIdx = out.indexOf('Promise.all')
    expect(promiseAllIdx).toBeGreaterThan(-1)
    expect(hydrateCallIdx).toBeGreaterThan(promiseAllIdx)
  })

  it('entry-client wires a 1500ms timeout on the preload step (EC-3 safeguard)', () => {
    const out = generateEntryClient(true)
    expect(out).toMatch(/1500/)
    // The fallback path should mention rendering / hydrating anyway.
    expect(out.toLowerCase()).toMatch(/timeout|fallback/)
  })

  it('Given non-SSR mode (CSR-only), When entry-client is generated, Then no preload await is emitted', () => {
    const out = generateEntryClient(false)
    // CSR-only: React.lazy + Suspense fallback is acceptable, no SSR
    // hydration mismatch risk. No preload needed.
    expect(out).not.toMatch(/Promise\.all\([\s\S]*__theoPreloadMap/)
  })
})

describe('Phase 4 — backward compatibility', () => {
  it('The manifest still imports React and Suspense (Suspense needed for lazy fallback)', () => {
    const out = generateRouteManifest(singlePageTree())
    expect(out).toMatch(/import\s+React,\s*\{\s*Suspense\s*\}\s*from\s+['"]react['"]/)
  })

  it('Outlet is still imported when any layout is present', () => {
    const out = generateRouteManifest(singlePageTree())
    expect(out).toContain("import { Outlet } from 'react-router'")
  })

  it('Layouts still wrap with children: <Outlet /> (regression — black page fix from 2026-05-18)', () => {
    const out = generateRouteManifest(singlePageTree())
    expect(out).toMatch(/createElement\(\s*\w*Layout\w*\s*,\s*\{\s*children:\s*React\.createElement\(Outlet\)\s*\}\s*\)/)
  })
})
