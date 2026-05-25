import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHmac } from 'node:crypto'

import { dispatchWebhook } from '../../packages/theo/src/server/webhook/define-webhook.js'

const FIXTURES = resolve(__dirname, '../../fixtures')

const makeReq = (url: string, body: string, headers: HeadersInit): Request =>
  new Request(url, { method: 'POST', body, headers })

describe('fixture: webhook-stripe (T6.1)', () => {
  it('has expected structure', () => {
    expect(existsSync(resolve(FIXTURES, 'webhook-stripe/server/webhooks/stripe.ts'))).toBe(true)
  })

  it('verifies signed Stripe request + invokes handler', async () => {
    const SECRET = 'fixture-only-not-a-stripe-key'
    process.env.STRIPE_WEBHOOK_SECRET = SECRET
    const def = (await import(resolve(FIXTURES, 'webhook-stripe/server/webhooks/stripe.ts'))) as {
      default: Parameters<typeof dispatchWebhook>[0]
    }
    const ts = Math.floor(Date.now() / 1000)
    const body = '{"id":"evt_1","type":"checkout.session.completed"}'
    // eslint-disable-next-line sonarjs/hardcoded-secret-signatures -- test-computed HMAC, not a real secret
    const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
    const res = await dispatchWebhook(
      def.default,
      makeReq('http://example.test/stripe-webhook', body, {
        'stripe-signature': `t=${ts},v1=${sig}`,
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
  })

  it('rejects invalid Stripe signature with 401', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'fixture-only-not-a-stripe-key'
    const def = (await import(resolve(FIXTURES, 'webhook-stripe/server/webhooks/stripe.ts'))) as {
      default: Parameters<typeof dispatchWebhook>[0]
    }
    const res = await dispatchWebhook(
      def.default,
      makeReq('http://example.test/stripe-webhook', '{}', {
        'stripe-signature': 't=0,v1=deadbeef',
      }),
    )
    expect(res.status).toBe(401)
  })
})

describe('fixture: webhook-github (T6.1)', () => {
  it('has expected structure', () => {
    expect(existsSync(resolve(FIXTURES, 'webhook-github/server/webhooks/github.ts'))).toBe(true)
  })

  it('verifies signed GitHub request + invokes handler', async () => {
    const SECRET = 'fixture-only-not-a-github-key'
    process.env.GITHUB_WEBHOOK_SECRET = SECRET
    const def = (await import(resolve(FIXTURES, 'webhook-github/server/webhooks/github.ts'))) as {
      default: Parameters<typeof dispatchWebhook>[0]
    }
    const body = '{"action":"opened"}'
    // eslint-disable-next-line sonarjs/hardcoded-secret-signatures -- test-computed HMAC, not a real secret
    const sig = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
    const res = await dispatchWebhook(
      def.default,
      makeReq('http://example.test/github-webhook', body, {
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request',
      }),
    )
    expect(res.status).toBe(200)
  })
})

describe('fixture: webhook-slack (T6.1)', () => {
  it('has expected structure', () => {
    expect(existsSync(resolve(FIXTURES, 'webhook-slack/server/webhooks/slack.ts'))).toBe(true)
  })

  it('verifies signed Slack request + invokes handler', async () => {
    const SECRET = 'fixture-only-not-a-slack-key'
    process.env.SLACK_SIGNING_SECRET = SECRET
    const def = (await import(resolve(FIXTURES, 'webhook-slack/server/webhooks/slack.ts'))) as {
      default: Parameters<typeof dispatchWebhook>[0]
    }
    const body = 'token=xxx&team_id=T123'
    const ts = Math.floor(Date.now() / 1000)
    const base = `v0:${ts}:${body}`
    // eslint-disable-next-line sonarjs/hardcoded-secret-signatures -- test-computed HMAC, not a real secret
    const sig = `v0=${createHmac('sha256', SECRET).update(base).digest('hex')}`
    const res = await dispatchWebhook(
      def.default,
      makeReq('http://example.test/slack-webhook', body, {
        'x-slack-request-timestamp': String(ts),
        'x-slack-signature': sig,
      }),
    )
    expect(res.status).toBe(200)
  })
})
