import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T5.1 — README "Your first agent in 5 minutes" snippet uses the 6-line essence.
 *
 * EC-8: tests scope greps to the tutorial section (between `## Your first agent`
 * heading and the next top-level `## ` heading). Avoids false positive if
 * `result.status` appears later in advanced docs.
 */

const README = readFileSync(resolve(__dirname, '../../README.md'), 'utf-8')

function tutorialSection(readme: string): string {
  const start = readme.indexOf('## Your first agent')
  if (start === -1) throw new Error('Tutorial section not found in README.md')
  const rest = readme.slice(start)
  const nextHeading = rest.slice(2).search(/^## /m)
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 2)
}

const TUTORIAL = tutorialSection(README)

describe('README "Your first agent in 5 minutes"', () => {
  it('tutorial section exists', () => {
    expect(TUTORIAL.length).toBeGreaterThan(100)
    expect(TUTORIAL).toMatch(/Your first agent in 5 minutes/)
  })

  it('snippet uses throwOnError: true (canonical 6-line essence)', () => {
    expect(TUTORIAL).toContain('throwOnError: true')
  })

  it('EC-8: tutorial section does NOT contain the status-check pattern (replaced by try/catch)', () => {
    // The 10-line snippet used `result.status === 'error'`. The 6-line essence
    // replaces it with try/catch + throwOnError. Scoped grep prevents false
    // positives if `result.status` appears in future advanced docs.
    expect(TUTORIAL).not.toContain("result.status === 'error'")
    expect(TUTORIAL).not.toContain('result.status ===')
  })

  it('snippet imports Agent from @usetheo/sdk', () => {
    expect(TUTORIAL).toMatch(/import\s+\{\s*Agent\s*\}\s+from\s+['"]@usetheo\/sdk['"]/)
  })

  it('tutorial section does NOT reference openai (anti-stack scoped)', () => {
    expect(TUTORIAL.toLowerCase()).not.toContain('openai')
  })

  it('snippet uses try/catch idiom', () => {
    expect(TUTORIAL).toMatch(/try\s*\{/)
    expect(TUTORIAL).toMatch(/catch\s*\(/)
  })

  it('tutorial still mentions ANTHROPIC_API_KEY setup step', () => {
    expect(TUTORIAL).toContain('ANTHROPIC_API_KEY')
  })
})
