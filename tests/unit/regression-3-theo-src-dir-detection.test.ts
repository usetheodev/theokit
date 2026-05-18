import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTheoRootDir } from '../../packages/theo/src/vite-plugin/resolve-theo-root.js'

/**
 * Regression for nextjs-maturity T1.3.
 *
 * Original bug (previous session): `theoSrcDir = resolve(currentDir, '..')`
 * unconditionally pointed at the parent. When running from compiled `dist/`,
 * the parent is the package root, not `dist/` — so aliases like
 * `theokit/client` resolved to `…/packages/theo/client/index.js` (missing)
 * instead of `…/packages/theo/dist/client/index.js`.
 *
 * The fix `existsSync(currentDir/client) ? currentDir : ..` is now extracted
 * to `resolveTheoRootDir()`. These tests pin its behavior across both modes.
 */

function buildTempTree(): {
  distLikeWithClient: string
  srcViteShape: { currentDir: string; expectedRoot: string }
  bareWithoutClient: string
  cleanup: () => void
} {
  const root = mkdtempSync(join(tmpdir(), 'theo-root-resolve-'))

  // Dist-shaped: `<root>/dist/` contains `client/` directly
  const distDir = join(root, 'dist')
  mkdirSync(join(distDir, 'client'), { recursive: true })

  // Src-shaped: `<root>/src/vite-plugin/` is currentDir, `<root>/src/client/` exists
  const srcDir = join(root, 'src')
  const srcVitePlugin = join(srcDir, 'vite-plugin')
  mkdirSync(srcVitePlugin, { recursive: true })
  mkdirSync(join(srcDir, 'client'), { recursive: true })

  // Bare: no client/ at either level
  const bareDir = join(root, 'bare', 'inner')
  mkdirSync(bareDir, { recursive: true })

  return {
    distLikeWithClient: distDir,
    srcViteShape: { currentDir: srcVitePlugin, expectedRoot: srcDir },
    bareWithoutClient: bareDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

describe('T1.3 — resolveTheoRootDir branch detection', () => {
  it('dist shape: currentDir already has client/ → returns currentDir', () => {
    const t = buildTempTree()
    try {
      expect(resolveTheoRootDir(t.distLikeWithClient)).toBe(t.distLikeWithClient)
    } finally {
      t.cleanup()
    }
  })

  it('src shape: currentDir is vite-plugin/, parent has client/ → returns parent', () => {
    const t = buildTempTree()
    try {
      expect(resolveTheoRootDir(t.srcViteShape.currentDir)).toBe(
        t.srcViteShape.expectedRoot,
      )
    } finally {
      t.cleanup()
    }
  })

  it('no client/ at either level → falls back to parent (legacy behavior)', () => {
    const t = buildTempTree()
    try {
      const result = resolveTheoRootDir(t.bareWithoutClient)
      // Parent of `<root>/bare/inner` is `<root>/bare`
      expect(result.endsWith('/bare')).toBe(true)
    } finally {
      t.cleanup()
    }
  })

  it('pure function — calling twice returns identical result', () => {
    const t = buildTempTree()
    try {
      const a = resolveTheoRootDir(t.distLikeWithClient)
      const b = resolveTheoRootDir(t.distLikeWithClient)
      expect(a).toBe(b)
    } finally {
      t.cleanup()
    }
  })
})
