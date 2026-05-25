import { defineWebhook } from '../../../../packages/theo/src/server/webhook/define-webhook.js'
import { stripe } from '../../../../packages/theo/src/server/webhook/providers/stripe.js'

export default defineWebhook({
  verify: stripe({
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? 'fixture-only-not-a-stripe-key',
  }),
  async handler({ rawBody }) {
    const event = JSON.parse(rawBody) as { id: string; type: string }
    console.log(`[stripe] event ${event.type} id=${event.id}`)
    return { received: true }
  },
})
