import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectPackage } from '../../packages/theo/src/vite-plugin/auto-detect.js'

/**
 * T3.1 — `detectPackage(name, cwd)` generalized detector tests.
 */

let tmpDir: string

function makeTmp(): string {
  const d = join(tmpdir(), `__detect_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

beforeEach(() => {
  tmpDir = makeTmp()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('detectPackage', () => {
  it('happy: real installed package (workspace theokit detects fine via @vitejs/plugin-react)', () => {
    // packages/theo declares @vitejs/plugin-react as a dep.
    const result = detectPackage(
      '@vitejs/plugin-react',
      join(process.cwd(), 'packages/theo'),
    )
    expect(result.installed).toBe(true)
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('not declared: returns {installed: false}', () => {
    // tmpDir has no package.json
    const result = detectPackage('@vitejs/plugin-react', tmpDir)
    expect(result.installed).toBe(false)
  })

  it('declared but unresolvable: returns {installed: false}', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'tmp',
        dependencies: { '@nonexistent/never-installed': '^1.0.0' },
      }),
    )
    const result = detectPackage('@nonexistent/never-installed', tmpDir)
    expect(result.installed).toBe(false)
  })

  it('peerDependencies counted as declaration', () => {
    // Create a fake project inside packages/theo so node_modules is resolvable
    const fakeRoot = join(process.cwd(), 'packages/theo', '__test-peer-decl')
    mkdirSync(fakeRoot, { recursive: true })
    writeFileSync(
      join(fakeRoot, 'package.json'),
      JSON.stringify({
        name: 'tmp',
        peerDependencies: { '@vitejs/plugin-react': '^4.0.0' },
      }),
    )
    try {
      const result = detectPackage('@vitejs/plugin-react', fakeRoot)
      expect(result.installed).toBe(true)
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true })
    }
  })

  it('invalid name: returns {installed: false} (no throw)', () => {
    const result = detectPackage('@nonexistent/garbage', tmpDir)
    expect(result.installed).toBe(false)
  })

  it('handles corrupt package.json gracefully', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ this is not valid json')
    const result = detectPackage('@vitejs/plugin-react', tmpDir)
    expect(result.installed).toBe(false)
  })
})
