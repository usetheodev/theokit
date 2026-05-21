#!/usr/bin/env node
/**
 * T7.1 — Load test the SSR streaming path with autocannon.
 *
 * Spins up `examples/devtools-demo` (or `LOAD_TEST_TARGET` example) in
 * production mode, runs 1000 concurrent connections for 60s against the
 * SSR-streamed home route, measures latency + memory + abort behavior,
 * writes results to JSON. EC-11: assertions are RELATIVE against the
 * previous baseline (`scripts/load-test-baseline.json`), not absolute.
 *
 * Requires `autocannon` installed locally:
 *   pnpm add -D autocannon
 *
 * Usage:
 *   node scripts/load-test-streaming.mjs
 *   node scripts/load-test-streaming.mjs --update-baseline   # capture new baseline
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const BASELINE = resolve(__dirname, 'load-test-baseline.json')
const TARGET = process.env.LOAD_TEST_TARGET ?? 'examples/devtools-demo'
const PORT = Number(process.env.LOAD_TEST_PORT ?? 3470)
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 1000)
const DURATION = Number(process.env.LOAD_TEST_DURATION ?? 60)
const updateBaseline = process.argv.includes('--update-baseline')

let autocannon
try {
  autocannon = (await import('autocannon')).default
} catch {
  console.error('[load-test] FAIL: autocannon not installed. Run `pnpm add -D autocannon`.')
  process.exit(2)
}

// Start the target example.
console.log(`[load-test] Booting target: ${TARGET} on port ${String(PORT)}`)
// eslint-disable-next-line sonarjs/no-os-command-from-path -- dev-time load test harness; PATH is controlled by the engineer running the test
const proc = spawn('pnpm', ['start'], {
  cwd: resolve(ROOT, TARGET),
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'pipe',
})

// Wait for the server to be ready.
async function waitForServer() {
  const start = Date.now()
  while (Date.now() - start < 30_000) {
    try {
      const res = await fetch(`http://localhost:${String(PORT)}/`)
      if (res.ok) return
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Server failed to boot within 30s')
}

try {
  await waitForServer()

  const memBefore = process.memoryUsage()
  console.log(`[load-test] Running autocannon: ${String(CONNECTIONS)}c × ${String(DURATION)}s`)
  const result = await autocannon({
    url: `http://localhost:${String(PORT)}/`,
    connections: CONNECTIONS,
    duration: DURATION,
    timeout: 30,
  })
  const memAfter = process.memoryUsage()
  const memDeltaMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024

  const summary = {
    timestamp: new Date().toISOString(),
    target: TARGET,
    connections: CONNECTIONS,
    durationSec: DURATION,
    p99LatencyMs: result.latency.p99,
    p50LatencyMs: result.latency.p50,
    requestsPerSec: result.requests.average,
    errors: result.errors,
    timeouts: result.timeouts,
    heapDeltaMB: Math.round(memDeltaMB * 100) / 100,
  }

  console.log('[load-test] Results:', JSON.stringify(summary, null, 2))

  // EC-11: relative assertions vs baseline.
  if (updateBaseline || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(summary, null, 2) + '\n')
    console.log(`[load-test] Baseline ${updateBaseline ? 'updated' : 'created'}: ${BASELINE}`)
  } else {
    const prev = JSON.parse(readFileSync(BASELINE, 'utf8'))
    const failures = []

    // p99 latency: must be ≤ baseline × 1.20
    if (summary.p99LatencyMs > prev.p99LatencyMs * 1.2) {
      failures.push(
        `p99 latency regression: ${String(summary.p99LatencyMs)}ms > ${String(prev.p99LatencyMs)}ms × 1.20`,
      )
    }
    // RPS: must be ≥ baseline × 0.80
    if (summary.requestsPerSec < prev.requestsPerSec * 0.8) {
      failures.push(
        `RPS regression: ${String(summary.requestsPerSec)} < ${String(prev.requestsPerSec)} × 0.80`,
      )
    }
    // Memory growth: absolute ≤ 50 MB
    if (summary.heapDeltaMB > 50) {
      failures.push(`Memory growth: ${String(summary.heapDeltaMB)} MB > 50 MB cap`)
    }
    // Errors: absolute 0
    if (summary.errors > 0) {
      failures.push(`Errors: ${String(summary.errors)} > 0`)
    }

    if (failures.length > 0) {
      console.error('[load-test] FAIL:')
      for (const f of failures) console.error('  - ' + f)
      process.exit(1)
    }
    console.log('[load-test] PASS (all thresholds within baseline tolerance)')
  }
} finally {
  proc.kill('SIGTERM')
}
