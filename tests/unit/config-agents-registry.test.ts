/**
 * T6.1 — Zod schema validation for theo.config.ts > agents.registry.
 */
import { describe, it, expect } from 'vitest'
import { theoConfigSchema } from '../../packages/theo/src/config/schema.js'

describe('agents.registry config schema (T6.1)', () => {
  it('test_config_accepts_valid_agents_registry', () => {
    const result = theoConfigSchema.safeParse({
      agents: { registry: { maxAgents: 50, idleTimeoutMs: 600_000 } },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.agents?.registry?.maxAgents).toBe(50)
      expect(result.data.agents?.registry?.idleTimeoutMs).toBe(600_000)
    }
  })

  it('test_config_rejects_zero_max_agents — must be positive', () => {
    const result = theoConfigSchema.safeParse({
      agents: { registry: { maxAgents: 0 } },
    })
    expect(result.success).toBe(false)
  })

  it('test_config_rejects_negative_max_agents', () => {
    const result = theoConfigSchema.safeParse({
      agents: { registry: { maxAgents: -1 } },
    })
    expect(result.success).toBe(false)
  })

  it('test_config_accepts_zero_idle_timeout — disables idle eviction', () => {
    const result = theoConfigSchema.safeParse({
      agents: { registry: { maxAgents: 10, idleTimeoutMs: 0 } },
    })
    expect(result.success).toBe(true)
  })

  it('test_config_defaults_applied — empty registry object', () => {
    const result = theoConfigSchema.safeParse({
      agents: { registry: {} },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.agents?.registry?.maxAgents).toBe(100)
      expect(result.data.agents?.registry?.idleTimeoutMs).toBe(30 * 60_000)
    }
  })

  it('test_config_no_registry_section_ok — agents section optional', () => {
    const result = theoConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('test_config_rejects_string_max_agents', () => {
    const result = theoConfigSchema.safeParse({
      agents: { registry: { maxAgents: 'fifty' } },
    })
    expect(result.success).toBe(false)
  })
})
