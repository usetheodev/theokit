import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T7.1 — Static smoke of the load-test script.
 *
 * Running the actual autocannon is for nightly CI (not every PR). This
 * test validates structure + EC-11 (relative thresholds) is wired.
 */

const ROOT = resolve(__dirname, '../..')
const SCRIPT = resolve(ROOT, 'scripts/load-test-streaming.mjs')

describe('load-test-streaming.mjs — structure', () => {
  it('Given the script path, Then the file exists with node shebang', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true)
  })

  it('Given the script, Then it uses autocannon (ADR D5)', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('autocannon')
  })

  it('Given the script, Then thresholds are RELATIVE to baseline (EC-11)', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('p99LatencyMs * 1.2')
    expect(content).toContain('requestsPerSec * 0.8')
  })

  it('Given the script, Then memory growth has an absolute 50 MB cap', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('heapDeltaMB > 50')
  })

  it('Given the script, Then errors have an absolute 0 threshold', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('summary.errors > 0')
  })

  it('Given the script, Then it supports --update-baseline mode', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('--update-baseline')
  })

  it('Given the script, Then it kills the spawned server on exit', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain("proc.kill('SIGTERM')")
  })

  it('Given the script, Then it waits for the server to boot before benchmarking', () => {
    const content = readFileSync(SCRIPT, 'utf8')
    expect(content).toContain('waitForServer')
  })
})
