import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Fetches a URL and returns the response body (truncated to 8 KB).
 *
 * Hostname allowlist enforced via dot-boundary check — prevents SSRF to
 * internal services (RFC 1918, 127.x, 0.x, 169.254.x, fc00::/7).
 *
 * Edge cases mitigated:
 *  • only http/https schemes (no file://, no data:)
 *  • body capped at 8 KB to bound LLM context cost
 *  • content-type fallback for non-text resources
 *  • 5s timeout via AbortController
 */
const ALLOWED_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'developer.mozilla.org',
  'tc39.es',
  'nodejs.org',
  'en.wikipedia.org',
  'news.ycombinator.com',
  'hacker-news.firebaseio.com',
]

function isAllowed(host: string): boolean {
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

const MAX_BODY_BYTES = 8 * 1024

export const webFetch = defineAgentTool({
  name: 'web_fetch',
  description:
    'Fetch a public URL and return the response body (truncated to 8 KB). Allowed hosts: github.com, mdn, tc39.es, nodejs.org, wikipedia.org, news.ycombinator.com.',
  inputSchema: z.object({
    url: z.string().url(),
  }),
  handler: async ({ url }) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol: ${parsed.protocol}`)
    }
    if (!isAllowed(parsed.hostname)) {
      throw new Error(
        `host not in allowlist: ${parsed.hostname}. Edit server/tools/web-fetch.ts to extend.`,
      )
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      const contentType = res.headers.get('content-type') ?? 'unknown'
      const buffer = await res.arrayBuffer()
      const truncated = buffer.byteLength > MAX_BODY_BYTES
      const slice = buffer.slice(0, MAX_BODY_BYTES)
      const body = new TextDecoder('utf-8', { fatal: false }).decode(slice)
      return {
        url,
        status: res.status,
        contentType,
        truncated,
        bytes: buffer.byteLength,
        body,
      }
    } finally {
      clearTimeout(timer)
    }
  },
})
