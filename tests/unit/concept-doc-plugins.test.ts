import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOC_PATH = resolve(__dirname, '../../docs/concepts/plugins.md')

describe('T2.2 — docs/concepts/plugins.md', () => {
  it('exists with all 7 required sections (happy path)', () => {
    expect(existsSync(DOC_PATH)).toBe(true)
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('# Plugins')
    expect(content).toContain('## 1. What & Why')
    expect(content).toContain('## 2. API Surface')
    expect(content).toContain('## 3. Current state')
    expect(content).toContain('## 4. Lifecycle')
    expect(content).toContain('## 5. Cookbook')
    expect(content).toContain('## 6. Limitations & non-goals')
    expect(content).toContain('## 7. Want to ship a plugin?')
  })

  it('cites ADR-0008 (validation error: missing crosslink)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('ADR-0008')
  })

  it('reflects 1 shipping plugin + 2 committed (post-T5.1 update)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/1 shipping plugin|@theokit\/plugin-cors@/)
    expect(content).toMatch(/sentry/)
    expect(content).toMatch(/i18n/)
  })

  it('cross-links ADR-0011 (moderate roadmap)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/ADR-0011|0011-moderate-plugin-roadmap/)
  })

  it('points to theokit-plugins monorepo for first-party plugins', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('theokit-plugins')
    expect(content).toMatch(/first-party/i)
  })

  it('documents naming convention (@theokit/plugin-* vs community)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toContain('@theokit/plugin-')
    expect(content).toContain('theokit-plugin-')
  })

  it('shows real consumer example (theo.config.ts > plugins: [cors(...)])', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/cors\(\s*\{/)
    expect(content).toContain('defineConfig')
  })

  it('documents non-goals to clarify scope (error scenario)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    expect(content).toMatch(/non-goals/i)
    expect(content).toMatch(/does NOT|do NOT|don't/i)
  })

  it('provides at least 3 cookbook recipes (happy path)', () => {
    const content = readFileSync(DOC_PATH, 'utf8')
    const matches = content.match(/### 5\.\d+/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })
})
