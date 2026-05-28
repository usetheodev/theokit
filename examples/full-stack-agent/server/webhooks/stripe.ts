import { defineWebhook } from 'theokit/server'
import { stripe } from 'theokit/server/webhook/providers'

/**
 * Example: Stripe webhook for subscription lifecycle events. Verifies
 * `stripe-signature` against `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256 with
 * 5-minute replay window).
 *
 * In production:
 *   - On `customer.subscription.created` → upgrade user's tier in DB
 *   - On `customer.subscription.deleted` → revert tier
 *   - On `invoice.payment_failed` → notify user
 */
export default defineWebhook({
  verify: stripe({
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? 'example-not-a-real-key',
  }),
  async handler({ rawBody, traceId }) {
    const event = JSON.parse(rawBody) as {
      id: string
      type: string
      data: { object: unknown }
    }
    console.log(`[webhook:stripe] type=${event.type} id=${event.id} trace=${traceId}`)
    return { received: true }
  },
})
