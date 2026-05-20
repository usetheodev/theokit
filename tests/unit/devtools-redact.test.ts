/**
 * T2.3 — Privacy redaction unit tests.
 *
 * EC-18 — query string redaction
 * EC-19 — binary body type-safe truncate
 * EC-26 — BigInt walker (serializeSafely)
 * Headers — Authorization / Cookie / Set-Cookie / x-api-key / x-auth-token
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { describe, expect, it } from 'vitest'
import {
  redactHeaders,
  redactQueryString,
  serializeSafely,
  truncateBody,
} from '../../packages/theo/src/devtools/server-side/redact.js'

describe('redactHeaders', () => {
  it('redacts Authorization header (case-insensitive)', () => {
    const out = redactHeaders({ Authorization: 'Bearer xyz', 'content-type': 'application/json' })
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out['content-type']).toBe('application/json')
  })

  it('redacts lowercase authorization', () => {
    const out = redactHeaders({ authorization: 'Bearer xyz' })
    expect(out.authorization).toBe('[REDACTED]')
  })

  it('redacts cookie + set-cookie', () => {
    const out = redactHeaders({ Cookie: 'sid=1', 'Set-Cookie': 'a=b' })
    expect(out.Cookie).toBe('[REDACTED]')
    expect(out['Set-Cookie']).toBe('[REDACTED]')
  })

  it('redacts x-api-key + x-auth-token + proxy-authorization', () => {
    const out = redactHeaders({
      'X-API-Key': 'abc',
      'X-Auth-Token': 'def',
      'Proxy-Authorization': 'Basic ghi',
    })
    expect(out['X-API-Key']).toBe('[REDACTED]')
    expect(out['X-Auth-Token']).toBe('[REDACTED]')
    expect(out['Proxy-Authorization']).toBe('[REDACTED]')
  })

  it('joins array header values for non-sensitive headers', () => {
    const out = redactHeaders({ Accept: ['text/html', 'application/json'] })
    expect(out.Accept).toBe('text/html, application/json')
  })

  it('redacts array Set-Cookie completely', () => {
    const out = redactHeaders({ 'Set-Cookie': ['a=1', 'b=2'] })
    expect(out['Set-Cookie']).toBe('[REDACTED]')
  })

  it('skips undefined values', () => {
    const out = redactHeaders({ Foo: undefined, Bar: 'x' })
    expect(out.Foo).toBeUndefined()
    expect(out.Bar).toBe('x')
  })
})

describe('truncateBody (EC-19)', () => {
  it('returns short string unchanged', () => {
    expect(truncateBody('small', 4096)).toEqual({
      preview: 'small',
      length: 5,
      truncated: false,
    })
  })

  it('truncates strings over the cap', () => {
    const long = 'a'.repeat(5000)
    const out = truncateBody(long, 4096)
    expect(out.preview.length).toBe(4096)
    expect(out.length).toBe(5000)
    expect(out.truncated).toBe(true)
  })

  it('handles undefined / null', () => {
    expect(truncateBody(undefined)).toEqual({ preview: '', length: 0, truncated: false })
    expect(truncateBody(null)).toEqual({ preview: '', length: 0, truncated: false })
  })

  it('EC-19: Buffer body → [binary body] placeholder (no crash on slice)', () => {
    const buf = Buffer.from([1, 2, 3, 4])
    const out = truncateBody(buf)
    expect(out.preview).toBe('[binary body]')
    expect(out.length).toBe(0)
    expect(out.truncated).toBe(true)
  })

  it('EC-19: FormData body → [binary body] placeholder', () => {
    const fd = new FormData()
    const out = truncateBody(fd)
    expect(out.preview).toBe('[binary body]')
  })

  it('EC-19: object body (any non-string) → [binary body] placeholder', () => {
    const out = truncateBody({ x: 1 })
    expect(out.preview).toBe('[binary body]')
  })
})

describe('redactQueryString (EC-18)', () => {
  it('redacts ?token= in path', () => {
    expect(redactQueryString('/api/file?token=eyJhbGc')).toBe('/api/file?token=%5BREDACTED%5D')
  })

  it('redacts multiple sensitive keys preserving other params', () => {
    expect(redactQueryString('/api?token=abc&user=alice&api_key=def')).toBe(
      '/api?token=%5BREDACTED%5D&user=alice&api_key=%5BREDACTED%5D',
    )
  })

  it('redacts URL-encoded key (token written as %74%6F%6B%65%6E)', () => {
    expect(redactQueryString('/api?%74%6F%6B%65%6E=xyz')).toBe(
      '/api?%74%6F%6B%65%6E=%5BREDACTED%5D',
    )
  })

  it('returns path unchanged when no query string', () => {
    expect(redactQueryString('/api/users')).toBe('/api/users')
  })

  it('returns path unchanged when query has no sensitive keys', () => {
    expect(redactQueryString('/api?page=1&limit=10')).toBe('/api?page=1&limit=10')
  })

  it('handles password / secret / auth / access_token keys', () => {
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- testing the REDACTOR with literal sensitive-shaped strings
    expect(redactQueryString('/x?password=abc')).toContain('password=%5BREDACTED%5D')
    expect(redactQueryString('/x?secret=abc')).toContain('secret=%5BREDACTED%5D')
    expect(redactQueryString('/x?auth=abc')).toContain('auth=%5BREDACTED%5D')
    expect(redactQueryString('/x?access_token=abc')).toContain('access_token=%5BREDACTED%5D')
  })

  it('handles case-insensitive key match', () => {
    expect(redactQueryString('/x?TOKEN=abc')).toBe('/x?TOKEN=%5BREDACTED%5D')
  })
})

describe('serializeSafely (EC-26)', () => {
  it('converts BigInt → "<n>n" string', () => {
    expect(serializeSafely(123n)).toBe('123n')
  })

  it('preserves number, string, boolean, null, undefined', () => {
    expect(serializeSafely(42)).toBe(42)
    expect(serializeSafely('hi')).toBe('hi')
    expect(serializeSafely(true)).toBe(true)
    expect(serializeSafely(null)).toBe(null)
    expect(serializeSafely(undefined)).toBe(undefined)
  })

  it('walks nested objects converting BigInt at any depth', () => {
    const input = { a: 1, b: { c: 999n, d: [10n, 20n, { e: 5n }] } }
    const out = serializeSafely(input) as Record<string, unknown>
    expect(out.a).toBe(1)
    const b = out.b as Record<string, unknown>
    expect(b.c).toBe('999n')
    const d = b.d as unknown[]
    expect(d[0]).toBe('10n')
    expect(d[1]).toBe('20n')
    expect((d[2] as Record<string, unknown>).e).toBe('5n')
  })

  it('does not mutate input', () => {
    const input = { id: 100n }
    serializeSafely(input)
    expect(input.id).toBe(100n)
  })

  it('handles circular references gracefully (no infinite loop)', () => {
    const a: Record<string, unknown> = { x: 1 }
    a.self = a
    const out = serializeSafely(a) as Record<string, unknown>
    expect(out.x).toBe(1)
    expect(out.self).toBe('[Circular]')
  })
})
