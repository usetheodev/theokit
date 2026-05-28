import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

const DDG_HTML_URL = 'https://html.duckduckgo.com/html/'
const TIMEOUT_MS = 10_000
const MAX_RESULTS = 5

interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface SearchResponse {
  results: SearchResult[]
  note?: string
}

/**
 * Decode HTML entities (`&amp;`, `&#39;`, `&quot;`, etc.) — minimal set
 * that appears in DDG result titles.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

/**
 * Strip HTML tags from a fragment. Defensive — DDG sometimes wraps the
 * match query in `<b>...</b>` inside titles.
 */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

function parseDdg(html: string): SearchResponse {
  // Each result is a <div class="result"> block. Inside:
  //   <a class="result__a" href="..."> title </a>
  //   <a class="result__snippet"> snippet </a>
  // The regex is intentionally loose to survive minor HTML drift.
  const blockRe = /<div\s+class="(?:[^"]*\s)?result(?:\s[^"]*)?"[\s\S]*?<\/div>/gi
  const titleRe = /<a\s+(?:[^>]*\s)?class="(?:[^"]*\s)?result__a(?:\s[^"]*)?"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
  const snippetRe = /<a\s+(?:[^>]*\s)?class="(?:[^"]*\s)?result__snippet(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/a>/i
  const results: SearchResult[] = []
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null && results.length < MAX_RESULTS) {
    const block = m[0]
    const tm = titleRe.exec(block)
    if (!tm) continue
    const sm = snippetRe.exec(block)
    results.push({
      url: decodeEntities(tm[1]!.trim()),
      title: decodeEntities(stripTags(tm[2]!.trim())),
      snippet: sm ? decodeEntities(stripTags(sm[1]!.trim())) : '',
    })
  }
  if (results.length === 0) {
    return {
      results: [],
      note: 'DDG HTML structure changed; parser found zero results. May also be CAPTCHA from a cloud IP.',
    }
  }
  return { results }
}

export const webSearch = defineAgentTool({
  name: 'web_search',
  description:
    'Search the web via DuckDuckGo HTML endpoint (no API key). Returns top ' +
    `${MAX_RESULTS.toString()} results: { title, url, snippet }. Use for finding pages to then ` +
    'fetch with web_fetch.',
  inputSchema: z.object({ query: z.string().min(1).max(500) }),
  handler: async ({ query }) => {
    const res = await fetch(`${DDG_HTML_URL}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // DDG serves a different HTML to UA-less clients sometimes.
        'user-agent': 'Mozilla/5.0 (theokit-full-stack-agent demo)',
      },
    })
    if (!res.ok) {
      return JSON.stringify({
        results: [],
        note: `DDG returned HTTP ${res.status.toString()} — try later.`,
      } satisfies SearchResponse)
    }
    const html = await res.text()
    return JSON.stringify(parseDdg(html))
  },
})

// Re-export for unit tests
export { parseDdg as __parseDdg }
