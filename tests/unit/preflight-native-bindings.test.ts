import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  findRebuildCwd,
  ensureNativeBindings,
} from '../../scripts/preflight-native-bindings.mjs'

/**
 * T1.2 TDD — theokit native bindings preflight unit tests.
 * Mirrors theokit-sdk/packages/sdk/tests/tools/preflight-native-bindings.test.ts.
 */

describe('findRebuildCwd (v1.1 EC-1 MUST FIX — workspace-link routing)', () => {
  let sandbox: string
  let realRepo: string
  let linkedRepo: string

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'preflight-cwd-theokit-'))
    realRepo = join(sandbox, 'sibling-sdk')
    mkdirSync(
      join(
        realRepo,
        'node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3/build/Release',
      ),
      { recursive: true },
    )
    const binPath = join(
      realRepo,
      'node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    )
    writeFileSync(binPath, 'fake-bin')

    linkedRepo = join(sandbox, 'consumer-repo')
    mkdirSync(join(linkedRepo, 'node_modules/@usetheo'), { recursive: true })
    symlinkSync(realRepo, join(linkedRepo, 'node_modules/@usetheo/sdk'))
  })

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('resolves symlink to sibling repo (EC-1)', () => {
    // Given: a binding path under the symlinked @usetheo/sdk in the consumer
    const failingBindingPath = join(
      linkedRepo,
      'node_modules/@usetheo/sdk/node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    )

    // When
    const got = findRebuildCwd(failingBindingPath, linkedRepo)

    // Then: rebuild routes to the real sibling repo
    expect(got).toBe(realRepo)
  })

  it('returns default when binding is local (no regression for non-symlinked cases)', () => {
    const localBinDir = join(
      linkedRepo,
      'node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3/build/Release',
    )
    mkdirSync(localBinDir, { recursive: true })
    const localBin = join(localBinDir, 'better_sqlite3.node')
    writeFileSync(localBin, 'fake')

    const got = findRebuildCwd(localBin, linkedRepo)
    expect(got).toBe(linkedRepo)
  })

  it('returns default when failingBindingPath is undefined (defensive)', () => {
    const got = findRebuildCwd(undefined, linkedRepo)
    expect(got).toBe(linkedRepo)
  })

  it('returns default when binding path does not exist (defensive)', () => {
    const bogus = join(sandbox, 'does-not-exist/foo.node')
    const got = findRebuildCwd(bogus, linkedRepo)
    expect(got).toBe(linkedRepo)
  })
})

describe('preflight-native-bindings module shape (theokit)', () => {
  it('exports findRebuildCwd + ensureNativeBindings', () => {
    expect(typeof findRebuildCwd).toBe('function')
    expect(typeof ensureNativeBindings).toBe('function')
  })

  it('ensureNativeBindings returns a Promise (async + sentinel fast-path)', async () => {
    const result = ensureNativeBindings()
    expect(result).toBeInstanceOf(Promise)
    await result
  })
})
