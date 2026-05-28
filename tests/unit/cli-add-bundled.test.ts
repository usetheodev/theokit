import { describe, it, expect } from 'vitest'
import {
  runAdd,
  KNOWN_PACKAGES,
  UnknownPackageError,
} from '../../packages/theo/src/cli/commands/add.js'

describe('theokit add — bundled adapters (T6.1)', () => {
  it('bundled adapter does NOT spawn pnpm/npm', async () => {
    let spawned = false
    const result = await runAdd({
      input: 'bun',
      cwd: '/cwd',
      existsSync: () => true,
      spawnPm: async () => {
        spawned = true
        return { ok: true, code: 0 }
      },
      registry: KNOWN_PACKAGES,
    })
    expect(spawned).toBe(false)
    expect(result.packageManager).toBe('bundled')
  })

  it('bundled add returns instructions instead of installing', async () => {
    const result = await runAdd({
      input: 'bun',
      cwd: '/cwd',
      existsSync: () => true,
      spawnPm: async () => ({ ok: true, code: 0 }),
      registry: KNOWN_PACKAGES,
    })
    expect(result.packageInstalled).toMatch(/bundled|theokit/)
  })

  it('all current registry entries are bundled (no real npm packages exist)', () => {
    for (const [, entry] of Object.entries(KNOWN_PACKAGES)) {
      expect(entry.kind).toBe('bundled')
    }
  })

  it('still rejects unknown packages with Did you mean suggestion', async () => {
    await expect(
      runAdd({
        input: 'bunzz',
        cwd: '/cwd',
        existsSync: () => true,
        spawnPm: async () => ({ ok: true, code: 0 }),
        registry: KNOWN_PACKAGES,
      }),
    ).rejects.toThrow(UnknownPackageError)
  })
})
