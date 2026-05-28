import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * T5.2 — Prod-mode integration test.
 *
 * Spawns `theokit build` + `theokit start` against examples/full-stack-agent
 * and asserts the SSR + CSP + nonce + Cache-Control wire works end-to-end.
 * Closes Phase 0 (T0.1 + T0.2) with a CI regression test.
 */

const ROOT = resolve(__dirname, '../..')
const EXAMPLE_DIR = resolve(ROOT, 'examples/full-stack-agent')
const CLI = resolve(ROOT, 'packages/theo/src/cli/index.ts')
const PORT = 3511

let serverProc: ChildProcess | null = null

function spawnTsx(args: string[], env: Record<string, string>): Promise<ChildProcess> {
  return new Promise((resolveSpawn, reject) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- test harness; PATH is dev-controlled
    const child = spawn('pnpm', ['exec', 'tsx', CLI, ...args], {
      cwd: EXAMPLE_DIR,
      env: { ...process.env, ...env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.on('error', reject)
    resolveSpawn(child)
  })
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (res.status > 0) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`server at ${url} never responded within ${timeoutMs.toString()}ms`)
}

async function runBuild(): Promise<void> {
  await new Promise<void>((resolveBuild, rejectBuild) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- test harness; PATH is dev-controlled
    const child = spawn('pnpm', ['exec', 'tsx', CLI, 'build'], {
      cwd: EXAMPLE_DIR,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('exit', (code) => {
      if (code === 0) resolveBuild()
      else rejectBuild(new Error(`build failed (exit ${code?.toString() ?? 'null'}): ${stderr}`))
    })
    child.on('error', rejectBuild)
  })
}

describe('examples/full-stack-agent — prod server (T5.2)', () => {
  beforeAll(async () => {
    // Clean any previous build artifacts.
    rmSync(resolve(EXAMPLE_DIR, '.theo'), { recursive: true, force: true })
    await runBuild()
    serverProc = await spawnTsx(['start', '--port', PORT.toString()], {
      // Placeholder so resolveProvider doesn't shortcut before the route
      // exercises createConversationHistory (which is what issues cookies).
      OPENROUTER_API_KEY: 'PLAYWRIGHT_PLACEHOLDER_prod_server',
    })
    await waitForServer(`http://localhost:${PORT.toString()}/`, 30_000)
  }, 90_000)

  afterAll(() => {
    if (serverProc?.pid !== undefined) {
      try {
        process.kill(serverProc.pid, 'SIGTERM')
      } catch {
        // Already gone
      }
    }
  })

  it('SSR emits non-empty <div id="root">', async () => {
    const res = await fetch(`http://localhost:${PORT.toString()}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    // The root div must have at least one element inside (SSR happened).
    expect(html).toMatch(/<div id=["']root["'][^>]*>[\s\S]*?<\w[\s\S]*?<\/div>/)
  })

  it('emits Content-Security-Policy header with nonce-X', async () => {
    const res = await fetch(`http://localhost:${PORT.toString()}/`)
    const csp = res.headers.get('content-security-policy')
    expect(csp).toBeDefined()
    expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/i)
  })

  it('Cache-Control: private, no-store is set (EC-3)', async () => {
    const res = await fetch(`http://localhost:${PORT.toString()}/`)
    const cache = res.headers.get('cache-control')
    expect(cache).toBeDefined()
    expect(cache).toMatch(/private/i)
    expect(cache).toMatch(/no-store/i)
  })

  it('SSR <script nonce="X"> matches CSP nonce-X (T4.1 wire)', async () => {
    const res = await fetch(`http://localhost:${PORT.toString()}/`)
    const csp = res.headers.get('content-security-policy')!
    const cspMatch = /'nonce-([^']+)'/.exec(csp)
    expect(cspMatch).not.toBeNull()
    const cspNonce = cspMatch![1]!

    const html = await res.text()
    const scriptMatch = /<script\b[^>]*\bnonce="([^"]+)"/i.exec(html)
    expect(scriptMatch).not.toBeNull()
    const scriptNonce = scriptMatch![1]!

    expect(scriptNonce).toBe(cspNonce)
  })
})
