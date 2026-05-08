import { describe, it, expect } from 'vitest'
import { theoPlugin } from 'theo'

describe('theoPlugin', () => {
  it('should resolve /@theo/entry-client to internal virtual ID', () => {
    const plugin = theoPlugin('/tmp/project')
    const resolved = (plugin as any).resolveId('/@theo/entry-client')
    expect(resolved).toBe('\0@theo/entry-client')
  })

  it('should load virtual module with React entry code', () => {
    const plugin = theoPlugin('/tmp/project')
    const code = (plugin as any).load('\0@theo/entry-client')
    expect(code).toContain('createRoot')
    expect(code).toContain('app/page.tsx')
    expect(code).toContain('React.createElement')
  })

  it('should return undefined for non-virtual module IDs (resolveId)', () => {
    const plugin = theoPlugin('/tmp/project')
    const resolved = (plugin as any).resolveId('./some-file.ts')
    expect(resolved).toBeUndefined()
  })

  it('should return undefined from load for non-virtual module IDs', () => {
    const plugin = theoPlugin('/tmp/project')
    const code = (plugin as any).load('./some-file.ts')
    expect(code).toBeUndefined()
  })

  it('should use forward slashes in import paths (EC-3)', () => {
    const plugin = theoPlugin('/tmp/project')
    const code = (plugin as any).load('\0@theo/entry-client') as string
    expect(code).not.toContain('\\')
  })
})
