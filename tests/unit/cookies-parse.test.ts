import { describe, it, expect } from 'vitest'

import { parseCookieHeader } from '../../packages/theo/src/server/http/cookies.js'

/**
 * T3.2 — parseCookieHeader canonical helper.
 * Covers PV-4 DRY consolidation + EC-12 broader inline-parser detection.
 */
describe('parseCookieHeader (T3.2)', () => {
  it('happy path: returns Map', () => {
    const map = parseCookieHeader('a=1; b=2')
    expect(map.get('a')).toBe('1')
    expect(map.get('b')).toBe('2')
    expect(map.size).toBe(2)
  })

  it('empty input → empty Map', () => {
    expect(parseCookieHeader('').size).toBe(0)
    expect(parseCookieHeader(undefined).size).toBe(0)
  })

  it('URL-decodes values', () => {
    const map = parseCookieHeader('name=hello%20world')
    expect(map.get('name')).toBe('hello world')
  })

  it('EDGE: duplicate name — last wins', () => {
    const map = parseCookieHeader('a=1; a=2')
    expect(map.get('a')).toBe('2')
    expect(map.size).toBe(1)
  })

  it('EDGE: malformed entry (no =) skipped', () => {
    const map = parseCookieHeader('novalue; a=1')
    expect(map.get('a')).toBe('1')
    expect(map.has('novalue')).toBe(false)
    expect(map.size).toBe(1)
  })

  it('EDGE: malformed percent-encoding → raw value preserved (consumer treats untrusted)', () => {
    const map = parseCookieHeader('a=%GG')
    expect(map.get('a')).toBe('%GG')
  })

  it('EC-12: no inline cookie parsing remains in server/', async () => {
    const { execSync } = await import('node:child_process')
    const { resolve } = await import('node:path')
    let stdout = ''
    try {
      stdout = execSync(
        'grep -rEln "(headers\\.cookie|headers\\[\'cookie\'\\])\\?\\.split|cookie\\".split" packages/theo/src/server 2>/dev/null || true',
        { encoding: 'utf8', cwd: resolve(__dirname, '../..') },
      )
    } catch {
      stdout = ''
    }
    const offenders = stdout
      .split('\n')
      .filter((l) => l && !l.includes('dist/') && !l.endsWith('cookies.ts'))
    expect(offenders).toEqual([])
  })
})
