import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  compilePattern,
  matchRoute,
  type ServerRouteNode,
} from '../../packages/theo/src/server/match.js'
import { scanServerRoutes } from '../../packages/theo/src/server/scan.js'

describe('compilePattern catch-all', () => {
  it('should convert :...slug to (.+) regex', () => {
    const { pattern, paramNames } = compilePattern('/api/docs/:...slug')
    expect(pattern.test('/api/docs/getting-started')).toBe(true)
    expect(pattern.test('/api/docs/guides/advanced/setup')).toBe(true)
    expect(paramNames).toEqual(['slug'])
  })

  it('should NOT match empty path for catch-all', () => {
    const { pattern } = compilePattern('/api/docs/:...slug')
    expect(pattern.test('/api/docs')).toBe(false)
    expect(pattern.test('/api/docs/')).toBe(false)
  })

  it('should store param name without ... prefix', () => {
    const { paramNames } = compilePattern('/api/pages/:...path')
    expect(paramNames).toEqual(['path'])
  })

  it('should still handle regular dynamic params correctly', () => {
    const { pattern, paramNames } = compilePattern('/api/users/:id')
    expect(pattern.test('/api/users/123')).toBe(true)
    expect(pattern.test('/api/users/123/extra')).toBe(false)
    expect(paramNames).toEqual(['id'])
  })

  it('should handle mixed regular and catch-all params', () => {
    const { pattern, paramNames } = compilePattern('/api/users/:id/files/:...path')
    expect(pattern.test('/api/users/42/files/docs/readme.md')).toBe(true)
    expect(paramNames).toEqual(['id', 'path'])
  })
})

describe('matchRoute catch-all', () => {
  function buildRoutes(): ServerRouteNode[] {
    const staticRoute = compilePattern('/api/docs')
    const dynamicRoute = compilePattern('/api/docs/:section')
    const catchAllRoute = compilePattern('/api/docs/:...slug')

    return [
      { filePath: '/docs.ts', routePath: '/api/docs', ...staticRoute },
      { filePath: '/docs/[section].ts', routePath: '/api/docs/:section', ...dynamicRoute },
      { filePath: '/docs/[...slug].ts', routePath: '/api/docs/:...slug', ...catchAllRoute },
    ]
  }

  it('should match single segment with catch-all', () => {
    const routes = buildRoutes()
    const result = matchRoute('/api/docs/intro', routes)
    expect(result).not.toBeNull()
    // Dynamic route should win over catch-all for single segment
    expect(result!.route.routePath).toBe('/api/docs/:section')
    expect(result!.params.section).toBe('intro')
  })

  it('should match multiple segments with catch-all', () => {
    const routes = buildRoutes()
    const result = matchRoute('/api/docs/guides/advanced/setup', routes)
    expect(result).not.toBeNull()
    expect(result!.route.routePath).toBe('/api/docs/:...slug')
    expect(result!.params.slug).toBe('guides/advanced/setup')
  })

  it('should prefer static route over catch-all', () => {
    const routes = buildRoutes()
    const result = matchRoute('/api/docs', routes)
    expect(result).not.toBeNull()
    expect(result!.route.routePath).toBe('/api/docs')
    expect(result!.params).toEqual({})
  })

  it('should prefer dynamic route over catch-all for single segment', () => {
    const routes = buildRoutes()
    const result = matchRoute('/api/docs/overview', routes)
    expect(result).not.toBeNull()
    expect(result!.route.routePath).toBe('/api/docs/:section')
  })
})

describe('scanServerRoutes catch-all', () => {
  let serverDir: string

  beforeEach(() => {
    const base = join(
      tmpdir(),
      `theo-catchall-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    serverDir = join(base, 'server')
    mkdirSync(join(serverDir, 'routes'), { recursive: true })
  })

  function touch(relativePath: string, content = 'export const GET = { handler: () => ({}) }') {
    const full = join(serverDir, 'routes', relativePath)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }

  it('should convert [...slug].ts to :...slug in routePath', () => {
    touch('docs/[...slug].ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes).toHaveLength(1)
    expect(routes[0].routePath).toBe('/api/docs/:...slug')
  })

  it('should sort: static > dynamic > catch-all', () => {
    touch('docs/[...slug].ts')
    touch('docs/[section].ts')
    touch('docs.ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].routePath).toBe('/api/docs')
    expect(routes[1].routePath).toBe('/api/docs/:section')
    expect(routes[2].routePath).toBe('/api/docs/:...slug')
  })

  it('should extract param name without ... prefix', () => {
    touch('pages/[...path].ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].paramNames).toEqual(['path'])
  })
})
