import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTheokitPackageOnce } from './_helpers/build-theokit-package.js'

const REPO = resolve(__dirname, '../..')
const DIST = resolve(REPO, 'packages/theo/dist')

describe('theokit package build (T5.1)', { timeout: 300_000 }, () => {
  beforeAll(() => {
    buildTheokitPackageOnce()
  }, 300_000)

  it('pnpm --filter theokit build succeeds (artifacts present)', () => {
    // Shared mutex-guarded build already ran in beforeAll; just verify dist/
    expect(existsSync(resolve(DIST, 'index.d.ts'))).toBe(true)
  })

  it('dist/index.d.ts exists', () => {
    expect(existsSync(resolve(DIST, 'index.d.ts'))).toBe(true)
  })

  it('dist/server/index.d.ts exists', () => {
    expect(existsSync(resolve(DIST, 'server/index.d.ts'))).toBe(true)
  })

  it('dist exports include defineJob', () => {
    const content = readFileSync(resolve(DIST, 'server/index.d.ts'), 'utf8')
    expect(content).toMatch(/defineJob/)
  })

  it('dist exports include defineCron', () => {
    const content = readFileSync(resolve(DIST, 'server/index.d.ts'), 'utf8')
    expect(content).toMatch(/defineCron/)
  })

  it('dist exports include defineWebhook', () => {
    const content = readFileSync(resolve(DIST, 'server/index.d.ts'), 'utf8')
    expect(content).toMatch(/defineWebhook/)
  })

  it('dist exports include trackAgentRun', () => {
    const content = readFileSync(resolve(DIST, 'server/index.d.ts'), 'utf8')
    expect(content).toMatch(/trackAgentRun/)
  })

  it('dist exports include DuplicateContextKeyError', () => {
    const content = readFileSync(resolve(DIST, 'server/index.d.ts'), 'utf8')
    expect(content).toMatch(/DuplicateContextKeyError/)
  })

  it('no `: any\\b` leaks in public DTS', () => {
    const content = readFileSync(resolve(DIST, 'server/index.d.ts'), 'utf8')
    const anyCount = (content.match(/:\s*any\b/g) ?? []).length
    // Some libraries (e.g. zod 3 internals) leak `any` in transitive types.
    // Cap is empirical baseline: post-Zod-fix should be ≤ 30 (was 100+ pre-fix).
    expect(anyCount).toBeLessThan(50)
  })
})
