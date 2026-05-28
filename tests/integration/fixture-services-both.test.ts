import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { theoConfigSchema } from 'theokit'
import { buildManifest } from '../../packages/theo/src/services/index.js'

const FIXTURE = resolve(__dirname, '../../fixtures/services-both')
const TEMPLATE_PY = resolve(__dirname, '../../packages/create-theo/templates/services/agent-python')
const TEMPLATE_NODE = resolve(__dirname, '../../packages/create-theo/templates/services/agent-node')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('T4.3 — services-both fixture (Python + Node with dependsOn)', () => {
  it('all required files exist', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/agent/main.py'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/worker/src/index.ts'))).toBe(true)
  })

  it('theo.config.ts declares both services with dependsOn', () => {
    const src = readFileSync(resolve(FIXTURE, 'theo.config.ts'), 'utf-8')
    expect(src).toMatch(/agent:[\s\S]+runtime:\s*['"]python['"]/)
    expect(src).toMatch(/worker:[\s\S]+runtime:\s*['"]node['"]/)
    expect(src).toMatch(/dependsOn:\s*\[\s*['"]agent['"]\s*\]/)
  })

  it('schema parses the both-config successfully', () => {
    const result = theoConfigSchema.safeParse({
      services: {
        agent: {
          runtime: 'python',
          port: 8103,
          proxy: '/api/agent',
          dev: 'uv run uvicorn main:app --reload --port 8103',
          start: 'uv run uvicorn main:app --port 8103 --workers 4',
          healthcheck: '/health',
        },
        worker: {
          runtime: 'node',
          port: 8104,
          proxy: '/api/worker',
          dev: 'pnpm dev',
          start: 'pnpm start',
          healthcheck: '/health',
          dependsOn: ['agent'],
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('manifest topological order: agent BEFORE worker', () => {
    const manifest = buildManifest({
      agent: {
        runtime: 'python',
        port: 8103,
        proxy: '/api/agent',
        dev: 'uv run uvicorn main:app --reload --port 8103',
        start: 'uv run uvicorn main:app --port 8103 --workers 4',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
      worker: {
        runtime: 'node',
        port: 8104,
        proxy: '/api/worker',
        dev: 'pnpm dev',
        start: 'pnpm start',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
        dependsOn: ['agent'],
      },
    })
    const names = manifest.services.map((s) => s.name)
    expect(names.indexOf('agent')).toBeLessThan(names.indexOf('worker'))
  })

  it('EC-3 drift check: Python main.py byte-equal to template', () => {
    expect(sha256(resolve(FIXTURE, 'services/agent/main.py'))).toBe(
      sha256(resolve(TEMPLATE_PY, 'main.py')),
    )
  })

  it('EC-3 drift check: Node src/index.ts byte-equal to template', () => {
    expect(sha256(resolve(FIXTURE, 'services/worker/src/index.ts'))).toBe(
      sha256(resolve(TEMPLATE_NODE, 'src/index.ts')),
    )
  })
})
