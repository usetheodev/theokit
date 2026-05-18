import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/typed-client')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T4.1 — typed-client fixture (structure)', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/users.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('page.tsx uses theoFetch with typeof imports', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/theoFetch<typeof GET>/)
    expect(src).toMatch(/theoFetch<typeof POST>/)
  })

  it('page.tsx uses type-only import for route types', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/import\s+type\s+\{[^}]*GET[^}]*\}\s+from/)
  })

  it('route exports both GET and POST with Zod schemas', () => {
    const src = read('server/routes/users.ts')
    expect(src).toMatch(/export const GET = defineRoute/)
    expect(src).toMatch(/export const POST = defineRoute/)
    expect(src).toMatch(/z\.object/)
  })
})
