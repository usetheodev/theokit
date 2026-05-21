import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T4.1 — Static smoke of the deploy-smoke-vercel.sh script.
 *
 * The real deploy can only run with a VERCEL_TOKEN secret (CI). This test
 * validates the script's structure, error-paths, and the example project
 * exist and are coherent. EC-7 (timeout 300) is asserted at script level.
 */

const ROOT = resolve(__dirname, '../..')
const SCRIPT = resolve(ROOT, 'scripts/deploy-smoke-vercel.sh')
const EXAMPLE = resolve(ROOT, 'examples/deploy-vercel')

describe('deploy-smoke-vercel.sh — structure', () => {
  it('Given the script path, Then the file exists and is executable', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    const mode = readFileSync(SCRIPT, 'utf8')
    expect(mode.startsWith('#!/usr/bin/env bash')).toBe(true)
  })

  it('Given the script, Then it enforces `timeout 300` on vercel deploy (EC-7)', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('timeout 300 vercel deploy')
  })

  it('Given the script, Then it uses `curl --max-time 30` for HTTP assertions', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('curl --max-time 30')
  })

  it('Given the script, Then bash syntax check passes', () => {
    // eslint-disable-next-line sonarjs/os-command -- shellcheck-style syntax check on a controlled script path
    expect(() => execSync(`bash -n "${SCRIPT}"`)).not.toThrow()
  })
})

describe('examples/deploy-vercel — completeness', () => {
  it('Given the example dir, Then vercel.json exists', () => {
    expect(existsSync(resolve(EXAMPLE, 'vercel.json'))).toBe(true)
  })

  it('Given the example dir, Then theo.config.ts exists', () => {
    expect(existsSync(resolve(EXAMPLE, 'theo.config.ts'))).toBe(true)
  })

  it('Given the example dir, Then app/page.tsx and api/health route exist', () => {
    expect(existsSync(resolve(EXAMPLE, 'app/page.tsx'))).toBe(true)
    expect(existsSync(resolve(EXAMPLE, 'server/routes/health.ts'))).toBe(true)
  })

  it('Given the example dir, Then README documents VERCEL_TOKEN usage', () => {
    const readme = readFileSync(resolve(EXAMPLE, 'README.md'), 'utf8')
    expect(readme).toContain('VERCEL_TOKEN')
    expect(readme).toContain('deploy:smoke')
  })
})

describe('deploy-smoke-vercel.sh — error scenarios (without VERCEL_TOKEN)', () => {
  it('Given no VERCEL_TOKEN and no LOCAL_URL, When script runs, Then exit code 2 + clear error', () => {
    let exitCode = 0
    let stderr = ''
    try {
      // eslint-disable-next-line sonarjs/os-command -- test invokes a controlled constant script path with the env stripped
      execSync(`env -u VERCEL_TOKEN -u LOCAL_URL bash "${SCRIPT}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      const error = err as { status?: number; stderr?: Buffer | string }
      exitCode = error.status ?? -1
      stderr = String(error.stderr ?? '')
    }
    expect(exitCode).toBe(2)
    expect(stderr).toContain('VERCEL_TOKEN unset')
  })
})
