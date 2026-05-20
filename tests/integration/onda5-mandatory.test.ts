import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import path from 'node:path'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')

describe('Onda 5 — Middleware + Context', () => {
  let server: Awaited<ReturnType<typeof startDevServer>>
  let port: number

  beforeAll(async () => {
    server = await startDevServer(path.join(FIXTURES, 'middleware-context'), { port: 0 })
    const address = server.httpServer!.address()
    port = typeof address === 'object' && address ? address.port : 0
  }, 15000)

  afterAll(async () => {
    await server?.close()
  }, 15000)

  // Teste 1 — Context disponível em route
  it('ctx.requestId exists in route handler', async () => {
    const res = await fetch(`http://localhost:${port}/api/ctx-test`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.requestId).toBeDefined()
    expect(typeof data.requestId).toBe('string')
    expect(data.requestId.length).toBeGreaterThan(0)
  })

  // Teste 2 — Context disponível em action
  it('ctx.requestId exists in action handler', async () => {
    const res = await fetch(`http://localhost:${port}/api/__actions/ctx-test/testAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
      body: JSON.stringify({ value: 'hello' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.requestId).toBeDefined()
    expect(data.value).toBe('hello')
  })

  // Teste 3 — Middleware adds response header
  it('middleware adds X-Custom-Header to response', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-custom-header')).toBe('theo')
  })

  // Teste 4 — Middleware ran before context
  it('middleware ran before context (middlewareRan flag)', async () => {
    const res = await fetch(`http://localhost:${port}/api/ctx-test`)
    const data = await res.json()
    expect(data.middlewareRan).toBe(true)
  })

  // Teste 5 — Execution order: middleware → context → handler
  it('order: middleware → context → handler all executed', async () => {
    const res = await fetch(`http://localhost:${port}/api/order-test`)
    const data = await res.json()
    expect(data.hasRequestId).toBe(true)
    expect(data.middlewareRan).toBe(true)
    expect(data.handlerRan).toBe(true)
  })

  // Extra: backward compat — health route still works
  it('existing routes still work with middleware', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`)
    const data = await res.json()
    expect(data).toEqual({ ok: true })
  })
})
