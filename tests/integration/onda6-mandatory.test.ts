import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { scanServerRoutes } from '../../packages/theo/src/server/scan.js'
import { matchRoute } from '../../packages/theo/src/server/match.js'
import { executeRoute, sendError } from '../../packages/theo/src/server/execute.js'
import { createProductionLoader } from '../../packages/theo/src/server/module-loader.js'
import { serveStaticFile } from '../../packages/theo/src/server/static.js'

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures')
const fixtureDir = path.join(FIXTURES, 'production-build')
const distDir = resolve(fixtureDir, '.theo')
const clientDir = resolve(distDir, 'client')
const serverDir = resolve(fixtureDir, 'server')

let server: Server
let port: number

beforeAll(async () => {
  // Build using CLI
  // eslint-disable-next-line sonarjs/os-command -- developer-local integration test running the framework's own CLI via npx tsx
  execSync(
    `npx tsx ${resolve(import.meta.dirname, '../../packages/theo/src/cli/index.ts')} build`,
    { cwd: fixtureDir, stdio: 'pipe' },
  )

  // Start production server
  const indexHtml = readFileSync(join(clientDir, 'index.html'), 'utf-8')
  const loadModule = createProductionLoader()

  server = createServer(async (req, res) => {
    const url = req.url ?? '/'
    try {
      if (url.startsWith('/api/')) {
        const routes = scanServerRoutes(serverDir)
        const match = matchRoute(url, routes)
        if (!match) {
          sendError(res, 'NOT_FOUND', 'Not found', 404)
          return
        }
        const method = (req.method ?? 'GET').toUpperCase()
        await executeRoute(match.route, method, match.params, req, res, loadModule, serverDir)
        return
      }
      if (serveStaticFile(req, res, clientDir)) return
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(indexHtml)
    } catch (err) {
      sendError(res, 'INTERNAL_ERROR', (err as Error).message, 500)
    }
  })

  await new Promise<void>((r) => {
    server.listen(0, () => {
      const addr = server.address()
      port = typeof addr === 'object' && addr ? addr.port : 0
      r()
    })
  })
}, 60000)

afterAll(async () => {
  server?.close()
  if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true })
}, 15000)

describe('Onda 6 — Build + Production', () => {
  it('build generates .theo/client/index.html', () => {
    expect(existsSync(join(clientDir, 'index.html'))).toBe(true)
  })

  it('GET / returns 200 with HTML', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('GET /dashboard returns 200 via SPA fallback', async () => {
    const res = await fetch(`http://localhost:${port}/dashboard`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('GET /logo.png returns 200 with image', async () => {
    const res = await fetch(`http://localhost:${port}/logo.png`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
  })

  it('GET /api/health returns JSON in production', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ ok: true })
  })
})
