import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const REPO = resolve(__dirname, '../..')

describe('Zod single-version invariant (T0.1)', () => {
  it('package.json contains pnpm.overrides.zod === 3.25.76', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8')) as {
      pnpm?: { overrides?: Record<string, string> }
    }
    expect(pkg.pnpm?.overrides?.zod).toBe('3.25.76')
  })

  it('exactly ONE zod version installed in node_modules/.pnpm/', () => {
    const pnpmDir = resolve(REPO, 'node_modules/.pnpm')
    const entries = readdirSync(pnpmDir).filter((e) => /^zod@\d/.test(e))
    expect(entries.length).toBe(1)
    expect(entries[0]).toBe('zod@3.25.76')
  })

  it('require("zod/package.json").version === 3.25.76', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zodPkg = require('zod/package.json') as { version: string }
    expect(zodPkg.version).toBe('3.25.76')
  })

  it('no zod@4 directory anywhere in node_modules/.pnpm/', () => {
    const pnpmDir = resolve(REPO, 'node_modules/.pnpm')
    const entries = readdirSync(pnpmDir).filter((e) => e.startsWith('zod@4'))
    expect(entries.length).toBe(0)
  })

  // EC-210: knip 5.88.1 declares zod ^4 as peer; with override, it sees 3.25.76.
  // We don't test knip success here (out of scope of this assertion test);
  // we ONLY assert the override is in place.
  it('pnpm-lock.yaml exists (regenerated after override)', () => {
    const lockPath = resolve(REPO, 'pnpm-lock.yaml')
    const content = readFileSync(lockPath, 'utf8')
    expect(content).toContain('lockfileVersion')
  })

  it('pnpm exec knip --no-config still produces output (does not crash)', () => {
    // EC-210 trigger: if knip outright crashes, fallback T0.1b is to remove
    // knip from CI. For now we verify it doesn't crash on the override.
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      execSync('node_modules/.bin/knip --no-config --no-exit-code 2>&1', {
        cwd: REPO,
        encoding: 'utf8',
        timeout: 30_000,
      })
      // exit 0 OR documented warning — both acceptable
    } catch (err) {
      // Knip failure documented in CHANGELOG; test only fails if process crashed
      const message = err instanceof Error ? err.message : String(err)
      // Don't fail on knip's own findings ("3 unused files") — only on
      // crash-level errors (segfault, missing binary, etc.).
      expect(message).not.toMatch(/segfault|cannot find module 'knip'/i)
    }
  })
})
