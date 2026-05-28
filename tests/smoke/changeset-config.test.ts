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

  it('theo version should be 0.1.0-alpha.0', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/theo/package.json'), 'utf-8'))
    expect(pkg.version).toMatch(/0\.1\.0-alpha/)
  })

  it('create-theo version should be 0.1.0-alpha.0', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(rootDir, 'packages/create-theo/package.json'), 'utf-8'),
    )
    expect(pkg.version).toMatch(/0\.1\.0-alpha/)
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

  it('theo CHANGELOG.md should have version 0.1.0-alpha.0', () => {
    const content = readFileSync(resolve(rootDir, 'packages/theo/CHANGELOG.md'), 'utf-8')
    expect(content).toContain('0.1.0-alpha.0')
  })

  it('theo CHANGELOG.md should have [Unreleased] section', () => {
    const content = readFileSync(resolve(rootDir, 'packages/theo/CHANGELOG.md'), 'utf-8')
    expect(content).toContain('[Unreleased]')
  })

  it('create-theo CHANGELOG.md should exist', () => {
    expect(existsSync(resolve(rootDir, 'packages/create-theo/CHANGELOG.md'))).toBe(true)
  })

  it('create-theo CHANGELOG.md should have version 0.1.0-alpha.0', () => {
    const content = readFileSync(resolve(rootDir, 'packages/create-theo/CHANGELOG.md'), 'utf-8')
    expect(content).toContain('0.1.0-alpha.0')
  })
})
