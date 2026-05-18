import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/adapter-targets/vercel')
const ADAPTER = resolve(__dirname, '../../packages/theo/src/adapters/vercel.ts')
const read = (p: string) => readFileSync(p, 'utf-8')

describe('T8.4 — adapter-vercel fixture', () => {
  it('fixture has theo.config.ts + README + vercel.json', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'vercel.json'))).toBe(true)
  })

  it('README mentions `theokit build --target=vercel`', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/--target=vercel/)
  })

  it('adapter source emits Build Output v3 (config.json + functions)', () => {
    const src = read(ADAPTER)
    expect(src).toMatch(/config\.json/)
    expect(src).toMatch(/\.vercel\/output|vercel\/output/)
  })

  it('vercel.json declares the theokit build command', () => {
    const vc = JSON.parse(read(resolve(FIXTURE, 'vercel.json'))) as { buildCommand?: string }
    expect(vc.buildCommand).toMatch(/--target=vercel/)
  })
})
