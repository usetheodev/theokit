import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scaffold } from '../../packages/create-theo/src/index.js'

/**
 * Dogfood polish 2026-05-22:
 *   - Generalize `.tmpl` substitution so any `foo.tmpl` becomes `foo` with
 *     `{{name}}` interpolated.
 *   - Default template ships a README.md.tmpl that documents the post-install
 *     path + the `--bare` escape hatch for the (operator-deferred) SDK publish.
 */

function makeTargetDir(): string {
  return mkdtempSync(join(tmpdir(), 'theokit-readme-tmpl-'))
}

describe('generalized .tmpl substitution', () => {
  it('default template produces README.md from README.md.tmpl with {{name}} replaced', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'awesome-app', 'default')
      const readmePath = join(target, 'README.md')
      expect(existsSync(readmePath)).toBe(true)
      const readme = readFileSync(readmePath, 'utf-8')
      // {{name}} replaced
      expect(readme).toContain('# awesome-app')
      // Source template removed
      expect(existsSync(join(target, 'README.md.tmpl'))).toBe(false)
      // Mentions the --bare escape hatch (the always-works recipe)
      expect(readme).toContain('--bare')
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('package.json.tmpl substitution still works (regression)', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'pkg-check-app', 'default')
      const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('pkg-check-app')
      expect(existsSync(join(target, 'package.json.tmpl'))).toBe(false)
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('README explains the operator-deferred @usetheo/sdk publish', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'sdk-doc-app', 'default')
      const readme = readFileSync(join(target, 'README.md'), 'utf-8')
      expect(readme).toMatch(/@usetheo\/sdk/)
      expect(readme).toMatch(/operator-deferred|publish/i)
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })
})
