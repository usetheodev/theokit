import { describe, it, expect, beforeEach } from 'vitest'
import { scanRoutes } from 'theokit'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tempBase: string
let appDir: string

beforeEach(() => {
  tempBase = join(tmpdir(), `theo-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  appDir = join(tempBase, 'app')
  mkdirSync(appDir, { recursive: true })
})

function touch(relativePath: string, content = 'export default {}') {
  const full = join(appDir, relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

describe('scanRoutes', () => {
  it('should return root node with page set for single page', () => {
    touch('page.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.path).toBe('/')
    expect(tree.page).toContain('page.tsx')
  })

  it('should find child routes', () => {
    touch('page.tsx')
    touch('about/page.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].path).toBe('/about')
    expect(tree.children[0].page).toContain('about/page.tsx')
  })

  it('should detect root layout', () => {
    touch('layout.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.layout).toContain('layout.tsx')
  })

  it('should detect nested layout', () => {
    touch('dashboard/layout.tsx')
    touch('dashboard/page.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.children[0].layout).toContain('dashboard/layout.tsx')
  })

  it('should detect error file', () => {
    touch('error.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.error).toContain('error.tsx')
  })

  it('should detect loading file', () => {
    touch('loading.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.loading).toContain('loading.tsx')
  })

  it('should detect not-found file', () => {
    touch('not-found.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.notFound).toContain('not-found.tsx')
  })

  it('should ignore _private directories', () => {
    touch('_components/button.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.children).toHaveLength(0)
  })

  it('should ignore .hidden directories', () => {
    touch('.git/config')
    const tree = scanRoutes(appDir)
    expect(tree.children).toHaveLength(0)
  })

  it('should ignore non-route files', () => {
    writeFileSync(join(appDir, 'utils.ts'), 'export {}')
    const tree = scanRoutes(appDir)
    expect(tree.page).toBeUndefined()
  })

  it('should handle empty directory', () => {
    const tree = scanRoutes(appDir)
    expect(tree.page).toBeUndefined()
    expect(tree.children).toHaveLength(0)
  })

  it('should handle deep nesting', () => {
    touch('a/b/page.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.children[0].children[0].path).toBe('/a/b')
  })

  it('should throw for non-existent directory', () => {
    expect(() => scanRoutes('/nonexistent/path')).toThrow('does not exist')
  })

  it('should prioritize .tsx over .ts (EC-2)', () => {
    touch('page.tsx', 'export default function A() {}')
    touch('page.ts', 'export default function B() {}')
    const tree = scanRoutes(appDir)
    expect(tree.page).toContain('page.tsx')
  })

  it('should include layout-only directory (EC-5)', () => {
    touch('admin/layout.tsx')
    const tree = scanRoutes(appDir)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].layout).toContain('admin/layout.tsx')
    expect(tree.children[0].page).toBeUndefined()
  })
})
