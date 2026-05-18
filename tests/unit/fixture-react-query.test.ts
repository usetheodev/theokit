import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/react-query-integration')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T4.4 — react-query-integration fixture', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/users.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/layout.tsx'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('package.json declares @tanstack/react-query (EC-6 pinned)', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['@tanstack/react-query']).toBeDefined()
  })

  it('page imports from theokit/react-query subpath', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/from\s+['"]theokit\/react-query['"]/)
    expect(src).toMatch(/buildUseTheoQueryConfig/)
  })

  it('page uses useQuery from @tanstack/react-query', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/from\s+['"]@tanstack\/react-query['"]/)
    expect(src).toMatch(/useQuery\(/)
  })

  it('layout wraps QueryClientProvider with useState (not top-level instance)', () => {
    const src = read('app/layout.tsx')
    expect(src).toMatch(/QueryClientProvider/)
    expect(src).toMatch(/useState\(\(\)\s*=>\s*new QueryClient\(\)\)/)
  })

  it('README explains EC-10 stable-key win', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/stable.*key|infinite.*refetch|EC-10/i)
  })
})
