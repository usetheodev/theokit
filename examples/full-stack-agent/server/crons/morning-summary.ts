import { defineCron } from 'theokit/server'

/**
 * Example: a daily summary cron. Fires at 09:00 UTC every day. In a real
 * agent app, this would fetch HN top stories, summarize via the LLM,
 * and post to Telegram/Slack/Email.
 */
export default defineCron('morning-summary', {
  schedule: '0 9 * * *',
  async handler({ traceId, scheduledAt }) {
    console.log(`[cron:morning-summary] firing at ${scheduledAt.toISOString()} trace=${traceId}`)
    // Production: fetch HN, call Agent.prompt, post to channel.
  },
})
