import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T1.1 — Skeleton sanity checks. Heavier integration (boot dev server, hit
 * health route) runs as Playwright/integration tests in Phase 5.
 */

const ROOT = resolve(__dirname, '../..')
const EXAMPLE = resolve(ROOT, 'examples/full-stack-agent')

function read(rel: string): string {
  return readFileSync(resolve(EXAMPLE, rel), 'utf-8')
}

describe('examples/full-stack-agent skeleton — T1.1', () => {
  it('declares the required dependencies in package.json', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
    }
    const deps = pkg.dependencies ?? {}
    for (const name of [
      'theokit',
      '@usetheo/sdk',
      '@usetheo/ui',
      '@usetheo/gateway',
      '@usetheo/gateway-telegram',
      'grammy',
      'zod',
      'react',
      'react-dom',
    ]) {
      expect(deps[name], `dep ${name} missing`).toBeDefined()
    }
  })

  it('does NOT contain real secrets in .env.example', () => {
    const env = read('.env.example')
    // Real OpenRouter / Anthropic / Telegram tokens should never be committed.
    expect(env).not.toMatch(/sk-or-v1-[a-zA-Z0-9]{20,}/)
    expect(env).not.toMatch(/sk-ant-api03-[a-zA-Z0-9_-]{20,}/)
    expect(env).not.toMatch(/^TELEGRAM_BOT_TOKEN=\d+:.+/m)
  })

  it('ships health route + theo.config.ts + layout/page', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/routes/health.ts'))).toBe(true)
    expect(existsSync(resolve(EXAMPLE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(EXAMPLE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(EXAMPLE, 'app/layout.tsx'))).toBe(true)
    expect(existsSync(resolve(EXAMPLE, 'index.html'))).toBe(true)
  })

  it('theo.config.ts opts into SSR + production-conditional CSP mode', () => {
    const config = read('theo.config.ts')
    expect(config).toMatch(/ssr:\s*true/)
    // Production-conditional: enforce in prod, off/report-only in dev so Vite's
    // React Refresh inline preamble doesn't break HMR / first hydration.
    expect(config).toMatch(/cspMode:\s*isProduction\s*\?\s*['"]enforce['"]\s*:\s*['"](off|report-only)['"]/)
  })
})
