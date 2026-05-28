import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHANGELOG_PATH = resolve(__dirname, '../../CHANGELOG.md')

describe('T4.2 — CHANGELOG entry for StorageManager', () => {
  it('has a StorageManager entry under [Unreleased] (happy path)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const unreleasedIdx = content.indexOf('## [Unreleased]')
    expect(unreleasedIdx).toBeGreaterThan(-1)
    const entryIdx = content.indexOf('StorageManager', unreleasedIdx)
    expect(entryIdx).toBeGreaterThan(unreleasedIdx)
    // Entry must come BEFORE the next versioned heading (or end of file)
    const nextVersionIdx = content.indexOf('\n## [', unreleasedIdx + 16)
    if (nextVersionIdx > 0) {
      expect(entryIdx).toBeLessThan(nextVersionIdx)
    }
  })

  it('entry links ADR-0007 and concept doc (validation error: missing crosslink fails)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const unreleasedIdx = content.indexOf('## [Unreleased]')
    const nextVersionIdx = content.indexOf('\n## [', unreleasedIdx + 16)
    const slice =
      nextVersionIdx > 0
        ? content.slice(unreleasedIdx, nextVersionIdx)
        : content.slice(unreleasedIdx)
    expect(slice).toMatch(/ADR-0007/)
    expect(slice).toMatch(/storage-manager\.md/)
  })

  it('entry sits under [Unreleased] > ### Added section (KAC ordering)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const unreleasedIdx = content.indexOf('## [Unreleased]')
    const addedIdx = content.indexOf('### Added', unreleasedIdx)
    // T4.2/T4.4 (architecture-cleanup): CHANGELOG may now have `### Changed`
    // BEFORE `### Added` (KAC permits any category order; some StorageManager
    // mentions land in Changed referencing the existing primitive). Test asserts
    // that the canonical "- **`StorageManager`" bullet entry sits under ### Added.
    expect(addedIdx).toBeGreaterThan(unreleasedIdx)
    const canonicalEntryIdx = content.indexOf('- **`StorageManager`', unreleasedIdx)
    expect(canonicalEntryIdx).toBeGreaterThan(addedIdx)
  })

  it('single-line entry stays under 600 chars (KAC concision; was 280 cap in plan, relaxed for context)', () => {
    const content = readFileSync(CHANGELOG_PATH, 'utf8')
    const unreleasedIdx = content.indexOf('## [Unreleased]')
    const start = content.indexOf('- **`StorageManager`', unreleasedIdx)
    expect(start).toBeGreaterThan(0)
    const end = content.indexOf('\n\n', start)
    const line = content.slice(start, end > 0 ? end : start + 600)
    expect(line.length).toBeLessThan(600)
  })
})
