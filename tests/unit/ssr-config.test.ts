import { describe, it, expect } from 'vitest'
import { theoConfigSchema } from '../../packages/theo/src/config/schema.js'
import { generateEntryClient } from '../../packages/theo/src/router/entry.js'

describe('SSR Config', () => {
  it('should accept ssr: true', () => {
    const result = theoConfigSchema.safeParse({ ssr: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.ssr).toBe(true)
  })

  it('should default ssr to false', () => {
    const result = theoConfigSchema.parse({})
    expect(result.ssr).toBe(false)
  })

  it('should reject ssr as string', () => {
    const result = theoConfigSchema.safeParse({ ssr: 'yes' })
    expect(result.success).toBe(false)
  })

  it('should not affect other fields when ssr added', () => {
    const result = theoConfigSchema.parse({ port: 4000 })
    expect(result.port).toBe(4000)
    expect(result.ssr).toBe(false)
  })
})

describe('Entry Client SSR mode', () => {
  it('should use createRoot when ssr=false (default)', () => {
    const code = generateEntryClient()
    expect(code).toContain('createRoot')
    expect(code).not.toContain('hydrateRoot')
  })

  it('should use hydrateRoot when ssr=true', () => {
    const code = generateEntryClient(true)
    expect(code).toContain('hydrateRoot')
    expect(code).not.toContain('createRoot')
  })

  it('should import RouterProvider in both modes', () => {
    expect(generateEntryClient()).toContain('RouterProvider')
    expect(generateEntryClient(true)).toContain('RouterProvider')
  })

  it('should import from react-dom/client in both modes', () => {
    expect(generateEntryClient()).toContain('react-dom/client')
    expect(generateEntryClient(true)).toContain('react-dom/client')
  })
})

describe('HTML split for SSR (EC-2)', () => {
  it('should split on standard root div', () => {
    const html = '<html><body><div id="root"></div><script></script></body></html>'
    const match = html.match(/<div id=["']root["'][^>]*>/)
    expect(match).not.toBeNull()
    const idx = html.indexOf(match![0]) + match![0].length
    expect(html.slice(0, idx)).toContain('<div id="root">')
    expect(html.slice(idx)).toContain('</div>')
  })

  it('should split on root div with extra attributes', () => {
    const html = '<html><body><div id="root" class="app" data-theme="dark"></div></body></html>'
    const match = html.match(/<div id=["']root["'][^>]*>/)
    expect(match).not.toBeNull()
    expect(match![0]).toContain('class="app"')
  })

  it('should split on root div with single quotes', () => {
    const html = "<html><body><div id='root'></div></body></html>"
    const match = html.match(/<div id=["']root["'][^>]*>/)
    expect(match).not.toBeNull()
  })
})
