import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { scaffold } from '../../packages/create-theo/src/index.js'

function makeTargetDir(): string {
  return mkdtempSync(join(tmpdir(), 'theokit-bare-test-'))
}

describe('create-theokit --bare flag (T4.1)', () => {
  it('without --bare: scaffold includes @usetheo/ui in deps', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'demo-app', 'default')
      const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8'))
      expect(pkg.dependencies['@usetheo/ui']).toBeDefined()
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('with --bare: removes @usetheo/ui from deps', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'demo-app', 'default', { bare: true })
      const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8'))
      expect(pkg.dependencies['@usetheo/ui']).toBeUndefined()
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('with --bare: replaces app/page.tsx with Hello Theo', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'demo-app', 'default', { bare: true })
      const page = readFileSync(join(target, 'app/page.tsx'), 'utf-8')
      expect(page).toContain('Hello Theo')
      expect(page).not.toContain('AgentComposer')
      expect(page).not.toContain('@usetheo/ui')
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('with --bare: removes mock chat route (depends on AgentEvent)', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'demo-app', 'default', { bare: true })
      expect(existsSync(join(target, 'server/routes/chat.ts'))).toBe(false)
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('--bare + non-default template throws clear error', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    expect(() =>
      scaffold(target, 'demo-app', 'dashboard', { bare: true }),
    ).toThrow(/bare.+default/i)
  })

  it('--bare with default template: still has health route + theo.config + tsconfig', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    try {
      scaffold(target, 'demo-app', 'default', { bare: true })
      expect(existsSync(join(target, 'server/routes/health.ts'))).toBe(true)
      expect(existsSync(join(target, 'theo.config.ts'))).toBe(true)
      expect(existsSync(join(target, 'tsconfig.json'))).toBe(true)
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('--bare transform failure rolls back targetDir (EC-4)', () => {
    const target = makeTargetDir()
    rmSync(target, { recursive: true, force: true })
    // Simulate failure via injected fs that throws on write
    expect(() =>
      scaffold(target, 'demo-app', 'default', {
        bare: true,
        // Inject a transform that throws to simulate disk failure mid-transform
        _testForceTransformError: 'simulated-fs-failure',
      } as never),
    ).toThrow(/rolled back|scaffold/i)
    // After rollback, targetDir should not exist
    expect(existsSync(target)).toBe(false)
  })
})
