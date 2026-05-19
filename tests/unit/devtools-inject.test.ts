/**
 * T1.2 — inject-devtools.ts unit tests.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { describe, expect, it } from 'vitest'
import { injectDevtoolsScript, DEVTOOLS_VIRTUAL_ID } from '../../packages/theo/src/vite-plugin/inject-devtools.js'

const HTML_WITH_HEAD = `<!doctype html>
<html>
  <head>
    <title>app</title>
  </head>
  <body><div id="root"></div></body>
</html>`

describe('injectDevtoolsScript', () => {
  it('appends script before </head> in dev mode', () => {
    const result = injectDevtoolsScript(HTML_WITH_HEAD, { isDev: true })
    expect(result.injected).toBe(true)
    expect(result.html).toContain(`<script type="module" src="${DEVTOOLS_VIRTUAL_ID}">`)
    expect(result.html.indexOf(DEVTOOLS_VIRTUAL_ID)).toBeLessThan(result.html.indexOf('</head>'))
  })

  it('passthrough in build mode', () => {
    const result = injectDevtoolsScript(HTML_WITH_HEAD, { isDev: false })
    expect(result.injected).toBe(false)
    expect(result.html).toBe(HTML_WITH_HEAD)
    expect(result.html).not.toContain(DEVTOOLS_VIRTUAL_ID)
  })

  it('passthrough when explicitly disabled (config.devtools = false)', () => {
    const result = injectDevtoolsScript(HTML_WITH_HEAD, { isDev: true, enabled: false })
    expect(result.injected).toBe(false)
    expect(result.html).toBe(HTML_WITH_HEAD)
  })

  it('idempotent — does not double-inject if script tag already present', () => {
    const already = HTML_WITH_HEAD.replace(
      '</head>',
      `<script type="module" src="${DEVTOOLS_VIRTUAL_ID}"></script></head>`,
    )
    const result = injectDevtoolsScript(already, { isDev: true })
    expect(result.injected).toBe(false)
    // Single occurrence preserved
    const occurrences = result.html.split(DEVTOOLS_VIRTUAL_ID).length - 1
    expect(occurrences).toBe(1)
  })

  it('warns + does NOT inject when HTML has no </head>', () => {
    const noHead = '<html><body></body></html>'
    const result = injectDevtoolsScript(noHead, { isDev: true })
    expect(result.injected).toBe(false)
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('no </head>')
    expect(result.html).toBe(noHead)
  })

  it('case-insensitive </head> match', () => {
    const upperHead = '<html><HEAD></HEAD><body></body></html>'
    const result = injectDevtoolsScript(upperHead, { isDev: true })
    expect(result.injected).toBe(true)
    expect(result.html).toContain(DEVTOOLS_VIRTUAL_ID)
  })

  it('only replaces FIRST </head> occurrence (defensive)', () => {
    const weird = '<head></head><body></head></body>'
    const result = injectDevtoolsScript(weird, { isDev: true })
    expect(result.injected).toBe(true)
    const occurrences = result.html.split(DEVTOOLS_VIRTUAL_ID).length - 1
    expect(occurrences).toBe(1)
  })
})
