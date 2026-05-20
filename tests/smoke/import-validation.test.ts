import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const theoDistDir = resolve(__dirname, '../../packages/theo/dist')
const createTheoDistDir = resolve(__dirname, '../../packages/create-theo/dist')

describe('Smoke: Package Build Outputs', () => {
  beforeAll(() => {
    // Ensure build has been run
    if (!existsSync(resolve(theoDistDir, 'index.js'))) {
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local smoke test
      execSync('pnpm build', { cwd: resolve(__dirname, '../..'), stdio: 'pipe' })
    }
  })

  describe('theo package dist/', () => {
    it('should have dist/index.js', () => {
      expect(existsSync(resolve(theoDistDir, 'index.js'))).toBe(true)
    })

    it('should have dist/index.d.ts', () => {
      expect(existsSync(resolve(theoDistDir, 'index.d.ts'))).toBe(true)
    })

    it('should have dist/server/index.js', () => {
      expect(existsSync(resolve(theoDistDir, 'server/index.js'))).toBe(true)
    })

    it('should have dist/server/index.d.ts', () => {
      expect(existsSync(resolve(theoDistDir, 'server/index.d.ts'))).toBe(true)
    })

    it('should have dist/vite-plugin/index.js', () => {
      expect(existsSync(resolve(theoDistDir, 'vite-plugin/index.js'))).toBe(true)
    })

    it('should have dist/vite-plugin/index.d.ts', () => {
      expect(existsSync(resolve(theoDistDir, 'vite-plugin/index.d.ts'))).toBe(true)
    })

    it('should have dist/cli/index.js', () => {
      expect(existsSync(resolve(theoDistDir, 'cli/index.js'))).toBe(true)
    })

    it('should have shebang in CLI', () => {
      const content = readFileSync(resolve(theoDistDir, 'cli/index.js'), 'utf-8')
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true)
    })

    it('should have exactly one shebang in CLI (no duplicate)', () => {
      const content = readFileSync(resolve(theoDistDir, 'cli/index.js'), 'utf-8')
      const shebangs = content.match(/^#!\/usr\/bin\/env node$/gm)
      expect(shebangs).toHaveLength(1)
    })
  })

  describe('create-theo package dist/', () => {
    it('should have dist/cli.js', () => {
      expect(existsSync(resolve(createTheoDistDir, 'cli.js'))).toBe(true)
    })

    it('should have shebang in CLI', () => {
      const content = readFileSync(resolve(createTheoDistDir, 'cli.js'), 'utf-8')
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true)
    })

    it('should have templates accessible from dist/', () => {
      // Templates should be at packages/create-theo/templates/ (sibling to dist/)
      const templatesDir = resolve(createTheoDistDir, '..', 'templates')
      expect(existsSync(resolve(templatesDir, 'default'))).toBe(true)
      expect(existsSync(resolve(templatesDir, 'dashboard'))).toBe(true)
      expect(existsSync(resolve(templatesDir, 'api-only'))).toBe(true)
    })
  })
})

