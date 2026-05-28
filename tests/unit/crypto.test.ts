import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../packages/theo/src/server/auth/crypto.js'

const SECRET = 'a-very-secure-secret-key-for-testing-purposes-1234'

describe('Crypto: encrypt/decrypt (AES-256-GCM)', () => {
  it('should encrypt and return a non-empty string', async () => {
    const token = await encrypt({ userId: '123' }, SECRET)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('should decrypt to original data (round-trip)', async () => {
    const data = { userId: '123', role: 'admin' }
    const token = await encrypt(data, SECRET)
    const result = await decrypt(token, SECRET)
    expect(result).toEqual(data)
  })

  it('should return null with wrong secret', async () => {
    const token = await encrypt({ userId: '123' }, SECRET)
    const result = await decrypt(token, 'wrong-secret-that-is-long-enough-1234')
    expect(result).toBeNull()
  })

  it('should return null for tampered token', async () => {
    const token = await encrypt({ userId: '123' }, SECRET)
    const tampered = token.slice(0, -5) + 'XXXXX'
    const result = await decrypt(tampered, SECRET)
    expect(result).toBeNull()
  })

  it('should return null for invalid format', async () => {
    const result = await decrypt('not-a-valid-token', SECRET)
    expect(result).toBeNull()
  })

  it('should handle complex nested data', async () => {
    const data = {
      user: { name: 'Alice', permissions: ['read', 'write'] },
      metadata: { loginAt: '2026-01-01T00:00:00Z' },
    }
    const token = await encrypt(data, SECRET)
    const result = await decrypt(token, SECRET)
    expect(result).toEqual(data)
  })

  it('should produce unique tokens for same data (random IV)', async () => {
    const data = { userId: '123' }
    const token1 = await encrypt(data, SECRET)
    const token2 = await encrypt(data, SECRET)
    expect(token1).not.toBe(token2)
  })

  it('should handle empty object', async () => {
    const token = await encrypt({}, SECRET)
    const result = await decrypt(token, SECRET)
    expect(result).toEqual({})
  })
})
