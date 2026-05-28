import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADR_PATH = resolve(__dirname, '../../docs/adr/0008-theoplugin-is-the-canonical-sdk.md')

describe('ADR-0008 — TheoPlugin canonical SDK', () => {
  it('exists with MADR 3.0 sections (happy path)', () => {
    expect(existsSync(ADR_PATH), `ADR file missing at ${ADR_PATH}`).toBe(true)
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('# 0008.')
    expect(content).toContain('Status: accepted')
    expect(content).toContain('## Context and Problem Statement')
    expect(content).toContain('## Decision')
    expect(content).toContain('## Consequences')
    expect(content).toContain('## Considered Alternatives')
  })

  it('explicitly rejects defineTheokitModule in alternatives (validation error)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('defineTheokitModule')
    expect(content).toMatch(/Rejected because|REJECTED/i)
  })

  it('cross-links ADR-0007 + CLAUDE.md R0.6.5 (edge case: docs stay coherent)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/ADR-0007|0007-storage-manager/)
    expect(content).toContain('R0.6.5')
  })

  it('documents D1 and D6 with Rationale + Consequences (error scenario)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/### D1/)
    expect(content).toMatch(/### D6/)
    expect(content.match(/\*\*Rationale:\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(content.match(/\*\*Consequences:\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
