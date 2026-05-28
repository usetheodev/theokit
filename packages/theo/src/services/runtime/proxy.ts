/**
 * Web Standards proxy helper (T1.3).
 *
 * Pure fetch-handler proxy — no Node-specific I/O API. Works on Node 18+,
 * Bun, Deno, Cloudflare Workers, Vercel Edge. Used by the production
 * adapter path (the Vite dev path uses Vite's `server.proxy` which wraps
 * `http-proxy-3`).
 *
 * Pattern ported from Hono's helper/proxy/index.ts (RFC 2616 §13.5.1 +
 * RFC 9110 §7.6.1 compliant). TheoKit additions:
 *  - EC-5: Host header set to target host (anti virtual-host leak)
 *  - EC-16: HEAD/OPTIONS requests do NOT forward body
 *  - EC-17: 304 Not Modified relayed with empty body
 *  - EC-26: redirect: 'manual' so 3xx is relayed verbatim, not followed
 *  - Set-Cookie stripped from upstream response by default (EC-25 / ref doc §8)
 *  - stripBase + isPathInScope guard against GHSA-5w89-w975-hf9q
 */
import { isPathInScope } from './path-scope.js'

// RFC 2616 §13.5.1 — hop-by-hop headers MUST NOT be forwarded by intermediaries.
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const

/** Methods that MUST NOT have a body forwarded (EC-16). */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface ProxyOptions {
  /** Upstream target URL — origin + optional path prefix. */
  target: string
  /**
   * Path prefix to strip from the incoming pathname before joining onto
   * `target`. When set, `isPathInScope` enforces the boundary; out-of-scope
   * paths return 400.
   */
  stripBase?: string
  /** Optional path rewriter applied AFTER stripBase. */
  rewrite?: (path: string) => string
  /** Test injection — replace `fetch`. */
  customFetch?: typeof fetch
  /**
   * Default false: pass upstream Set-Cookie back to the client. Default
   * strips Set-Cookie to prevent the polyglot service from issuing cookies
   * that conflict with TheoKit's encrypted session.
   */
  passSetCookie?: boolean
}

function stripHopByHop(headers: Headers): void {
  for (const h of HOP_BY_HOP_HEADERS) {
    headers.delete(h)
  }
}

/**
 * Proxy an incoming request to the configured `target`.
 *
 * Returns a Response that can be returned directly from a fetch handler.
 * On upstream failure (network error, fetch throw), returns 502 with a
 * TheoKit error body.
 */
export async function proxyFetch(request: Request, options: ProxyOptions): Promise<Response> {
  const incomingUrl = new URL(request.url)
  let pathname = incomingUrl.pathname
  const search = incomingUrl.search

  // EC-4/path-scope: enforce boundary on stripBase
  if (options.stripBase) {
    if (!isPathInScope(pathname, options.stripBase)) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'PROXY_PATH_OUT_OF_SCOPE',
            message: 'path is outside the configured scope',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }
    pathname = pathname.slice(options.stripBase.length) || '/'
  }

  if (options.rewrite) {
    pathname = options.rewrite(pathname)
  }

  const targetUrl = new URL(options.target)
  // Append pathname onto target's existing path (so target='http://h:8001/v1' + '/foo' → '/v1/foo')
  const targetPath =
    (targetUrl.pathname.endsWith('/') ? targetUrl.pathname.slice(0, -1) : targetUrl.pathname) +
    pathname
  const outgoingUrl = `${targetUrl.protocol}//${targetUrl.host}${targetPath}${search}`

  // Clone headers + strip hop-by-hop + EC-5 (Host) + accept-encoding
  const outgoingHeaders = new Headers(request.headers)
  stripHopByHop(outgoingHeaders)
  outgoingHeaders.delete('accept-encoding')
  outgoingHeaders.set('host', targetUrl.host) // EC-5

  // EC-16: HEAD/OPTIONS/GET don't forward body
  const sendBody = !BODYLESS_METHODS.has(request.method) && request.body !== null

  const outgoingRequest = new Request(outgoingUrl, {
    method: request.method,
    headers: outgoingHeaders,
    body: sendBody ? request.body : null,
    redirect: 'manual', // EC-26: relay 3xx, don't follow
    signal: request.signal,
    // `duplex: 'half'` required for streaming bodies in Node 18+ (undici).
    ...(sendBody ? ({ duplex: 'half' } as { duplex: 'half' }) : {}),
  })

  let upstreamResponse: Response
  try {
    const f = options.customFetch ?? fetch
    upstreamResponse = await f(outgoingRequest)
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'upstream service unreachable',
          detail: err instanceof Error ? err.message : String(err),
        },
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  // Strip hop-by-hop on response too; delete content-encoding+content-length
  // (body may be re-streamed/re-encoded by the runtime).
  const responseHeaders = new Headers(upstreamResponse.headers)
  stripHopByHop(responseHeaders)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')

  if (!options.passSetCookie) {
    responseHeaders.delete('set-cookie')
  }

  // EC-17: 304 has no body; preserve status+headers
  if (upstreamResponse.status === 304) {
    return new Response(null, {
      status: 304,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}
