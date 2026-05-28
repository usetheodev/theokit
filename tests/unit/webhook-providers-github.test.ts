import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'

import { github } from '../../packages/theo/src/server/webhook/providers/github.js'

function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function makeReq(opts: { body?: string; headers?: HeadersInit } = {}): Request {
  return new Request('http://example.test/github-webhook', {
    method: 'POST',
    body: opts.body ?? '',
    headers: opts.headers,
  })
}

// Test-only fixture; no network call, no real key.
const SECRET = 'fixture-only-not-a-github-key'

describe('github webhook verifier (T4.3)', () => {
  it('returns ok:true for valid signature', async () => {
    const body = '{"action":"opened"}'
    const verify = github({ secret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: { 'x-hub-signature-256': sign(SECRET, body) },
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects wrong secret', async () => {
    const body = '{"action":"opened"}'
    const verify = github({ secret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: { 'x-hub-signature-256': sign('wrong', body) },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects missing X-Hub-Signature-256', async () => {
    const verify = github({ secret: SECRET })
    const result = await verify(makeReq({ body: '{}' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/missing/i)
  })

  it('rejects malformed header (no sha256= prefix)', async () => {
    const verify = github({ secret: SECRET })
    const result = await verify(
      makeReq({ body: '{}', headers: { 'x-hub-signature-256': 'garbage' } }),
    )
    expect(result.ok).toBe(false)
  })

  it('supports multi-key rotation', async () => {
    const body = '{}'
    const verify = github({ secret: ['old', 'new'] })
    const result = await verify(
      makeReq({ body, headers: { 'x-hub-signature-256': sign('new', body) } }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('handles empty body when signed correctly', async () => {
    const body = ''
    const verify = github({ secret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: { 'x-hub-signature-256': sign(SECRET, body) },
      }),
    )
    expect(result).toEqual({ ok: true })
  })
})
