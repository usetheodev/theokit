import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/adapter-targets/bun')
const BASE = resolve(__dirname, '../../fixtures/adapter-targets/_base')
const ADAPTER_SRC = resolve(__dirname, '../../packages/theo/src/adapters/bun.ts')

const read = (path: string) => readFileSync(path, 'utf-8')

describe('T8.1 — adapter-bun fixture (compile-only)', () => {
  it('shared _base exists with app + server route', () => {
    expect(existsSync(resolve(BASE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(BASE, 'server/routes/health.ts'))).toBe(true)
  })

  it('fixture has theo.config.ts + README', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('README documents `theokit build --target=bun` command', () => {
    const readme = read(resolve(FIXTURE, 'README.md'))
    expect(readme).toMatch(/--target=bun/)
  })

  it('bun adapter source uses Bun.serve', () => {
    const adapter = read(ADAPTER_SRC)
    expect(adapter).toMatch(/Bun\.serve/)
  })

  it('bun adapter source does NOT import node:http', () => {
    const adapter = read(ADAPTER_SRC)
    expect(adapter).not.toMatch(/from\s+['"]node:http['"]/)
  })

  it('bun adapter has a runtime presence guard', () => {
    const adapter = read(ADAPTER_SRC)
    expect(adapter).toMatch(/typeof Bun/)
  })
})
