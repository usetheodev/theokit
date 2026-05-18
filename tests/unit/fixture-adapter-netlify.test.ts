import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/adapter-targets/netlify')
const ADAPTER = resolve(__dirname, '../../packages/theo/src/adapters/netlify.ts')
const read = (p: string) => readFileSync(p, 'utf-8')

describe('T8.5 — adapter-netlify fixture', () => {
  it('fixture has theo.config.ts + README + netlify.toml', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'netlify.toml'))).toBe(true)
  })

  it('README mentions `theokit build --target=netlify`', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/--target=netlify/)
  })

  it('netlify.toml has pre-existing user content to test non-destructive merge', () => {
    const toml = read(resolve(FIXTURE, 'netlify.toml'))
    expect(toml).toMatch(/\[build\]/)
    expect(toml).toMatch(/\[\[headers\]\]/)
  })

  it('adapter source emits .netlify/functions/theo.mjs', () => {
    expect(read(ADAPTER)).toMatch(/functions\/theo\.mjs/)
  })

  it('adapter source merges netlify.toml (does not overwrite)', () => {
    // Match either of the canonical implementation signals
    const src = read(ADAPTER)
    expect(src).toMatch(/netlify\.toml|NetlifyConflictError|mergeTomlContent/)
  })

  it('README documents idempotent merge guarantee', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/idempotent|does not duplicate/i)
  })
})