describe('Smoke: Import Validation from dist/', () => {
  it('should import defineConfig from theo dist', async () => {
    const mod = await import('../../packages/theo/dist/index.js')
    expect(typeof mod.defineConfig).toBe('function')
  })

  it('should import loadConfig from theo dist', async () => {
    const mod = await import('../../packages/theo/dist/index.js')
    expect(typeof mod.loadConfig).toBe('function')
  })

  it('should import theoPlugin from theo dist', async () => {
    const mod = await import('../../packages/theo/dist/index.js')
    expect(typeof mod.theoPlugin).toBe('function')
  })

  it('should import validateProjectStructure from theo dist', async () => {
    const mod = await import('../../packages/theo/dist/index.js')
    expect(typeof mod.validateProjectStructure).toBe('function')
  })

  it('should import defineRoute from theo/server dist', async () => {
    const mod = await import('../../packages/theo/dist/server/index.js')
    expect(typeof mod.defineRoute).toBe('function')
  })

  it('should import defineAction from theo/server dist', async () => {
    const mod = await import('../../packages/theo/dist/server/index.js')
    expect(typeof mod.defineAction).toBe('function')
  })

  it('should import defineMiddleware from theo/server dist', async () => {
    const mod = await import('../../packages/theo/dist/server/index.js')
    expect(typeof mod.defineMiddleware).toBe('function')
  })

  it('should import cookie helpers from theo/server dist', async () => {
    const mod = await import('../../packages/theo/dist/server/index.js')
    expect(typeof mod.getCookie).toBe('function')
    expect(typeof mod.setCookie).toBe('function')
    expect(typeof mod.deleteCookie).toBe('function')
  })

  it('should import theoPlugin from theo/vite-plugin dist', async () => {
    const mod = await import('../../packages/theo/dist/vite-plugin/index.js')
    expect(typeof mod.theoPlugin).toBe('function')
  })

  it('should import theoFetch from theo/client dist', async () => {
    const mod = await import('../../packages/theo/dist/client/index.js')
    expect(typeof mod.theoFetch).toBe('function')
  })

  it('should import TheoFetchError from theo/client dist', async () => {
    const mod = await import('../../packages/theo/dist/client/index.js')
    expect(typeof mod.TheoFetchError).toBe('function')
  })

  it('should run CLI --help without error', () => {
    // eslint-disable-next-line sonarjs/os-command -- launches local CLI bin; smoke test only
    const output = execSync(`node ${resolve(theoDistDir, 'cli/index.js')} --help`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(output).toContain('theo')
  })
})

describe('Smoke: Package.json Validation', () => {
  it('theo exports should point to dist/', () => {
    const pkg = JSON.parse(readFileSync(resolve(theoDistDir, '../package.json'), 'utf-8'))
    expect(pkg.exports['.'].import).toBe('./dist/index.js')
    expect(pkg.exports['.'].types).toBe('./dist/index.d.ts')
    expect(pkg.exports['./server'].import).toBe('./dist/server/index.js')
    expect(pkg.exports['./vite-plugin'].import).toBe('./dist/vite-plugin/index.js')
    expect(pkg.exports['./client'].import).toBe('./dist/client/index.js')
    expect(pkg.exports['./client'].types).toBe('./dist/client/index.d.ts')
  })

  it('theo bin should point to dist/', () => {
    const pkg = JSON.parse(readFileSync(resolve(theoDistDir, '../package.json'), 'utf-8'))
    expect(pkg.bin.theokit).toBe('./dist/cli/index.js')
  })

  it('theo files should include only dist', () => {
    const pkg = JSON.parse(readFileSync(resolve(theoDistDir, '../package.json'), 'utf-8'))
    expect(pkg.files).toContain('dist')
    expect(pkg.files).not.toContain('src')
  })

  it('create-theo bin should point to dist/', () => {
    const pkg = JSON.parse(readFileSync(resolve(createTheoDistDir, '../package.json'), 'utf-8'))
    expect(pkg.bin['create-theokit']).toBe('./dist/cli.js')
  })

  it('create-theo files should include dist and templates', () => {
    const pkg = JSON.parse(readFileSync(resolve(createTheoDistDir, '../package.json'), 'utf-8'))
    expect(pkg.files).toContain('dist')
    expect(pkg.files).toContain('templates')
  })
})

describe('Smoke: publint Validation', () => {
  beforeAll(() => {
    // Ensure build has been run (publint needs dist/)
    if (!existsSync(resolve(theoDistDir, 'index.js'))) {
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local smoke test
      execSync('pnpm build', { cwd: resolve(__dirname, '../..'), stdio: 'pipe' })
    }
  })

  // publint spawns `pnpm pack` under the hood — flakes at the default 5s under parallel load.
  it('theo should pass publint', () => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local smoke test
    const result = execSync('npx publint packages/theo', {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(result).toContain('All good')
  }, 30_000)

  it('create-theo should pass publint', () => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local smoke test
    const result = execSync('npx publint packages/create-theo', {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(result).toContain('All good')
  }, 30_000)
})
