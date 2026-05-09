import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { dockerCommand } from '../../packages/theo/src/cli/commands/docker.js'
import { tmpdir } from 'node:os'

function createTempProject(lockfile = 'pnpm-lock.yaml'): string {
  const dir = resolve(tmpdir(), `theo-docker-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{}')
  writeFileSync(join(dir, lockfile), '')
  return dir
}

describe('Docker Adapter', () => {
  it('should generate Dockerfile', async () => {
    const dir = createTempProject()
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      expect(existsSync(join(dir, 'Dockerfile'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should generate .dockerignore', async () => {
    const dir = createTempProject()
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      expect(existsSync(join(dir, '.dockerignore'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should use node:22 in Dockerfile', async () => {
    const dir = createTempProject()
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      const content = readFileSync(join(dir, 'Dockerfile'), 'utf-8')
      expect(content).toContain('node:22')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should detect pnpm from lockfile', async () => {
    const dir = createTempProject('pnpm-lock.yaml')
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      const content = readFileSync(join(dir, 'Dockerfile'), 'utf-8')
      expect(content).toContain('pnpm')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should detect npm from lockfile', async () => {
    const dir = createTempProject('package-lock.json')
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      const content = readFileSync(join(dir, 'Dockerfile'), 'utf-8')
      expect(content).toContain('npm ci')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should contain theo build and theo start', async () => {
    const dir = createTempProject()
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      const content = readFileSync(join(dir, 'Dockerfile'), 'utf-8')
      expect(content).toContain('theo build')
      expect(content).toContain('"theo", "start"')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should skip if Dockerfile exists without --force', async () => {
    const dir = createTempProject()
    writeFileSync(join(dir, 'Dockerfile'), 'existing')
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand()
      // Should NOT overwrite
      expect(readFileSync(join(dir, 'Dockerfile'), 'utf-8')).toBe('existing')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should overwrite with --force', async () => {
    const dir = createTempProject()
    writeFileSync(join(dir, 'Dockerfile'), 'existing')
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      await dockerCommand({ force: true })
      expect(readFileSync(join(dir, 'Dockerfile'), 'utf-8')).toContain('node:22')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
