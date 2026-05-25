import { defineCron } from '../../../../packages/theo/src/server/cron/define-cron.js'

export default defineCron('morning-summary', {
  schedule: '0 9 * * *', // 09:00 UTC daily
  async handler({ traceId, scheduledAt }) {
    console.log(`[cron:morning-summary] trace=${traceId} scheduledAt=${scheduledAt.toISOString()}`)
  },
})
