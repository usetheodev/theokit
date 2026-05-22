import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

import { isHostAllowed } from './_allowlist.js'

const MAX_BYTES = 4096
const TIMEOUT_MS = 10_000

/**
 * HTTP GET against an allowlisted host. Defense-in-depth:
 *
 *   1. Zod URL validation rejects non-string / non-URL inputs.
 *   2. Scheme allowlist (https/http only) — `file://`, `data:`, etc. blocked.
 *   3. Hostname allowlist (EC-3 dot-boundary match) — IPv4/IPv6 literals
 *      blocked; subdomain match only on legitimate boundary.
 *   4. 10s timeout via `AbortSignal.timeout`.
 *   5. 4 KB byte cap on response — prevents the LLM from consuming a
 *      huge document in one go.
 */
export const webFetch = defineAgentTool({
  name: 'web_fetch',
  description:
    'HTTP GET a URL on the allowlist (wikipedia, github, etc.). Returns the ' +
    'first 4 KB of the response body. Use for fetching documentation, READMEs, ' +
    'or specific articles. NOT a general-purpose web crawler.',
  inputSchema: z.object({ url: z.string().url() }),
  handler: async ({ url }) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`scheme ${parsed.protocol} not allowed`)
    }
    if (!isHostAllowed(parsed.hostname)) {
      throw new Error(
        `host ${parsed.hostname} not in allowlist (override via WEB_FETCH_ALLOWLIST env)`,
      )
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const buf = await res.arrayBuffer()
    const bytes = Buffer.from(buf).subarray(0, MAX_BYTES)
    // Slice safely on UTF-8 boundary by relying on TextDecoder's
    // fatal=false default (it replaces partial chars at the end instead
    // of throwing).
    const body = new TextDecoder('utf-8').decode(bytes)
    return JSON.stringify({ status: res.status, body })
  },
})
