import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { scanCrons } from '../../packages/theo/src/server/cron/cron-scan.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'theokit-cron-scan-'))
  mkdirSync(join(root, 'server', 'crons'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const crons = (): string => join(root, 'server', 'crons')

const cronModule = (name: string, schedule = '0 9 * * *'): string => `
import { defineCron } from '${join(process.cwd(), 'packages/theo/src/server/cron/define-cron.ts')}'
export default defineCron('${name}', { schedule: '${schedule}', handler: () => {} })
`

describe('scanCrons (T1.3)', () => {
  it('returns empty array for empty directory', async () => {
    const result = await scanCrons(crons())
    expect(result).toEqual([])
  })

  it('discovers one cron file', async () => {
    writeFileSync(join(crons(), 'morning.ts'), cronModule('morning-summary'))
    const result = await scanCrons(crons())
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('morning-summary')
    expect(result[0].schedule).toBe('0 9 * * *')
    expect(result[0].filePath).toMatch(/morning\.ts$/)
  })

  it('discovers multiple crons in deterministic order (by name)', async () => {
    writeFileSync(join(crons(), 'a.ts'), cronModule('zulu', '0 1 * * *'))
    writeFileSync(join(crons(), 'b.ts'), cronModule('alpha', '0 2 * * *'))
    const result = await scanCrons(crons())
    expect(result.map((c) => c.name)).toEqual(['alpha', 'zulu'])
  })

  it('throws on duplicate cron names', async () => {
    writeFileSync(join(crons(), 'first.ts'), cronModule('dup'))
    writeFileSync(join(crons(), 'second.ts'), cronModule('dup'))
    await expect(scanCrons(crons())).rejects.toThrow(/duplicate.*dup/i)
  })

  it('throws actionable error for module without default export', async () => {
    writeFileSync(join(crons(), 'bad.ts'), 'export const nope = 1\n')
    await expect(scanCrons(crons())).rejects.toThrow(/default export/i)
  })

  it('ignores dotfiles and underscore-prefixed files', async () => {
    writeFileSync(join(crons(), '_helper.ts'), 'export const x = 1')
    writeFileSync(join(crons(), '.DS_Store'), '')
    writeFileSync(join(crons(), 'real.ts'), cronModule('real-cron'))
    const result = await scanCrons(crons())
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('real-cron')
  })

  it('CronNode includes concurrency policy', async () => {
    writeFileSync(join(crons(), 'c.ts'), cronModule('c-name'))
    const [node] = await scanCrons(crons())
    expect(node.concurrency).toBe('forbid')
  })
})
