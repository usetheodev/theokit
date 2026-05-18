import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/use-agent-stream-react')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T4.2 — use-agent-stream-react fixture', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/agent.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('page.tsx uses useAgentStream from theokit/client', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/useAgentStream/)
    expect(src).toMatch(/from\s+['"]theokit\/client['"]/)
  })

  it('page.tsx has NO dependency on @usetheo/ui', () => {
    const src = read('app/page.tsx')
    expect(src).not.toMatch(/@usetheo\/ui/)
  })

  it('page.tsx uses native HTML elements (button, input, ul, li)', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/<button/)
    expect(src).toMatch(/<input/)
    expect(src).toMatch(/<ul>/)
    expect(src).toMatch(/<li/)
  })

  it('page.tsx demonstrates send() and reset()', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/send\(/)
    expect(src).toMatch(/reset/)
  })

  it('agent route uses defineAgentEndpoint', () => {
    const src = read('server/routes/agent.ts')
    expect(src).toMatch(/defineAgentEndpoint/)
  })

  it('README explains plain-React proof (no UI library)', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/plain React|no.*@usetheo\/ui|no extra UI/i)
  })
})
