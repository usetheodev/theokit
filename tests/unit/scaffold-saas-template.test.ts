import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TEMPLATE = resolve(__dirname, '../../packages/create-theo/templates/saas')
const read = (rel: string) => readFileSync(resolve(TEMPLATE, rel), 'utf-8')

describe('T10.1 — saas template', () => {
  it('has all expected files', () => {
    const expected = [
      'package.json.tmpl',
      'theo.config.ts',
      'tsconfig.json',
      '_gitignore',
      '.env.example',
      'drizzle.config.ts',
      'index.html',
      'db/index.ts',
      'db/schema.ts',
      'server/context.ts',
      'server/routes/login.ts',
      'server/routes/logout.ts',
      'server/routes/me.ts',
      'server/routes/agent.ts',
      'app/page.tsx',
      'app/layout.tsx',
    ]
    for (const f of expected) {
      expect(existsSync(resolve(TEMPLATE, f)), `missing ${f}`).toBe(true)
    }
  })

  it('agent.ts uses requireAuth before yielding events', () => {
    const src = read('server/routes/agent.ts')
    expect(src).toMatch(/requireAuth/)
    expect(src).toMatch(/defineAgentEndpoint/)
  })

  it('login.ts validates with Zod (email + password)', () => {
    const src = read('server/routes/login.ts')
    expect(src).toMatch(/z\.object/)
    expect(src).toMatch(/email:\s*z\.string\(\)\.email\(\)/)
  })

  it('db/schema.ts has both users and sessions tables', () => {
    const src = read('db/schema.ts')
    expect(src).toMatch(/users\s*=\s*pgTable/)
    expect(src).toMatch(/sessions\s*=\s*pgTable/)
  })

  it('EC-2: .env.example uses CHANGE_ME placeholder pattern', () => {
    const env = read('.env.example')
    expect(env).toMatch(/SECRET=CHANGE_ME/)
  })

  it('EC-2: context.ts calls assertProductionSecret', () => {
    const src = read('server/context.ts')
    expect(src).toMatch(/assertProductionSecret/)
  })

  it('package.json.tmpl pulls in @usetheo/ui + react-router + zod', () => {
    const pkg = read('package.json.tmpl')
    expect(pkg).toMatch(/"@usetheo\/ui"/)
    expect(pkg).toMatch(/"react-router"/)
    expect(pkg).toMatch(/"zod"/)
    expect(pkg).toMatch(/"drizzle-orm"/)
  })

  it('app/page.tsx uses useAgentStream + AgentComposer + AgentTimeline', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/useAgentStream/)
    expect(src).toMatch(/AgentComposer/)
    expect(src).toMatch(/AgentTimeline/)
  })
})

describe('T10.1 — saas template registered in scaffolder', () => {
  it('saas template directory exists', () => {
    expect(existsSync(TEMPLATE)).toBe(true)
  })
})
