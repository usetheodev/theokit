import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import path from 'node:path'
import { safeClose } from './helpers/safe-close.js'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')

describe('Onda 2 — App Router Integration', () => {
  let server: Awaited<ReturnType<typeof startDevServer>>
  let port: number

  beforeAll(async () => {
    server = await startDevServer(path.join(FIXTURES, 'app-router-basic'), { port: 0 })
    const address = server.httpServer!.address()
    port = typeof address === 'object' && address ? address.port : 0
  }, 60000)

  afterAll(async () => {
    await safeClose(server)
  }, 15000)

  it('GET / returns 200', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
  })

  it('GET /dashboard returns 200', async () => {
    const res = await fetch(`http://localhost:${port}/dashboard`)
    expect(res.status).toBe(200)
  })

  it('GET /about returns 200', async () => {
    const res = await fetch(`http://localhost:${port}/about`)
    expect(res.status).toBe(200)
  })

  it('/@theo/route-manifest serves JavaScript', async () => {
    const res = await fetch(`http://localhost:${port}/@theo/route-manifest`)
    expect(res.status).toBe(200)
    const ct = res.headers.get('content-type') ?? ''
    expect(ct).toContain('javascript')
  })
})
