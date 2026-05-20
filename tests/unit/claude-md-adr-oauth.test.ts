import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T7.1 — CLAUDE.md must carry the AUTH-DELEGATION ADR.
 *
 * Without this ADR, future maintainers will face pressure to "just add
 * Google login built-in". The ADR makes the prior-art research load-bearing.
 */

const CLAUDE_MD = resolve(__dirname, '../../CLAUDE.md')

describe('T7.1 — CLAUDE.md ADR-AUTH-DELEGATION', () => {
  const content = readFileSync(CLAUDE_MD, 'utf8')

  it('contains ADR-AUTH-DELEGATION heading or equivalent marker', () => {
    expect(/AUTH[-_ ]?DELEGATION/i.test(content)).toBe(true)
  })

  it('links the oauth-oidc-delegation reference doc', () => {
    expect(content).toContain('oauth-oidc-delegation.md')
  })

  it('enumerates at least three re-evaluation triggers (numbered list)', () => {
    // Find the ADR section
    const section = content
      .split(/AUTH[-_ ]?DELEGATION/i)
      .slice(1)
      .join('\n')
    // Look for "Re-evaluation triggers" header + numbered items 1./2./3.
    const triggers = section.match(/^\s*\d+\.\s+/gm) ?? []
    expect(triggers.length).toBeGreaterThanOrEqual(3)
  })

  it('mentions Auth.js AND Better Auth as recommended alternatives', () => {
    expect(content).toMatch(/Auth\.js/)
    expect(content).toMatch(/Better Auth/)
  })
})
