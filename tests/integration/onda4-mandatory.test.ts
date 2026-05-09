import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import path from 'node:path'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')

describe('Onda 4 — Server Actions', () => {
  let server: Awaited<ReturnType<typeof startDevServer>>
  let port: number
  let baseUrl: string

  beforeAll(async () => {
    server = await startDevServer(
      path.join(FIXTURES, 'server-actions-basic'),
      { port: 0 },
    )
    const address = server.httpServer!.address()
    port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://localhost:${port}/api/__actions/create-user/createUser`
  }, 15000)

  afterAll(async () => {
    await server?.close()
  }, 15000)

  // Teste 1 — Action com input válido
  it('POST with valid input returns 200 with handler result', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
      body: JSON.stringify({ name: 'Paulo', email: 'paulo@example.com' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ id: '1', name: 'Paulo', email: 'paulo@example.com' })
  })

  // Teste 2 — Input inválido
  it('POST with invalid input returns 400 VALIDATION_ERROR', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
      body: JSON.stringify({ name: '', email: 'bad' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('VALIDATION_ERROR')
    expect(data.error.issues.length).toBeGreaterThan(0)
  })

  // Teste 3 — CSRF: sem X-Theo-Action header → 403
  it('POST without X-Theo-Action header returns 403', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Paulo', email: 'paulo@example.com' }),
    })
    expect(res.status).toBe(403)
  })

  // Teste 4 — Action inexistente → 404
  it('POST to nonexistent action returns 404', async () => {
    const res = await fetch(`http://localhost:${port}/api/__actions/nonexistent/foo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(404)
  })

  // Teste 5 — GET → 405
  it('GET on action endpoint returns 405', async () => {
    const res = await fetch(baseUrl, {
      headers: { 'X-Theo-Action': '1' },
    })
    expect(res.status).toBe(405)
  })

  // Extra: URL malformada (sem exportName)
  it('POST with malformed URL returns 400', async () => {
    const res = await fetch(`http://localhost:${port}/api/__actions/create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})
