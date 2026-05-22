import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scanUpgradeReadiness } from '../../packages/theo/src/cli/commands/upgrade-readiness.js'

/**
 * T4.1 — `theokit check` hints for zero-config migration:
 *   - zero-config-tailwind-suggest: tailwind.config without @usetheo/ui/preset
 *   - handrolled-dotenv-suggest: server/ files importing dotenv directly
 */

let tmpDir: string

function makeFixture(): string {
  const dir = join(tmpdir(), `__check_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, 'app'), { recursive: true })
  mkdirSync(join(dir, 'server'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'fix',
      dependencies: { theokit: '0.1.0', '@usetheo/ui': '0.1.0' },
    }),
  )
  writeFileSync(join(dir, 'app/page.tsx'), 'export default function() { return null }')
  return dir
}

beforeEach(() => {
  tmpDir = makeFixture()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('T4.1 — zero-config hints', () => {
  it('hint fires when @usetheo/ui + tailwind.config.ts without preset import', async () => {
    writeFileSync(join(tmpDir, 'tailwind.config.ts'), `export default { content: ['./app/**'] }`)
    const report = await scanUpgradeReadiness({ cwd: tmpDir, allowWarnings: true })
    const hint = report.violations.find((v) => v.rule === 'zero-config-tailwind-suggest')
    expect(hint).toBeDefined()
    expect(hint?.fix).toMatch(/@usetheo\/ui\/preset/)
  })

  it('no hint when tailwind.config already imports the preset', async () => {
    writeFileSync(
      join(tmpDir, 'tailwind.config.ts'),
      `import preset from '@usetheo/ui/preset'\nexport default { presets: [preset] }`,
    )
    const report = await scanUpgradeReadiness({ cwd: tmpDir, allowWarnings: true })
    expect(report.violations.find((v) => v.rule === 'zero-config-tailwind-suggest')).toBeUndefined()
  })

  it('no hint when @usetheo/ui is absent (even with tailwind.config)', async () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'fix', dependencies: { theokit: '0.1.0' } }),
    )
    writeFileSync(join(tmpDir, 'tailwind.config.ts'), `export default { content: ['./app/**'] }`)
    const report = await scanUpgradeReadiness({ cwd: tmpDir, allowWarnings: true })
    expect(report.violations.find((v) => v.rule === 'zero-config-tailwind-suggest')).toBeUndefined()
  })

  it('hint fires when server/ file imports dotenv', async () => {
    writeFileSync(
      join(tmpDir, 'server/load-env.ts'),
      `import 'dotenv/config'\nexport const x = 1`,
    )
    const report = await scanUpgradeReadiness({ cwd: tmpDir, allowWarnings: true })
    const hint = report.violations.find((v) => v.rule === 'handrolled-dotenv-suggest')
    expect(hint).toBeDefined()
    expect(hint?.message).toMatch(/loadEnv/)
  })
})
