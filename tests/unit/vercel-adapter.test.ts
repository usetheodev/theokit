import { describe, it, expect } from 'vitest'
import { vercelAdapter } from '../../packages/theo/src/adapters/vercel.js'

describe('Vercel Adapter', () => {
  it('should have correct name', () => {
    expect(vercelAdapter.name).toBe('vercel')
  })

  it('should have build function', () => {
    expect(typeof vercelAdapter.build).toBe('function')
  })

  // Note: Full integration test (running actual build) would require
  // a fixture project. These unit tests validate the adapter structure.
  // The adapter's build() runs nodeAdapter.build() first, then generates
  // Vercel output — tested via integration tests with real fixtures.
})
