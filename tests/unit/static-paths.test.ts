import { describe, it, expect } from 'vitest'
import {
  parseSegment,
  collectStaticPaths,
  StaticPathsRequiredError,
} from '../../packages/theo/src/adapters/static-paths.js'
import type { RouteNode } from '../../packages/theo/src/router/types.js'

const stubLoader = (db: Record<string, unknown>) => async (file: string) => {
  if (file in db) return db[file] as Awaited<ReturnType<Parameters<typeof collectStaticPaths>[1]['loadStaticPaths']>>
  return null
}

describe('parseSegment', () => {
  it('classifies a static segment', () => {
    expect(parseSegment('blog')).toEqual({ kind: 'static' })
  })

  it('classifies a named dynamic segment', () => {
    expect(parseSegment('[id]')).toEqual({ kind: 'param', name: 'id' })
  })

  it('classifies a catch-all segment', () => {
    expect(parseSegment('[...slug]')).toEqual({ kind: 'catch-all', name: 'slug' })
  })

  it('treats unbracketed segment as static even if name resembles param', () => {
    expect(parseSegment('id')).toEqual({ kind: 'static' })
  })
})

describe('collectStaticPaths', () => {
  const appDir = '/app'

  it('returns a single index path for a root-only tree', async () => {
    const tree: RouteNode = { segment: '', path: '/', page: '/app/page.tsx', children: [] }
    const result = await collectStaticPaths(tree, {
      appDir,
      loadStaticPaths: stubLoader({}),
    })
    expect(result).toEqual([{ url: '/', filename: 'index.html' }])
  })

  it('returns one path per static page in a nested tree', async () => {
    const tree: RouteNode = {
      segment: '',
      path: '/',
      page: '/app/page.tsx',
      children: [
        { segment: 'about', path: '/about', page: '/app/about/page.tsx', children: [] },
        { segment: 'contact', path: '/contact', page: '/app/contact/page.tsx', children: [] },
      ],
    }
    const result = await collectStaticPaths(tree, {
      appDir,
      loadStaticPaths: stubLoader({}),
    })
    expect(result).toEqual([
      { url: '/', filename: 'index.html' },
      { url: '/about', filename: 'about.html' },
      { url: '/contact', filename: 'contact.html' },
    ])
  })

  it('resolves a [id] dynamic route via static-paths', async () => {
    const tree: RouteNode = {
      segment: '',
      path: '/',
      children: [
        {
          segment: 'blog',
          path: '/blog',
          children: [
            {
              segment: '[id]',
              path: '/blog/[id]',
              page: '/app/blog/[id]/page.tsx',
              children: [],
            },
          ],
        },
      ],
    }
    const result = await collectStaticPaths(tree, {
      appDir,
      loadStaticPaths: stubLoader({
        '/app/blog/[id]/static-paths.ts': [{ id: '1' }, { id: '2' }, { id: '3' }],
      }),
    })
    expect(result).toEqual([
      { url: '/blog/1', filename: 'blog/1.html' },
      { url: '/blog/2', filename: 'blog/2.html' },
      { url: '/blog/3', filename: 'blog/3.html' },
    ])
  })

  it('resolves a [...slug] catch-all route via static-paths (EC-3)', async () => {
    const tree: RouteNode = {
      segment: '',
      path: '/',
      children: [
        {
          segment: 'docs',
          path: '/docs',
          children: [
            {
              segment: '[...slug]',
              path: '/docs/[...slug]',
              page: '/app/docs/[...slug]/page.tsx',
              children: [],
            },
          ],
        },
      ],
    }
    const result = await collectStaticPaths(tree, {
      appDir,
      loadStaticPaths: stubLoader({
        '/app/docs/[...slug]/static-paths.ts': [
          { slug: ['intro'] },
          { slug: ['guides', 'auth'] },
        ],
      }),
    })
    expect(result).toEqual([
      { url: '/docs/intro', filename: 'docs/intro.html' },
      { url: '/docs/guides/auth', filename: 'docs/guides/auth.html' },
    ])
  })

  it('throws when [id] route has no static-paths.ts', async () => {
    const tree: RouteNode = {
      segment: '',
      path: '/',
      children: [
        {
          segment: '[id]',
          path: '/[id]',
          page: '/app/[id]/page.tsx',
          children: [],
        },
      ],
    }
    await expect(
      collectStaticPaths(tree, {
        appDir,
        loadStaticPaths: stubLoader({}),
      })
    ).rejects.toThrow(StaticPathsRequiredError)
  })

  it('throws when [...slug] route has no static-paths.ts (EC-3)', async () => {
    const tree: RouteNode = {
      segment: '',
      path: '/',
      children: [
        {
          segment: '[...slug]',
          path: '/[...slug]',
          page: '/app/[...slug]/page.tsx',
          children: [],
        },
      ],
    }
    await expect(
      collectStaticPaths(tree, {
        appDir,
        loadStaticPaths: stubLoader({}),
      })
    ).rejects.toThrow(/\[\.\.\.slug\]/)
  })

  it('skips nodes without a page (layout-only intermediate nodes)', async () => {
    const tree: RouteNode = {
      segment: '',
      path: '/',
      page: '/app/page.tsx',
      children: [
        {
          segment: 'dashboard',
          path: '/dashboard',
          layout: '/app/dashboard/layout.tsx',
          children: [
            { segment: 'inbox', path: '/dashboard/inbox', page: '/app/dashboard/inbox/page.tsx', children: [] },
          ],
        },
      ],
    }
    const result = await collectStaticPaths(tree, {
      appDir,
      loadStaticPaths: stubLoader({}),
    })
    expect(result).toEqual([
      { url: '/', filename: 'index.html' },
      { url: '/dashboard/inbox', filename: 'dashboard/inbox.html' },
    ])
  })
})
