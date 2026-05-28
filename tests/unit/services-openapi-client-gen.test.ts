import { describe, it, expect, vi } from 'vitest'

import { generateTypedClient } from '../../packages/theo/src/services/index.js'
import type { ManifestServiceEntry } from '../../packages/theo/src/services/index.js'

const SERVICE: ManifestServiceEntry = {
  name: 'agent',
  runtime: 'python',
  port: 8001,
  proxy: '/api/agent',
  dev: 'uvicorn main:app',
  start: 'uvicorn main:app --workers 4',
  healthcheck: '/health',
  cors: false,
  passSetCookie: false,
}

describe('T5.1 — generateTypedClient', () => {
  it('skips when service has no openapi URL', async () => {
    const result = await generateTypedClient({
      service: SERVICE,
      outputDir: '/tmp/clients',
    })
    expect(result.generated).toBe(false)
    expect(result.skippedReason).toMatch(/no openapi/i)
  })

  it('warns when fetch returns non-2xx', async () => {
    const logs: string[] = []
    const result = await generateTypedClient({
      service: { ...SERVICE, openapi: 'http://localhost:8001/openapi.json' },
      outputDir: '/tmp/clients',
      log: (_l, m) => logs.push(m),
      customFetch: vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch,
    })
    expect(result.generated).toBe(false)
    expect(result.skippedReason).toMatch(/503/)
    expect(logs.some((l) => l.includes('agent'))).toBe(true)
  })

  it('handles fetch throw (network failure)', async () => {
    const result = await generateTypedClient({
      service: { ...SERVICE, openapi: 'http://localhost:8001/openapi.json' },
      outputDir: '/tmp/clients',
      log: () => {},
      customFetch: vi.fn(async () => {
        throw new TypeError('connection refused')
      }) as unknown as typeof fetch,
    })
    expect(result.generated).toBe(false)
    expect(result.skippedReason).toMatch(/fetch failed/)
  })

  it('warns when @hey-api/openapi-ts is not installed (dynamic import fails)', async () => {
    const logs: string[] = []
    const result = await generateTypedClient({
      service: { ...SERVICE, openapi: 'http://localhost:8001/openapi.json' },
      outputDir: '/tmp/clients',
      log: (_l, m) => logs.push(m),
      customFetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ openapi: '3.1.0' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as unknown as typeof fetch,
    })
    // dep not installed → graceful skip
    expect(result.generated).toBe(false)
    expect(result.skippedReason).toMatch(/hey-api not installed/i)
    expect(
      logs.some(
        (l) => l.includes('hey-api') || l.includes('openapi-ts') || l.includes('not installed'),
      ),
    ).toBe(true)
  })

  it('does NOT crash on any failure mode', async () => {
    await expect(
      generateTypedClient({
        service: { ...SERVICE, openapi: 'http://localhost:8001/openapi.json' },
        outputDir: '/tmp/clients',
        customFetch: vi.fn(async () => {
          throw new Error('weird error')
        }) as unknown as typeof fetch,
      }),
    ).resolves.toBeDefined()
  })
})
