import { describe, it, expect } from 'vitest'
import { VALID_TARGETS } from '../../packages/theo/src/adapters/types.js'
import { nodeAdapter } from '../../packages/theo/src/adapters/node.js'

describe('Adapter Interface', () => {
  it('should have valid targets list', () => {
    expect(VALID_TARGETS).toContain('node')
    expect(VALID_TARGETS).toContain('vercel')
    expect(VALID_TARGETS).toContain('cloudflare')
    expect(VALID_TARGETS).toContain('static')
    expect(VALID_TARGETS).toContain('bun')
    expect(VALID_TARGETS).toContain('deno-deploy')
    expect(VALID_TARGETS).toContain('netlify')
    expect(VALID_TARGETS).toContain('aws-lambda')
  })

  it('should reject invalid target', () => {
    expect(VALID_TARGETS.includes('aws' as never)).toBe(false)
  })

  it('node adapter should have correct name', () => {
    expect(nodeAdapter.name).toBe('node')
  })

  it('node adapter should have build function', () => {
    expect(typeof nodeAdapter.build).toBe('function')
  })
})
