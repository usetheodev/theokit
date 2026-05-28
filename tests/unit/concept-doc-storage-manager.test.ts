import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOC_PATH = resolve(__dirname, '../../docs/concepts/storage-manager.md')

describe('T4.1 — docs/concepts/storage-manager.md', () => {
  it('exists with all required sections (happy path)', () => {
    expect(existsSync(DOC_PATH)).toBe(true)
    const content = readFileSync(DOC_PATH, 'utf8')
    for (const heading of [
      '# Storage Manager',
      '## 1. What & Why',
      '## 2. API Surface',
      '## 3. Config schema',
      '## 4. Deploy-target matrix',
      '## 5. Cookbook',
      '## 6. Edge cases & gotchas',
    ]) {
      expect(content, `Missing section: ${heading}`).toContain(heading)
    }
  })

  it('cites ADR-0007 (validation error: missing crosslink fails)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('ADR-0007')
    expect(content).toContain('0007-storage-manager-singleton')
  })

  it('deploy matrix has 5 targets — TheoCloud, Vercel, Cloudflare, K8s, Node', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/TheoCloud/)
    expect(content).toMatch(/Vercel/)
    expect(content).toMatch(/Cloudflare/)
    expect(content).toMatch(/K8s/)
    expect(content).toMatch(/Node self-host/)
  })

  it('references the reference deep-dive doc', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('pluggable-storage-managed-pg-redis.md')
  })

  it('[EC-7/EC-8/EC-9] documents the 3 runtime gotchas', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('[EC-7]') // dispose timeout
    expect(content).toContain('[EC-8]') // HMR
    expect(content).toContain('[EC-9]') // SIGKILL
    expect(content).toMatch(/SIGKILL/)
    expect(content).toMatch(/HMR/)
    expect(content).toMatch(/timeout/)
  })

  it('[EC-1] documents the unknown-keys gotcha', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('[EC-1]')
    expect(content).toMatch(/silently/)
    expect(content).toMatch(/typo|databasees/)
  })

  it('cookbook section has at least 3 worked examples (numbered subsections)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    const matches = content.match(/### 5\.\d+/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })
})
