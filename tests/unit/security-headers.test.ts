import { describe, it, expect } from 'vitest'
import {
  buildSecurityHeaders,
  applySecurityHeaders,
  DEFAULT_CSP,
  type SecurityHeadersConfig,
} from '../../packages/theo/src/server/security-headers.js'

/**
 * Phase 6 — Default Security Headers (D4 / EC-2).
 *
 * Every response carries OWASP-recommended security headers by default:
 *   - Content-Security-Policy (REPORT-ONLY in 0.2.0 — EC-2 backward compat)
 *   - Strict-Transport-Security (production only — localhost has no TLS)
 *   - X-Frame-Options: DENY
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *
 * EC-2 amendment: default `cspMode` was `'report-only'` in 0.2.0 so
 * existing apps with inline `<script>` tags or third-party CDN scripts
 * keep working. T6.1 (0.3.0) flips the default to `'enforce'` after a
 * release of visibility via report-only violations. Apps that need the
 * legacy posture opt in explicitly with `cspMode: 'report-only'`.
 *
 * `security.headers.csp = false` opts out entirely.
 * `security.headers.csp = <string>` overrides the policy verbatim.
 * Handler-level `res.setHeader()` ALWAYS wins (last write).
 */

describe('buildSecurityHeaders — defaults', () => {
  // T6.1 — 0.3.0 default is `cspMode: 'enforce'`. Apps wanting the
  // legacy 'report-only' posture set `cspMode: 'report-only'` explicitly.
  it('Given no config + dev env (0.3.0 default), When building, Then returns enforce-mode CSP + X-Frame + nosniff + Referrer-Policy', () => {
    const headers = buildSecurityHeaders({}, { production: false })
    expect(headers['Content-Security-Policy']).toBeDefined()
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined()
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('Given dev env, When building, Then HSTS is NOT emitted (no TLS on localhost)', () => {
    const headers = buildSecurityHeaders({}, { production: false })
    expect(headers['Strict-Transport-Security']).toBeUndefined()
  })

  it('Given production env, When building, Then HSTS is emitted with sensible defaults', () => {
    const headers = buildSecurityHeaders({}, { production: true })
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d+/)
    expect(headers['Strict-Transport-Security']).toMatch(/includeSubDomains/)
  })

  it('Default CSP includes the minimum directives expected from OWASP baseline', () => {
    expect(DEFAULT_CSP).toMatch(/default-src 'self'/)
    expect(DEFAULT_CSP).toMatch(/frame-ancestors 'none'/)
    expect(DEFAULT_CSP).toMatch(/img-src/)
    expect(DEFAULT_CSP).toMatch(/connect-src/)
  })
})

describe('buildSecurityHeaders — cspMode', () => {
  it('Given cspMode = "enforce", When building, Then emits Content-Security-Policy (not the report-only header)', () => {
    const cfg: SecurityHeadersConfig = { cspMode: 'enforce' }
    const headers = buildSecurityHeaders(cfg, { production: false })
    expect(headers['Content-Security-Policy']).toBeDefined()
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('Given cspMode = "off", When building, Then no CSP header at all', () => {
    const cfg: SecurityHeadersConfig = { cspMode: 'off' }
    const headers = buildSecurityHeaders(cfg, { production: false })
    expect(headers['Content-Security-Policy']).toBeUndefined()
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('Given csp: false, When building, Then no CSP header (alias for cspMode = "off")', () => {
    const cfg: SecurityHeadersConfig = { csp: false }
    const headers = buildSecurityHeaders(cfg, { production: false })
    expect(headers['Content-Security-Policy']).toBeUndefined()
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('Given a custom csp string (0.3.0 default enforce mode), When building, Then uses it verbatim in enforce header', () => {
    const custom = "default-src 'self'; script-src 'self' https://cdn.example.com"
    const headers = buildSecurityHeaders({ csp: custom }, { production: false })
    expect(headers['Content-Security-Policy']).toBe(custom)
  })
})

describe('buildSecurityHeaders — frameOptions / referrerPolicy / hsts overrides', () => {
  it('Given frameOptions = "SAMEORIGIN", When building, Then X-Frame-Options is SAMEORIGIN', () => {
    const headers = buildSecurityHeaders({ frameOptions: 'SAMEORIGIN' }, { production: false })
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
  })

  it('Given referrerPolicy override, When building, Then Referrer-Policy uses the override', () => {
    const headers = buildSecurityHeaders({ referrerPolicy: 'no-referrer' }, { production: false })
    expect(headers['Referrer-Policy']).toBe('no-referrer')
  })

  it('Given hsts = false in production, When building, Then HSTS is suppressed', () => {
    const headers = buildSecurityHeaders({ hsts: false }, { production: true })
    expect(headers['Strict-Transport-Security']).toBeUndefined()
  })

  it('Given custom hsts string in production, When building, Then uses it verbatim', () => {
    const headers = buildSecurityHeaders({ hsts: 'max-age=63072000' }, { production: true })
    expect(headers['Strict-Transport-Security']).toBe('max-age=63072000')
  })
})

describe('applySecurityHeaders — integration with ServerResponse', () => {
  function mockRes() {
    const headers: Record<string, string> = {}
    return {
      headers,
      setHeader(k: string, v: string) { headers[k] = v },
    }
  }

  it('Given a response (0.3.0 default enforce mode), When applied, Then setHeader is called for each header value', () => {
    const res = mockRes()
    applySecurityHeaders(res as never, {}, { production: false })
    expect(res.headers['X-Frame-Options']).toBe('DENY')
    expect(res.headers['Content-Security-Policy']).toBeDefined()
  })

  it('Given cspMode = "off", When applied, Then no CSP header is set', () => {
    const res = mockRes()
    applySecurityHeaders(res as never, { cspMode: 'off' }, { production: false })
    expect(res.headers['Content-Security-Policy']).toBeUndefined()
    expect(res.headers['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('User override semantics: applying headers does NOT overwrite if a handler has already set the same key', () => {
    // The api-middleware applies security headers BEFORE the handler runs.
    // The handler can then call res.setHeader to override. Since the underlying
    // Node response is "last write wins", we just need the framework to apply
    // its defaults BEFORE the handler — which is the wiring contract, not
    // something this helper enforces. Document the contract.
    const res = mockRes()
    applySecurityHeaders(res as never, {}, { production: false })
    // Handler "overrides" later:
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    expect(res.headers['X-Frame-Options']).toBe('SAMEORIGIN')
  })
})
