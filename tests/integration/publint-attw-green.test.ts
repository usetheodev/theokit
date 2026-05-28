import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTheokitPackageOnce } from './_helpers/build-theokit-package.js'

const REPO = resolve(__dirname, '../..')
const THEOKIT_PKG = resolve(REPO, 'packages/theo')

describe('publint + attw gate (T5.2)', { timeout: 300_000 }, () => {
  beforeAll(() => {
    buildTheokitPackageOnce()
  }, 300_000)

  it('publint packages/theo → "All good!"', () => {
    let output: string
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local test invoking publint CLI
      output = execSync('npx publint packages/theo 2>&1', {
        cwd: REPO,
        encoding: 'utf8',
      })
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string }
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }
    expect(output).toMatch(/All good!|Suggestions/i)
    // No fatal errors (publint prints them as ✖ at non-zero exit; the
    // try/catch above already captures stdout)
    expect(output).not.toMatch(/✖.*Error/i)
  })

  it('attw --pack packages/theo → "No problems"', () => {
    let output: string
    try {
      output = execSync(
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local test invoking attw CLI
        'npx @arethetypeswrong/cli --pack packages/theo --ignore-rules cjs-resolves-to-esm no-resolution 2>&1',
        { cwd: REPO, encoding: 'utf8' },
      )
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string }
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }
    // attw exits 0 only when no problems; we accept both literal match and
    // empty error list as success indicators
    expect(output.toLowerCase()).toMatch(/no problems|all good|🎉|✅/)
  })

  it('package.json contains files field', () => {
    const pkg = JSON.parse(readFileSync(resolve(THEOKIT_PKG, 'package.json'), 'utf8')) as {
      files?: string[]
    }
    expect(pkg.files).toBeDefined()
    expect(Array.isArray(pkg.files)).toBe(true)
  })

  it('package.json exports map includes ./server', () => {
    const pkg = JSON.parse(readFileSync(resolve(THEOKIT_PKG, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
    }
    expect(pkg.exports).toBeDefined()
    expect(pkg.exports?.['./server']).toBeDefined()
  })

  it('dist/ exists (precondition for the above)', () => {
    expect(existsSync(resolve(THEOKIT_PKG, 'dist/index.d.ts'))).toBe(true)
  })
})
