/**
 * T3.1 — Route manifest unit tests.
 *
 * Covers:
 *  - buildRouteManifest: RouteNode tree → flat RouteManifest with layout chains
 *  - matchActiveRoute: pathname → matched route + chain
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { describe, expect, it } from 'vitest'
import { buildRouteManifest } from '../../packages/theo/src/devtools/server-side/route-manifest.js'
import { matchActiveRoute } from '../../packages/theo/src/devtools/hooks/useActiveRoute.js'
import type { RouteNode } from '../../packages/theo/src/router/types.js'

function leaf(segment: string, page: string, opts: Partial<RouteNode> = {}): RouteNode {
  return { segment, path: '/' + segment, page, children: [], ...opts }
}

function node(segment: string, opts: Partial<RouteNode>, ...children: RouteNode[]): RouteNode {
  return { segment, path: '/' + segment, children, ...opts }
}

describe('buildRouteManifest', () => {
  it('flattens single page into one route', () => {
    const tree: RouteNode = node('', { layout: '/app/layout.tsx', page: '/app/page.tsx' })
    const manifest = buildRouteManifest(tree)
    expect(manifest.routes).toHaveLength(1)
    expect(manifest.routes[0]!.path).toBe('/')
    expect(manifest.routes[0]!.absoluteFilePath).toBe('/app/page.tsx')
    // Root's own layout is not in the chain for its own leaf — layouts cascade DOWN to children
    expect(manifest.routes[0]!.layoutChain).toEqual([])
  })

  it('nested route inherits parent layout in chain', () => {
    const tree: RouteNode = node('', { layout: '/app/layout.tsx' },
      leaf('about', '/app/about/page.tsx'),
    )
    const manifest = buildRouteManifest(tree)
    expect(manifest.routes).toHaveLength(1)
    expect(manifest.routes[0]!.path).toBe('/about')
    expect(manifest.routes[0]!.layoutChain).toEqual(['/app/layout.tsx'])
  })

  it('multiple nested levels accumulate layouts in chain', () => {
    const tree: RouteNode = node('', { layout: '/app/layout.tsx' },
      node('blog', { layout: '/app/blog/layout.tsx', page: '/app/blog/page.tsx' },
        leaf('post', '/app/blog/post/page.tsx'),
      ),
    )
    const manifest = buildRouteManifest(tree)
    expect(manifest.routes).toHaveLength(2)
    const blog = manifest.routes.find((r) => r.path === '/blog')!
    expect(blog.layoutChain).toEqual(['/app/layout.tsx'])
    const post = manifest.routes.find((r) => r.path === '/blog/post')!
    expect(post.layoutChain).toEqual(['/app/layout.tsx', '/app/blog/layout.tsx'])
  })

  it('records hasLoading / hasError / hasNotFound flags', () => {
    const tree: RouteNode = node('', {},
      leaf('users', '/app/users/page.tsx', {
        loading: '/app/users/loading.tsx',
        error: '/app/users/error.tsx',
        notFound: '/app/users/not-found.tsx',
      }),
    )
    const manifest = buildRouteManifest(tree)
    const u = manifest.routes[0]!
    expect(u.hasLoading).toBe(true)
    expect(u.hasError).toBe(true)
    expect(u.hasNotFound).toBe(true)
  })

  it('skips nodes without page', () => {
    const tree: RouteNode = node('', { layout: '/app/layout.tsx' },
      // intermediate dir with no page — should NOT appear in routes
      node('api', {},
        leaf('users', '/app/api/users/page.tsx'),
      ),
    )
    const manifest = buildRouteManifest(tree)
    expect(manifest.routes).toHaveLength(1)
    expect(manifest.routes[0]!.path).toBe('/api/users')
  })
})

describe('matchActiveRoute', () => {
  const manifest = buildRouteManifest(
    node('', { layout: '/app/layout.tsx', page: '/app/page.tsx' },
      leaf('about', '/app/about/page.tsx'),
      node('blog', { layout: '/app/blog/layout.tsx', page: '/app/blog/page.tsx' },
        leaf('post', '/app/blog/post/page.tsx'),
      ),
    ),
  )

  it('exact match on root', () => {
    const m = matchActiveRoute('/', manifest)
    expect(m).not.toBeNull()
    expect(m!.path).toBe('/')
    expect(m!.chain).toContain('/app/page.tsx')
  })

  it('exact match on nested route', () => {
    const m = matchActiveRoute('/about', manifest)
    expect(m).not.toBeNull()
    expect(m!.path).toBe('/about')
    expect(m!.chain).toContain('/app/about/page.tsx')
    expect(m!.chain).toContain('/app/layout.tsx')
  })

  it('exact match handles trailing slash gracefully', () => {
    const m = matchActiveRoute('/about/', manifest)
    expect(m).not.toBeNull()
    expect(m!.path).toBe('/about')
  })

  it('longest-prefix match for nested route', () => {
    const m = matchActiveRoute('/blog/post', manifest)
    expect(m).not.toBeNull()
    expect(m!.path).toBe('/blog/post')
  })

  it('falls back to longest-prefix when pathname has extra segments', () => {
    const m = matchActiveRoute('/blog/anything-else', manifest)
    expect(m).not.toBeNull()
    expect(m!.path).toBe('/blog')
  })

  it('returns null when nothing matches', () => {
    const empty = buildRouteManifest({ segment: 'x', path: '/x', children: [] })
    const m = matchActiveRoute('/nothing', empty)
    expect(m).toBeNull()
  })
})
