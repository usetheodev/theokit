/**
 * T1.2 — Contract test cross-repo executando contra @usetheo/ui REAL.
 *
 * O contrato (ADR 0018) é: @usetheo/ui/vite-plugin expõe um default-export
 * factory que retorna Plugin | Plugin[] (com `name: string`). Subpath exports
 * /preset, /styles.css, /fonts.css devem resolver.
 *
 * Por que rodar contra fixture (não contra packages/theo): @usetheo/ui NÃO
 * é peerDep instalada em packages/theo — é dep opt-in dos consumers/fixtures.
 * A fixture `theoui-autoinject` tem UI instalado e é o canary canônico para
 * o contract test consumer-side (ADR 0020 D5: UI fica fora do workspace
 * default; SDK fica dentro).
 *
 * 6 it():
 *  1. default export é factory
 *  2. factory() retorna Plugin|Plugin[] válido
 *  3. factory({ tailwind: false }) não throw
 *  4. ./preset existe como .css
 *  5. ./styles.css + ./fonts.css existem
 *  6. EC-7 — versão resolvida satisfaz range peerDep do theokit (hoist guard)
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, it, expect } from 'vitest'

// Localiza a fixture canônica com @usetheo/ui instalado.
const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(TEST_DIR, '..', '..', 'fixtures', 'theoui-autoinject')
const UI_PKG_DIR = join(FIXTURE_DIR, 'node_modules', '@usetheo', 'ui')
const UI_DIST = (relative: string) => join(UI_PKG_DIR, 'dist', relative)

// Reexporta os helpers internos do integrate-ui.ts (test-only side-doors EC-N CT-N).
function isValidPlugin(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (!('name' in value)) return false
  return typeof (value as Record<string, unknown>).name === 'string'
}

function normalizePluginReturn(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return value.every(isValidPlugin) ? value : null
  }
  return isValidPlugin(value) ? [value] : null
}

/**
 * Caret-prerelease semver-satisfies (inline, evita adicionar semver dep).
 *
 * Regra usada: `^X.Y.Z-pre` aceita `X.Y.Z-pre.*` com mesmo tuple X.Y.Z e pre tag.
 * Implementação pragmática para o caso de uso (`^0.12.0-next.0` × `0.12.0-next.N`).
 *
 * Casos cobertos:
 *  - ^0.12.0-next.0 + 0.12.0-next.0  → true
 *  - ^0.12.0-next.0 + 0.12.0-next.5  → true
 *  - ^0.12.0-next.0 + 0.11.0-next.0  → false
 *  - ^0.12.0-next.0 + 0.13.0-next.0  → false
 *  - ^0.12.0-next.0 + 0.12.0-beta.0  → false (tag diferente)
 *  - ^0.12.0 + 0.12.1                → true (sem pre, mesmo minor)
 *
 * Limitação: não cobre todo o espaço npm semver. Suficiente para EC-7 hoist guard.
 */
function satisfiesCaretPrerelease(version: string, range: string): boolean {
  if (!range.startsWith('^')) return false
  const pin = range.slice(1)
  const pinMatch = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(pin)
  const verMatch = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(version)
  if (!pinMatch || !verMatch) return false
  const [, pMaj, pMin, pPat, pTag, pNum] = pinMatch
  const [, vMaj, vMin, vPat, vTag, vNum] = verMatch
  // Major must match (in 0.x semver, this includes minor — but for our use case
  // of 0.X.Y-tag.N, we want the X.Y.Z tuple to match when there's a prerelease).
  if (pTag) {
    // Prerelease pin: require same X.Y.Z + same tag + ver >= pin
    if (pMaj !== vMaj || pMin !== vMin || pPat !== vPat) return false
    if (vTag !== pTag) return false
    return Number(vNum ?? 0) >= Number(pNum ?? 0)
  }
  // Non-prerelease pin: caret semantics
  if (pMaj !== vMaj) return false
  if (pMaj === '0') {
    // 0.X.Y: X must match exactly; Y can be >=
    if (pMin !== vMin) return false
    return Number(vPat) >= Number(pPat)
  }
  // ≥1.0.0: y can be >=, z anything
  if (Number(vMin) > Number(pMin)) return true
  if (Number(vMin) === Number(pMin)) return Number(vPat) >= Number(pPat)
  return false
}

