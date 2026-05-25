import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(__dirname, '../..')
const VERCEL_EXAMPLE = resolve(REPO, 'examples/deploy-vercel')

// EC-207: ensure node_modules exists before invoking build.
// (CI env may not have pre-installed example deps.)
const ensureInstalled = (): void => {
  if (!existsSync(resolve(VERCEL_EXAMPLE, 'node_modules'))) {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local install precondition for the smoke test
    execSync('pnpm install --filter ./examples/deploy-vercel', {
      cwd: REPO,
      stdio: 'pipe',
    })
  }
}

const runBuild = (target: string): { stdout: string; exitCode: number } => {
  try {
    // eslint-disable-next-line sonarjs/os-command -- developer-local invoking the framework's own CLI via tsx
    const stdout = execSync(
      `npx tsx ${resolve(REPO, 'packages/theo/src/cli/index.ts')} build --target=${target}`,
      { cwd: VERCEL_EXAMPLE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return { stdout, exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: `${e.stdout ?? ''}\n${e.stderr ?? ''}`,
      exitCode: e.status ?? 1,
    }
  }
}

describe('Vercel adapter build structural smoke (T6.1)', { timeout: 180_000 }, () => {
  it('EC-207: example has node_modules OR install succeeds', () => {
    ensureInstalled()
    expect(existsSync(resolve(VERCEL_EXAMPLE, 'node_modules'))).toBe(true)
  })

  it('build --target=vercel emits .theo/ manifest artifacts', () => {
    ensureInstalled()
    // Clean prior build
    rmSync(resolve(VERCEL_EXAMPLE, '.theo'), { recursive: true, force: true })
    runBuild('vercel')
    expect(existsSync(resolve(VERCEL_EXAMPLE, '.theo/crons.json'))).toBe(true)
    expect(existsSync(resolve(VERCEL_EXAMPLE, '.theo/jobs.json'))).toBe(true)
  })

  it('cron + job manifests have schemaVersion=1', () => {
    ensureInstalled()
    const crons = JSON.parse(readFileSync(resolve(VERCEL_EXAMPLE, '.theo/crons.json'), 'utf8')) as {
      schemaVersion: number
    }
    const jobs = JSON.parse(readFileSync(resolve(VERCEL_EXAMPLE, '.theo/jobs.json'), 'utf8')) as {
      schemaVersion: number
    }
    expect(crons.schemaVersion).toBe(1)
    expect(jobs.schemaVersion).toBe(1)
  })

  it('vercel.json preserved/updated post-build (EC-105 invariant)', () => {
    ensureInstalled()
    // Pre-existing vercel.json in example must remain valid JSON post-build
    const vercelJson = JSON.parse(
      readFileSync(resolve(VERCEL_EXAMPLE, 'vercel.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(typeof vercelJson).toBe('object')
    expect(vercelJson).not.toBeNull()
  })

  it('build produces .vercel/output OR .theo (smoke — adapter exists)', () => {
    ensureInstalled()
    // Either build output dir exists — adapter does SOMETHING
    const hasVercelOutput = existsSync(resolve(VERCEL_EXAMPLE, '.vercel'))
    const hasTheoOutput = existsSync(resolve(VERCEL_EXAMPLE, '.theo'))
    expect(hasVercelOutput || hasTheoOutput).toBe(true)
  })
})
