import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectPackage } from '../../packages/theo/src/vite-plugin/auto-detect.js'
import { integrateUseTheoUI } from '../../packages/theo/src/vite-plugin/integrate-ui.js'

/**
 * T3.2 — `integrateUseTheoUI` tests. Mocks `detectPackage` AND the
 * dynamic imports of `@tailwindcss/vite` + `@usetheo/ui/vite-plugin`.
 * Covers happy path + EC-5 (default-export validation) + EC-6 (return-shape).
 */

vi.mock('../../packages/theo/src/vite-plugin/auto-detect.js', () => ({
  detectPackage: vi.fn(),
}))

vi.mock('@tailwindcss/vite', () => ({
  default: () => ({ name: '@tailwindcss/vite' }),
}))

vi.mock('@usetheo/ui/vite-plugin', () => ({
  default: () => ({ name: '@usetheo/ui/vite-plugin' }),
}))

const TEST_ROOT = join(process.cwd(), '.tmp-integrate-ui')

beforeEach(() => {
  mkdirSync(TEST_ROOT, { recursive: true })
  vi.mocked(detectPackage).mockReset()
})

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('integrateUseTheoUI', () => {
  it('happy: both deps installed → returns 2 plugins (tailwind first)', async () => {
    vi.mocked(detectPackage).mockImplementation((name) => ({
      installed: name === '@usetheo/ui' || name === '@tailwindcss/vite',
    }))
    const plugins = await integrateUseTheoUI(TEST_ROOT)
    expect(plugins).toHaveLength(2)
    expect(plugins[0]?.name).toBe('@tailwindcss/vite')
    expect(plugins[1]?.name).toBe('@usetheo/ui/vite-plugin')
  })

  it('no @usetheo/ui → returns []', async () => {
    vi.mocked(detectPackage).mockReturnValue({ installed: false })
    const plugins = await integrateUseTheoUI(TEST_ROOT)
    expect(plugins).toEqual([])
  })

  it('no @tailwindcss/vite → warn + returns []', async () => {
    vi.mocked(detectPackage).mockImplementation((name) => ({
      installed: name === '@usetheo/ui',
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plugins = await integrateUseTheoUI(TEST_ROOT)
    expect(plugins).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/@tailwindcss\/vite is not installed/))
    warnSpy.mockRestore()
  })

  it('explicit enabled: false → returns []', async () => {
    vi.mocked(detectPackage).mockReturnValue({ installed: true })
    const plugins = await integrateUseTheoUI(TEST_ROOT, { enabled: false })
    expect(plugins).toEqual([])
  })

  it('consumer has tailwind.config → info + returns []', async () => {
    vi.mocked(detectPackage).mockReturnValue({ installed: true })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const plugins = await integrateUseTheoUI(TEST_ROOT, {
      consumerTailwindConfig: '/some/path/tailwind.config.ts',
    })
    expect(plugins).toEqual([])
    expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/Detected your tailwind.config/))
    infoSpy.mockRestore()
  })

  it('consumer has postcss.config → info + returns []', async () => {
    vi.mocked(detectPackage).mockReturnValue({ installed: true })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const plugins = await integrateUseTheoUI(TEST_ROOT, {
      consumerPostcssConfig: '/some/path/postcss.config.js',
    })
    expect(plugins).toEqual([])
    infoSpy.mockRestore()
  })
})

// EC-5 + EC-6 — guards against misshapen UI plugin
//
// The guards are tested via direct invocation of the internal `isValidPlugin`
// helper (exported as `_isValidPluginForTest`). Trying to vi.doMock the
// dynamic import on a per-test basis fights with vi's hoisted mocks; the
// guards themselves are pure functions and can be tested directly.
describe('integrateUseTheoUI — shape guards (EC-5, EC-6)', () => {
  it('EC-6: isValidPlugin rejects null', async () => {
    const { _isValidPluginForTest } = await import(
      '../../packages/theo/src/vite-plugin/integrate-ui.js'
    )
    expect(_isValidPluginForTest(null)).toBe(false)
  })

  it('EC-6: isValidPlugin rejects array (no name property on the array itself)', async () => {
    const { _isValidPluginForTest } = await import(
      '../../packages/theo/src/vite-plugin/integrate-ui.js'
    )
    expect(_isValidPluginForTest([{ name: 'a' }, { name: 'b' }])).toBe(false)
    expect(_isValidPluginForTest([])).toBe(false)
  })

  it('EC-6: isValidPlugin rejects non-object', async () => {
    const { _isValidPluginForTest } = await import(
      '../../packages/theo/src/vite-plugin/integrate-ui.js'
    )
    expect(_isValidPluginForTest('string')).toBe(false)
    expect(_isValidPluginForTest(42)).toBe(false)
    expect(_isValidPluginForTest(undefined)).toBe(false)
  })

  it('EC-6: isValidPlugin accepts object with .name string', async () => {
    const { _isValidPluginForTest } = await import(
      '../../packages/theo/src/vite-plugin/integrate-ui.js'
    )
    expect(_isValidPluginForTest({ name: 'my-plugin' })).toBe(true)
  })
})
