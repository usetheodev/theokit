import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/rate-limit')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T7.1 — rate-limit fixture', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/api.ts'))).toBe(true)
  })

  it('config declares windowMs + max', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/windowMs:\s*10_?000/)
    expect(src).toMatch(/max:\s*5/)
  })

  it('README documents 429 + Retry-After headers', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/429/)
    expect(readme).toMatch(/Retry-After/)
  })

  it('README documents X-RateLimit-* response headers', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/X-RateLimit-Limit/)
    expect(readme).toMatch(/X-RateLimit-Remaining/)
  })
})
