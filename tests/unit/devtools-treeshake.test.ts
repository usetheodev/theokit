/**
 * T1.1 EC-22 — devtools tree-shake gate.
 *
 * Build the default template fixture FRESH (beforeAll runs build via execSync)
 * — never trust stale dist artifacts. Then grep the bundle for any devtools
 * symbol or goober string. Production bundle MUST NOT contain devtools code.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildTemplateDefaultOnce,
  TEMPLATE_DEFAULT_ASSETS,
} from '../integration/_helpers/build-template-default.js'

const DIST_ASSETS = TEMPLATE_DEFAULT_ASSETS

interface BundleSnapshot {
  files: string[]
  combined: string
}

let snapshot: BundleSnapshot | null = null
let buildError: string | null = null

beforeAll(() => {
  try {
    // Shared mutex-guarded build — see _helpers/build-template-default.ts
    buildTemplateDefaultOnce()
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string }
    buildError = `build failed: ${e.message ?? 'unknown'}\nstdout:\n${e.stdout?.toString() ?? ''}\nstderr:\n${e.stderr?.toString() ?? ''}`
    return
  }
  if (!existsSync(DIST_ASSETS)) {
    buildError = `dist/client/assets does not exist at ${DIST_ASSETS}`
    return
  }
  const files = readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js'))
  const combined = files.map((f) => readFileSync(resolve(DIST_ASSETS, f), 'utf-8')).join('\n')
  snapshot = { files, combined }
}, 200_000)

describe('devtools — tree-shake (EC-22)', () => {
  it('build succeeded', () => {
    expect(buildError, buildError ?? 'OK').toBeNull()
    expect(snapshot, 'no snapshot captured').not.toBeNull()
  })

  it('prod bundle does NOT contain "theo-devtools" custom-element tag (EC-22)', () => {
    if (!snapshot) return
    expect(snapshot.combined).not.toContain('theo-devtools-portal')
  })

  it('prod bundle does NOT contain "goober" library source (EC-22)', () => {
    if (!snapshot) return
    // Goober ships short identifiers in minified form; the LICENSE/source comments
    // would carry "goober" only if the lib were included. Bundle must exclude.
    expect(snapshot.combined).not.toContain('goober')
  })

  it('prod bundle does NOT contain devtools shadow-root mount source', () => {
    if (!snapshot) return
    expect(snapshot.combined).not.toContain('__theoDevtoolsMounted')
    expect(snapshot.combined).not.toContain('data-theo-devtools-root')
  })
})
