import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { scanCrons } from '../../packages/theo/src/server/cron/cron-scan.js'
import { scanJobs } from '../../packages/theo/src/server/jobs/job-scan.js'

const EXAMPLE = resolve(__dirname, '../../examples/full-stack-agent')

describe('examples/full-stack-agent: jobs + crons + webhooks (T6.2)', () => {
  it('crons/morning-summary.ts present', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/crons/morning-summary.ts'))).toBe(true)
  })

  it('jobs/process-document.ts present', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/jobs/process-document.ts'))).toBe(true)
  })

  it('webhooks/stripe.ts present', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/webhooks/stripe.ts'))).toBe(true)
  })

  it('lib/usage-tracking.ts singleton present', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/lib/usage-tracking.ts'))).toBe(true)
  })

  it('routes/usage.ts surfaces getUsage', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/routes/usage.ts'))).toBe(true)
  })

  it('scanCrons discovers the example cron', async () => {
    const nodes = await scanCrons(resolve(EXAMPLE, 'server/crons'))
    expect(nodes.some((n) => n.name === 'morning-summary')).toBe(true)
  })

  it('scanJobs discovers the example job', async () => {
    const nodes = await scanJobs(resolve(EXAMPLE, 'server/jobs'))
    expect(nodes.some((n) => n.name === 'process-document')).toBe(true)
  })
})
