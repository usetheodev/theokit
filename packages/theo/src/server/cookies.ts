import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  maxAge?: number
  path?: string
  domain?: string
}

export function getCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? ''
  for (const pair of header.split(';')) {
    const trimmed = pair.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    if (key === name) {
      // CR-009 fix: malformed percent-encoding (`%GG`, lone `%`) makes
      // `decodeURIComponent` throw `URIError`. An attacker reproducibly
      // returned 500 on any authenticated endpoint by sending a malformed
      // cookie. Return undefined on decode failure — the upstream behavior
      // for "session cookie unreadable" is "treat as unauthenticated".
      try {
        return decodeURIComponent(trimmed.slice(eqIdx + 1))
      } catch {
        return undefined
      }
    }
  }
  return undefined
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
