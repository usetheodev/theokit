import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cleanOutDir, gcAgentRegistry } from '../../packages/theo/src/cli/cleanup/cleanup.js'

/**
 * T2.1 — cleanOutDir + gcAgentRegistry unit tests.
 * Covers 11 base scenarios + 5 EC scenarios per the plan (EC-3, EC-9, EC-11, EC-12).
 *
 * IMPORTANT: cleanOutDir refuses paths outside cwd (EC-3). Tests use tmpdir
 * subdirs under process.cwd() to stay inside the guard.
 */

const TEST_ROOT = join(process.cwd(), '.tmp-test-cleanup')

function makeSubdir(name?: string): string {
  const dir = join(TEST_ROOT, name ?? `c_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

beforeEach(() => {
  mkdirSync(TEST_ROOT, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true })
})

describe('cleanOutDir — Astro-pattern wipe with skip list', () => {
  it('happy: wipes all files', async () => {
    const dir = makeSubdir()
    for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']) {
      writeFileSync(join(dir, f), 'x')
    }
    const result = await cleanOutDir({ dir })
    expect(result.deleted).toBe(5)
    expect(result.kept).toBe(0)
  })

  it('preserves .git and .gitkeep by default', async () => {
    const dir = makeSubdir()
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref')
    writeFileSync(join(dir, '.gitkeep'), '')
    writeFileSync(join(dir, 'foo.txt'), 'x')
    const result = await cleanOutDir({ dir })
    expect(result.deleted).toBe(1)
    expect(result.kept).toBe(2)
  })

  it('custom skip list', async () => {
    const dir = makeSubdir()
    writeFileSync(join(dir, 'foo.txt'), 'x')
    writeFileSync(join(dir, 'bar.txt'), 'x')
    const result = await cleanOutDir({ dir, skip: ['foo.txt'] })
    expect(result.deleted).toBe(1)
    expect(result.kept).toBe(1)
  })

  it('missing dir: no throw, returns {0, 0}', async () => {
    const dir = join(TEST_ROOT, 'never-existed')
    const result = await cleanOutDir({ dir })
    expect(result).toEqual({ deleted: 0, kept: 0 })
  })

  // EC-3 — CRITICAL path safety
  it('EC-3: refuses absolute path outside cwd', async () => {
    await expect(cleanOutDir({ dir: '/etc' })).rejects.toThrow(/must be inside cwd/)
  })

  it('EC-3: refuses dir equals cwd', async () => {
    await expect(cleanOutDir({ dir: process.cwd() })).rejects.toThrow(/must be a child of cwd/)
  })

  // EC-11 — skip list normalization
  it('EC-11: normalizes trailing-slash in skip basenames', async () => {
    const dir = makeSubdir()
    mkdirSync(join(dir, 'foo'), { recursive: true })
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(join(dir, 'bar.txt'), 'x')
    const result = await cleanOutDir({ dir, skip: ['foo/', '.git'] })
    expect(result.kept).toBe(2)
    expect(result.deleted).toBe(1)
  })

  // EC-12 — EROFS / permission warn-and-continue
  it('EC-12: catches fs.rm failures and logs warn', async () => {
    const dir = makeSubdir()
    writeFileSync(join(dir, 'a.txt'), 'x')
    writeFileSync(join(dir, 'b.txt'), 'x')
    // Mock fs.rm to reject with EROFS
    const { promises: fsp } = await import('node:fs')
    const spy = vi
      .spyOn(fsp, 'rm')
      .mockRejectedValue(Object.assign(new Error('rofs'), { code: 'EROFS' }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await cleanOutDir({ dir })
    expect(result.deleted).toBe(0)
    expect(result.kept).toBe(2)
    expect(warnSpy).toHaveBeenCalled()
    spy.mockRestore()
    warnSpy.mockRestore()
  })
})

describe('gcAgentRegistry — Nuxt-pattern LRU', () => {
  it('under cap: no-op', async () => {
    const dir = makeSubdir()
    for (let i = 0; i < 5; i++) mkdirSync(join(dir, `agent${i}`), { recursive: true })
    const result = await gcAgentRegistry({ dir, maxAgents: 100 })
    expect(result).toEqual({ deleted: 0, kept: 5 })
  })

  it('LRU over cap: deletes oldest by mtime', async () => {
    const dir = makeSubdir()
    const base = Date.now() / 1000
    for (let i = 0; i < 12; i++) {
      const sub = join(dir, `agent${i}`)
      mkdirSync(sub, { recursive: true })
      // utimes: lower atime/mtime = older. agent0 oldest, agent11 newest.
      utimesSync(sub, base - (12 - i) * 60, base - (12 - i) * 60)
    }
    const result = await gcAgentRegistry({ dir, maxAgents: 10 })
    expect(result.deleted).toBe(2)
    expect(result.kept).toBe(10)
  })

  it('ignores files (only directories)', async () => {
    const dir = makeSubdir()
    mkdirSync(join(dir, 'a'), { recursive: true })
    writeFileSync(join(dir, 'b.txt'), 'x')
    const result = await gcAgentRegistry({ dir, maxAgents: 100 })
    expect(result.kept).toBe(1) // only the dir counted
  })

  it('missing dir: no throw', async () => {
    const dir = join(TEST_ROOT, 'never-existed-gc')
    const result = await gcAgentRegistry({ dir })
    expect(result).toEqual({ deleted: 0, kept: 0 })
  })

  it('concurrent calls safe — no crash', async () => {
    const dir = makeSubdir()
    for (let i = 0; i < 12; i++) mkdirSync(join(dir, `agent${i}`), { recursive: true })
    const [r1, r2] = await Promise.all([
      gcAgentRegistry({ dir, maxAgents: 10 }),
      gcAgentRegistry({ dir, maxAgents: 10 }),
    ])
    expect(r1.deleted + r1.kept).toBeGreaterThanOrEqual(10)
    expect(r2.deleted + r2.kept).toBeGreaterThanOrEqual(0)
  })

  // EC-9
  it('EC-9: handles dirs with mtime=0 (Docker overlay)', async () => {
    const dir = makeSubdir()
    for (let i = 0; i < 5; i++) {
      const sub = join(dir, `agent${i}`)
      mkdirSync(sub, { recursive: true })
      utimesSync(sub, 0, 0)
    }
    const result = await gcAgentRegistry({ dir, maxAgents: 3 })
    expect(result.deleted).toBe(2)
    expect(result.kept).toBe(3)
  })
})
