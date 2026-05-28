import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOC_PATH = resolve(__dirname, '../../docs/concepts/storage-manager.md')

describe('T5.1 — storage-manager.md v2 (3-layer extension story)', () => {
  it('has useStorage<T> recipe (happy path)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('### 5.4')
    expect(content).toMatch(/useStorage</)
  })

  it('has useUnstorage recipe (validation error: missing)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('### 5.5')
    expect(content).toContain('useUnstorage')
    expect(content).toContain("'unstorage/drivers/redis'")
  })

  it('has useDatabase recipe (edge case)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('### 5.6')
    expect(content).toContain('useDatabase')
    expect(content).toContain('libsql')
  })

  it('has Extension model section §7 (error scenario: section missing)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/## 7\. Extension model/)
  })

  it('cross-links plugins.md', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/plugins\.md/)
  })

  it('documents reserved key prefixes', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('__pg:')
    expect(content).toContain('__redis:')
    expect(content).toContain('__unstorage:')
    expect(content).toContain('__db0:')
    expect(content).toMatch(/Reserved key prefixes/)
  })

  it('documents useDatabase manual dispose pattern (EC-9)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/useDatabase` does NOT auto-register/)
    expect(content).toMatch(/getStorageManager\(\)\.register/)
  })

  it('documents native modules support / better-sqlite3 (EC-10)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('better-sqlite3')
    expect(content).toMatch(/native modules|Native modules|prebuilt/i)
  })

  it('documents peer-dep version mismatch caveat (EC-11)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/Peer-dep version mismatch|peer-deps are declared/i)
    expect(content).toMatch(/CHANGELOG|changelog/)
  })

  it('cross-links ADRs D2 / D3 / D4 (validation: discoverability)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('ADR-0009')
    expect(content).toContain('ADR-0010')
  })
})
