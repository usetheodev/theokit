import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { scanCrons } from '../../packages/theo/src/server/cron/cron-scan.js'
import { buildCronManifest } from '../../packages/theo/src/server/cron/cron-manifest.js'

const FIXTURE = resolve(__dirname, '../../fixtures/cron-basic')

describe('fixture: cron-basic (T6.1)', () => {
  it('has expected structure', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/crons/morning-summary.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('scanCrons discovers the morning-summary cron', async () => {
    const nodes = await scanCrons(resolve(FIXTURE, 'server/crons'))
    expect(nodes.length).toBe(1)
    expect(nodes[0].name).toBe('morning-summary')
    expect(nodes[0].schedule).toBe('0 9 * * *')
    expect(nodes[0].concurrency).toBe('forbid')
  })

  it('buildCronManifest produces a valid manifest from the fixture', async () => {
    const nodes = await scanCrons(resolve(FIXTURE, 'server/crons'))
    const manifest = buildCronManifest(nodes, FIXTURE)
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.crons.length).toBe(1)
    expect(manifest.crons[0].filePath).toBe('server/crons/morning-summary.ts')
  })
})
