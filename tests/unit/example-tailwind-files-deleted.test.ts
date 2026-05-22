import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T3.5 — Target-state contract.
 *
 * The actual deletion of `examples/full-stack-agent/tailwind.config.ts` and
 * `postcss.config.js` is BLOCKED on cross-repo `@usetheo/ui/vite-plugin` +
 * `@usetheo/ui/preset` shipping per the Phase 0 spike doc
 * (`docs/spikes/usetheo-ui-vite-plugin-shape.md`).
 *
 * This test file pins the FRAMEWORK CONTRACT — when the cross-repo work
 * ships, deleting those two files + flipping the `it.skip` to `it` below
 * is the completion gesture for T3.5.
 *
 * Until then, this file documents the target state for `/cross-validation`
 * to detect "Phase 3 still pending cross-repo" rather than "Phase 3 broken".
 */

const EXAMPLE = resolve(process.cwd(), 'examples/full-stack-agent')

describe('T3.5 — example tailwind/postcss files (target state, gated on cross-repo)', () => {
  it.skip('tailwind.config.ts deleted', () => {
    expect(existsSync(resolve(EXAMPLE, 'tailwind.config.ts'))).toBe(false)
  })

  it.skip('postcss.config.js deleted', () => {
    expect(existsSync(resolve(EXAMPLE, 'postcss.config.js'))).toBe(false)
  })

  // These tests RUN today — they verify the framework wiring is ready
  // to absorb the deletion, even though deletion itself awaits cross-repo.
  it('framework integrateUseTheoUI is wired in vite-plugin/index.ts (deletion-ready)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'packages/theo/src/vite-plugin/index.ts'),
      'utf-8',
    )
    expect(src).toMatch(/integrateUseTheoUI\(projectRoot/)
  })

  it('Phase 0 spike doc exists with cross-repo sign-off section', () => {
    const spike = readFileSync(
      resolve(process.cwd(), 'docs/spikes/usetheo-ui-vite-plugin-shape.md'),
      'utf-8',
    )
    expect(spike).toMatch(/cross-repo/i)
    expect(spike).toMatch(/Sign-off required/i)
  })
})
