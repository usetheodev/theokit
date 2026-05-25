import { defineWebhook } from '../../../../packages/theo/src/server/webhook/define-webhook.js'
import { github } from '../../../../packages/theo/src/server/webhook/providers/github.js'

export default defineWebhook({
  verify: github({
    secret: process.env.GITHUB_WEBHOOK_SECRET ?? 'fixture-only-not-a-github-key',
  }),
  async handler({ rawBody, request }) {
    const event = request.headers.get('x-github-event') ?? 'unknown'
    const payload = JSON.parse(rawBody) as { action?: string }
    console.log(`[github] event=${event} action=${payload.action ?? '-'}`)
    return { received: true }
  },
})
