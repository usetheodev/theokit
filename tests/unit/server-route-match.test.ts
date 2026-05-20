import { describe, it, expect } from 'vitest'
import {
  compilePattern,
  matchRoute,
  type ServerRouteNode,
} from '../../packages/theo/src/server/match.js'

describe('compilePattern', () => {
  it('should match static path', () => {
    const { pattern, paramNames } = compilePattern('/api/health')
    expect(pattern.test('/api/health')).toBe(true)
    expect(paramNames).toEqual([])
  })

  it('should match dynamic path and extract param names', () => {
    const { pattern, paramNames } = compilePattern('/api/users/:id')
    expect(pattern.test('/api/users/123')).toBe(true)
    expect(paramNames).toEqual(['id'])
  })

  it('should reject extra path segments', () => {
    const { pattern } = compilePattern('/api/users/:id')
    expect(pattern.test('/api/users/123/extra')).toBe(false)
  })

  it('should handle multiple params', () => {
    const { pattern, paramNames } = compilePattern('/api/users/:uid/posts/:pid')
    expect(pattern.test('/api/users/abc/posts/def')).toBe(true)
    expect(paramNames).toEqual(['uid', 'pid'])
  })
})

describe('matchRoute', () => {
  const routes: ServerRouteNode[] = [
    {
      filePath: '/health.ts',
      routePath: '/api/health',
      paramNames: [],
      pattern: compilePattern('/api/health').pattern,
    },
    {
      filePath: '/users.ts',
      routePath: '/api/users',
      paramNames: [],
      pattern: compilePattern('/api/users').pattern,
    },
    {
      filePath: '/users/[id].ts',
      routePath: '/api/users/:id',
      ...compilePattern('/api/users/:id'),
    },
  ]

  it('should match static route', () => {
    const result = matchRoute('/api/health', routes)
    expect(result).not.toBeNull()
    expect(result!.route.routePath).toBe('/api/health')
    expect(result!.params).toEqual({})
  })

  it('should match dynamic route with params', () => {
    const result = matchRoute('/api/users/abc', routes)
    expect(result).not.toBeNull()
    expect(result!.params.id).toBe('abc')
  })

  it('should return null for unmatched routes', () => {
    expect(matchRoute('/api/nonexistent', routes)).toBeNull()
  })

  it('should strip query string before matching', () => {
    const result = matchRoute('/api/health?v=1', routes)
    expect(result).not.toBeNull()
  })

  it('should strip trailing slash before matching (EC-3)', () => {
    const result = matchRoute('/api/health/', routes)
    expect(result).not.toBeNull()
  })

  it('should prefer static over dynamic when both could match', () => {
    const result = matchRoute('/api/users', routes)
    expect(result).not.toBeNull()
    expect(result!.route.routePath).toBe('/api/users')
    expect(result!.params).toEqual({})
  })
})
