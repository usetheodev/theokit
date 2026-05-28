import { test, expect } from '@playwright/test'

/**
 * 0.3.0 cutover T4.1 — per-request nonce machinery end-to-end.
 *
 * The unit tests in `tests/unit/security-headers-nonce.test.ts` + `nonce.test.ts`
 * cover the helpers in isolation. This spec validates the WIRING in real
 * Chromium against a live SSR-enabled fixture (`fixtures/ssr-basic` on port 3492):
 *
 *   1. The `Content-Security-Policy` response header carries `'nonce-X'` in
 *      script-src AND the value X equals the `nonce=` attribute on the
 *      inline `<script>window.__staticRouterHydrationData = ...</script>`
 *      emitted by react-router's `StaticRouterProvider`. Mismatch = browser
 *      blocks the hydration script = client-only fallback = silently broken
 *      app (the exact regression Phase 1 of the framework-maturity work
 *      already paid down once).
 *
 *   2. `Cache-Control: private, no-store` is set on the response so a CDN
 *      cannot serve cached HTML (carrying one nonce) with a freshly-generated
 *      CSP header (carrying a different nonce). EC-3 of the cutover plan —
 *      "CRITICAL" risk in production with any CDN in front.
 *
 *   3. Every `<script>` tag emitted in the document carries the nonce
 *      attribute. Naked script tags (e.g. from React internals if the
 *      `renderToPipeableStream({ nonce })` option wasn't honored, OR from
 *      react-router if its `StaticRouterProvider` wasn't passed `nonce`)
 *      would be CSP-blocked. EC-12.
 *
 * The fixture is the framework's minimum SSR shape — `app/page.tsx` =
 * `<h1>SSR Hello Theo</h1>`. The thinnest possible surface that still
 * exercises the SSR codepath.
 */

const NONCE_ATTR = /\bnonce="([^"]+)"/i
const CSP_NONCE = /'nonce-([^']+)'/

test.describe('0.3.0 cutover — SSR nonce machinery (T4.1)', () => {
  test('Content-Security-Policy nonce-X matches the <script nonce="X"> in HTML body', async ({
    request,
  }) => {
    const response = await request.get('/')
    expect(response.status()).toBe(200)

    const csp = response.headers()['content-security-policy']
    expect(csp, 'CSP header must be present').toBeDefined()
    const cspMatch = CSP_NONCE.exec(csp!)
    expect(cspMatch, `CSP must contain 'nonce-X' directive; got: ${csp}`).not.toBeNull()
    const cspNonce = cspMatch![1]!

    const html = await response.text()
    const scriptMatch = NONCE_ATTR.exec(html)
    expect(scriptMatch, 'HTML must contain at least one <script nonce="...">').not.toBeNull()
    const scriptNonce = scriptMatch![1]!

    expect(scriptNonce).toBe(cspNonce)
  })

  test('Cache-Control: private, no-store is set when nonce is generated (EC-3)', async ({
    request,
  }) => {
    const response = await request.get('/')
    expect(response.status()).toBe(200)
    const cache = response.headers()['cache-control']
    expect(cache, 'Cache-Control must be set on nonce-bearing responses').toBeDefined()
    expect(cache).toMatch(/private/i)
    expect(cache).toMatch(/no-store/i)
  })

  test('every framework-emitted inline <script> carries the nonce attribute (EC-12)', async ({
    request,
  }) => {
    const response = await request.get('/')
    const html = await response.text()

    // Find every <script...>...</script> block (capture opening tag + body).
    // We assert nonce on every FRAMEWORK-emitted inline script. The Vite dev
    // server injects its own React-Refresh hook in dev mode that lives
    // outside CSP scope and won't exist in production builds; we exclude it
    // explicitly so this test pins the contract that matters at ship time.
    //
    // External scripts (`<script src="...">`) are governed by script-src
    // 'self' or host allowlist — NOT by nonce. We exclude those too.
    const blocks = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    const frameworkInlineScripts = blocks.filter(([, attrs, body]) => {
      if (/\bsrc=/.test(attrs!)) return false // external script
      if (body!.includes('@react-refresh')) return false // Vite dev only
      if (body!.includes('@vite/client')) return false // Vite dev only
      return true
    })

    expect(
      frameworkInlineScripts.length,
      'fixture must emit at least one framework inline script (hydration data)',
    ).toBeGreaterThan(0)

    for (const [tag, attrs] of frameworkInlineScripts) {
      expect(attrs, `inline <script> missing nonce attr: ${tag}`).toMatch(/\bnonce=/i)
    }
  })
})