describe('Contract: @usetheo/ui/vite-plugin (real dist, fixture-resolved)', () => {
  // Sanity: fixture must be installed before running.
  it('precondition — fixture theoui-autoinject has @usetheo/ui installed', () => {
    expect(existsSync(UI_PKG_DIR)).toBe(true)
    expect(existsSync(UI_DIST('vite-plugin.js'))).toBe(true)
  })

  // CT-1: shape check — default export é função (entry point do contrato)
  it('CT-1 — default export of dist/vite-plugin.js is a factory function', async () => {
    // Given the contract from ADR 0018,
    // When we dynamic-import the dist entry,
    // Then the default export must be a function.
    const mod = await import(pathToFileURL(UI_DIST('vite-plugin.js')).href)
    expect(typeof mod.default).toBe('function')
  })

  // CT-2: factory() retorna shape válido
  it('CT-2 — factory() returns a valid Vite Plugin or Plugin[] with name: string', async () => {
    // Given the factory is called with no args,
    // When we normalize the return value,
    // Then we must get a non-empty array of plugins each with name: string.
    const mod = await import(pathToFileURL(UI_DIST('vite-plugin.js')).href)
    const result = (mod.default as () => unknown)()
    const normalized = normalizePluginReturn(result)
    expect(normalized).not.toBeNull()
    expect(normalized!.length).toBeGreaterThan(0)
    for (const plugin of normalized!) {
      expect(isValidPlugin(plugin)).toBe(true)
    }
  })

  // CT-3: options { tailwind: false } não throw
  it('CT-3 — factory({ tailwind: false }) does not throw', async () => {
    // Given the documented opt-out for tailwind (consumer-managed),
    // When we pass { tailwind: false },
    // Then the factory must accept it without throwing.
    const mod = await import(pathToFileURL(UI_DIST('vite-plugin.js')).href)
    expect(() =>
      (mod.default as (o?: { tailwind?: boolean }) => unknown)({ tailwind: false }),
    ).not.toThrow()
  })

  // CT-4: ./preset existe como .css
  it('CT-4 — dist/preset.css subpath export exists and is .css', () => {
    // Given the consumer can `import preset from '@usetheo/ui/preset'`,
    // When the dist is shipped,
    // Then preset.css must be present.
    expect(existsSync(UI_DIST('preset.css'))).toBe(true)
    expect(UI_DIST('preset.css')).toMatch(/\.css$/)
  })

  // CT-5: ./styles.css + ./fonts.css
  it('CT-5 — dist/styles.css and dist/fonts.css subpaths resolve', () => {
    // Given theokit's vite-plugin emits `import '@usetheo/ui/styles.css'` etc,
    // When the dist is shipped,
    // Then both files must be present.
    expect(existsSync(UI_DIST('styles.css'))).toBe(true)
    expect(existsSync(UI_DIST('fonts.css'))).toBe(true)
  })

  // EC-7: hoist guard — versão resolvida na fixture satisfaz peerDep declarado
  it('EC-7 — fixture-resolved version satisfies theokit peerDep range', () => {
    // Given pnpm hoist can produce divergent versions in a monorepo,
    // When we read the peerDep range declared by theokit/packages/theo
    // and the version actually resolved in the fixture,
    // Then the resolved version MUST satisfy the declared range.
    const theoPkgPath = join(TEST_DIR, '..', '..', 'packages', 'theo', 'package.json')
    const theoPkg = JSON.parse(readFileSync(theoPkgPath, 'utf-8')) as {
      peerDependencies?: Record<string, string>
    }
    const declaredRange = theoPkg.peerDependencies?.['@usetheo/ui']
    expect(declaredRange).toBeDefined()
    expect(declaredRange).toMatch(/^\^/)

    const uiPkg = JSON.parse(
      readFileSync(join(UI_PKG_DIR, 'package.json'), 'utf-8'),
    ) as { version: string }
    const resolvedVersion = uiPkg.version

    expect(
      satisfiesCaretPrerelease(resolvedVersion, declaredRange!),
      `peerDep range ${declaredRange} does not satisfy fixture-resolved version ${resolvedVersion} — hoist drift detected`,
    ).toBe(true)
  })
})
