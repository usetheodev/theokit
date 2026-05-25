import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'

import { stripe } from '../../packages/theo/src/server/webhook/providers/stripe.js'

function sign(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

function makeReq(opts: { body?: string; headers?: HeadersInit } = {}): Request {
  return new Request('http://example.test/stripe-webhook', {
    method: 'POST',
    body: opts.body ?? '',
    headers: opts.headers,
  })
}

// Test-only fixture; no network call, no real key.
const SECRET = 'fixture-only-not-a-stripe-key'

describe('stripe webhook verifier (T4.2)', () => {
  it('returns ok:true for valid signature within tolerance', async () => {
    const body = '{"id":"evt_1"}'
    const ts = Math.floor(Date.now() / 1000)
    const sig = sign(SECRET, ts, body)
    const verify = stripe({ secret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects expired timestamp beyond tolerance', async () => {
    const body = '{"id":"evt_1"}'
    const ts = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    const sig = sign(SECRET, ts, body)
    const verify = stripe({ secret: SECRET, toleranceSeconds: 300 })
    const result = await verify(
      makeReq({
        body,
        headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/timestamp/i)
  })

  it('rejects missing stripe-signature header', async () => {
    const verify = stripe({ secret: SECRET })
    const result = await verify(makeReq({ body: '{}' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/missing/i)
  })

  it('rejects wrong signature', async () => {
    const body = '{"id":"evt_1"}'
    const ts = Math.floor(Date.now() / 1000)
    const wrongSig = sign('wrong-secret', ts, body)
    const verify = stripe({ secret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: { 'stripe-signature': `t=${ts},v1=${wrongSig}` },
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/mismatch/i)
  })

  it('rejects modified body (signature was for different body)', async () => {
    const original = '{"id":"evt_1"}'
    const modified = '{"id":"evt_2"}'
    const ts = Math.floor(Date.now() / 1000)
    const sig = sign(SECRET, ts, original)
    const verify = stripe({ secret: SECRET })
    const result = await verify(
      makeReq({
        body: modified,
        headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('supports multi-key rotation (array of secrets, any matches)', async () => {
    const body = '{}'
    const ts = Math.floor(Date.now() / 1000)
    const sigWithNew = sign('new-secret', ts, body)
    const verify = stripe({ secret: ['old-secret', 'new-secret'] })
    const result = await verify(
      makeReq({
        body,
        headers: { 'stripe-signature': `t=${ts},v1=${sigWithNew}` },
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects malformed signature header', async () => {
    const verify = stripe({ secret: SECRET })
    const result = await verify(makeReq({ body: '{}', headers: { 'stripe-signature': 'garbage' } }))
    expect(result.ok).toBe(false)
  })

  it('handles empty body when signed correctly', async () => {
    const body = ''
    const ts = Math.floor(Date.now() / 1000)
    const sig = sign(SECRET, ts, body)
    const verify = stripe({ secret: SECRET })
    const result = await verify(
      makeReq({
        body,
        headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects when only timestamp present (no v1)', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const verify = stripe({ secret: SECRET })
    const result = await verify(makeReq({ body: '{}', headers: { 'stripe-signature': `t=${ts}` } }))
    expect(result.ok).toBe(false)
  })
})
