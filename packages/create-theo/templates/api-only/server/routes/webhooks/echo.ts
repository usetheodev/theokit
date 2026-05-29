import { defineWebhook } from 'theokit/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Echo webhook — demonstrates `defineWebhook` HMAC-SHA256 pattern
 * without depending on an external provider (Stripe, GitHub, etc.).
 *
 * Self-test:
 *   SECRET=$(openssl rand -base64 32)
 *   echo -n '{"message":"hi"}' | openssl dgst -sha256 -hmac "$SECRET"
 *   curl -X POST localhost:3000/api/webhooks/echo \
 *     -H "x-echo-signature: <hex from above>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"message":"hi"}'
 */
const ECHO_SECRET = process.env.ECHO_WEBHOOK_SECRET ?? ''

export const POST = defineWebhook({
  verify: ({ rawBody, headers }) => {
    if (ECHO_SECRET === '') return false
    const sig = headers.get('x-echo-signature') ?? ''
    const expected = createHmac('sha256', ECHO_SECRET).update(rawBody).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(sig, 'utf-8'), Buffer.from(expected, 'utf-8'))
    } catch {
      return false
    }
  },
  inputSchema: z.object({ message: z.string() }),
  handler: async ({ input }) => {
    return Response.json({ echoed: input.message, timestamp: new Date().toISOString() })
  },
})
