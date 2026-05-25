import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { walkSourceFiles } from '../../packages/theo/src/server/_internal/scan-walker.js'

/**
 * T3.1 — walkSourceFiles unit tests.
 * Covers PV-3 (DRY) consolidation of 3 scanner walkers + EC-11 symlink loop guard.
 */
describe('walkSourceFiles (T3.1)', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `walk-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('yields files matching extensions, skips non-matching', () => {
    writeFileSync(join(root, 'foo.ts'), '')
    writeFileSync(join(root, 'bar.tsx'), '')
    writeFileSync(join(root, 'baz.md'), '')
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts', '.tsx']) }, (p) => seen.push(p))
    const names = seen.map((p) => p.split('/').pop() ?? '').sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(['bar.tsx', 'foo.ts'])
  })

  it('recurses into subdirectories', () => {
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'nested.ts'), '')
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts']) }, (p) => seen.push(p))
    expect(seen.length).toBe(1)
    expect(seen[0]).toMatch(/sub\/nested\.ts$/)
  })

  it('skips directories starting with underscore', () => {
    mkdirSync(join(root, '_internal'))
    writeFileSync(join(root, '_internal', 'private.ts'), '')
    writeFileSync(join(root, 'public.ts'), '')
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts']) }, (p) => seen.push(p))
    const names = seen.map((p) => p.split('/').pop())
    expect(names).toEqual(['public.ts'])
  })

  it('skips directories starting with dot', () => {
    mkdirSync(join(root, '.hidden'))
    writeFileSync(join(root, '.hidden', 'secret.ts'), '')
    writeFileSync(join(root, 'visible.ts'), '')
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts']) }, (p) => seen.push(p))
    expect(seen.map((p) => p.split('/').pop())).toEqual(['visible.ts'])
  })

  it('honors custom skipPrefixes', () => {
    mkdirSync(join(root, 'skipme'))
    writeFileSync(join(root, 'skipme', 'skip.ts'), '')
    writeFileSync(join(root, 'keep.ts'), '')
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts']), skipPrefixes: ['skip'] }, (p) =>
      seen.push(p),
    )
    expect(seen.map((p) => p.split('/').pop())).toEqual(['keep.ts'])
  })

  it('handles empty directory — no error', () => {
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts']) }, (p) => seen.push(p))
    expect(seen).toEqual([])
  })

  it('handles unreadable directory — silently skips', () => {
    const seen: string[] = []
    walkSourceFiles(join(root, 'nonexistent'), { extensions: new Set(['.ts']) }, (p) =>
      seen.push(p),
    )
    expect(seen).toEqual([])
  })

  it('returns absolute paths', () => {
    writeFileSync(join(root, 'a.ts'), '')
    const seen: string[] = []
    walkSourceFiles(root, { extensions: new Set(['.ts']) }, (p) => seen.push(p))
    expect(seen[0]?.startsWith('/')).toBe(true)
  })

  // EC-11 — symlink loop guard (best-effort: skip the loop)
  it('EC-11: symlink loop does not hang within 1s', () => {
    mkdirSync(join(root, 'a'))
    mkdirSync(join(root, 'b'))
    writeFileSync(join(root, 'a', 'real.ts'), '')
    // Create symlinks a/loop → ../b and b/loop → ../a (mutual loop)
    try {
      symlinkSync('../b', join(root, 'a', 'loop'))
      symlinkSync('../a', join(root, 'b', 'loop'))
    } catch {
      // Symlinks not supported (unlikely on Linux); skip test
      return
    }
    const start = Date.now()
    const seen: string[] = []
    // walkSourceFiles doesn't pre-resolve symlinks; readdir+isDirectory on
    // symlink returns false (it's a SymbolicLink type), so loops are
    // implicitly avoided. Test passes by completing under 1s.
    walkSourceFiles(root, { extensions: new Set(['.ts']) }, (p) => seen.push(p))
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1_000)
    expect(seen.length).toBeGreaterThanOrEqual(1)
  })
})
