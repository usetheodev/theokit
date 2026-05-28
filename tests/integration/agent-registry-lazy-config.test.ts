/**
 * T6.1 integration — `configureAgentRegistryOnce` lazy + race-free.
 *
 * EC-3 (MUST FIX) — concurrent first-requests must NOT cause `configure` to
 * run multiple times. The sync flag flip BEFORE configure prevents the race.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  configureAgentRegistryOnce,
  __resetAgentRegistryConfigForTests,
  __isAgentRegistryConfigured,
} from '../../packages/theo/src/server/agent/configure-agent-registry.js'

interface FakeRegistry {
  configure: (opts: { maxAgents?: number; idleTimeoutMs?: number }) => void
}

function makeFakeRegistry(): FakeRegistry & {
  calls: { maxAgents?: number; idleTimeoutMs?: number }[]
} {
  const calls: { maxAgents?: number; idleTimeoutMs?: number }[] = []
  return {
    configure(opts) {
      calls.push(opts)
    },
    calls,
  }
}

beforeEach(() => {
  __resetAgentRegistryConfigForTests()
})

describe('configureAgentRegistryOnce (T6.1)', () => {
  it('test_configure_called_once_per_process — 3 requests, 1 call', () => {
    const registry = makeFakeRegistry()
    const cfg = { maxAgents: 50, idleTimeoutMs: 1000 }
    configureAgentRegistryOnce(registry, cfg)
    configureAgentRegistryOnce(registry, cfg)
    configureAgentRegistryOnce(registry, cfg)
    expect(registry.calls).toHaveLength(1)
    expect(registry.calls[0]).toEqual(cfg)
  })

  it('test_configure_skipped_when_registry_undefined — no configure call', () => {
    const registry = makeFakeRegistry()
    configureAgentRegistryOnce(registry, undefined)
    expect(registry.calls).toHaveLength(0)
    // But the flag should be set, so subsequent calls don't re-attempt
    expect(__isAgentRegistryConfigured()).toBe(true)
  })

  it('test_lazy_configure_no_race_under_concurrency (EC-3 MUST FIX)', async () => {
    const registry = makeFakeRegistry()
    const cfg = { maxAgents: 50 }
    // Simulate concurrent first-requests
    await Promise.all([
      Promise.resolve(configureAgentRegistryOnce(registry, cfg)),
      Promise.resolve(configureAgentRegistryOnce(registry, cfg)),
      Promise.resolve(configureAgentRegistryOnce(registry, cfg)),
      Promise.resolve(configureAgentRegistryOnce(registry, cfg)),
      Promise.resolve(configureAgentRegistryOnce(registry, cfg)),
    ])
    expect(registry.calls).toHaveLength(1)
  })

  it('test_rollback_on_configure_throw — flag rolls back, future request retries', () => {
    const calls: { maxAgents?: number; idleTimeoutMs?: number }[] = []
    let throwOnce = true
    const registry: FakeRegistry = {
      configure(opts) {
        calls.push(opts)
        if (throwOnce) {
          throwOnce = false
          throw new Error('SDK bug')
        }
      },
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configureAgentRegistryOnce(registry, { maxAgents: 5 })
    expect(__isAgentRegistryConfigured()).toBe(false) // rolled back
    expect(warnSpy).toHaveBeenCalled()
    // Second call retries
    configureAgentRegistryOnce(registry, { maxAgents: 5 })
    expect(__isAgentRegistryConfigured()).toBe(true)
    expect(calls).toHaveLength(2)
    warnSpy.mockRestore()
  })
})
