import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/define-integration')

function read(rel: string): string {
  return readFileSync(resolve(FIXTURE, rel), 'utf-8')
}

describe('T2.3 — define-integration fixture', () => {
  it('fixture exists with package.json + theo.config.ts', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
  })

  it('integration uses defineTheoIntegration with theo:config:setup hook', () => {
    const src = read('integrations/banner.ts')
    expect(src).toMatch(/defineTheoIntegration/)
    expect(src).toMatch(/theo:config:setup/)
  })

  it('integration calls addVirtualModule with correct prefix (EC-6)', () => {
    const src = read('integrations/banner.ts')
    expect(src).toMatch(/addVirtualModule/)
    expect(src).toMatch(/virtual:integration:banner\//)
  })

  it('app/page.tsx imports the virtual module', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/virtual:integration:banner\/text/)
  })

  it('theo.config.ts registers the banner integration', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/integrations/)
    expect(src).toMatch(/banner/)
  })

  it('README documents virtual module prefix invariant', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/virtual:integration:/)
  })
})
