import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectTheoUi,
  resolveTheoUiConfig,
  type TheoUiConfig,
  type SubpathResolver,
} from '../../packages/theo/src/vite-plugin/theoui-detect.js'

/**
 * T2.1 — detectTheoUi
 *
 * The resolver is injected (DIP) so tests can deterministically simulate
 * "present" / "absent" / "corrupted" without fighting Node's parent-dir
 * walk-up (which would always find @usetheo/ui in the monorepo's
 * node_modules/.pnpm/ during test runs).
 *
 * Detect also requires `@usetheo/ui` to be DECLARED in the user's
 * package.json — this protects against false positives in pnpm monorepos
 * where the package may be present at the workspace root but a fixture
 * deeper in the tree didn't ask for it.
 */

function presentResolver(paths: string[]): SubpathResolver {
  return (specifier) => paths.includes(specifier)
}

const absentResolver: SubpathResolver = () => false

function makeProject(declared: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'theo-detect-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      declared
        ? { name: 'test', dependencies: { '@usetheo/ui': '^0.1.0' } }
        : { name: 'test' },
    ),
  )
  return root
}

describe('detectTheoUi (T2.1)', () => {
  it('returns enabled true when declared in package.json + styles.css resolves', () => {
    const root = makeProject(true)
    try {
      const result = detectTheoUi(
        root,
        undefined,
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns enabled true when only fonts.css resolves (fallback probe)', () => {
    const root = makeProject(true)
    try {
      const result = detectTheoUi(
        root,
        undefined,
        presentResolver(['@usetheo/ui/fonts.css']),
      )
      expect(result.enabled).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns enabled false when not declared in package.json', () => {
    const root = makeProject(false)
    try {
      // resolver would return true (e.g., monorepo workspace has the dep)
      // but the conservative gate must still say "no"
      const result = detectTheoUi(
        root,
        undefined,
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns enabled false when declared but no probe resolves (broken install)', () => {
    const root = makeProject(true)
    try {
      const result = detectTheoUi(root, undefined, absentResolver)
      expect(result.enabled).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('force-disabled when config.ui === false even with TheoUI installed', () => {
    const root = makeProject(true)
    try {
      const result = detectTheoUi(
        root,
        false,
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns enabled false when projectRoot has no package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'theo-no-pkg-'))
    try {
      const result = detectTheoUi(
        root,
        undefined,
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns enabled false when package.json is malformed', () => {
    const root = mkdtempSync(join(tmpdir(), 'theo-bad-pkg-'))
    writeFileSync(join(root, 'package.json'), '{ this is not valid json')
    try {
      const result = detectTheoUi(
        root,
        undefined,
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('detects when declared in devDependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'theo-dev-'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@usetheo/ui': '^0.1.0' },
      }),
    )
    try {
      const result = detectTheoUi(
        root,
        undefined,
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves config defaults regardless of enabled state', () => {
    const root = makeProject(false)
    try {
      const result = detectTheoUi(root, undefined, absentResolver)
      expect(result.config.theme).toBe('violet-forge')
      expect(result.config.fonts).toBe('bundled')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('respects custom config when ui object passed', () => {
    const root = makeProject(true)
    try {
      const result = detectTheoUi(
        root,
        { theme: 'noir', fonts: 'cdn' },
        presentResolver(['@usetheo/ui/styles.css']),
      )
      expect(result.enabled).toBe(true)
      expect(result.config.theme).toBe('noir')
      expect(result.config.fonts).toBe('cdn')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('resolveTheoUiConfig (theme + fonts defaults)', () => {
  it('default theme is violet-forge', () => {
    const cfg: TheoUiConfig = resolveTheoUiConfig(undefined)
    expect(cfg.theme).toBe('violet-forge')
    expect(cfg.fonts).toBe('bundled')
  })

  it('respects custom theme', () => {
    const cfg = resolveTheoUiConfig({ theme: 'noir' })
    expect(cfg.theme).toBe('noir')
  })

  it('respects custom fonts', () => {
    const cfg = resolveTheoUiConfig({ fonts: 'cdn' })
    expect(cfg.fonts).toBe('cdn')
  })
})
