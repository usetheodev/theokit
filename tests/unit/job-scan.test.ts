import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { scanJobs } from '../../packages/theo/src/server/jobs/job-scan.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'theokit-job-scan-'))
  mkdirSync(join(root, 'server', 'jobs'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const jobs = (): string => join(root, 'server', 'jobs')

const jobModule = (name: string, withSchema = false): string => {
  const schemaImport = withSchema ? "import { z } from 'zod'\n" : ''
  const schemaDecl = withSchema ? 'input: z.object({ id: z.string() }),\n' : ''
  return `
${schemaImport}import { defineJob } from '${join(process.cwd(), 'packages/theo/src/server/jobs/define-job.ts')}'
export default defineJob('${name}', {
  ${schemaDecl}
  handler: async () => {},
})
`
}

describe('scanJobs (T2.3)', () => {
  it('returns empty array for empty directory', async () => {
    const result = await scanJobs(jobs())
    expect(result).toEqual([])
  })

  it('discovers one job', async () => {
    writeFileSync(join(jobs(), 'process.ts'), jobModule('process-document'))
    const result = await scanJobs(jobs())
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('process-document')
    expect(result[0].maxAttempts).toBe(1)
    expect(result[0].hasInputSchema).toBe(false)
  })

  it('captures hasInputSchema true when Zod schema present', async () => {
    writeFileSync(join(jobs(), 'send.ts'), jobModule('send-email', true))
    const result = await scanJobs(jobs())
    expect(result[0].hasInputSchema).toBe(true)
  })

  it('throws DuplicateJobNameError on name collision', async () => {
    writeFileSync(join(jobs(), 'a.ts'), jobModule('dup'))
    writeFileSync(join(jobs(), 'b.ts'), jobModule('dup'))
    await expect(scanJobs(jobs())).rejects.toThrow(/duplicate.*dup/i)
  })

  it('throws on missing default export', async () => {
    writeFileSync(join(jobs(), 'bad.ts'), 'export const nope = 1\n')
    await expect(scanJobs(jobs())).rejects.toThrow(/default export/i)
  })

  it('returns nodes sorted by name', async () => {
    writeFileSync(join(jobs(), 'a.ts'), jobModule('zulu'))
    writeFileSync(join(jobs(), 'b.ts'), jobModule('alpha'))
    const result = await scanJobs(jobs())
    expect(result.map((n) => n.name)).toEqual(['alpha', 'zulu'])
  })

  it('ignores underscore + dot prefixed files', async () => {
    writeFileSync(join(jobs(), '_helper.ts'), 'export const x = 1')
    writeFileSync(join(jobs(), '.DS_Store'), '')
    writeFileSync(join(jobs(), 'real.ts'), jobModule('real-job'))
    const result = await scanJobs(jobs())
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('real-job')
  })
})
