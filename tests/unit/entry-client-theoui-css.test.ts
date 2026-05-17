import { describe, it, expect } from 'vitest'
import { generateEntryClient } from '../../packages/theo/src/router/entry.js'
import { generateEntryServer } from '../../packages/theo/src/router/entry-server.js'

describe('generateEntryClient — TheoUI CSS injection (T2.2)', () => {
  it('imports styles.css when theoUi enabled (default fonts: bundled)', () => {
    const out = generateEntryClient(false, { theoUi: { fonts: 'bundled' } })
    expect(out).toContain("import '@usetheo/ui/styles.css'")
  })

  it('imports fonts.css bundled by default', () => {
    const out = generateEntryClient(false, { theoUi: { fonts: 'bundled' } })
    expect(out).toContain("import '@usetheo/ui/fonts.css'")
  })

  it('imports fonts-cdn.css when configured', () => {
    const out = generateEntryClient(false, { theoUi: { fonts: 'cdn' } })
    expect(out).toContain("import '@usetheo/ui/fonts-cdn.css'")
    expect(out).not.toContain("import '@usetheo/ui/fonts.css'")
  })

  it('no @usetheo/ui imports when theoUi disabled', () => {
    const out = generateEntryClient(false)
    expect(out).not.toContain('@usetheo/ui')
  })

  it('preserves SSR variant (hydrateRoot) when theoUi enabled', () => {
    const out = generateEntryClient(true, { theoUi: { fonts: 'bundled' } })
    expect(out).toContain('hydrateRoot')
    expect(out).toContain("import '@usetheo/ui/styles.css'")
  })
})

describe('generateEntryServer — never emits CSS even with theoUi enabled (EC-2)', () => {
  it('does NOT import styles.css even when streaming + ssr', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).not.toContain('@usetheo/ui/styles.css')
    expect(out).not.toContain('@usetheo/ui/fonts.css')
    expect(out).not.toContain('.css')
  })

  it('does NOT import anything from @usetheo/ui (server has no client UI)', () => {
    const out = generateEntryServer()
    expect(out).not.toContain('@usetheo/ui')
  })
})
