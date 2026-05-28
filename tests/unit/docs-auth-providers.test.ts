import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T7.2 — docs/concepts/auth-providers.md must exist with the 3 worked
 * examples + a list of TheoKit-provided primitives.
 */

const PATH = resolve(__dirname, '../../docs/concepts/auth-providers.md')
const README = resolve(__dirname, '../../README.md')

describe('T7.2 — docs/concepts/auth-providers.md', () => {
  it('file exists', () => {
    expect(existsSync(PATH)).toBe(true)
  })

  const content = readFileSync(PATH, 'utf8')

  it('contains all three Option headings', () => {
    expect(content).toMatch(/## Option A/)
    expect(content).toMatch(/## Option B/)
    expect(content).toMatch(/## Option C/)
  })

  it('lists the TheoKit-provided primitives', () => {
    expect(content).toContain('createSessionManager')
    expect(content).toContain('generatePkceChallenge')
    expect(content).toContain('generateTotp')
    expect(content).toContain('rotateSession')
  })

  it('README links to the auth-providers docs', () => {
    const readme = readFileSync(README, 'utf8')
    expect(readme).toMatch(/auth-providers\.md/)
  })
})
