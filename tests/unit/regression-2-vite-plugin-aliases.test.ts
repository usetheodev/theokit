import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { theoPlugin } from '../../packages/theo/src/vite-plugin/index.js'

/**
 * Regression for nextjs-maturity T1.2.
 *
 * Original bug (previous session): the Vite plugin only emitted aliases
 * for `theokit/server` and bare `theokit`. Because the bare `theokit`
 * alias matched ANY path starting with `theokit/`, an import like
 * `theokit/client` produced a broken resolve (e.g.,
 * `packages/theo/index.js/client`) and Vite returned 500.
 *
 * The fix is the full list of subpath aliases ORDERED with bare last.
 * If anyone removes an entry or reorders so that `theokit` is not last,
 * these tests fail.
 */

const EXPECTED_SUBPATHS = [
  'theokit/server',
  'theokit/client',
  'theokit/react-query',
  'theokit/vite-plugin',
  'theokit/adapters/web-shim',
  'theokit/adapters/ws-shim',
  // 'theokit' (bare) — MUST be last
]

function getAliasArray(): Array<{ find: string; replacement: string }> {
  const plugin = theoPlugin()
  // Vite plugin API: config() returns the config patch
  const hook = plugin.config as (this: unknown, ...args: unknown[]) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = hook.call({}, {} as any, {} as any) as
    | { resolve?: { alias?: unknown } }
    | undefined
  const alias = cfg?.resolve?.alias
  expect(Array.isArray(alias), 'expected alias array shape').toBe(true)
  return alias as Array<{ find: string; replacement: string }>
}

describe('T1.2 — Vite plugin emits all subpath aliases in correct order', () => {
  it('emits at least 7 aliases', () => {
    const aliases = getAliasArray()
    expect(aliases.length).toBeGreaterThanOrEqual(EXPECTED_SUBPATHS.length + 1)
  })

  it('contains every expected subpath alias', () => {
    const aliases = getAliasArray()
    const finds = aliases.map((a) => a.find)
    for (const sub of EXPECTED_SUBPATHS) {
      expect(finds, `missing alias ${sub}`).toContain(sub)
    }
  })

  it('places bare `theokit` alias LAST (so subpaths match first)', () => {
    const aliases = getAliasArray()
    const last = aliases[aliases.length - 1]
    expect(last?.find, 'bare theokit alias must be last in array').toBe('theokit')
  })

  it('replacement path for `theokit/client` points to an existing file', () => {
    const aliases = getAliasArray()
    const clientAlias = aliases.find((a) => a.find === 'theokit/client')
    expect(clientAlias).toBeDefined()
    expect(existsSync(clientAlias!.replacement), `missing file: ${clientAlias!.replacement}`).toBe(true)
  })

  it('each subpath alias resolves to a real file on disk', () => {
    const aliases = getAliasArray()
    for (const sub of EXPECTED_SUBPATHS) {
      const a = aliases.find((x) => x.find === sub)
      expect(a, `missing alias for ${sub}`).toBeDefined()
      expect(
        existsSync(a!.replacement),
        `alias ${sub} → ${a!.replacement} does not exist`,
      ).toBe(true)
    }
  })
})
