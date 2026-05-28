import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADR_PATH = resolve(__dirname, '../../docs/adr/0007-storage-manager-singleton.md')

describe('ADR-0007 — StorageManager singleton', () => {
  it('exists and has the MADR 3.0 sections', () => {
    expect(existsSync(ADR_PATH), `ADR file missing at ${ADR_PATH}`).toBe(true)
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('# 0007.')
    expect(content).toContain('Status: accepted')
    expect(content).toContain('## Context and Problem Statement')
    expect(content).toContain('## Decision')
    expect(content).toContain('## Consequences')
  })

  it('cites all 7 decisions D1..D7 with rationale + consequences', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    for (const d of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']) {
      expect(content, `ADR must document ${d}`).toMatch(new RegExp(`### ${d} `))
    }
    expect(content.match(/\*\*Rationale\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(content.match(/\*\*Consequences\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
  })

  it('cross-links to ADR-0002 and the reference doc', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/ADR-0002|0002-job-backend-interface-neutral-contract/)
    expect(content).toContain('pluggable-storage-managed-pg-redis.md')
  })
})
