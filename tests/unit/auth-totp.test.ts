import { describe, it, expect } from 'vitest'
import { generateTotp, verifyTotp, generateTotpSecret, totpUri } from '../../packages/theo/src/server/auth-totp.js'

/**
 * T6.2 — RFC 6238 TOTP primitive.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc6238
 *
 * Appendix B test vectors — SHA-1, 8 digits, secret = ASCII "12345678901234567890"
 *   T=59           → 94287082
 *   T=1111111109   → 07081804
 *   T=1111111111   → 14050471
 *   T=1234567890   → 89005924
 *   T=2000000000   → 69279037
 */

const RFC_SECRET_ASCII = '12345678901234567890'
function rfcSecret(): Uint8Array {
  return new TextEncoder().encode(RFC_SECRET_ASCII)
}

describe('T6.2 — RFC 6238 Appendix B test vectors', () => {
  it('T=59 → 94287082', async () => {
    const code = await generateTotp({ secret: rfcSecret(), digits: 8, time: 59 * 1000 })
    expect(code).toBe('94287082')
  })

  it('T=1111111109 → 07081804', async () => {
    const code = await generateTotp({ secret: rfcSecret(), digits: 8, time: 1111111109 * 1000 })
    expect(code).toBe('07081804')
  })

  it('T=1111111111 → 14050471', async () => {
    const code = await generateTotp({ secret: rfcSecret(), digits: 8, time: 1111111111 * 1000 })
    expect(code).toBe('14050471')
  })

  it('T=1234567890 → 89005924', async () => {
    const code = await generateTotp({ secret: rfcSecret(), digits: 8, time: 1234567890 * 1000 })
    expect(code).toBe('89005924')
  })

  it('T=2000000000 → 69279037', async () => {
    const code = await generateTotp({ secret: rfcSecret(), digits: 8, time: 2000000000 * 1000 })
    expect(code).toBe('69279037')
  })

  it('T=20000000000 → 65353130 (large counter — 64-bit handling)', async () => {
    const code = await generateTotp({ secret: rfcSecret(), digits: 8, time: 20000000000 * 1000 })
    expect(code).toBe('65353130')
  })
})

/**
 * RFC 6238 §3 minimum secret length (16 bytes / 128 bits). Smaller secrets
 * MUST throw at generation time — the function is a safety gate, not a silent
 * pass-through.
 */
describe('T6.2 — secret entropy enforcement', () => {
  it('generateTotpSecret(bytes < 16) throws (RFC 6238 §3 minimum)', () => {
    expect(() => generateTotpSecret(8)).toThrow(/16/)
    expect(() => generateTotpSecret(15)).toThrow(/16/)
  })

  it('generateTotpSecret(16) is the boundary — accepted', () => {
    const s = generateTotpSecret(16)
    expect(s.length).toBe(16)
  })
})

describe('T6.2 — generateTotp', () => {
  it('default digits = 6, length = 6', async () => {
    const code = await generateTotp({ secret: rfcSecret() })
    expect(code.length).toBe(6)
    expect(/^\d{6}$/.test(code)).toBe(true)
  })
})

describe('T6.2 — verifyTotp', () => {
  it('accepts current-window code', async () => {
    const secret = rfcSecret()
    const t = Date.now()
    const code = await generateTotp({ secret, time: t })
    expect(await verifyTotp(code, { secret, time: t })).toBe(true)
  })

  it('accepts prev-window code when window=1 (drift tolerance)', async () => {
    const secret = rfcSecret()
    const t = Date.now()
    const codePrev = await generateTotp({ secret, time: t - 30 * 1000 })
    expect(await verifyTotp(codePrev, { secret, time: t, window: 1 })).toBe(true)
  })

  it('rejects far-drift code (window=1, drift=4 steps)', async () => {
    const secret = rfcSecret()
    const t = Date.now()
    const codeFar = await generateTotp({ secret, time: t - 120 * 1000 })
    expect(await verifyTotp(codeFar, { secret, time: t, window: 1 })).toBe(false)
  })

  it('EC: non-digit token → false (no crash)', async () => {
    expect(await verifyTotp('abc123', { secret: rfcSecret() })).toBe(false)
  })

  it('EC: wrong-length token → false', async () => {
    expect(await verifyTotp('12345', { secret: rfcSecret() })).toBe(false)
  })
})

describe('T6.2 — generateTotpSecret + totpUri', () => {
  it('generateTotpSecret default 20 bytes', () => {
    const s = generateTotpSecret()
    expect(s.length).toBe(20)
  })

  it('totpUri format: otpauth://totp/<encoded label>?secret=...&issuer=...', () => {
    const s = new Uint8Array([0x12, 0x34, 0x56, 0x78])
    const uri = totpUri({ secret: s, issuer: 'TheoApp', account: 'alice@example.com' })
    // Label is fully URI-encoded — colon becomes %3A, @ becomes %40
    expect(uri).toMatch(/^otpauth:\/\/totp\/TheoApp%3Aalice%40example\.com\?/)
    expect(uri).toContain('secret=')
    expect(uri).toContain('issuer=TheoApp')
  })
})
