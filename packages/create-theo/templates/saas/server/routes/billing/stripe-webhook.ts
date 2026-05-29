import { defineWebhook } from 'theokit/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Stripe webhook receiver.
 *
 * Verifies `Stripe-Signature` header per Stripe's documented HMAC-SHA256
 * scheme (https://stripe.com/docs/webhooks/signatures). Real impl would
 * handle `checkout.session.completed`, `invoice.paid`, etc.
 *
 * Setup:
 *   1. Create webhook endpoint in Stripe Dashboard pointing to /api/billing/stripe-webhook
 *   2. Copy signing secret → `.env` STRIPE_WEBHOOK_SECRET
 *   3. Test locally: `stripe listen --forward-to localhost:3000/api/billing/stripe-webhook`
 */
const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export const POST = defineWebhook({
  verify: ({ rawBody, headers }) => {
    if (STRIPE_SECRET === '') return false
    const sigHeader = headers.get('stripe-signature') ?? ''
    // Stripe format: `t=<unix-ts>,v1=<hash>` (potentially also v0)
    const parts: Record<string, string> = {}
    for (const pair of sigHeader.split(',')) {
      const [k, v] = pair.split('=')
      if (k && v) parts[k.trim()] = v.trim()
    }
    const t = parts['t']
    const v1 = parts['v1']
    if (!t || !v1) return false
    const signedPayload = `${t}.${rawBody}`
    const expected = createHmac('sha256', STRIPE_SECRET).update(signedPayload).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(v1, 'utf-8'), Buffer.from(expected, 'utf-8'))
    } catch {
      return false
    }
  },
  inputSchema: z.object({ type: z.string(), data: z.unknown() }),
  handler: async ({ input, log }) => {
    log.info({ msg: 'stripe webhook received', type: input.type })
    // TODO: dispatch by input.type:
    //   - 'checkout.session.completed' → activate subscription
    //   - 'invoice.paid' → extend access
    //   - 'invoice.payment_failed' → notify user + retry plan
    return Response.json({ received: true })
  },
})
