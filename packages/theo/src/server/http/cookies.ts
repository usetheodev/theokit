import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  maxAge?: number
  path?: string
  domain?: string
}

/**
 * Parse a `Cookie` header into a Map (RFC 6265 §5.4).
 * - Empty/missing input → empty Map.
 * - Malformed entries (no `=`) skipped silently (defensive).
 * - Duplicate names → last-wins.
 * - Values URL-decoded if possible; raw on decode failure (CR-009 protection).
 *
 * Canonical helper (T3.2 of architecture-review-remediation-plan; PV-4 DRY).
 * Consumed by `getCookie` here AND by `rate-limit/rate-limit-per-route.ts`.
 */
export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!header) return map
  for (const pair of header.split(';')) {
    const trimmed = pair.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const rawValue = trimmed.slice(eqIdx + 1)
    let value: string
    try {
      value = decodeURIComponent(rawValue)
    } catch {
      // Malformed percent-encoding — preserve raw to not lose data,
      // but the consumer is responsible for treating it as untrusted.
      value = rawValue
    }
    map.set(key, value)
  }
  return map
}

export function getCookie(req: IncomingMessage, name: string): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie)
  const value = cookies.get(name)
  // CR-009 fix: malformed percent-encoding returns raw via parseCookieHeader.
  // If decoding failed in parse, we get the raw value (with %XX intact).
  // Treat that as "unreadable" for the typed getCookie API to preserve the
  // original "treat as unauthenticated" semantics.
  if (value === undefined) return undefined
  // Sanity: if rawValue contains lone `%` that didn't decode, parseCookieHeader
  // returned the raw — return undefined to preserve old getCookie contract.
  if (/(?:%[^0-9A-Fa-f])|(?:%[0-9A-Fa-f]$)/.test(value)) return undefined
  return value
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  const opts: Required<Omit<CookieOptions, 'maxAge' | 'domain'>> &
    Pick<CookieOptions, 'maxAge' | 'domain'> = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...options,
  }

  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  // sameSite has a default ('lax') so it is always defined after the
  // spread. Keep the cast inside the value computation to avoid a wide
  // re-narrowing branch in CSV output.
  const sameSiteCanonical = opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1)
  parts.push(`SameSite=${sameSiteCanonical}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.path) parts.push(`Path=${opts.path}`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)

  // Append to existing Set-Cookie headers (EC-1: don't overwrite)
  const existing = res.getHeader('Set-Cookie')
  let cookies: string[] = []
  if (Array.isArray(existing)) {
    cookies = existing.map(String)
  } else if (existing !== undefined) {
    cookies = [String(existing)]
  }
  cookies.push(parts.join('; '))
  res.setHeader('Set-Cookie', cookies)
}

export function deleteCookie(res: ServerResponse, name: string, options?: { path?: string }): void {
  setCookie(res, name, '', { maxAge: 0, path: options?.path ?? '/' })
}
