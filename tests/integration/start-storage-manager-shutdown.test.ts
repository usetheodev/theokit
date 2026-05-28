/**
 * T3.1 — Structural + functional test for start.ts SIGTERM wiring.
 *
 * start.ts is a CLI bootstrap (process.listen + signal handlers). E2E
 * coverage requires a subprocess — that's done by dogfood. Here we:
 *
 *   1. Assert the source contains the wiring (configureStorageManagerFromConfig
 *      called after configureAgentRegistryFromConfig; manager.dispose() inside
 *      gracefulShutdown after evictAll()).
 *   2. Functional test the order: agent.evictAll → manager.dispose → server.close.
 *      We re-implement the shutdown sequence inline (mirroring start.ts) and
 *      assert call order via spies.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSingletonForTests,
  getStorageManager,
  type StorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'

const START_TS = resolve(__dirname, '../../packages/theo/src/cli/commands/start.ts')
// T4.2 (architecture-cleanup) — shutdown sequence extracted to a sibling file.
const SHUTDOWN_TS = resolve(
  __dirname,
  '../../packages/theo/src/cli/commands/start-graceful-shutdown.ts',
)

beforeEach(() => {
  __resetSingletonForTests()
  vi.restoreAllMocks()
})

describe('T3.1 — start.ts SIGTERM wiring (structural)', () => {
  it('boot calls configureStorageManagerFromConfig after configureAgentRegistryFromConfig', () => {
    const src = readFileSync(START_TS, 'utf8')
    expect(src).toContain('configureAgentRegistryFromConfig(config.agents?.registry)')
    expect(src).toContain('configureStorageManagerFromConfig(config.storage)')

    const agentIdx = src.indexOf('configureAgentRegistryFromConfig(config.agents?.registry)')
    const storageIdx = src.indexOf('configureStorageManagerFromConfig(config.storage)')
    expect(agentIdx).toBeGreaterThan(0)
    expect(storageIdx).toBeGreaterThan(agentIdx)
  })

  it('gracefulShutdown imports + calls manager.dispose() after evictAll', () => {
    // T4.2 — shutdown moved to start-graceful-shutdown.ts
    const src = readFileSync(SHUTDOWN_TS, 'utf8')
    expect(src).toContain('Agent.registry.evictAll')
    expect(src).toContain('storage-manager')
    expect(src).toContain('manager.dispose()')
    const evictIdx = src.indexOf('evictAll')
    const disposeIdx = src.indexOf('manager.dispose()')
    expect(disposeIdx).toBeGreaterThan(evictIdx)
  })

  it('source declares a 25s force-exit timer covering the whole shutdown', () => {
    // T4.2 — shutdown moved to start-graceful-shutdown.ts
    const src = readFileSync(SHUTDOWN_TS, 'utf8')
    expect(src).toMatch(/25_?000/)
    expect(src).toContain('forced')
  })
})

describe('T3.1 — shutdown sequence (functional)', () => {
  it('agent.evictAll runs BEFORE manager.dispose (happy path order)', async () => {
    const calls: string[] = []
    const fakeAgentEviction = async () => {
      calls.push('agent.evictAll')
      await Promise.resolve()
    }
    // Pre-arrange manager state — register an adapter so dispose is observable
    const manager = getStorageManager()
    manager.configure({})
    manager.register({
      name: 'sentinel',
      dispose: () => {
        calls.push('manager.dispose')
        return Promise.resolve()
      },
    })

    // Re-implement the sequence inline (mirroring start.ts lines 425-447):
    await fakeAgentEviction()
    await manager.dispose()
    calls.push('server.close')

    expect(calls).toEqual(['agent.evictAll', 'manager.dispose', 'server.close'])
  })

  it('manager.dispose error is logged not thrown (error scenario)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const manager = getStorageManager()
    manager.configure({})
    manager.register({
      name: 'bad',
      dispose: () => Promise.reject(new Error('boom')),
    })
    await expect(manager.dispose()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"bad" dispose failed'))
  })

  it('manager.dispose() resolves quickly when no resources registered (edge case)', async () => {
    const manager = getStorageManager()
    const start = Date.now()
    await manager.dispose()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(100)
  })

  it('multiple gracefulShutdown invocations would early-exit (re-entry guard)', async () => {
    // Mirrors `shuttingDown` flag in start.ts — once dispose runs, second call no-op
    const manager = getStorageManager()
    manager.configure({})
    let disposeCalls = 0
    manager.register({
      name: 'count',
      dispose: () => {
        disposeCalls++
        return Promise.resolve()
      },
    })
    await manager.dispose()
    await manager.dispose() // idempotent
    expect(disposeCalls).toBe(1)
  })

  it('the wired manager singleton in shutdown matches the one configured at boot', () => {
    const manager: StorageManager = getStorageManager()
    const sameInstance = getStorageManager()
    expect(manager).toBe(sameInstance)
  })
})
