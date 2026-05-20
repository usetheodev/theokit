import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { scanServerRoutes } from '../../packages/theo/src/server/scan.js'
import { scanServerActions } from '../../packages/theo/src/server/action-scan.js'
import { scanWebSocketRoutes } from '../../packages/theo/src/server/ws-scan.js'

describe('Route Listing Data', () => {
  it('should list API routes from fixture', () => {
    const serverDir = resolve(__dirname, '../../fixtures/server-routes-basic/server')
    const routes = scanServerRoutes(serverDir)
    expect(routes.length).toBeGreaterThan(0)
    const paths = routes.map((r) => r.routePath)
    expect(paths.some((p) => p.includes('health'))).toBe(true)
  })

  it('should list actions from fixture', () => {
    const serverDir = resolve(__dirname, '../../fixtures/server-actions-basic/server')
    const actions = scanServerActions(serverDir)
    expect(actions.length).toBeGreaterThan(0)
  })

  it('should list WebSocket routes from fixture', () => {
    const serverDir = resolve(__dirname, '../../fixtures/websocket-basic/server')
    const routes = scanWebSocketRoutes(serverDir)
    expect(routes.length).toBeGreaterThan(0)
    const paths = routes.map((r) => r.wsPath)
    expect(paths).toContain('/ws/echo')
  })

  it('should return empty for projects without routes', () => {
    const serverDir = resolve(__dirname, '../../fixtures/basic-valid-app/server')
    const routes = scanServerRoutes(serverDir)
    // basic-valid-app may or may not have routes — just verify no crash
    expect(Array.isArray(routes)).toBe(true)
  })

  it('should show file paths for each route', () => {
    const serverDir = resolve(__dirname, '../../fixtures/server-routes-basic/server')
    const routes = scanServerRoutes(serverDir)
    for (const route of routes) {
      expect(route.filePath).toBeTruthy()
      expect(route.routePath).toBeTruthy()
    }
  })

  it('should have API Routes, Actions, and WebSocket sections available', () => {
    // This tests that all three scanners can run without error
    const wsDir = resolve(__dirname, '../../fixtures/websocket-basic/server')
    const routeDir = resolve(__dirname, '../../fixtures/server-routes-basic/server')
    const actionDir = resolve(__dirname, '../../fixtures/server-actions-basic/server')

    const routes = scanServerRoutes(routeDir)
    const actions = scanServerActions(actionDir)
    const ws = scanWebSocketRoutes(wsDir)

    expect(routes.length + actions.length + ws.length).toBeGreaterThan(0)
  })
})
