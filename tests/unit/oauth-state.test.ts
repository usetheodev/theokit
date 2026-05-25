import { describe, it, expect } from 'vitest'
import {
  generateOAuthState,
  verifyOAuthState,
} from '../../packages/theo/src/server/auth/oauth-state.js'

/**
 * T7.4 — OAuth state parameter (RFC 6749 §10.12 — anti-CSRF token).
 */

describe('T7.4 — generateOAuthState / verifyOAuthState', () => {
  it('100 calls produce 100 unique values', () => {
    const s = new Set<string>()
    for (let i = 0; i < 100; i++) s.add(generateOAuthState())
    expect(s.size).toBe(100)
  })

  it('default state length: 32 bytes → ~43 base64url chars', () => {
    const s = generateOAuthState()
    expect(s.length).toBeGreaterThanOrEqual(42)
    expect(s.length).toBeLessThanOrEqual(44)
  })

  it('verify happy path: same string matches', () => {
    const s = generateOAuthState()
    expect(verifyOAuthState(s, s)).toBe(true)
  })

  it('verify mismatch returns false', () => {
    expect(verifyOAuthState('abc', 'def')).toBe(false)
  })

  it('EC: empty provided OR empty stored → false (never accept empty)', () => {
    expect(verifyOAuthState('', '')).toBe(false)
    expect(verifyOAuthState('', 'abc')).toBe(false)
    expect(verifyOAuthState('abc', '')).toBe(false)
  })

  /**
   * EC-1 (OAuth state CSRF) — reference doc §8.
   *
   * Without state verification, an attacker can trick a logged-in user
   * into authorizing the attacker's account on the victim's session.
   * The state primitive is the anti-CSRF defense; this test simulates
   * an attacker swapping the state value in the callback URL.
   */
  it('EC-1: anti-CSRF defense — attacker-substituted state in callback fails verify', () => {
    // Server generated state at /start and stored it in session
    const sessionState = generateOAuthState()
    // Attacker substitutes their own state value in the redirect URL
    const attackerState = generateOAuthState()
    expect(verifyOAuthState(attackerState, sessionState)).toBe(false)
    // Replay attack: even using a previously valid state (intercepted via
    // logs) would require knowing the session state — the constant-time
    // compare gives no incremental leak even with timing analysis.
  })

  /**
   * Type-level guarantee: verifyOAuthState returns boolean only — no
   * undefined/truthy ambiguity that the caller could misinterpret.
   */
  it('verifyOAuthState returns strict boolean (never undefined / truthy non-boolean)', () => {
    const r = verifyOAuthState('a', 'a')
    expect(typeof r).toBe('boolean')
    expect(r).toBe(true)
  })
})
