import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/batching')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T4.3 — batching fixture', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/users.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
  })

  it('config enables batching', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/batching:/)
  })

  it('page uses createBatcher from theokit/client', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/createBatcher/)
    expect(src).toMatch(/from\s+['"]theokit\/client['"]/)
  })

  it('page dispatches in same microtask (synchronous calls inside Promise.all)', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/Promise\.all\(/)
    // count dispatches inside the Promise.all
    expect(src.match(/batcher\.dispatch\(/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('README documents the same-microtask contract', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/microtask|same tick|same.microtask|same-tick/i)
  })

  it('README mentions /api/__theo_batch__ convention', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/__theo_batch__/)
  })
})
