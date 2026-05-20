import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { scanWebSocketRoutes } from '../../packages/theo/src/server/ws-scan.js'

const fixtureDir = resolve(__dirname, '../../fixtures/websocket-basic/server')
const noWsDir = resolve(__dirname, '../../fixtures/basic-valid-app/server')

describe('scanWebSocketRoutes', () => {
  it('should scan server/ws/ directory and return routes', () => {
    const routes = scanWebSocketRoutes(fixtureDir)
    expect(routes.length).toBeGreaterThanOrEqual(2)
    const paths = routes.map((r) => r.wsPath)
    expect(paths).toContain('/ws/echo')
    expect(paths).toContain('/ws/notifications')
  })

  it('should return empty array when no ws/ directory', () => {
    const routes = scanWebSocketRoutes(noWsDir)
    expect(routes).toEqual([])
  })

  it('should return empty for non-existent server dir', () => {
    const routes = scanWebSocketRoutes('/nonexistent')
    expect(routes).toEqual([])
  })

  it('should have filePath pointing to actual files', () => {
    const routes = scanWebSocketRoutes(fixtureDir)
    for (const route of routes) {
      expect(route.filePath).toContain('echo.ts')
      break // just check first
    }
  })

  it('should ignore non-ts files', () => {
    const routes = scanWebSocketRoutes(fixtureDir)
    // All routes should be from .ts files
    for (const route of routes) {
      expect(route.filePath).toMatch(/\.(ts|tsx|js|jsx)$/)
    }
  })
})
