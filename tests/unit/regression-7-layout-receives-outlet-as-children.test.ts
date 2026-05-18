import { describe, it, expect } from 'vitest'
import { generateRouteManifest } from '../../packages/theo/src/router/generate.js'
import type { RouteNode } from '../../packages/theo/src/router/types.js'

/**
 * Regression for live demo bug 2026-05-18.
 *
 * Symptom: scaffold default rendered a black page in the browser. React mounted
 * (the TheoUIProvider's Toaster appeared), but the page itself did not render.
 *
 * Root cause: the default template's `app/layout.tsx` follows the Next.js App
 * Router convention and returns `children` from a destructured prop:
 *
 *     export default function RootLayout({ children }) {
 *       return children
 *     }
 *
 * But the generated route manifest passed the layout to react-router as
 * `React.createElement(Layout_root)` with no `children` prop. react-router
 * renders nested routes via `<Outlet />` — it does not pass `children`. So
 * the layout received `children = undefined` and rendered nothing.
 *
 * Fix: the manifest now wraps the layout call to pass `<Outlet />` as
 * `children`: `React.createElement(Layout_root, { children: React.createElement(Outlet) })`.
 * This works for BOTH conventions — a Next.js-style layout uses `{children}`;
 * a react-router-style layout that already calls `<Outlet />` directly ignores
 * the prop entirely (same Outlet element either way).
 */

function makeTree(layout: string | undefined): RouteNode {
  return {
    segment: '',
    path: '',
    children: [],
    page: '/app/page.tsx',
    layout,
    error: undefined,
    loading: undefined,
    notFound: undefined,
  }
}

describe('regression — layout receives <Outlet /> as children prop', () => {
  it('Given a tree with a layout, When the manifest is generated, Then the layout call includes children: Outlet', () => {
    const tree = makeTree('/app/layout.tsx')
    const out = generateRouteManifest(tree)
    expect(out).toMatch(/createElement\(\s*\w*Layout\w*\s*,\s*\{\s*children:\s*React\.createElement\(Outlet\)\s*\}\s*\)/)
  })

  it('Given a tree without a layout, When the manifest is generated, Then no Outlet-wrap is emitted at the root', () => {
    const tree = makeTree(undefined)
    const out = generateRouteManifest(tree)
    expect(out).not.toMatch(/createElement\(\s*\w*Layout\w*\s*,/)
  })

  it('Given a tree with a layout, When inspecting the output, Then Outlet is imported from react-router', () => {
    const tree = makeTree('/app/layout.tsx')
    const out = generateRouteManifest(tree)
    expect(out).toContain("import { Outlet } from 'react-router'")
  })

  it('regression — Next-style layout ({ children }) must receive a defined children prop', () => {
    const tree = makeTree('/app/layout.tsx')
    const out = generateRouteManifest(tree)
    // Negative assertion: the pre-fix shape `createElement(LayoutVar)` with no
    // second argument MUST NOT appear (it would re-introduce the black-page bug).
    expect(out).not.toMatch(/createElement\(\w*Layout\w*\)/)
  })
})
