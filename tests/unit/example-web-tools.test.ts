import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetAllowlistCache,
  isHostAllowed,
} from '../../examples/full-stack-agent/server/tools/_allowlist.js'
import { webFetch } from '../../examples/full-stack-agent/server/tools/web-fetch.js'
import {
  __parseDdg,
  webSearch,
} from '../../examples/full-stack-agent/server/tools/web-search.js'

/**
 * T2.2 — Web tools (web_fetch + web_search).
 *
 * Includes EC-3 (dot-boundary allowlist) from the edge-case review.
 */

describe('isHostAllowed — EC-3 dot-boundary', () => {
  beforeEach(() => {
    delete process.env.WEB_FETCH_ALLOWLIST
    __resetAllowlistCache()
  })

  it('matches exact host', () => {
    expect(isHostAllowed('wikipedia.org')).toBe(true)
    expect(isHostAllowed('github.com')).toBe(true)
  })

  it('matches legitimate subdomain', () => {
    expect(isHostAllowed('en.wikipedia.org')).toBe(true)
    expect(isHostAllowed('api.github.com')).toBe(true)
  })

  it('EC-3 — rejects evilwikipedia.org lookalike', () => {
    expect(isHostAllowed('evilwikipedia.org')).toBe(false)
    expect(isHostAllowed('attackergithub.com')).toBe(false)
  })

  it('EC-3 — rejects suffix-attack with sub.attacker.com', () => {
    expect(isHostAllowed('wikipedia.org.attacker.com')).toBe(false)
  })

  it('rejects IPv4 literal (defense against AWS metadata SSRF)', () => {
    expect(isHostAllowed('169.254.169.254')).toBe(false)
    expect(isHostAllowed('127.0.0.1')).toBe(false)
  })

  it('rejects IPv6 literal', () => {
    expect(isHostAllowed('[::1]')).toBe(false)
  })

  it('case-insensitive', () => {
    expect(isHostAllowed('GitHub.com')).toBe(true)
    expect(isHostAllowed('API.GITHUB.COM')).toBe(true)
  })

  it('respects WEB_FETCH_ALLOWLIST env override', () => {
    process.env.WEB_FETCH_ALLOWLIST = 'example.com'
    __resetAllowlistCache()
    expect(isHostAllowed('example.com')).toBe(true)
    expect(isHostAllowed('wikipedia.org')).toBe(false)
  })
})

describe('webFetch', () => {
  beforeEach(() => {
    delete process.env.WEB_FETCH_ALLOWLIST
    __resetAllowlistCache()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.WEB_FETCH_ALLOWLIST
    __resetAllowlistCache()
  })

  it('rejects non-allowlisted host', async () => {
    await expect(webFetch.handler({ url: 'https://localhost:8080/' })).rejects.toThrow(
      /not in allowlist/i,
    )
  })

  it('rejects non-http(s) scheme', async () => {
    await expect(webFetch.handler({ url: 'ftp://example.com/foo' })).rejects.toThrow()
  })

  it('rejects malformed URL via Zod', async () => {
    await expect(webFetch.handler({ url: 'not-a-url' })).rejects.toThrow()
  })

  it('fetches allowlisted host and caps at 4 KB', async () => {
    const body = 'hello '.repeat(1000) // 6 KB
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    )
    const result = JSON.parse(
      await webFetch.handler({ url: 'https://en.wikipedia.org/wiki/Test' }),
    ) as { status: number; body: string }
    expect(result.status).toBe(200)
    // Byte cap is 4096 — UTF-8 'hello ' is ASCII (1 byte/char), so 4096 chars
    expect(Buffer.byteLength(result.body, 'utf-8')).toBeLessThanOrEqual(4096)
  })

  it('EC-3 — rejects evilwikipedia.org lookalike at handler level', async () => {
    await expect(
      webFetch.handler({ url: 'https://evilwikipedia.org/test' }),
    ).rejects.toThrow(/not in allowlist/i)
  })
})

describe('webSearch parser', () => {
  it('parses DDG results with title + url + snippet', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com/foo">Foo Title</a>
        <a class="result__snippet">Foo snippet text</a>
      </div>
      <div class="result">
        <a class="result__a" href="https://example.com/bar">Bar Title</a>
        <a class="result__snippet">Bar snippet</a>
      </div>
    `
    const r = __parseDdg(html)
    expect(r.results).toHaveLength(2)
    expect(r.results[0]!.title).toBe('Foo Title')
    expect(r.results[0]!.url).toBe('https://example.com/foo')
    expect(r.results[0]!.snippet).toBe('Foo snippet text')
  })

  it('returns note on zero results (DDG structure changed)', () => {
    const r = __parseDdg('<html><body>no results here</body></html>')
    expect(r.results).toEqual([])
    expect(r.note).toMatch(/DDG HTML|CAPTCHA/)
  })

  it('decodes HTML entities in title', () => {
    const html = `<div class="result"><a class="result__a" href="x">Foo &amp; Bar</a></div>`
    const r = __parseDdg(html)
    expect(r.results[0]!.title).toBe('Foo & Bar')
  })

  it('strips nested HTML tags in title', () => {
    const html = `<div class="result"><a class="result__a" href="x">Foo <b>bar</b> baz</a></div>`
    const r = __parseDdg(html)
    expect(r.results[0]!.title).toBe('Foo bar baz')
  })

  it('caps at 5 results', () => {
    const html = Array.from(
      { length: 10 },
      (_, i) => `<div class="result"><a class="result__a" href="x${i}">T${i}</a></div>`,
    ).join('')
    const r = __parseDdg(html)
    expect(r.results).toHaveLength(5)
  })

  it('webSearch handler returns parsed JSON', async () => {
    const fixture = `<div class="result"><a class="result__a" href="https://example.com">Hi</a></div>`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fixture, { status: 200 })),
    )
    const out = JSON.parse(await webSearch.handler({ query: 'theokit' })) as {
      results: { title: string }[]
    }
    expect(out.results[0]!.title).toBe('Hi')
    vi.restoreAllMocks()
  })

  it('rejects empty query via Zod', async () => {
    await expect(webSearch.handler({ query: '' })).rejects.toThrow()
  })
})
