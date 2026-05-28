import { describe, it, expect } from 'vitest'
import { generateRouteManifest } from 'theokit'
import type { RouteNode } from 'theokit'

function makeNode(overrides: Partial<RouteNode> = {}): RouteNode {
  return { segment: '', path: '/', children: [], ...overrides }
}

describe('generateRouteManifest', () => {
  it('should generate route with index:true for single root page', () => {
    const code = generateRouteManifest(makeNode({ page: '/app/page.tsx' }))
    expect(code).toContain('index: true')
    expect(code).toContain('Page_root')
  })

  it('should generate Layout with Outlet for page+layout', () => {
    const code = generateRouteManifest(
      makeNode({ page: '/app/page.tsx', layout: '/app/layout.tsx' }),
    )
    expect(code).toContain('Layout_root')
    expect(code).toContain('Outlet')
  })

  it('should generate children for nested routes', () => {
    const code = generateRouteManifest(
      makeNode({
        page: '/app/page.tsx',
        children: [
          makeNode({ segment: 'about', path: '/about', page: '/app/about/page.tsx' }),
          makeNode({ segment: 'dashboard', path: '/dashboard', page: '/app/dashboard/page.tsx' }),
        ],
      }),
    )
    expect(code).toContain("path: 'about'")
    expect(code).toContain("path: 'dashboard'")
  })

  it('should generate errorElement for error file', () => {
    const code = generateRouteManifest(makeNode({ page: '/app/page.tsx', error: '/app/error.tsx' }))
    expect(code).toContain('errorElement')
    expect(code).toContain('Error_root')
  })

  it('should generate wildcard * for not-found', () => {
    const code = generateRouteManifest(
      makeNode({ page: '/app/page.tsx', notFound: '/app/not-found.tsx' }),
    )
    expect(code).toContain("path: '*'")
    expect(code).toContain('NotFound_root')
  })

  it('should generate Suspense for loading', () => {
    const code = generateRouteManifest(
      makeNode({ page: '/app/page.tsx', loading: '/app/loading.tsx' }),
    )
    expect(code).toContain('Suspense')
    expect(code).toContain('Loading_root')
  })

  it('should generate nested layout structure', () => {
    const code = generateRouteManifest(
      makeNode({
        layout: '/app/layout.tsx',
        page: '/app/page.tsx',
        children: [
          makeNode({
            segment: 'dashboard',
            path: '/dashboard',
            layout: '/app/dashboard/layout.tsx',
            page: '/app/dashboard/page.tsx',
          }),
        ],
      }),
    )
    expect(code).toContain('Layout_root')
    expect(code).toContain('Layout_dashboard')
  })

  it('should use React.createElement, no JSX', () => {
    const code = generateRouteManifest(
      makeNode({ page: '/app/page.tsx', layout: '/app/layout.tsx' }),
    )
    expect(code).toContain('React.createElement')
    expect(code).not.toContain('<Page')
    expect(code).not.toContain('<Layout')
  })

  it('should use forward slashes in import paths', () => {
    const code = generateRouteManifest(makeNode({ page: '/app/page.tsx' }))
    expect(code).not.toContain('\\')
  })

  it('should create safe variable names for hyphenated segments (EC-3)', () => {
    const code = generateRouteManifest(
      makeNode({
        children: [
          makeNode({
            segment: 'my-dashboard',
            path: '/my-dashboard',
            page: '/app/my-dashboard/page.tsx',
          }),
        ],
      }),
    )
    expect(code).toContain('Page_my_dashboard')
    expect(code).not.toMatch(/Page_my-dashboard/)
  })

  it('should handle empty tree gracefully', () => {
    const code = generateRouteManifest(makeNode())
    expect(code).toContain('export const routes')
  })

  it('should generate Outlet import when layout exists (EC-1)', () => {
    const code = generateRouteManifest(
      makeNode({ layout: '/app/layout.tsx', page: '/app/page.tsx' }),
    )
    expect(code).toContain("import { Outlet } from 'react-router'")
  })

  it('should NOT import Outlet when no layout exists', () => {
    const code = generateRouteManifest(makeNode({ page: '/app/page.tsx' }))
    expect(code).not.toContain('Outlet')
  })
})
