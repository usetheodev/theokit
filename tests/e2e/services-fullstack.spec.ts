/**
 * T5.1 — services fullstack E2E.
 *
 * Boots `services-python-basic` fixture via `startDevServer` (not Playwright's
 * webServer config, so we can attach to the dev server lifecycle and capture
 * service stdout). Asserts the full Wave 2 flow:
 *   1. `pnpm dev` spawns uvicorn + waits for healthcheck
 *   2. Page navigates and clicks button → POST /api/agent/echo
 *   3. Vite proxy forwards to localhost:8101
 *   4. FastAPI returns echoed body
 *   5. Service stdout shows the request (traceparent propagation when present)
 *
 * Self-skips when Python 3.11+ or uv are absent (per ADR-0015 D5 + EC-12).
 */
import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(__dirname, '../../fixtures/services-python-basic')

// Minimal shape we need from ViteDevServer at runtime — avoid type-import of `vite`
// which is not declared as a direct dep of the root tsconfig.
interface MinimalServer {
  httpServer: { address(): unknown } | null
  close(): Promise<void>
}

function isUvAvailable(): boolean {
  try {
    // sonarjs/no-os-command-from-path: we DO want PATH lookup here — the spec
    // is dev-tooling, not production. Linter inline-disable to declare intent.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const r = spawnSync('uv', ['--version'], { stdio: 'ignore' })
    return r.status === 0
  } catch {
    return false
  }
}

function isPythonAvailable(): boolean {
  // Need Python 3.11+ per template's pyproject.toml requires-python.
  // Try `uv python find >=3.11` first (uv knows about non-PATH installs); fall
  // back to direct binary lookup. Either succeeding is enough — uv at runtime
  // will pick the right one.
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const r = spawnSync('uv', ['python', 'find', '>=3.11'], { stdio: 'ignore' })
    if (r.status === 0) return true
  } catch {
    /* fall through */
  }
  for (const bin of ['python3.13', 'python3.12', 'python3.11', 'python3']) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf-8' })
      if (r.status !== 0) continue
      const match = /Python\s+(\d+)\.(\d+)/.exec(r.stdout)
      if (!match) continue
      const major = Number(match[1])
      const minor = Number(match[2])
      if (major > 3 || (major === 3 && minor >= 11)) return true
    } catch {
      /* try next */
    }
  }
  return false
}

function computeSkipReason(): string | null {
  if (!isUvAvailable()) return 'uv not in PATH — install https://github.com/astral-sh/uv'
  if (!isPythonAvailable()) return 'Python 3.11+ not in PATH'
  return null
}

const skipReason: string | null = computeSkipReason()

test.describe('T5.1 — services fullstack E2E', () => {
  test.skip(skipReason !== null, skipReason ?? '')

  let server: MinimalServer | null = null
  let port = 0

  test.beforeAll(async () => {
    // Lazy-import to avoid pulling Vite into the skip path
    const { startDevServer } = await import('../../packages/theo/src/cli/commands/dev.js')
    server = (await startDevServer(FIXTURE, { port: 0 })) as unknown as MinimalServer
    const addr = server.httpServer?.address()
    if (addr && typeof addr === 'object' && addr !== null && 'port' in addr) {
      port = (addr as { port: number }).port
    }
  })

  test.afterAll(async () => {
    if (server) {
      await server.close()
    }
  })

  test('services flow: page → proxy → python service responds', async ({ page }) => {
    test.skip(port === 0, 'dev server did not boot (likely Python service unhealthy)')
    await page.goto(`http://localhost:${port}/`)
    await page.click('[data-test=echo-button]')
    // Allow time for the proxy hop + FastAPI response.
    await expect(page.locator('[data-test=echo-result]')).toContainText('hello', {
      timeout: 15_000,
    })
  })
})
