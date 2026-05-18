import { describe, it, expect } from 'vitest'
import { injectEntryClient } from '../../packages/theo/src/vite-plugin/inject-entry-client.js'

/**
 * T2.1 — transformIndexHtml auto-inject.
 *
 * Live session bug: user authored index.html WITHOUT the entry-client
 * `<script>`, page rendered SSR perfectly but no JS ran. Now the Vite
 * plugin injects it automatically; these tests pin the behavior.
 */

const SCRIPT = '<script type="module" src="/@theo/entry-client"></script>'

describe('T2.1 — injectEntryClient', () => {
  it('injects script before </body> when missing', () => {
    const input = '<!doctype html><html><body><div id="root"></div></body></html>'
    const result = injectEntryClient(input)
    expect(result.injected).toBe(true)
    expect(result.html).toContain(SCRIPT)
    // Script must appear BEFORE </body>, not after
    const scriptIdx = result.html.indexOf(SCRIPT)
    const bodyCloseIdx = result.html.toLowerCase().indexOf('</body>')
    expect(scriptIdx).toBeGreaterThan(0)
    expect(scriptIdx).toBeLessThan(bodyCloseIdx)
  })

  it('does not double-inject when script is already present', () => {
    const input = `<body>${SCRIPT}</body>`
    const result = injectEntryClient(input)
    expect(result.injected).toBe(false)
    expect(result.html).toBe(input)
    // Count occurrences
    const matches = result.html.match(/\/@theo\/entry-client/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('recognizes variant quoting / attribute order (single quote, attr reordered)', () => {
    const variants = [
      `<body><script src='/@theo/entry-client' type='module'></script></body>`,
      `<body><script defer type="module" src="/@theo/entry-client"></script></body>`,
      `<body><link rel="modulepreload" href="/@theo/entry-client"><script src="/@theo/entry-client"></script></body>`,
    ]
    for (const v of variants) {
      const result = injectEntryClient(v)
      expect(result.injected, `failed to recognize: ${v}`).toBe(false)
    }
  })

  it('handles HTML with no </body> tag (appends + warns)', () => {
    const input = '<!doctype html><html><div id="root"></div></html>'
    const result = injectEntryClient(input)
    expect(result.injected).toBe(true)
    expect(result.html).toContain(SCRIPT)
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('no </body>')
  })

  it('preserves the user HTML — only injects, never strips', () => {
    const input = `<html>
  <head>
    <link rel="stylesheet" href="/app/globals.css" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
    const result = injectEntryClient(input)
    // Every line from input is preserved
    for (const line of input.split('\n')) {
      expect(result.html).toContain(line.trim())
    }
  })

  it('is case-insensitive for the body close tag', () => {
    const input = '<body><div></div></BODY>'
    const result = injectEntryClient(input)
    expect(result.injected).toBe(true)
    expect(result.html).toContain(SCRIPT)
  })

  it('injects BEFORE the first </body> when there are duplicates (malformed but tolerated)', () => {
    const input = '<body><div></body></body>'
    const result = injectEntryClient(input)
    expect(result.injected).toBe(true)
    const scriptIdx = result.html.indexOf(SCRIPT)
    const firstBodyClose = result.html.indexOf('</body>')
    expect(scriptIdx).toBeLessThan(firstBodyClose)
  })
})
