import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generatePkceChallenge } from '../../packages/theo/src/server/auth/oauth-pkce.js'
import {
  generateOAuthState,
  verifyOAuthState,
} from '../../packages/theo/src/server/auth/oauth-state.js'

/**
 * T7.5 — Fixture sanity tests.
 *
 * Validates the fixtures' shape (package.json, README, theo.config.ts,
 * the auth files exist) and exercises the DIY GitHub flow's PKCE+state
 * primitives without needing real GitHub OAuth secrets.
 */

const ROOT = resolve(__dirname, '../..')
const DIY = resolve(ROOT, 'fixtures/auth-providers-diy-github')
const AUTHJS = resolve(ROOT, 'fixtures/auth-providers-with-authjs')

describe('T7.5 — fixture shape', () => {
  it('auth-providers-diy-github exists with required files', () => {
    expect(existsSync(resolve(DIY, 'package.json'))).toBe(true)
    expect(existsSync(resolve(DIY, 'README.md'))).toBe(true)
    expect(existsSync(resolve(DIY, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(DIY, 'server/context.ts'))).toBe(true)
    expect(existsSync(resolve(DIY, 'server/routes/auth/start.ts'))).toBe(true)
    expect(existsSync(resolve(DIY, 'server/routes/auth/callback.ts'))).toBe(true)
    expect(existsSync(resolve(DIY, 'server/routes/me.ts'))).toBe(true)
  })

  it('auth-providers-with-authjs exists with required files', () => {
    expect(existsSync(resolve(AUTHJS, 'package.json'))).toBe(true)
    expect(existsSync(resolve(AUTHJS, 'README.md'))).toBe(true)
    expect(existsSync(resolve(AUTHJS, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(AUTHJS, 'server/context.ts'))).toBe(true)
    expect(existsSync(resolve(AUTHJS, 'server/routes/auth/sync.ts'))).toBe(true)
  })

  it('diy-github start.ts uses PKCE + state primitives', () => {
    const code = readFileSync(resolve(DIY, 'server/routes/auth/start.ts'), 'utf8')
    expect(code).toContain('generatePkceChallenge')
    expect(code).toContain('generateOAuthState')
    expect(code).toContain('code_challenge')
  })

  it('diy-github callback.ts verifies state AND uses rotateSession', () => {
    const code = readFileSync(resolve(DIY, 'server/routes/auth/callback.ts'), 'utf8')
    expect(code).toContain('verifyOAuthState')
    expect(code).toContain('rotateSession')
  })
})

describe('T7.5 — primitives integration (no GitHub secrets required)', () => {
  it('full PKCE + state round-trip simulating the DIY callback', async () => {
    // Simulate /auth/start: generate verifier + challenge + state
    const challenge = await generatePkceChallenge()
    const state = generateOAuthState()

    // Pretend we stored them and now we're on /auth/callback. Verify the
    // state mirrors what we stored:
    expect(verifyOAuthState(state, state)).toBe(true)
    expect(verifyOAuthState('attacker-supplied', state)).toBe(false)

    // The PKCE challenge would be sent to GitHub at /authorize and the
    // verifier later in the token exchange — they're a pair, no further
    // round-trip needed for this test.
    expect(challenge.codeChallengeMethod).toBe('S256')
    expect(challenge.codeVerifier.length).toBeGreaterThanOrEqual(43)
  })
})
