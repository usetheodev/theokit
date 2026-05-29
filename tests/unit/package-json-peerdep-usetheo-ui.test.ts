/**
 * T1.1 — Assert that theokit/packages/theo/package.json declares
 * @usetheo/ui as an optional peerDependency.
 *
 * This pins ADR 0018 (theokit/docs/adr/0018-usetheo-ui-vite-plugin-contract-versionado.md):
 * the contract between theokit and @usetheo/ui is VERSIONED and declared,
 * not implicit. The range here is the install-time gate; the runtime gate
 * is the contract test at tests/integration/contract-usetheo-ui-vite-plugin.test.ts.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const PKG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'theo',
  'package.json',
)

interface TheokitPackageJson {
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

describe('theokit/packages/theo/package.json — @usetheo/ui peerDep contract (ADR 0018)', () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8')) as TheokitPackageJson

  it('should declare @usetheo/ui in peerDependencies', () => {
    // Given the contract VERSIONADO decision in ADR 0018,
    // When we read the package.json,
    // Then @usetheo/ui must appear as a declared peer.
    expect(pkg.peerDependencies).toBeDefined()
    expect(pkg.peerDependencies?.['@usetheo/ui']).toBeDefined()
  })

  it('should declare a caret pre-release range for @usetheo/ui', () => {
    // Given that UI is in 0.x with -next.X tags,
    // When we declare the range,
    // Then it must use caret pre-release semantics (e.g. ^0.12.0-next.0).
    const range = pkg.peerDependencies?.['@usetheo/ui'] ?? ''
    expect(range).toMatch(/^\^\d+\.\d+\.\d+-[a-z]+\.\d+$/)
  })

  it('should mark @usetheo/ui as optional in peerDependenciesMeta', () => {
    // Given that @usetheo/ui is opt-in (templates api-only/postgres skip it),
    // When the consumer omits the dep,
    // Then no install-time error should fire — only mismatch warns.
    expect(pkg.peerDependenciesMeta?.['@usetheo/ui']?.optional).toBe(true)
  })
})
