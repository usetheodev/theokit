import { describe, it, expect } from 'vitest'
import { generateEntryClient } from 'theo'

describe('generateEntryClient', () => {
  it('should contain createBrowserRouter', () => {
    expect(generateEntryClient()).toContain('createBrowserRouter')
  })

  it('should import from /@theo/route-manifest', () => {
    expect(generateEntryClient()).toContain('/@theo/route-manifest')
  })

  it('should import from react-router', () => {
    expect(generateEntryClient()).toContain('react-router')
  })

  it('should use React.createElement (no JSX)', () => {
    const code = generateEntryClient()
    expect(code).toContain('React.createElement')
    expect(code).not.toContain('<Router')
  })

  it('should have Suspense wrapper', () => {
    expect(generateEntryClient()).toContain('Suspense')
  })

  it('should be deterministic', () => {
    expect(generateEntryClient()).toBe(generateEntryClient())
  })
})
