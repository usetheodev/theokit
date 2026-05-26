/**
 * T6.2 — `theokit start` registers SIGTERM/SIGINT handlers.
 *
 * Static (file-level) test — verifies the handler wiring exists in source.
 * Subprocess-based runtime tests would force the entire prod server boot
 * (heavy + flaky in CI) just to send a signal. Instead we assert:
 *   - source contains process.on('SIGTERM') + process.on('SIGINT')
 *   - source contains Agent.registry.evictAll() call
 *   - source has re-entry guard (`shuttingDown` flag)
 *
 * EC-13 (DOCUMENT): the wire-up is documented inline in start.ts —
 * relying on platform LB drain rather than implementing TheoKit-side drain.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const START_SOURCE = readFileSync(
  resolve(__dirname, '../../packages/theo/src/cli/commands/start.ts'),
  'utf8',
)

describe('theokit start — SIGTERM/SIGINT handlers (T6.2)', () => {
  it('test_sigterm_handler_registered', () => {
    expect(START_SOURCE).toMatch(/process\.on\(\s*['"]SIGTERM['"]/)
  })

  it('test_sigint_handler_registered', () => {
    expect(START_SOURCE).toMatch(/process\.on\(\s*['"]SIGINT['"]/)
  })

  it('test_handler_calls_evict_all', () => {
    expect(START_SOURCE).toMatch(/Agent\.registry\.evictAll\(\)/)
  })

  it('test_re_entry_guard_present (shuttingDown flag)', () => {
    expect(START_SOURCE).toMatch(/shuttingDown\s*=\s*true/)
    expect(START_SOURCE).toMatch(/if\s*\(\s*shuttingDown\s*\)\s*return/)
  })

  it('test_force_exit_timeout_set (25s under K8s 30s grace)', () => {
    // 25_000 ms = 25 seconds — under K8s default 30s terminationGracePeriodSeconds
    expect(START_SOURCE).toMatch(/25_?000/)
  })

  it('test_evict_all_error_does_not_block_exit', () => {
    // catch block must exist around evictAll
    expect(START_SOURCE).toMatch(/catch\s*\(\s*err\s*\)/)
    expect(START_SOURCE).toMatch(/proceeding to exit|evictAll error/)
  })

  it('test_sdk_import_is_lazy (only at shutdown time)', () => {
    // SDK is imported via dynamic import() inside the handler — not statically.
    // This avoids forcing the dep on apps that don't use agents.
    expect(START_SOURCE).toMatch(/await import\(['"]@usetheo\/sdk['"]/)
  })
})
