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
      return decodeURIComponent(trimmed.slice(eqIdx + 1))
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
  const opts: Required<Omit<CookieOptions, 'maxAge' | 'domain'>> & Pick<CookieOptions, 'maxAge' | 'domain'> = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...options,
  }

  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1)}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.path) parts.push(`Path=${opts.path}`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)

  // Append to existing Set-Cookie headers (EC-1: don't overwrite)
  const existing = res.getHeader('Set-Cookie')
  const cookies: string[] = existing
    ? Array.isArray(existing) ? existing.map(String) : [String(existing)]
    : []
  cookies.push(parts.join('; '))
  res.setHeader('Set-Cookie', cookies)
}

export function deleteCookie(
  res: ServerResponse,
  name: string,
  options?: { path?: string },
): void {
  setCookie(res, name, '', { maxAge: 0, path: options?.path ?? '/' })
}
