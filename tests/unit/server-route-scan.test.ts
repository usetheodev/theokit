import { describe, it, expect, beforeEach } from 'vitest'
import { scanServerRoutes } from '../../packages/theo/src/server/scan/scan.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let serverDir: string

beforeEach(() => {
  const base = join(
    tmpdir(),
    `theo-server-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  serverDir = join(base, 'server')
  mkdirSync(join(serverDir, 'routes'), { recursive: true })
})

function touch(relativePath: string, content = 'export const GET = { handler: () => ({}) }') {
  const full = join(serverDir, 'routes', relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

describe('scanServerRoutes', () => {
  it('should scan health.ts → /api/health', () => {
    touch('health.ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes).toHaveLength(1)
    expect(routes[0].routePath).toBe('/api/health')
    expect(routes[0].paramNames).toEqual([])
  })

  it('should scan users.ts → /api/users', () => {
    touch('users.ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].routePath).toBe('/api/users')
  })

  it('should scan users/[id].ts → /api/users/:id', () => {
    touch('users/[id].ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].routePath).toBe('/api/users/:id')
    expect(routes[0].paramNames).toEqual(['id'])
  })

  it('should return empty array for empty dir', () => {
    const routes = scanServerRoutes(serverDir)
    expect(routes).toEqual([])
  })

  it('should return empty array for nonexistent dir', () => {
    const routes = scanServerRoutes('/nonexistent/path')
    expect(routes).toEqual([])
  })

  it('should handle nested dirs correctly', () => {
    touch('users.ts')
    touch('users/[id].ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes.length).toBe(2)
  })

  it('should sort static before dynamic', () => {
    touch('users/[id].ts')
    touch('users.ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].routePath).toBe('/api/users')
    expect(routes[1].routePath).toBe('/api/users/:id')
  })

  it('should map index.ts to parent path', () => {
    touch('users/index.ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].routePath).toBe('/api/users')
  })

  it('should handle hyphenated param names (EC-4)', () => {
    touch('[user-id].ts')
    const routes = scanServerRoutes(serverDir)
    expect(routes[0].paramNames).toEqual(['user-id'])
  })
})
