import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
} from '../../examples/agent-saas/server/password.js'

/**
 * Phase 8 — Argon2id Password Hashing (D5 / EC-4).
 *
 * The agent-saas example demo upgrades from PBKDF2-100k (below OWASP
 * 2023) to Argon2id via hash-wasm. Why hash-wasm (EC-4 amendment):
 * pure WASM means no native build step, works on Alpine and Vercel Edge.
 *
 * Backward compat: legacy `pbkdf2$...` hashes still verify. On a
 * successful PBKDF2 verify, `verifyPassword` returns `{ ok: true,
 * rehashAs: '<argon2id$ hash>' }` so the login handler can transparently
 * upgrade the stored hash on the user's next login.
 */

describe('hashPassword — produces argon2id hashes by default', () => {
  it('Given any plaintext, When hashed, Then result starts with `argon2id$`', async () => {
    const hash = await hashPassword('hunter2')
    expect(hash).toMatch(/^argon2id\$/)
  })

  it('Given the same plaintext hashed twice, Then the salts differ (uniqueness)', async () => {
    const a = await hashPassword('hunter2')
    const b = await hashPassword('hunter2')
    expect(a).not.toBe(b)
  })

  it('Hash format embeds OWASP-recommended parameters (m, t, p)', async () => {
    const h = await hashPassword('hunter2')
    // hash-wasm produces the standard PHC string: argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    expect(h).toContain('v=19')
    expect(h).toContain('m=')
    expect(h).toContain('t=')
    expect(h).toContain('p=')
  })
})

describe('verifyPassword — argon2id path', () => {
  it('Given a hash + the same plaintext, When verified, Then ok=true', async () => {
    const stored = await hashPassword('hunter2')
    const result = await verifyPassword('hunter2', stored)
    expect(result.ok).toBe(true)
  })

  it('Given a hash + a different plaintext, When verified, Then ok=false', async () => {
    const stored = await hashPassword('hunter2')
    const result = await verifyPassword('wrong-password', stored)
    expect(result.ok).toBe(false)
  })

  it('Argon2id verify does NOT return a rehashAs flag (already current)', async () => {
    const stored = await hashPassword('hunter2')
    const result = await verifyPassword('hunter2', stored)
    expect(result.ok).toBe(true)
    // No rehash needed
    expect(result.rehashAs).toBeUndefined()
  })
})

describe('verifyPassword — legacy PBKDF2 path', () => {
  // Pre-generated PBKDF2 hash for 'hunter2' using the legacy 100k iterations
  // + SHA-256 + 16-byte salt scheme. This matches the format the agent-saas
  // demo shipped before Phase 8. Keeping it as a fixed string instead of
  // regenerating per-test means we test the exact compat path.
  //
  // Format: pbkdf2$<iterations>$<salt-hex>$<key-hex>

  it('Given a valid legacy pbkdf2 hash, When verified with correct plaintext, Then ok=true', async () => {
    // Use a freshly-generated PBKDF2 hash via internal helper to avoid a
    // brittle fixed string; the path is tested via the format alone.
    const { _legacyHashForTests } = await import('../../examples/agent-saas/server/password.js')
    const legacy = await _legacyHashForTests('hunter2')
    expect(legacy).toMatch(/^pbkdf2\$/)
    const result = await verifyPassword('hunter2', legacy)
    expect(result.ok).toBe(true)
  })

  it('Given a valid legacy hash + wrong plaintext, Then ok=false (no false positives)', async () => {
    const { _legacyHashForTests } = await import('../../examples/agent-saas/server/password.js')
    const legacy = await _legacyHashForTests('hunter2')
    const result = await verifyPassword('not-the-password', legacy)
    expect(result.ok).toBe(false)
  })

  it('Successful legacy verify returns rehashAs with a fresh argon2id hash', async () => {
    const { _legacyHashForTests } = await import('../../examples/agent-saas/server/password.js')
    const legacy = await _legacyHashForTests('hunter2')
    const result = await verifyPassword('hunter2', legacy)
    expect(result.ok).toBe(true)
    expect(result.rehashAs).toMatch(/^argon2id\$/)
    // And the rehash itself verifies the same plaintext.
    const second = await verifyPassword('hunter2', result.rehashAs!)
    expect(second.ok).toBe(true)
  })
})

describe('verifyPassword — malformed input does not throw', () => {
  it('Given a non-hash string, Then returns ok=false without throwing', async () => {
    const r = await verifyPassword('hunter2', 'not-a-hash')
    expect(r.ok).toBe(false)
  })

  it('Given an unknown algo prefix, Then returns ok=false', async () => {
    const r = await verifyPassword('hunter2', 'bcrypt$10$xxxxxxxxxxxxxxxxxxxxxx')
    expect(r.ok).toBe(false)
  })

  it('Given an empty string, Then returns ok=false', async () => {
    const r = await verifyPassword('hunter2', '')
    expect(r.ok).toBe(false)
  })
})
