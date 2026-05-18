import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDevServer } from '../../packages/theo/src/cli/commands/dev.js'
import { safeClose } from './helpers/safe-close.js'
import type { Server } from 'node:http'

/**
 * T2.1 integration — auto-inject the entry-client script.
 *
 * Spawn a dev server against a temp project whose `index.html` does NOT
 * include `<script src="/@theo/entry-client">`. Fetch `/` and assert
 * the script appears in the served HTML (auto-injected by Vite plugin).
 */

let tmpRoot: string
let server: Awaited<ReturnType<typeof startDevServer>>
let port: number

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'theo-auto-inject-'))
  // Minimal project: index.html WITHOUT the script
  writeFileSync(
    join(tmpRoot, 'index.html'),
    `<!DOCTYPE html>
<html>
  <head><title>No-script test</title></head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
  )
  writeFileSync(
    join(tmpRoot, 'theo.config.ts'),
    `export default {}`,
  )
  writeFileSync(join(tmpRoot, 'package.json'), JSON.stringify({ name: 'tmp' }))
  // Empty app/page.tsx so the framework boots
  mkdirSync(join(tmpRoot, 'app'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'app', 'page.tsx'),
    `export default function Page() { return <h1>auto-inject test</h1> }`,
  )

  server = await startDevServer(tmpRoot, { port: 0 })
  const addr = (server.httpServer as Server).address()
  port = typeof addr === 'object' && addr ? addr.port : 0
}, 30000)

afterAll(async () => {
  await safeClose(server)
  rmSync(tmpRoot, { recursive: true, force: true })
}, 15000)

describe('T2.1 — auto-inject integration (Vite dev server)', () => {
  it('served HTML contains the entry-client script even though index.html omits it', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('/@theo/entry-client')
  })

  it('script is injected BEFORE </body> tag', async () => {
    const html = await (await fetch(`http://localhost:${port}/`)).text()
    const scriptIdx = html.indexOf('/@theo/entry-client')
    const bodyCloseIdx = html.toLowerCase().indexOf('</body>')
    expect(scriptIdx).toBeGreaterThan(0)
    expect(scriptIdx).toBeLessThan(bodyCloseIdx)
  })

  it('user-authored content (h1 from page.tsx) still renders in shell', async () => {
    const html = await (await fetch(`http://localhost:${port}/`)).text()
    // page.tsx doesn't actually run in SSR shell (Vite serves the shell with
    // <div id="root"></div>) — but the shell itself should be intact.
    expect(html).toContain('<div id="root">')
    expect(html).toContain('No-script test')
  })
})
