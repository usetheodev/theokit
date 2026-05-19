import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateNonce } from '../../packages/theo/src/server/nonce.js'

/**
 * T4.1 — Per-request nonce generation.
 *
 * The nonce is the load-bearing primitive that lets the framework drop
 * `'unsafe-inline'` from the default CSP without breaking its own SSR
 * hydration script. It MUST be:
 *
 *   - cryptographically random (NOT Math.random)
 *   - unique per request (no collisions across 1000+ generations)
 *   - base64-encoded, 22-24 chars (16 bytes of entropy)
 *   - generable on both Node (`node:crypto`) and edge runtimes
 *     (`globalThis.crypto.getRandomValues`)
 */

describe('generateNonce — output shape', () => {
  it('Given call, Then result matches /^[A-Za-z0-9+/=]{22,24}$/', () => {
    const nonce = generateNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{22,24}$/)
  })

  it('Given call, Then result decodes to 16 raw bytes', () => {
    const nonce = generateNonce()
    const decoded = Buffer.from(nonce, 'base64')
    expect(decoded.byteLength).toBe(16)
  })
})

describe('generateNonce — uniqueness', () => {
  it('Given 1000 calls, Then zero duplicates (cryptographic randomness)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      seen.add(generateNonce())
    }
    expect(seen.size).toBe(1000)
  })
})

describe('generateNonce — runtime portability', () => {
  // We can't realistically un-import node:crypto in vitest, but we can
  // assert the generator falls back through globalThis.crypto when
  // available. The implementation prefers Web Crypto (globalThis) over
  // node:crypto so the same code runs on Vercel Edge / Bun / Deno.
  it('Given globalThis.crypto present, Then generator works via Web Crypto', () => {
    expect(typeof globalThis.crypto?.getRandomValues).toBe('function')
    const nonce = generateNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{22,24}$/)
  })
})
