import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')

describe('Changeset Configuration', () => {
  it('should have .changeset/config.json', () => {
    expect(existsSync(resolve(rootDir, '.changeset/config.json'))).toBe(true)
  })

  it('should have linked packages theo + create-theo', () => {
    const config = JSON.parse(readFileSync(resolve(rootDir, '.changeset/config.json'), 'utf-8'))
    expect(config.linked).toEqual([['theokit', 'create-theokit']])
  })

  it('should have access set to public', () => {
    const config = JSON.parse(readFileSync(resolve(rootDir, '.changeset/config.json'), 'utf-8'))
    expect(config.access).toBe('public')
  })

  it('should have baseBranch set to main', () => {
    const config = JSON.parse(readFileSync(resolve(rootDir, '.changeset/config.json'), 'utf-8'))
    expect(config.baseBranch).toBe('main')
  })

  // 0.2.0 release (2026-05-28): exited alpha series. Gate now pins the
  // stable line — versions must be valid semver, no longer pre-release.
  it('theo version should be valid stable semver (post-alpha exit)', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/theo/package.json'), 'utf-8'))
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/)
    expect(pkg.version).not.toMatch(/-alpha\./)
  })

  it('create-theo version should be valid stable semver (post-alpha exit)', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(rootDir, 'packages/create-theo/package.json'), 'utf-8'),
    )
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/)
    expect(pkg.version).not.toMatch(/-alpha\./)
  })

  it('theo and create-theo versions are linked (stay in sync)', () => {
    const theo = JSON.parse(readFileSync(resolve(rootDir, 'packages/theo/package.json'), 'utf-8'))
    const create = JSON.parse(
      readFileSync(resolve(rootDir, 'packages/create-theo/package.json'), 'utf-8'),
    )
    expect(theo.version).toBe(create.version)
  })

  it('root package.json should have changeset scripts', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'))
    expect(pkg.scripts.changeset).toBeDefined()
    expect(pkg.scripts['version-packages']).toBeDefined()
    expect(pkg.scripts.release).toBeDefined()
  })
})

describe('CHANGELOG.md', () => {
  it('theo CHANGELOG.md should exist', () => {
    expect(existsSync(resolve(rootDir, 'packages/theo/CHANGELOG.md'))).toBe(true)
  })

  it('theo CHANGELOG.md should mention the current package.json version', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/theo/package.json'), 'utf-8'))
    const content = readFileSync(resolve(rootDir, 'packages/theo/CHANGELOG.md'), 'utf-8')
    expect(content).toContain(pkg.version)
  })

  it('create-theo CHANGELOG.md should exist', () => {
    expect(existsSync(resolve(rootDir, 'packages/create-theo/CHANGELOG.md'))).toBe(true)
  })

  it('create-theo CHANGELOG.md should mention the current package.json version', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(rootDir, 'packages/create-theo/package.json'), 'utf-8'),
    )
    const content = readFileSync(resolve(rootDir, 'packages/create-theo/CHANGELOG.md'), 'utf-8')
    expect(content).toContain(pkg.version)
  })
})
