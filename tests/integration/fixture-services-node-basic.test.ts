import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { theoConfigSchema } from 'theokit'

const FIXTURE = resolve(__dirname, '../../fixtures/services-node-basic')
const TEMPLATE = resolve(__dirname, '../../packages/create-theo/templates/services/agent-node')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('T4.2 — services-node-basic fixture', () => {
  it('all required files exist', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/worker/src/index.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/worker/package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/worker/tsconfig.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/health.ts'))).toBe(true)
  })

  it('theo.config.ts declares services.worker with runtime node', () => {
    const src = readFileSync(resolve(FIXTURE, 'theo.config.ts'), 'utf-8')
    expect(src).toMatch(/services:\s*\{[\s\S]+worker:[\s\S]+runtime:\s*['"]node['"]/)
    const result = theoConfigSchema.safeParse({
      services: {
        worker: {
          runtime: 'node',
          port: 8102,
          proxy: '/api/worker',
          dev: 'pnpm dev',
          start: 'pnpm start',
          healthcheck: '/health',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('src/index.ts uses Hono with /health + traceparent middleware', () => {
    const src = readFileSync(resolve(FIXTURE, 'services/worker/src/index.ts'), 'utf-8')
    expect(src).toContain("from 'hono'")
    expect(src).toMatch(/app\.get\(['"]\/health['"]/)
    expect(src).toContain('traceparent')
  })

  it('EC-3 drift check: src/index.ts byte-equal to template', () => {
    const fixtureSha = sha256(resolve(FIXTURE, 'services/worker/src/index.ts'))
    const templateSha = sha256(resolve(TEMPLATE, 'src/index.ts'))
    expect(fixtureSha).toBe(templateSha)
  })

  it('EC-3 drift check: tsconfig.json byte-equal to template', () => {
    const fixtureSha = sha256(resolve(FIXTURE, 'services/worker/tsconfig.json'))
    const templateSha = sha256(resolve(TEMPLATE, 'tsconfig.json'))
    expect(fixtureSha).toBe(templateSha)
  })
})
