import { describe, it, expect } from 'vitest'
import { generateEntryServer } from '../../packages/theo/src/router/entry-server.js'

describe('generateEntryServer', () => {
  const code = generateEntryServer()

  it('should return non-empty string', () => {
    expect(code.length).toBeGreaterThan(0)
  })

  it('should import renderToPipeableStream', () => {
    expect(code).toContain('renderToPipeableStream')
  })

  it('should import createStaticHandler from react-router', () => {
    expect(code).toContain('createStaticHandler')
    expect(code).toContain('react-router')
  })

  it('should import routes from route manifest', () => {
    expect(code).toContain('/@theo/route-manifest')
  })

  it('should export render function', () => {
    expect(code).toContain('export async function render')
  })

  it('should include onShellError handler (EC-1)', () => {
    expect(code).toContain('onShellError')
    expect(code).toContain('reject')
  })

  it('should include StaticRouterProvider', () => {
    expect(code).toContain('StaticRouterProvider')
  })

  it('should handle redirects', () => {
    expect(code).toContain('redirect')
  })

  /**
   * T4.1 — entry-server forwards options.nonce to renderToPipeableStream.
   *
   * React DOM Server reads `nonce` from the options bag and emits it
   * as a `nonce="..."` attribute on every <script> tag it produces
   * (Suspense boundaries, StaticRouterProvider's hydration data
   * script, etc.). Without this, dropping `'unsafe-inline'` from the
   * default CSP in 0.3.0 would block the framework's own hydration
   * script.
   *
   * EC-12: both the single-shot and the streaming variants must
   * thread the nonce.
   */
  it('T4.1 — single-shot entry forwards options.nonce to renderToPipeableStream', () => {
    const single = generateEntryServer({ streaming: false })
    expect(single).toMatch(/renderToPipeableStream\s*\([\s\S]*?nonce:\s*options\.nonce/)
  })

  it('T4.1 — streaming entry forwards options.nonce to renderToPipeableStream', () => {
    const streaming = generateEntryServer({ streaming: true })
    expect(streaming).toMatch(/renderToPipeableStream\s*\([\s\S]*?nonce:\s*options\.nonce/)
  })

  it('T4.1 — streaming entry forwards options.nonce to renderToReadableStream (Web Streams path)', () => {
    const streaming = generateEntryServer({ streaming: true })
    expect(streaming).toMatch(/renderToReadableStream\s*\([\s\S]*?nonce:\s*options\.nonce/)
  })
})
