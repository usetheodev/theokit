import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateCommand } from '../../packages/theo/src/cli/commands/generate.js'

function createTempProject(): string {
  const dir = resolve(tmpdir(), `theo-gen-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, 'app'), { recursive: true })
  mkdirSync(join(dir, 'server/routes'), { recursive: true })
  mkdirSync(join(dir, 'server/actions'), { recursive: true })
  writeFileSync(join(dir, 'theo.config.ts'), 'export default {}')
  writeFileSync(join(dir, 'package.json'), '{}')
  return dir
}

describe('theo generate', () => {
  it('should create route file', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('route', 'users')
      expect(existsSync(join(dir, 'server/routes/users.ts'))).toBe(true)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should create action file', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('action', 'create-user')
      expect(existsSync(join(dir, 'server/actions/create-user.ts'))).toBe(true)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should create page file', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('page', 'dashboard')
      expect(existsSync(join(dir, 'app/dashboard/page.tsx'))).toBe(true)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should create ws file', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('ws', 'chat')
      expect(existsSync(join(dir, 'server/ws/chat.ts'))).toBe(true)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('route should contain defineRoute', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('route', 'health')
      const content = readFileSync(join(dir, 'server/routes/health.ts'), 'utf-8')
      expect(content).toContain('defineRoute')
      expect(content).toContain("import { defineRoute } from 'theokit/server'")
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('action should contain defineAction', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('action', 'update-user')
      const content = readFileSync(join(dir, 'server/actions/update-user.ts'), 'utf-8')
      expect(content).toContain('defineAction')
      expect(content).toContain('updateUser')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('page should contain export default function', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('page', 'settings')
      const content = readFileSync(join(dir, 'app/settings/page.tsx'), 'utf-8')
      expect(content).toContain('export default function')
      expect(content).toContain('SettingsPage')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ws should contain defineWebSocket', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('ws', 'events')
      const content = readFileSync(join(dir, 'server/ws/events.ts'), 'utf-8')
      expect(content).toContain('defineWebSocket')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should reject invalid type', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await expect(generateCommand('model', 'user')).rejects.toThrow('Invalid generator type')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should reject invalid name (uppercase)', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await expect(generateCommand('route', 'MyRoute')).rejects.toThrow('kebab-case')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should skip if file already exists', async () => {
    const dir = createTempProject()
    writeFileSync(join(dir, 'server/routes/existing.ts'), 'original')
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('route', 'existing')
      // Should NOT overwrite
      expect(readFileSync(join(dir, 'server/routes/existing.ts'), 'utf-8')).toBe('original')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should create nested directories for nested paths', async () => {
    const dir = createTempProject()
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await generateCommand('route', 'admin/users')
      expect(existsSync(join(dir, 'server/routes/admin/users.ts'))).toBe(true)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('should reject when not in Theo project (EC-1)', async () => {
    const dir = resolve(tmpdir(), `not-theo-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const orig = process.cwd()
    process.chdir(dir)
    try {
      await expect(generateCommand('route', 'test')).rejects.toThrow('Not a Theo project')
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
