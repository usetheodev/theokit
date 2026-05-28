import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T4.2 — Docs + CHANGELOG + README addition.
 */

const ROOT = process.cwd()

describe('T4.2 — docs + changelog + README', () => {
  it('docs/concepts/zero-config.md exists', () => {
    expect(existsSync(resolve(ROOT, 'docs/concepts/zero-config.md'))).toBe(true)
  })

  it('docs/concepts/zero-config.md covers all 3 zero-config pillars', () => {
    const src = readFileSync(resolve(ROOT, 'docs/concepts/zero-config.md'), 'utf-8')
    expect(src).toMatch(/`\.env`\s+files\s+load\s+into\s+`process\.env`/i)
    expect(src).toMatch(/Tailwind \+ `@usetheo\/ui` styling auto-configures/i)
    expect(src).toMatch(/State cleanup runs automatically/i)
  })

  it('CHANGELOG.md has the zero-config-polish entry under [Unreleased]', () => {
    const src = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf-8')
    const unreleasedIdx = src.indexOf('## [Unreleased]')
    expect(unreleasedIdx).toBeGreaterThan(0)
    const after = src.slice(unreleasedIdx)
    expect(after).toMatch(/framework-zero-config-polish/)
    expect(after).toMatch(/loadEnv/)
    expect(after).toMatch(/cleanOutDir/)
    expect(after).toMatch(/integrateUseTheoUI|@tailwindcss\/vite/)
  })

  it('zero-config doc avoids banned hyperbole terms', () => {
    const src = readFileSync(resolve(ROOT, 'docs/concepts/zero-config.md'), 'utf-8')
    const banned = ['blazing fast', 'next-generation', 'enterprise-grade', 'battle-tested']
    for (const term of banned) {
      expect(src.toLowerCase()).not.toContain(term.toLowerCase())
    }
  })
})
