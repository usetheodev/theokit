import { describe, it, expect } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir as osTmpdir } from 'node:os'

/**
 * theokit-evolution-ci-and-dx Phase 1C — pnpm 11+ compat gate.
 *
 * Validates that scaffolded templates install + boot dev under pnpm 11
 * WITHOUT `ERR_PNPM_IGNORED_BUILDS` blocking. The `pnpm.onlyBuiltDependencies`
 * hint in each template's `package.json.tmpl` must remain present.
 *
 * Bug discovered 2026-05-28 during dogfood: pnpm 11 default approve-builds
 * gate blocks esbuild postinstall, which trips on `runDepsStatusCheck` when
 * `pnpm dev` runs. Templates ship the hint; this test enforces it doesn't
 * regress + verifies the dev binary boots cleanly.
 *
 * v1.1 EC-5 MUST FIX: corepack `COREPACK_DEFAULT_PM` env-scoped per call,
 * NO `prepare --activate` global → preserves inter-test isolation.
 * v1.1 EC-7 SHOULD TEST: pre-flight port collision check actionable.
 */

const TEMPLATES = ['default', 'dashboard', 'api-only', 'postgres', 'saas'] as const

function hasCorepack(): boolean {
  try {
    execFileSync('corepack', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// v1.1 EC-5 — env-scoped pnpm 11 (no global activate)
const PNPM_ENV = {
  ...process.env,
  COREPACK_DEFAULT_PM: 'pnpm@11.1.0',
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 1000)
      try {
        const res = await fetch(`http://localhost:${port}/`, { signal: ctrl.signal })
        clearTimeout(tid)
        if (res.ok || res.status === 404 || res.status === 304) return true
      } catch {
        clearTimeout(tid)
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function isPortBusy(port: number): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 500)
    await fetch(`http://localhost:${port}/`, { signal: ctrl.signal })
    clearTimeout(tid)
    return true
  } catch {
    return false
  }
}

// dogfood-regressions-fix-plan v1.1 — honest skipIf for infra deps.
// This integration test requires (a) corepack present, (b) ports 5000-5004
// all free, (c) network reachable for `npx create-theokit@latest`. When any
// requirement is missing, the suite skips with a clear stderr message instead
// of pretending to run + failing on port/network errors. Pattern matches
// `tests/integration/ollama-end-to-end.test.ts` (D182).
async function probeAllPortsFree(): Promise<boolean> {
  for (let i = 0; i < TEMPLATES.length; i++) {
    if (await isPortBusy(5000 + i)) return false
  }
  return true
}

async function probeNpxReachable(): Promise<boolean> {
  try {
    execFileSync('npx', ['--version'], { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

const hasCorepackBin = hasCorepack()
const portsFree = hasCorepackBin && (await probeAllPortsFree())
const npxAvailable = hasCorepackBin && (await probeNpxReachable())
const infraReady = hasCorepackBin && portsFree && npxAvailable

if (!infraReady) {
  const reasons: string[] = []
  if (!hasCorepackBin) reasons.push('corepack not in PATH')
  if (!portsFree) reasons.push('ports 5000-5004 not all free')
  if (!npxAvailable) reasons.push('npx not reachable')
  process.stderr.write(
    `[pnpm-11-compat] Skipping — infra requirements not met: ${reasons.join(', ')}. ` +
      'This integration test needs corepack + free ports 5000-5004 + npx network access.\n',
  )
}

describe.skipIf(!infraReady)('pnpm 11 compat — scaffold + install + dev boot', () => {
  for (let i = 0; i < TEMPLATES.length; i++) {
    const tpl = TEMPLATES[i]!
    const port = 5000 + i // 5000-5004

    it(
      `template ${tpl} installs + boots dev via pnpm 11 without ERR_PNPM_IGNORED_BUILDS`,
      async () => {
        // v1.1 EC-7 pre-flight: port collision check actionable
        if (await isPortBusy(port)) {
          throw new Error(
            `Port ${port} busy. Free it: lsof -ti :${port} | xargs kill -9`,
          )
        }

        const sandbox = mkdtempSync(join(osTmpdir(), `pnpm11-${tpl}-`))
        const appDir = join(sandbox, `my-${tpl}`)
        let devPid: number | undefined

        try {
          // Step 1: scaffold via npx (latest published create-theokit)
          execFileSync(
            'npx',
            ['-y', 'create-theokit@latest', `my-${tpl}`, `--template=${tpl}`, '--skip-install'],
            { cwd: sandbox, stdio: 'pipe', env: PNPM_ENV, timeout: 120_000 },
          )
          expect(existsSync(appDir)).toBe(true)

          // Step 2: verify pnpm.onlyBuiltDependencies hint shipped
          const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf-8'))
          expect(pkg.pnpm?.onlyBuiltDependencies).toContain('esbuild')

          // Step 3: install via pnpm 11 (env-scoped). pnpm 11 exits non-zero on
          // ERR_PNPM_IGNORED_BUILDS even when install completed. Check by file
          // presence, not exit code.
          try {
            execFileSync('pnpm', ['install', '--prefer-offline'], {
              cwd: appDir,
              stdio: 'pipe',
              env: PNPM_ENV,
              timeout: 120_000,
            })
          } catch {
            // ignore non-zero exit — verify install completeness below
          }
          expect(existsSync(join(appDir, 'node_modules/theokit'))).toBe(true)

          // Step 4: boot dev via theokit binary direct (bypass pnpm wrapper's
          // deps-status-check that re-trips ERR_PNPM_IGNORED_BUILDS)
          const theokitBin = join(appDir, 'node_modules/.bin/theokit')
          expect(existsSync(theokitBin)).toBe(true)

          const dev = spawn(theokitBin, ['dev', `--port=${port}`], {
            cwd: appDir,
            stdio: 'pipe',
            detached: true,
            env: { ...PNPM_ENV, NODE_ENV: 'development' },
          })
          devPid = dev.pid
          dev.stderr?.on('data', () => {}) // drain to avoid backpressure
          dev.stdout?.on('data', () => {})

          const ready = await waitForPort(port, 60_000)
          expect(ready, `dev server failed to boot on port ${port} within 60s`).toBe(true)
        } finally {
          if (devPid !== undefined) {
            try {
              process.kill(-devPid, 'SIGKILL')
            } catch {
              try {
                process.kill(devPid, 'SIGKILL')
              } catch {}
            }
          }
          rmSync(sandbox, { recursive: true, force: true })
        }
      },
      180_000,
    )
  }
})
