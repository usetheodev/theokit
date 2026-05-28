import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// We test the wire-up behavior of `startDevServer` against `services: {}` in
// the loaded TheoConfig. We do not actually start Vite (slow + flaky in CI);
// the wire-up correctness is verified by reading dev.ts's source and asserting:
//   - it imports `orchestrateDev` from services/orchestrator.js
//   - it calls orchestrateDev before createServer
//   - it attaches a 'close' handler to httpServer (NOT mutates server.close)
//   - it throws actionable error on unhealthy services
// This is a high-confidence structural integration test.

const DEV_TS = resolve(__dirname, '../../packages/theo/src/cli/commands/dev.ts')

describe('T1.1 — services dev wire-up (structural)', () => {
  it('dev.ts imports orchestrateDev from services barrel', () => {
    // T2.1 + T4.1 (architecture-cleanup) — cross-module imports MUST flow through
    // the services/index.js barrel (ADR-0001 v3 invariant #3). The barrel re-exports
    // from services/runtime/orchestrator.js.
    const src = readFileSync(DEV_TS, 'utf-8')
    expect(src).toMatch(
      /import\s*\{[^}]*orchestrateDev[^}]*\}\s*from\s*['"].*services\/(index|orchestrator)/,
    )
  })

  it('dev.ts calls orchestrateDev BEFORE createServer', () => {
    const src = readFileSync(DEV_TS, 'utf-8')
    const idxOrchestrate = src.indexOf('orchestrateDev(')
    const idxCreateServer = src.indexOf('createServer(')
    expect(idxOrchestrate).toBeGreaterThan(-1)
    expect(idxCreateServer).toBeGreaterThan(-1)
    expect(idxOrchestrate).toBeLessThan(idxCreateServer)
  })

  it('dev.ts throws actionable error when allHealthy === false', () => {
    const src = readFileSync(DEV_TS, 'utf-8')
    expect(src).toMatch(/services failed healthcheck/i)
    expect(src).toMatch(/orchestration\.unhealthy/)
  })

  it('dev.ts stops orchestration on healthcheck failure (no leak)', () => {
    const src = readFileSync(DEV_TS, 'utf-8')
    // Must contain `orchestration.stop()` call inside the unhealthy branch
    expect(src).toMatch(/!orchestration\.allHealthy[\s\S]+orchestration\.stop\(\)/)
  })

  it('EC-1: dev.ts attaches close handler via server.httpServer.on, NOT server.close mutation', () => {
    const src = readFileSync(DEV_TS, 'utf-8')
    expect(src).toMatch(/server\.httpServer\?.on\(['"]close['"]/)
    // server.close should NOT be reassigned
    expect(src).not.toMatch(/server\.close\s*=/)
  })

  it('EC-1: close handler calls orchestration.stop()', () => {
    const src = readFileSync(DEV_TS, 'utf-8')
    // The on('close', ...) block must invoke orchestration.stop()
    const closeBlock = /server\.httpServer\?.on\(['"]close['"][\s\S]+?orchestration\.stop\(\)/
    expect(closeBlock.test(src)).toBe(true)
  })

  it('wraps Vite createServer in try-catch that stops orchestration on Vite failure', () => {
    const src = readFileSync(DEV_TS, 'utf-8')
    // Must have a try/catch around the Vite createServer + listen path
    expect(src).toMatch(/try\s*\{[\s\S]+createServer[\s\S]+catch[\s\S]+orchestration\.stop\(\)/)
  })

  it('empty services preserves Wave 1 behavior (orchestrateDev returns immediately)', () => {
    // This is enforced by the orchestrator unit tests (see services-orchestrator.test.ts:
    // "returns allHealthy=true and no spawns for empty services").
    // We assert here that dev.ts does NOT gate the call on services emptiness —
    // it ALWAYS calls orchestrateDev, which itself returns immediately on empty.
    const src = readFileSync(DEV_TS, 'utf-8')
    // Must NOT have an early-return like `if (config.services && Object.keys(config.services).length > 0)`
    // gating the call. The call must happen unconditionally; orchestrator handles empty.
    const callsOrch = /await orchestrateDev\(\s*\{\s*cwd,\s*services:\s*config\.services/
    expect(callsOrch.test(src)).toBe(true)
  })
})

describe('T1.1 — orchestration behavior (live, no Vite)', () => {
  // These tests invoke orchestrateDev directly via a stubbed fetch + spawn
  // to verify the contract dev.ts relies on. They duplicate orchestrator
  // unit tests intentionally — proving the integration assumption.
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'services-dev-wireup-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('orchestrateDev returns allHealthy=true for empty services without spawning', async () => {
    const { orchestrateDev } = await import('../../packages/theo/src/services/index.js')
    const result = await orchestrateDev({
      cwd: tmp,
      services: {},
      installSignalHandlers: false,
    })
    expect(result.allHealthy).toBe(true)
    expect(result.spawned).toEqual([])
  })
})
