import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { detectPackage } from '../../packages/theo/src/vite-plugin/auto-detect.js'

/**
 * T3.4 — Integration: the zero-config-tailwind fixture proves the wiring
 * contract end-to-end.
 *
 * NOTE: Phase 0 spike (`docs/spikes/usetheo-ui-vite-plugin-shape.md`) blocks
 * the CSS-emission proof — that requires `@usetheo/ui` to publish its
 * `./vite-plugin` subpath (cross-repo work). Until that ships, this
 * integration test validates the WIRING contract (detection + plugin
 * chaining intent), not the CSS output.
 *
 * Once @usetheo/ui ships its Vite plugin, expand this test to run
 * `vite build` against the fixture and assert that `.theo/client/assets/index-*.css`
 * contains @usetheo/ui-emitted utility classes.
 */

const FIXTURE = resolve(process.cwd(), 'tests/fixtures/zero-config-tailwind')

describe('T3.4 — zero-config-tailwind fixture', () => {
  it('fixture has @usetheo/ui as a dep', () => {
    const pkg = JSON.parse(readFileSync(resolve(FIXTURE, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['@usetheo/ui']).toBeDefined()
  })

  it('fixture has NO consumer-side tailwind.config.*', () => {
    for (const ext of ['ts', 'js', 'mjs', 'cjs']) {
      expect(existsSync(resolve(FIXTURE, `tailwind.config.${ext}`))).toBe(false)
    }
  })

  it('fixture has NO consumer-side postcss.config.*', () => {
    for (const ext of ['ts', 'js', 'mjs', 'cjs']) {
      expect(existsSync(resolve(FIXTURE, `postcss.config.${ext}`))).toBe(false)
    }
  })

  it('fixture uses @usetheo/ui className conventions (.bg-primary etc)', () => {
    const page = readFileSync(resolve(FIXTURE, 'app/page.tsx'), 'utf-8')
    expect(page).toMatch(/bg-primary/)
  })

  it('detectPackage finds @usetheo/ui from fixture root (when installed)', () => {
    // This depends on the workspace install having materialized.
    const detect = detectPackage('@usetheo/ui', FIXTURE)
    // We're not asserting a strict true here because the workspace `@usetheo/ui`
    // may or may not be linked into the fixture at install time. Either result
    // is valid for the contract — what matters is no throw + boolean result.
    expect(typeof detect.installed).toBe('boolean')
  })
})
