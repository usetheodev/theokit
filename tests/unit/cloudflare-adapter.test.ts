import { describe, it, expect } from 'vitest'
import { cloudflareAdapter } from '../../packages/theo/src/adapters/cloudflare.js'

describe('Cloudflare Adapter', () => {
  it('should have correct name', () => {
    expect(cloudflareAdapter.name).toBe('cloudflare')
  })

  it('should have build function', () => {
    expect(typeof cloudflareAdapter.build).toBe('function')
  })
})
