import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import type { Server } from 'node:http'
import { safeClose } from './helpers/safe-close.js'

const FIXTURE = resolve(__dirname, '../../fixtures/theoui-autoinject')

describe('T9.1 — theoui-autoinject fixture (structure)', () => {
  it('declares @usetheo/ui in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(FIXTURE, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['@usetheo/ui']).toBeDefined()
  })

  it('config enables ui with noir theme + cdn fonts', () => {
    const src = readFileSync(resolve(FIXTURE, 'theo.config.ts'), 'utf-8')
    expect(src).toMatch(/theme:\s*['"]noir['"]/)
    expect(src).toMatch(/fonts:\s*['"]cdn['"]/)
  })

  it('app/page.tsx does NOT import @usetheo/ui directly', () => {
    const src = readFileSync(resolve(FIXTURE, 'app/page.tsx'), 'utf-8')
    expect(src).not.toMatch(/from\s+['"]@usetheo\/ui['"]/)
  })

  it('has README + index.html', () => {
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'index.html'))).toBe(true)
  })
})

describe('T9.1 — theoui-autoinject fixture (HTTP entry-client)', () => {
  let server: Awaited<ReturnType<typeof startDevServer>>
  let port: number

  beforeAll(async () => {
    server = await startDevServer(FIXTURE, { port: 0 })
    const address = (server.httpServer as Server).address()
    port = typeof address === 'object' && address ? address.port : 0
  }, 60000)

  afterAll(async () => {
    await safeClose(server)
  }, 15000)

  it('entry-client imports styles.css', async () => {
    const res = await fetch(`http://localhost:${port}/@theo/entry-client`)
    const src = await res.text()
    expect(src).toMatch(/styles\.css/)
  })

  it('entry-client imports fonts-cdn.css (fonts: cdn)', async () => {
    const res = await fetch(`http://localhost:${port}/@theo/entry-client`)
    const src = await res.text()
    expect(src).toMatch(/fonts-cdn\.css/)
  })

  it('entry-client wraps in TheoUIProvider with noir theme', async () => {
    const res = await fetch(`http://localhost:${port}/@theo/entry-client`)
    const src = await res.text()
    expect(src).toMatch(/TheoUIProvider/)
    expect(src).toMatch(/['"]noir['"]/)
  })
})
