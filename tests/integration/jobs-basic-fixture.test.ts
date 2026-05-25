import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { scanJobs } from '../../packages/theo/src/server/jobs/job-scan.js'

const FIXTURE = resolve(__dirname, '../../fixtures/jobs-basic')

describe('fixture: jobs-basic (T6.1)', () => {
  it('has expected structure', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/jobs/process-document.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/upload.ts'))).toBe(true)
  })

  it('scanJobs discovers process-document', async () => {
    const nodes = await scanJobs(resolve(FIXTURE, 'server/jobs'))
    expect(nodes.length).toBe(1)
    expect(nodes[0].name).toBe('process-document')
    expect(nodes[0].maxAttempts).toBe(3)
    expect(nodes[0].hasInputSchema).toBe(true)
  })
})
