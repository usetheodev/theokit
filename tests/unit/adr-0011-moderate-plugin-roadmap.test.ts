import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADR_PATH = resolve(__dirname, '../../docs/adr/0011-moderate-plugin-roadmap-strategy.md')

describe('ADR-0011 — moderate plugin roadmap strategy', () => {
  it('exists with MADR 3.0 sections (happy path)', () => {
    expect(existsSync(ADR_PATH)).toBe(true)
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('# 0011.')
    expect(content).toContain('Status: accepted')
    expect(content).toContain('## Context and Problem Statement')
    expect(content).toContain('## Decision')
    expect(content).toContain('## Considered Alternatives')
    expect(content).toContain('## Consequences')
  })

  it('documents D1, D4, D6, D7 with Rationale + Consequences (validation error if any missing)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    for (const d of ['D1', 'D4', 'D6', 'D7']) {
      expect(content, `must document ${d}`).toMatch(new RegExp(`### ${d} `))
    }
    expect(content.match(/\*\*Rationale:\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(content.match(/\*\*Consequences:\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('cites all 3 committed plugins (edge case: roadmap clarity)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('cors')
    expect(content).toContain('sentry')
    expect(content).toContain('i18n')
  })

  it('documents temporal gates for sentry (≤ 2 weeks) and i18n (≤ 6 weeks)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/2 weeks|≤ 2 sem/)
    expect(content).toMatch(/6 weeks|≤ 6 sem/)
  })

  it('cross-links ADR-0008 + R0.6.5', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/ADR-0008|0008-theoplugin/)
    expect(content).toContain('R0.6.5')
  })
})
