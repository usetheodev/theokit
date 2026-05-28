import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHANGELOG_PATH = resolve(__dirname, '../../CHANGELOG.md')

describe('T5.2 — CHANGELOG entries for storage-modules-sdk-delegation', () => {
  it('has definePlugin entry under [Unreleased] (happy path)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const unreleasedIdx = content.indexOf('## [Unreleased]')
    const nextVersionIdx = content.indexOf('\n## [', unreleasedIdx + 16)
    const sliceUntilNext =
      nextVersionIdx > 0
        ? content.slice(unreleasedIdx, nextVersionIdx)
        : content.slice(unreleasedIdx)
    expect(sliceUntilNext).toMatch(/definePlugin/)
  })

  it('has useStorage entry (happy path)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    expect(content).toMatch(/useStorage<T>|useStorage<\\T>|useStorage\\<T\\>/)
  })

  it('has unstorage AND db0 entry (happy path)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    expect(content).toContain('unstorage')
    expect(content).toContain('db0')
  })

  it('entries cite ADR-0008, ADR-0009, ADR-0010 (validation error: cross-links)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    expect(content).toContain('ADR-0008')
    expect(content).toContain('ADR-0009')
    expect(content).toContain('ADR-0010')
  })

  it('entries grouped under [Unreleased] > ### Added (KAC ordering)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const unreleasedIdx = content.indexOf('## [Unreleased]')
    const sectionIdx = content.indexOf('### Added (storage-modules-sdk-delegation', unreleasedIdx)
    expect(sectionIdx).toBeGreaterThan(unreleasedIdx)
  })

  it('[EC-6] each entry under 700 chars', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const sectionStart = content.indexOf('### Added (storage-modules-sdk-delegation')
    const sectionEnd = content.indexOf('### Added (pluggable-storage-storage-manager', sectionStart)
    expect(sectionStart).toBeGreaterThan(-1)
    expect(sectionEnd).toBeGreaterThan(sectionStart)
    const slice = content.slice(sectionStart, sectionEnd)
    // Split by bullet pattern; each bullet (until \n\n or next bullet) must be < 700
    const bullets = slice.split(/\n- \*\*/).slice(1)
    expect(bullets.length).toBeGreaterThanOrEqual(3)
    for (const b of bullets) {
      const line = `- **${b.split('\n\n')[0]?.split('\n-')[0] ?? ''}`
      expect(
        line.length,
        `bullet too long (${String(line.length)} chars): ${line.slice(0, 80)}...`,
      ).toBeLessThan(700)
    }
  })
})
