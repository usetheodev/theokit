import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import type { Server } from 'node:http'
import { safeClose } from './helpers/safe-close.js'

const FIXTURE = resolve(__dirname, '../../fixtures/sessions-auth')

function read(rel: string): string {
  return readFileSync(resolve(FIXTURE, rel), 'utf-8')
}

describe('T3.1 — sessions-auth fixture (structure)', () => {
  it('fixture has package.json + theo.config.ts + context.ts', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/context.ts'))).toBe(true)
  })

  it('context.ts wires createSessionManager AND calls assertProductionSecret (EC-2)', () => {
    const src = read('server/context.ts')
    expect(src).toMatch(/createSessionManager/)
    expect(src).toMatch(/assertProductionSecret/)
  })

  it('login route uses Zod validation', () => {
    const src = read('server/routes/login.ts')
    expect(src).toMatch(/from\s+['"]zod['"]/)
    expect(src).toMatch(/z\.object/)
  })

  it('me route uses requireAuth', () => {
    const src = read('server/routes/me.ts')
    expect(src).toMatch(/requireAuth/)
  })

  it('logout route exists and clears cookie', () => {
    const src = read('server/routes/logout.ts')
    expect(src).toMatch(/destroySession|deleteCookie/)
  })

  it('README explains the placeholder-secret gate (EC-2)', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/CHANGE_ME|placeholder|assertProductionSecret/)
  })
})

describe('T3.1 — sessions-auth integration (HTTP)', () => {
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

  it('GET /api/me returns 401 without session', async () => {
    const res = await fetch(`http://localhost:${port}/api/me`)
    expect(res.status).toBe(401)
  })

  it('POST /api/login sets a session cookie', async () => {
    const res = await fetch(`http://localhost:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'demo' }),
    })
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/theo_session=/)
  })

  it('GET /api/me returns 200 with valid session cookie', async () => {
    const login = await fetch(`http://localhost:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'demo' }),
    })
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
    const me = await fetch(`http://localhost:${port}/api/me`, {
      headers: { cookie },
    })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { username: string }
    expect(body.username).toBe('alice')
  })

  it('GET /api/me with tampered cookie returns 401 (not 500)', async () => {
    const res = await fetch(`http://localhost:${port}/api/me`, {
      headers: { cookie: 'theo_session=this-is-not-valid-encryption' },
    })
    expect(res.status).toBe(401)
  })
})
