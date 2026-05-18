import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FIXTURES_ROOT = resolve(__dirname, '../../fixtures')
const README_PATH = join(FIXTURES_ROOT, 'README.md')

function readReadme(): string {
  if (!existsSync(README_PATH)) {
    throw new Error(`Missing fixtures/README.md — required by T0.1`)
  }
  return readFileSync(README_PATH, 'utf-8')
}

function listFixtureDirs(): string[] {
  return readdirSync(FIXTURES_ROOT)
    .filter((name) => {
      const full = join(FIXTURES_ROOT, name)
      return statSync(full).isDirectory()
    })
    .sort()
}

describe('T0.1 — fixtures index README', () => {
  it('exists at tests/fixtures/README.md', () => {
    expect(existsSync(README_PATH)).toBe(true)
  })

  it('lists every subdirectory as a table row', () => {
    const readme = readReadme()
    const dirs = listFixtureDirs()
    for (const dir of dirs) {
      // Row uses `<name>` exactly (no aliases, no link-mangling).
      expect(readme).toMatch(new RegExp(`\\|\\s*${dir}\\s*\\|`, 'i'))
    }
  })

  it('has no orphan rows — every row corresponds to an actual subdirectory', () => {
    const readme = readReadme()
    const dirs = new Set(listFixtureDirs())
    // Find all table rows under the "Index" table header
    const rows = readme.match(/^\|\s*[a-z][a-z0-9-]+\s*\|/gm) ?? []
    const namesInTable = rows
      .map((r) => r.replace(/^\|\s*|\s*\|$/g, '').trim())
      .filter((n) => !['Fixture', 'fixture', '---'].some((skip) => n.toLowerCase() === skip.toLowerCase()))
    for (const name of namesInTable) {
      expect(dirs.has(name), `Index row "${name}" has no matching fixture directory`).toBe(true)
    }
  })

  it('has a header table with Fixture / Demonstrates / Phase columns', () => {
    const readme = readReadme()
    expect(readme).toMatch(/\|\s*Fixture\s*\|\s*Demonstrates\s*\|\s*Phase\s*\|/i)
  })

  it('documents the integration test command (EC-1: not `pnpm theokit dev`)', () => {
    const readme = readReadme()
    expect(readme).toMatch(/npx vitest run tests\/integration\/fixture-/)
  })

  it('points to npm create theokit for standalone use (EC-1)', () => {
    const readme = readReadme()
    expect(readme).toMatch(/npm create theokit|create-theokit/i)
  })

  it('clarifies fixtures are not standalone runnable (EC-1)', () => {
    const readme = readReadme()
    // The README must somewhere state that fixtures don't have their own node_modules
    // or that they're consumed by integration tests
    expect(readme).toMatch(/test fixtures|consumed by integration tests|not standalone/i)
  })
})
