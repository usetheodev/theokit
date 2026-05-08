import { describe, it, expect, beforeEach } from 'vitest'
import { theoPlugin } from 'theo'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let fixtureDir: string

beforeEach(() => {
  fixtureDir = join(tmpdir(), `theo-plugin-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(fixtureDir, 'app'), { recursive: true })
  writeFileSync(join(fixtureDir, 'app/page.tsx'), 'export default function P() { return null }')
})

describe('theoPlugin', () => {
  it('should resolve /@theo/entry-client to internal virtual ID', () => {
    const plugin = theoPlugin(fixtureDir)
    const resolved = (plugin as any).resolveId('/@theo/entry-client')
    expect(resolved).toBe('\0@theo/entry-client')
  })

  it('should resolve /@theo/route-manifest to internal virtual ID', () => {
    const plugin = theoPlugin(fixtureDir)
    const resolved = (plugin as any).resolveId('/@theo/route-manifest')
    expect(resolved).toBe('\0@theo/route-manifest')
  })

  it('should load entry-client with router code', () => {
    const plugin = theoPlugin(fixtureDir)
    const code = (plugin as any).load('\0@theo/entry-client') as string
    expect(code).toContain('createBrowserRouter')
    expect(code).toContain('RouterProvider')
    expect(code).toContain('/@theo/route-manifest')
    expect(code).toContain('React.createElement')
  })

  it('should load route-manifest with scanned routes', () => {
    const plugin = theoPlugin(fixtureDir)
    const code = (plugin as any).load('\0@theo/route-manifest') as string
    expect(code).toContain('export const routes')
    expect(code).toContain('page.tsx')
  })

  it('should return undefined for non-virtual module IDs (resolveId)', () => {
    const plugin = theoPlugin(fixtureDir)
    expect((plugin as any).resolveId('./some-file.ts')).toBeUndefined()
  })

  it('should return undefined from load for non-virtual module IDs', () => {
    const plugin = theoPlugin(fixtureDir)
    expect((plugin as any).load('./some-file.ts')).toBeUndefined()
  })

  it('should not contain backslashes in generated code', () => {
    const plugin = theoPlugin(fixtureDir)
    const code = (plugin as any).load('\0@theo/entry-client') as string
    expect(code).not.toContain('\\')
  })
})
