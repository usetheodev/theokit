import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/adapter-targets/deno-deploy')
const ADAPTER = resolve(__dirname, '../../packages/theo/src/adapters/deno-deploy.ts')
const read = (p: string) => readFileSync(p, 'utf-8')

describe('T8.2 — adapter-deno-deploy fixture', () => {
  it('fixture has theo.config.ts + README', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('README mentions `theokit build --target=deno-deploy`', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/--target=deno-deploy/)
  })

  it('adapter source uses Deno.serve', () => {
    expect(read(ADAPTER)).toMatch(/Deno\.serve/)
  })

  it('adapter emits server.ts (TypeScript) for Deno', () => {
    expect(read(ADAPTER)).toMatch(/server\.ts/)
  })

  it('adapter has runtime presence guard', () => {
    expect(read(ADAPTER)).toMatch(/typeof Deno/)
  })
})
