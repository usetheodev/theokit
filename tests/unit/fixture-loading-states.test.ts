import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/loading-states')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T5.1 — loading-states fixture', () => {
  it('has root + segment-level loading.tsx', () => {
    expect(existsSync(resolve(FIXTURE, 'app/loading.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/slow/loading.tsx'))).toBe(true)
  })

  it('has slow page wrapping a deferred component', () => {
    expect(existsSync(resolve(FIXTURE, 'app/slow/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/slow/SlowFeed.tsx'))).toBe(true)
  })

  it('slow page uses Suspense', () => {
    const src = read('app/slow/page.tsx')
    expect(src).toMatch(/<Suspense/)
  })

  it('SlowFeed implements the Suspense thrown-promise protocol', () => {
    const src = read('app/slow/SlowFeed.tsx')
    expect(src).toMatch(/throw\s+pending/)
  })

  it('each loading.tsx exports a default React component', () => {
    expect(read('app/loading.tsx')).toMatch(/export\s+default\s+function/)
    expect(read('app/slow/loading.tsx')).toMatch(/export\s+default\s+function/)
  })

  it('README documents closest-loading-wins rule', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/closest|wins|segment-level/i)
  })
})
