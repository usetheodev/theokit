import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'

import { slack } from '../../packages/theo/src/server/webhook/providers/slack.js'

function sign(signingSecret: string, ts: number, body: string): string {
  const base = `v0:${ts}:${body}`
  const hex = createHmac('sha256', signingSecret).update(base).digest('hex')
  return `v0=${hex}`
}

function makeReq(opts: { body?: string; headers?: HeadersInit } = {}): Request {
  return new Request('http://example.test/slack-webhook', {
    method: 'POST',
    body: opts.body ?? '',
    headers: opts.headers,
  })
}

// Test-only fixture; no network call, no real key.
const SECRET = 'fixture-only-not-a-slack-key'

describe('slack webhook verifier (T4.4)', () => {
  it('returns ok:true for valid signature within window', async () => {
    const body = 'token=xxx&team_id=T123'
    const ts = Math.floor(Date.now() / 1000)
    const verify = slack({ signingSecret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': sign(SECRET, ts, body),
        },
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects expired timestamp', async () => {
    const body = 'token=xxx'
    const ts = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    const verify = slack({ signingSecret: SECRET, toleranceSeconds: 300 })
    const result = await verify(
      makeReq({
        body,
        headers: {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': sign(SECRET, ts, body),
        },
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/timestamp/i)
  })

  it('rejects missing signature header', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const verify = slack({ signingSecret: SECRET })
    const result = await verify(
      makeReq({
        body: '',
        headers: { 'x-slack-request-timestamp': String(ts) },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects missing timestamp header', async () => {
    const verify = slack({ signingSecret: SECRET })
    const result = await verify(
      makeReq({ body: '', headers: { 'x-slack-signature': 'v0=garbage' } }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects wrong signing secret', async () => {
    const body = 'token=xxx'
    const ts = Math.floor(Date.now() / 1000)
    const verify = slack({ signingSecret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': sign('wrong', ts, body),
        },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects modified body', async () => {
    const original = 'token=xxx'
    const modified = 'token=yyy'
    const ts = Math.floor(Date.now() / 1000)
    const verify = slack({ signingSecret: SECRET })
    const result = await verify(
      makeReq({
        body: modified,
        headers: {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': sign(SECRET, ts, original),
        },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('handles empty body when signed correctly', async () => {
    const body = ''
    const ts = Math.floor(Date.now() / 1000)
    const verify = slack({ signingSecret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': sign(SECRET, ts, body),
        },
      }),
    )
    expect(result).toEqual({ ok: true })
  })
})
