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
})
