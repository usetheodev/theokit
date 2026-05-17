import { describe, it, expect } from 'vitest'
import { generateEntryClient } from '../../packages/theo/src/router/entry.js'

describe('generateEntryClient — TheoUIProvider wrap (T2.3)', () => {
  it('imports TheoUIProvider from @usetheo/ui when enabled', () => {
    const out = generateEntryClient(false, {
      theoUi: { fonts: 'bundled', theme: 'violet-forge' },
    })
    expect(out).toContain("import { TheoUIProvider } from '@usetheo/ui'")
  })

  it('wraps RouterProvider in TheoUIProvider when enabled', () => {
    const out = generateEntryClient(false, {
      theoUi: { fonts: 'bundled', theme: 'violet-forge' },
    })
    expect(out).toContain('TheoUIProvider')
    // The render call should nest RouterProvider inside TheoUIProvider
    const tuiIdx = out.indexOf('TheoUIProvider')
    const rpIdx = out.indexOf('RouterProvider', tuiIdx)
    expect(rpIdx).toBeGreaterThan(tuiIdx)
  })

  it('uses default theme violet-forge when not specified', () => {
    const out = generateEntryClient(false, { theoUi: { fonts: 'bundled' } })
    expect(out).toContain('violet-forge')
  })

  it('respects custom theme', () => {
    const out = generateEntryClient(false, {
      theoUi: { fonts: 'bundled', theme: 'noir' },
    })
    expect(out).toContain('noir')
  })

  it('does NOT wrap when theoUi disabled', () => {
    const out = generateEntryClient(false)
    expect(out).not.toContain('TheoUIProvider')
    expect(out).not.toContain('@usetheo/ui')
  })

  it('preserves SSR variant (hydrateRoot) with TheoUIProvider wrap', () => {
    const out = generateEntryClient(true, {
      theoUi: { fonts: 'bundled', theme: 'violet-forge' },
    })
    expect(out).toContain('hydrateRoot')
    expect(out).toContain('TheoUIProvider')
  })
})
