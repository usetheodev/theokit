import { describe, it, expect } from 'vitest'
import { generatePkceChallenge, pkceChallengeFromVerifier } from '../../packages/theo/src/server/oauth-pkce.js'

/**
 * T7.3 — RFC 7636 PKCE (Proof Key for Code Exchange).
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc7636
 *
 * Appendix B test vector:
 *   code_verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
 *   code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 *   (SHA-256 of verifier, base64url-encoded, no padding)
 */

describe('T7.3 — RFC 7636 Appendix B vector', () => {
  it('verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" → challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"', async () => {
    const challenge = await pkceChallengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('T7.3 — generatePkceChallenge', () => {
  it('default verifier length is 43 (32 random bytes → 43 base64url chars)', async () => {
    const c = await generatePkceChallenge()
    expect(c.codeVerifier.length).toBe(43)
  })

  it('codeChallengeMethod is always S256', async () => {
    const c = await generatePkceChallenge()
    expect(c.codeChallengeMethod).toBe('S256')
  })

  it('100 calls produce 100 unique verifiers', async () => {
    const vs = new Set<string>()
    for (let i = 0; i < 100; i++) {
      vs.add((await generatePkceChallenge()).codeVerifier)
    }
    expect(vs.size).toBe(100)
  })

  it('verifier uses url-safe base64url alphabet', async () => {
    const c = await generatePkceChallenge()
    expect(c.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('challenge matches SHA-256(verifier) base64url-encoded', async () => {
    const c = await generatePkceChallenge()
    const expected = await pkceChallengeFromVerifier(c.codeVerifier)
    expect(c.codeChallenge).toBe(expected)
  })

  /**
   * EC-2 (PKCE downgrade attack) — reference doc §8.
   *
   * If the implementation accepted `'plain'` as a fallback method, an
   * attacker MITM'ing the authorization code can use the unhashed
   * verifier directly. RFC 7636 §7.2 strongly discourages 'plain' and
   * modern providers reject it; TheoKit ships S256 ONLY — no exposed
   * option to downgrade.
   */
  it('EC-2: PKCE downgrade attack defense — only S256 supported (no plain)', async () => {
    const c = await generatePkceChallenge()
    expect(c.codeChallengeMethod).toBe('S256')
    // The TypeScript type for codeChallengeMethod is the literal 'S256'
    // (not a union with 'plain'). This compile-time guarantee complements
    // the runtime assertion.
    const _typecheck: 'S256' = c.codeChallengeMethod
    void _typecheck
  })

  /**
   * Verifier length entropy — RFC 7636 §4.1 allows 43–128 chars.
   * Our default is 43 (the secure minimum, 32 random bytes).
   */
  it('verifier entropy is ≥ 256 bits (32 random bytes → 43 base64url chars)', async () => {
    const c = await generatePkceChallenge()
    // 43 base64url chars × 6 bits per char = 258 bits of encoded data;
    // 32 random source bytes = 256 bits of actual entropy.
    expect(c.codeVerifier.length).toBeGreaterThanOrEqual(43)
    expect(c.codeVerifier.length).toBeLessThanOrEqual(128)
  })
})
