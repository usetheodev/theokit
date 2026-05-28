import { describe, expect, it } from 'vitest'

import {
  assertNodeVersion,
  compareSemver,
  MIN_NODE_VERSION,
} from '../../packages/create-theo/src/preflight-node.js'

/**
 * T4.1 — Node ≥ 22.12 preflight in create-theokit CLI.
 *
 * `@usetheo/sdk` requires Node ≥ 22.12. Without preflight, users on older
 * Node hit cryptic `node:sqlite` / `better-sqlite3` ABI errors mid-chat
 * with no actionable diagnostic. This preflight runs at scaffold start
 * (D4: not at runtime in `theokit dev`), prints a clear error, exits 1
 * before any FS write.
 *
 * The version comparator is a zero-dep helper (no `semver` package).
 */

describe('MIN_NODE_VERSION', () => {
  it('is exported and equals 22.12.0', () => {
    expect(MIN_NODE_VERSION).toBe('22.12.0')
  })
})

describe('compareSemver — major.minor.patch comparator', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('22.12.0', '22.12.0')).toBe(0)
  })

  it('returns < 0 when a < b', () => {
    expect(compareSemver('22.11.9', '22.12.0')).toBeLessThan(0)
    expect(compareSemver('20.19.2', '22.12.0')).toBeLessThan(0)
    expect(compareSemver('21.99.99', '22.0.0')).toBeLessThan(0)
  })

  it('returns > 0 when a > b', () => {
    expect(compareSemver('23.0.0', '22.12.0')).toBeGreaterThan(0)
    expect(compareSemver('22.13.0', '22.12.0')).toBeGreaterThan(0)
    expect(compareSemver('22.12.1', '22.12.0')).toBeGreaterThan(0)
  })

  it('strips leading v prefix from process.version-style input', () => {
    expect(compareSemver('v22.12.0', '22.12.0')).toBe(0)
    expect(compareSemver('v23.0.0', '22.12.0')).toBeGreaterThan(0)
  })

  it('handles pre-release suffix gracefully (rc/nightly)', () => {
    // 22.12.0-rc.1 parses as 22.12.0 → equal/passes (acceptable)
    expect(compareSemver('22.12.0-rc.1', '22.12.0')).toBeGreaterThanOrEqual(0)
    expect(compareSemver('23.0.0-nightly20251025', '22.12.0')).toBeGreaterThan(0)
  })
})

describe('assertNodeVersion', () => {
  it('does NOT throw on Node 22.12.0 (boundary)', () => {
    expect(() => assertNodeVersion('22.12.0')).not.toThrow()
  })

  it('throws on Node 22.11.9 (1 patch below minimum) with actionable message', () => {
    expect(() => assertNodeVersion('22.11.9')).toThrow(/nvm install 22/)
  })

  it('throws on Node 20.19.2 (real downgrade) — message mentions minimum', () => {
    try {
      assertNodeVersion('20.19.2')
      expect.fail('should have thrown')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain('22.12.0')
      expect(msg).toContain('20.19.2')
    }
  })

  it('does NOT throw on Node 23.0.0 (forward compat)', () => {
    expect(() => assertNodeVersion('23.0.0')).not.toThrow()
  })

  it('handles v-prefix from process.version', () => {
    expect(() => assertNodeVersion('v22.12.0')).not.toThrow()
    expect(() => assertNodeVersion('v20.19.2')).toThrow()
  })

  it('uses MIN_NODE_VERSION as default minimum', () => {
    // If the second arg is omitted, MIN_NODE_VERSION applies
    expect(() => assertNodeVersion('22.12.0')).not.toThrow()
    expect(() => assertNodeVersion('22.11.99')).toThrow()
  })

  it('throws with a clearly-typed Error (not string)', () => {
    expect(() => assertNodeVersion('20.0.0')).toThrow(Error)
  })

  it('error message includes the version manager hint', () => {
    try {
      assertNodeVersion('18.0.0')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg.toLowerCase()).toMatch(/version manager|nvm/)
    }
  })
})
