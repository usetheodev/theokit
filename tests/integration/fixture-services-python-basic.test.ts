import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { theoConfigSchema } from 'theokit'

const FIXTURE = resolve(__dirname, '../../fixtures/services-python-basic')
const TEMPLATE = resolve(__dirname, '../../packages/create-theo/templates/services/agent-python')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('T4.1 — services-python-basic fixture', () => {
  it('all required files exist', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'index.html'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/agent/main.py'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/agent/pyproject.toml'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'services/agent/README.md'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/health.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
  })

  it('theo.config.ts declares services.agent with runtime python', async () => {
    const src = readFileSync(resolve(FIXTURE, 'theo.config.ts'), 'utf-8')
    expect(src).toMatch(/services:\s*\{[\s\S]+agent:[\s\S]+runtime:\s*['"]python['"]/)
    // Also parse against the schema (use the literal config values).
    const result = theoConfigSchema.safeParse({
      services: {
        agent: {
          runtime: 'python',
          port: 8101,
          proxy: '/api/agent',
          dev: 'uv run uvicorn main:app --reload --port 8101',
          start: 'uv run uvicorn main:app --port 8101 --workers 4',
          healthcheck: '/health',
          openapi: 'http://localhost:8101/openapi.json',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('main.py has health endpoint, traceparent middleware, JSON logging', () => {
    const main = readFileSync(resolve(FIXTURE, 'services/agent/main.py'), 'utf-8')
    expect(main).toContain('@app.get("/health")')
    expect(main).toContain('traceparent')
    expect(main).toContain('JsonFormatter')
  })

  it('EC-3 drift check: main.py byte-equal to template', () => {
    const fixtureSha = sha256(resolve(FIXTURE, 'services/agent/main.py'))
    const templateSha = sha256(resolve(TEMPLATE, 'main.py'))
    expect(fixtureSha).toBe(templateSha)
  })

  it('EC-3 drift check: README.md byte-equal to template', () => {
    const fixtureSha = sha256(resolve(FIXTURE, 'services/agent/README.md'))
    const templateSha = sha256(resolve(TEMPLATE, 'README.md'))
    expect(fixtureSha).toBe(templateSha)
  })
})
