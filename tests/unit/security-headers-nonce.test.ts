import { describe, it, expect } from 'vitest'
import {
  buildSecurityHeaders,
  type SecurityHeadersConfig,
  type SecurityEnv,
} from '../../packages/theo/src/server/security/security-headers.js'

/**
 * T4.1 — CSP nonce wiring + EC-3 (Cache-Control) + EC-4 (prerender skip).
 *
 * When a nonce is supplied to `buildSecurityHeaders`, the resulting CSP
 * MUST:
 *
 *   1. Replace the `'unsafe-inline'` token in script-src with the
 *      explicit `'nonce-<token>'` directive (defense-in-depth — the
 *      directive is more restrictive than unsafe-inline).
 *   2. Force `Cache-Control: private, no-store` on the response so a
 *      CDN cannot serve a cached HTML body (carrying one nonce) with a
 *      freshly-generated CSP header (carrying a different nonce). That
 *      mismatch would silently block every script. EC-3.
 *
 * When `prerender: true` is supplied, the nonce path is BYPASSED:
 *
 *   1. CSP falls back to the `'unsafe-inline'` default (matches the
 *      build-time HTML which carries no nonce).
 *   2. No Cache-Control: private, no-store is emitted (prerendered HTML
 *      is meant to be cached).
 *   EC-4.
 */

const baseConfig: SecurityHeadersConfig = { cspMode: 'enforce' }
const env: SecurityEnv = { production: true }

describe('buildSecurityHeaders — nonce path', () => {
  it('Given enforce mode + nonce="abc123", Then CSP contains "nonce-abc123" in script-src', () => {
    const headers = buildSecurityHeaders(baseConfig, env, { nonce: 'abc123' })
    const csp = headers['Content-Security-Policy']
    expect(csp).toBeDefined()
    expect(csp).toContain("'nonce-abc123'")
    expect(csp).toMatch(/script-src[^;]*'nonce-abc123'/)
  })

  it('Given enforce mode + nonce, Then "unsafe-inline" is REMOVED from script-src', () => {
    const headers = buildSecurityHeaders(baseConfig, env, { nonce: 'abc123' })
    const csp = headers['Content-Security-Policy'] ?? ''
    const scriptSrcMatch = csp.match(/script-src[^;]*/)
    expect(scriptSrcMatch).toBeTruthy()
    expect(scriptSrcMatch?.[0]).not.toContain("'unsafe-inline'")
  })

  it('Given report-only mode + nonce, Then nonce appears in CSP-Report-Only header', () => {
    const headers = buildSecurityHeaders({ cspMode: 'report-only' }, env, { nonce: 'xyz789' })
    expect(headers['Content-Security-Policy-Report-Only']).toContain("'nonce-xyz789'")
    expect(headers['Content-Security-Policy']).toBeUndefined()
  })

  it('EC-3: Given nonce supplied, Then Cache-Control is forced to "private, no-store"', () => {
    const headers = buildSecurityHeaders(baseConfig, env, { nonce: 'abc' })
    expect(headers['Cache-Control']).toBe('private, no-store')
  })

  it('Given no nonce, Then no Cache-Control header injected (preserve adapter defaults)', () => {
    const headers = buildSecurityHeaders(baseConfig, env)
    expect(headers['Cache-Control']).toBeUndefined()
  })
})

describe('buildSecurityHeaders — no-nonce fallback path', () => {
  it('Given no nonce, Then CSP retains "unsafe-inline" in script-src (backwards compat)', () => {
    const headers = buildSecurityHeaders(baseConfig, env)
    const csp = headers['Content-Security-Policy'] ?? ''
    expect(csp).toContain("'unsafe-inline'")
  })

  it('Given config.csp custom string AND nonce, Then nonce is appended to that custom string', () => {
    const headers = buildSecurityHeaders(
      { csp: "default-src 'self'; script-src 'self'", cspMode: 'enforce' },
      env,
      { nonce: 'custom-nonce' },
    )
    expect(headers['Content-Security-Policy']).toContain("'nonce-custom-nonce'")
  })
})

describe('buildSecurityHeaders — EC-4 prerender skip', () => {
  it('Given prerender=true AND nonce supplied, Then nonce is IGNORED + unsafe-inline retained', () => {
    const headers = buildSecurityHeaders(baseConfig, env, {
      nonce: 'should-not-appear',
      prerender: true,
    })
    const csp = headers['Content-Security-Policy'] ?? ''
    expect(csp).not.toContain('should-not-appear')
    expect(csp).toContain("'unsafe-inline'")
  })

  it('Given prerender=true, Then NO Cache-Control: private, no-store is set (prerendered HTML must be cacheable)', () => {
    const headers = buildSecurityHeaders(baseConfig, env, {
      nonce: 'ignored',
      prerender: true,
    })
    expect(headers['Cache-Control']).toBeUndefined()
  })
})

describe('buildSecurityHeaders — opt-out paths still work with nonce option', () => {
  it('Given cspMode="off", Then no CSP header even if nonce provided', () => {
    const headers = buildSecurityHeaders({ cspMode: 'off' }, env, { nonce: 'abc' })
    expect(headers['Content-Security-Policy']).toBeUndefined()
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('Given csp=false, Then no CSP header even if nonce provided', () => {
    const headers = buildSecurityHeaders({ csp: false }, env, { nonce: 'abc' })
    expect(headers['Content-Security-Policy']).toBeUndefined()
  })
})
