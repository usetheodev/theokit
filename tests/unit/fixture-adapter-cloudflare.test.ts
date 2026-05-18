import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/adapter-targets/cloudflare')
const ADAPTER = resolve(__dirname, '../../packages/theo/src/adapters/cloudflare.ts')
const read = (p: string) => readFileSync(p, 'utf-8')

describe('T8.3 — adapter-cloudflare fixture', () => {
  it('fixture has theo.config.ts + README + wrangler.toml', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'wrangler.toml'))).toBe(true)
  })

  it('README mentions `theokit build --target=cloudflare`', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/--target=cloudflare/)
  })

  it('adapter source emits worker.mjs', () => {
    expect(read(ADAPTER)).toMatch(/worker\.mjs/)
  })

  it('adapter source uses default export with fetch handler (Workers shape)', () => {
    expect(read(ADAPTER)).toMatch(/export\s+default|fetch\s*\(/)
  })

  it('adapter uses the shared web-shim for executeRoute pipeline', () => {
    expect(read(ADAPTER)).toMatch(/createWebShim|web-shim/)
  })
})
