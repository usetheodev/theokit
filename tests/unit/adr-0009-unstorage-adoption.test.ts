import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADR_PATH = resolve(__dirname, '../../docs/adr/0009-unstorage-adoption-for-kv.md')

describe('ADR-0009 — unstorage adoption for KV', () => {
  it('exists with MADR sections (happy path)', () => {
    expect(existsSync(ADR_PATH)).toBe(true)
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('# 0009.')
    expect(content).toContain('Status: accepted')
    expect(content).toContain('## Context and Problem Statement')
    expect(content).toContain('## Decision')
    expect(content).toContain('## Consequences')
    expect(content).toContain('## Considered Alternatives')
  })

  it('cites Nitro prior art (validation error: missing evidence)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/Nitro/i)
    expect(content).toContain('runtime/internal/storage.ts')
  })

  it('documents optional peer-dep model (edge case: install model)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/peerDependenciesMeta/)
    expect(content).toMatch(/optional/i)
  })

  it('rejects inventing TheoKit-native registry (error scenario)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/Rejected because/i)
    expect(content).toMatch(/Reinventing|Reinvent/i)
  })

  it('declares D2 decision', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/### D2/)
  })
})
