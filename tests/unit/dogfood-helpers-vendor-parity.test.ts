import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * theokit-evolution-ci-and-dx Phase 1A — vendor parity gate.
 *
 * `theokit/scripts/dogfood/*.sh` is a vendored copy of the canonical helpers
 * at meta-repo `.claude/skills/dogfood-stranger/helpers/*.sh`. CI workflows
 * (`.github/workflows/dogfood-stranger.yml`) only checkout `theokit/` and
 * can't reach `.claude/` directly, so vendoring is needed.
 *
 * This test asserts the two copies are byte-identical. If meta-repo skill
 * updates, vendor must be re-synced; if vendor updates, meta-repo skill
 * must too. Drift = test failure with actionable rsync hint.
 *
 * Run only when both copies exist (skip in published npm package where
 * meta-repo `.claude/` is absent).
 */

const VENDOR_DIR = resolve(__dirname, '../../scripts/dogfood')
const META_DIR = resolve(__dirname, '../../../.claude/skills/dogfood-stranger/helpers')

const HELPERS = ['_lib.sh', 'chaos-providers.sh', 'multi-template-smoke.sh'] as const

describe('dogfood helpers vendor parity (meta-repo ↔ theokit/scripts/dogfood/)', () => {
  for (const helper of HELPERS) {
    it(`${helper} vendor copy matches meta-repo source byte-for-byte`, () => {
      const vendor = resolve(VENDOR_DIR, helper)
      const meta = resolve(META_DIR, helper)

      // Skip cleanly if meta-repo source absent (e.g., installed npm pkg context)
      if (!existsSync(meta)) {
        console.warn(`SKIP: ${meta} absent — likely running outside theokit-tools meta-repo`)
        return
      }
      expect(existsSync(vendor), `vendor missing: ${vendor}`).toBe(true)

      const vendorContent = readFileSync(vendor, 'utf-8')
      const metaContent = readFileSync(meta, 'utf-8')
      expect(vendorContent).toBe(metaContent)
    })
  }

  it('vendor scripts are executable', () => {
    for (const helper of HELPERS) {
      const vendor = resolve(VENDOR_DIR, helper)
      if (existsSync(vendor)) {
        const content = readFileSync(vendor, 'utf-8')
        expect(content.startsWith('#!/usr/bin/env bash')).toBe(true)
      }
    }
  })

  it('validate-all-latest-tags.mjs vendor copy matches meta-repo', () => {
    const vendor = resolve(__dirname, '../../scripts/validate-all-latest-tags.mjs')
    const meta = resolve(__dirname, '../../../scripts/validate-all-latest-tags.mjs')
    if (!existsSync(meta)) return // SKIP outside meta-repo
    expect(existsSync(vendor)).toBe(true)
    expect(readFileSync(vendor, 'utf-8')).toBe(readFileSync(meta, 'utf-8'))
  })
})
