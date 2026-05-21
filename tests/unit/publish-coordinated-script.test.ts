import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T9.1 — Static smoke of the coordinated publish script.
 *
 * The real publish needs NPM_TOKEN. This test validates structure,
 * error paths, and EC-12 (atomicity + rollback) is correctly wired.
 */

const ROOT = resolve(__dirname, '../..')
const SCRIPT = resolve(ROOT, 'scripts/publish-coordinated.sh')

describe('publish-coordinated.sh — structure', () => {
  it('Given the script path, Then the file exists with bash shebang', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true)
  })

  it('Given the script, Then it dry-runs every package BEFORE the real publish (EC-12)', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('pnpm publish --dry-run')
    // Real publish must appear AFTER the dry-run block.
    const dryIdx = content.indexOf('pnpm publish --dry-run')
    const realIdx = content.indexOf('Real publish')
    expect(dryIdx).toBeGreaterThan(0)
    expect(realIdx).toBeGreaterThan(dryIdx)
  })

  it('Given the script, Then it implements rollback via `npm dist-tag rm` (EC-12)', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('npm dist-tag rm')
    expect(content).toContain('rollback')
  })

  it('Given the script, Then it includes both theokit and create-theo packages', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('packages/theo')
    expect(content).toContain('packages/create-theo')
  })

  it('Given the script, Then bash syntax check passes', () => {
    // eslint-disable-next-line sonarjs/os-command -- syntax check on a controlled constant script path
    expect(() => execSync(`bash -n "${SCRIPT}"`)).not.toThrow()
  })

  it('Given the script, Then NPM_TOKEN cleanup uses trap', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('trap cleanup_npmrc EXIT')
  })
})

describe('publish-coordinated.sh — error scenario: no NPM_TOKEN', () => {
  it('Given NPM_TOKEN unset, When script runs, Then exit code 2 + clear error', () => {
    let exitCode = 0
    let stderr = ''
    try {
      // eslint-disable-next-line sonarjs/os-command -- test invokes a controlled constant script path with env stripped
      execSync(`env -u NPM_TOKEN bash "${SCRIPT}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      const error = err as { status?: number; stderr?: Buffer | string }
      exitCode = error.status ?? -1
      stderr = String(error.stderr ?? '')
    }
    expect(exitCode).toBe(2)
    expect(stderr).toContain('NPM_TOKEN unset')
  })
})
