import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/ssr-streaming')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T6.1 — ssr-streaming fixture', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/SlowFeed.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'index.html'))).toBe(true)
  })

  it('config enables ssr AND ssrStreaming', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/ssr:\s*true/)
    expect(src).toMatch(/ssrStreaming:\s*true/)
  })

  it('page wraps deferred component in Suspense', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/<Suspense/)
    expect(src).toMatch(/SlowFeed/)
  })

  it('SlowFeed implements thrown-promise Suspense protocol', () => {
    const src = read('app/SlowFeed.tsx')
    expect(src).toMatch(/throw\s+pending/)
  })

  it('README mentions renderToPipeableStream', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/renderToPipeableStream/)
  })

  it('README documents Transfer-Encoding chunked behavior', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/chunked|Transfer-Encoding/i)
  })
})
