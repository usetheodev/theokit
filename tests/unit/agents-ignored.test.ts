import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { validateProjectStructure } from 'theokit'
import { scanRoutes } from 'theokit'
import { scanServerRoutes } from '../../packages/theo/src/server/scan/scan.js'

const fixtureDir = resolve(__dirname, '../../fixtures/agents-dir-ignored')

function collectFilePaths(node: Record<string, unknown>): string[] {
  const paths: string[] = []
  if (typeof node.page === 'string') paths.push(node.page)
  if (typeof node.layout === 'string') paths.push(node.layout)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      paths.push(...collectFilePaths(child as Record<string, unknown>))
    }
  }
  return paths
}

describe('agents/ directory is ignored by framework', () => {
  it('should pass validateProjectStructure with agents/ dir present', () => {
    expect(() => validateProjectStructure(fixtureDir)).not.toThrow()
  })

  it('should not include agents/ files in route scan', () => {
    const tree = scanRoutes(resolve(fixtureDir, 'app'))
    const filePaths = collectFilePaths(tree as unknown as Record<string, unknown>)
    // All files should be from app/, none from agents/
    for (const fp of filePaths) {
      expect(fp).toContain('/app/')
      expect(fp).not.toContain('/agents/')
    }
  })

  it('should not include agents/ files in server route scan', () => {
    const routes = scanServerRoutes(resolve(fixtureDir, 'server'))
    for (const route of routes) {
      expect(route.filePath).toContain('/server/')
      expect(route.filePath).not.toContain('/agents/')
    }
  })

  it('should only find known routes from app/ and server/', () => {
    const tree = scanRoutes(resolve(fixtureDir, 'app'))
    expect(tree).toBeDefined()

    const routes = scanServerRoutes(resolve(fixtureDir, 'server'))
    expect(routes.length).toBeGreaterThan(0)
    expect(routes[0].filePath).toContain('health')
  })
})
