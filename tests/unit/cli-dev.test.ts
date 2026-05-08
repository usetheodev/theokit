import { describe, it, expect, afterEach } from 'vitest'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import path from 'node:path'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')
let server: Awaited<ReturnType<typeof startDevServer>> | undefined

afterEach(async () => {
  if (server) {
    await server.close()
    server = undefined
  }
}, 15000)

describe('theo dev command', () => {
  it('should start Vite dev server and respond 200 on /', async () => {
    server = await startDevServer(path.join(FIXTURES, 'onda1-hello-theo'), { port: 0 })
    const address = server.httpServer!.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
  }, 15000)

  it('should auto-assign port when port is 0', async () => {
    server = await startDevServer(path.join(FIXTURES, 'onda1-hello-theo'), { port: 0 })
    const address = server.httpServer!.address()
    const port = typeof address === 'object' && address ? address.port : 0
    expect(port).toBeGreaterThan(0)
  }, 15000)

  it('should serve HTML content on /', async () => {
    server = await startDevServer(path.join(FIXTURES, 'onda1-hello-theo'), { port: 0 })
    const address = server.httpServer!.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const res = await fetch(`http://localhost:${port}/`)
    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('text/html')
  }, 15000)

  it('should throw TheoProjectError when app/ directory is missing', async () => {
    await expect(
      startDevServer(path.join(FIXTURES, 'invalid-no-app'), { port: 0 }),
    ).rejects.toThrow('Missing required directory: app/')
  })
})
