import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { scaffold } from '../../packages/create-theo/src/index.js'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import { validateProjectStructure } from 'theokit'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import path from 'node:path'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')

describe('Onda 1 Mandatory Tests — Scaffold', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `theo-onda1-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tempDir, { recursive: true })
  })

  it('should generate project structure with package.json, app/page.tsx, theo.config.ts', () => {
    const targetDir = join(tempDir, 'my-app')
    scaffold(targetDir, 'my-app')

    expect(existsSync(join(targetDir, 'package.json'))).toBe(true)
    expect(existsSync(join(targetDir, 'app/page.tsx'))).toBe(true)
    expect(existsSync(join(targetDir, 'theo.config.ts'))).toBe(true)
  })

  it('should produce a valid project that passes validateProjectStructure', () => {
    const targetDir = join(tempDir, 'valid-app')
    scaffold(targetDir, 'valid-app')
    expect(() => validateProjectStructure(targetDir)).not.toThrow()
  })
})

describe('Onda 1 Mandatory Tests — Dev Server', () => {
  let server: Awaited<ReturnType<typeof startDevServer>>
  let port: number

  beforeAll(async () => {
    server = await startDevServer(path.join(FIXTURES, 'onda1-hello-theo'), { port: 0 })
    const address = server.httpServer!.address()
    port = typeof address === 'object' && address ? address.port : 0
  }, 15000)

  afterAll(async () => {
    await server?.close()
  }, 15000)

  it('should respond HTTP 200 on /', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
  })

  it('should resolve /@theo/entry-client as JavaScript', async () => {
    const res = await fetch(`http://localhost:${port}/@theo/entry-client`)
    expect(res.status).toBe(200)
    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('javascript')
  })
})
