import { defineWebhook } from '../../../../packages/theo/src/server/webhook/define-webhook.js'
import { slack } from '../../../../packages/theo/src/server/webhook/providers/slack.js'

export default defineWebhook({
  verify: slack({
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? 'fixture-only-not-a-slack-key',
  }),
  async handler({ rawBody }) {
    // Slack sends url-encoded form OR JSON depending on event type.
    console.log(`[slack] body bytes=${rawBody.length}`)
    return { ok: true }
  },
})
