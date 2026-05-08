import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import path from 'node:path'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')

describe('Onda 3 — Backend Routes', () => {
  let server: Awaited<ReturnType<typeof startDevServer>>
  let port: number

  beforeAll(async () => {
    server = await startDevServer(
      path.join(FIXTURES, 'server-routes-basic'),
      { port: 0 },
    )
    const address = server.httpServer!.address()
    port = typeof address === 'object' && address ? address.port : 0
  }, 15000)

  afterAll(async () => {
    await server?.close()
  }, 15000)

  // Teste 1 — GET simples
  it('GET /api/health returns { ok: true } with 200', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const data = await res.json()
    expect(data).toEqual({ ok: true })
  })

  // Teste 2 — POST com body válido
  it('POST /api/users with valid body returns 201', async () => {
    const res = await fetch(`http://localhost:${port}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Paulo', email: 'paulo@example.com' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('Paulo')
    expect(data.email).toBe('paulo@example.com')
  })

  // Teste 3 — POST com body inválido
  it('POST /api/users with invalid body returns 400 structured error', async () => {
    const res = await fetch(`http://localhost:${port}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Paulo', email: 'not-an-email' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('VALIDATION_ERROR')
    expect(data.error.issues).toBeDefined()
    expect(data.error.issues.length).toBeGreaterThan(0)
  })

  // Teste 4 — Params
  it('GET /api/users/123 returns params.id === "123"', async () => {
    const res = await fetch(`http://localhost:${port}/api/users/123`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('123')
  })

  // Teste 5 — Query
  it('GET /api/users?search=paulo returns query.search === "paulo"', async () => {
    const res = await fetch(`http://localhost:${port}/api/users?search=paulo`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.search).toBe('paulo')
  })

  // Extra: 404 for unmatched API
  it('GET /api/nonexistent returns 404', async () => {
    const res = await fetch(`http://localhost:${port}/api/nonexistent`)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error.code).toBe('NOT_FOUND')
  })

  // Extra: 405 for unsupported method
  it('DELETE /api/health returns 405', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`, { method: 'DELETE' })
    expect(res.status).toBe(405)
    const data = await res.json()
    expect(data.error.code).toBe('METHOD_NOT_ALLOWED')
  })
})
