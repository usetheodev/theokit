import { describe, expect, it } from 'vitest'

import { injectStylesheets } from '../../packages/theo/src/vite-plugin/inject-stylesheets.js'

/**
 * Perf fix 2026-05-22: HTML response in dev SSR was missing <link> tags
 * for `@usetheo/ui/styles.css`. Browser only fetched CSS after JS
 * executed the `import 'styles.css'` — pushing LCP to 9+ seconds.
 *
 * Fix: framework injects `<link rel="stylesheet">` into the HTML head
 * during DEV. Production builds skip this (Vite SSR bundle handles it).
 */

const BASE_HTML = `<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>`

describe('injectStylesheets', () => {
  it('injects <link> for @usetheo/ui/styles.css when package is present + isDev=true', () => {
    const result = injectStylesheets(BASE_HTML, {
      isDev: true,
      hasPackage: (name) => name === '@usetheo/ui',
    })
    expect(result.injected.length).toBeGreaterThan(0)
    expect(result.html).toContain('<link rel="stylesheet" href="/@id/@usetheo/ui/styles.css"')
    // Tag lands inside <head>, not in body
    const headSegment = result.html.split('</head>')[0] ?? ''
    expect(headSegment).toContain('@usetheo/ui/styles.css')
  })

  it('does NOT inject when isDev=false (prod build handles CSS via bundle)', () => {
    const result = injectStylesheets(BASE_HTML, {
      isDev: false,
      hasPackage: () => true,
    })
    expect(result.injected).toEqual([])
    expect(result.html).toBe(BASE_HTML)
  })

  it('does NOT inject when @usetheo/ui is not in node_modules', () => {
    const result = injectStylesheets(BASE_HTML, {
      isDev: true,
      hasPackage: () => false,
    })
    expect(result.injected).toEqual([])
    expect(result.html).toBe(BASE_HTML)
  })

  it('idempotent: skips injection if href already present', () => {
    const htmlWithLink = `<!doctype html><html><head><link rel="stylesheet" href="/@id/@usetheo/ui/styles.css" /></head><body></body></html>`
    const result = injectStylesheets(htmlWithLink, {
      isDev: true,
      hasPackage: () => true,
    })
    expect(result.injected).toEqual([])
    // Only one occurrence
    const matches = result.html.match(/@usetheo\/ui\/styles\.css/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('falls back to <body> opening when </head> is missing', () => {
    const malformed = `<!doctype html><body><div id="root"></div></body>`
    const result = injectStylesheets(malformed, {
      isDev: true,
      hasPackage: () => true,
    })
    expect(result.injected.length).toBe(1)
    expect(result.html).toMatch(/<body[^>]*>\s*<link/i)
  })

  // Font preload was reverted on 2026-05-23 — see inject-stylesheets.ts
  // module comment. Browser logged "preloaded but not used" because the
  // pnpm symlink path didn't match the actual @font-face request path.
  it('does NOT emit font preloads (would be wasted in pnpm dev)', () => {
    const result = injectStylesheets(BASE_HTML, {
      isDev: true,
      hasPackage: () => true,
    })
    const preloads = result.injected.filter((t) => t.includes('rel="preload"'))
    expect(preloads.length).toBe(0)
    expect(result.html).not.toContain('woff2')
  })
})
