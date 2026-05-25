import { describe, it, expect, vi } from 'vitest'

import {
  defineWebhook,
  dispatchWebhook,
} from '../../packages/theo/src/server/webhook/define-webhook.js'

const makeReq = (body: BodyInit | null = '{"a":1}'): Request =>
  new Request('http://example.test/webhook', { method: 'POST', body })

describe('defineWebhook (T4.1)', () => {
  it('is a pure identity helper — preserves verify + handler references', () => {
    const verify = () => ({ ok: true as const })
    const handler = () => 'ok'
    const def = defineWebhook({ verify, handler })
    expect(def.verify).toBe(verify)
    expect(def.handler).toBe(handler)
    expect(def.__theokit_kind).toBe('webhook')
  })

  it('preserves maxBodyBytes when set', () => {
    const def = defineWebhook({
      verify: () => ({ ok: true }),
      handler: () => {},
      maxBodyBytes: 5_000_000,
    })
    expect(def.maxBodyBytes).toBe(5_000_000)
  })
})

describe('dispatchWebhook (T4.1)', () => {
  it('invokes handler on verify success with rawBody + traceId', async () => {
    // Declare the handler signature so vi tracks the WebhookContext arg.
    const handler = vi.fn(
      (_ctx: { rawBody: string; traceId: string }) => new Response('ok', { status: 200 }),
    )
    const def = defineWebhook({
      verify: () => ({ ok: true }),
      handler,
    })
    const res = await dispatchWebhook(def, makeReq('{"a":1}'))
    expect(handler).toHaveBeenCalledTimes(1)
    const ctx = handler.mock.calls[0]![0]
    expect(ctx.rawBody).toBe('{"a":1}')
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(res.status).toBe(200)
  })

  it('returns 401 on verify failure WITHOUT invoking handler', async () => {
    const handler = vi.fn(() => new Response('should-not-run'))
    const def = defineWebhook({
      verify: () => ({ ok: false, reason: 'bad sig' }),
      handler,
    })
    const res = await dispatchWebhook(def, makeReq())
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(await res.text()).toContain('bad sig')
  })

  it('supports async verify', async () => {
    const handler = vi.fn(() => new Response('ok'))
    const def = defineWebhook({
      verify: async () => Promise.resolve({ ok: true as const }),
      handler,
    })
    const res = await dispatchWebhook(def, makeReq())
    expect(res.status).toBe(200)
  })

  it('EC-103: verify that throws SYNC is treated as ok:false', async () => {
    const handler = vi.fn(() => new Response('should-not-run'))
    const def = defineWebhook({
      verify: () => {
        throw new Error('oops')
      },
      handler,
    })
    const res = await dispatchWebhook(def, makeReq())
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    const body = await res.text()
    expect(body).toContain('verify threw')
    expect(body).toContain('oops')
  })

  it('EC-103: verify that rejects ASYNC is treated as ok:false', async () => {
    const handler = vi.fn(() => new Response('should-not-run'))
    const def = defineWebhook({
      verify: async () => {
        await Promise.resolve()
        throw new Error('async oops')
      },
      handler,
    })
    const res = await dispatchWebhook(def, makeReq())
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(await res.text()).toContain('async oops')
  })

  it('EC-101: body over default 1MB returns 413 BEFORE verify is called', async () => {
    const verify = vi.fn(() => ({ ok: true as const }))
    const handler = vi.fn(() => new Response('ok'))
    const def = defineWebhook({ verify, handler })
    const big = 'x'.repeat(2_000_000)
    const res = await dispatchWebhook(def, makeReq(big))
    expect(res.status).toBe(413)
    expect(verify).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('handler returning unknown body is wrapped as JSON 200', async () => {
    const def = defineWebhook({
      verify: () => ({ ok: true }),
      handler: () => ({ status: 'received' }),
    })
    const res = await dispatchWebhook(def, makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'received' })
  })

  it('uses traceId from incoming traceparent when valid', async () => {
    let captured = ''
    const def = defineWebhook({
      verify: () => ({ ok: true }),
      handler: ({ traceId }) => {
        captured = traceId
        return new Response('ok')
      },
    })
    const req = new Request('http://example.test/webhook', {
      method: 'POST',
      body: '{}',
      headers: {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      },
    })
    await dispatchWebhook(def, req)
    expect(captured).toBe('0af7651916cd43dd8448eb211c80319c')
  })
})
