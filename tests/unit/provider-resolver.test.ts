/**
 * Provider Resolver tests — Strategy + Registry pattern (FAANG-grade).
 *
 * Cobertura BDD obrigatória:
 *   - Happy path: cada env var resolve no provider correto
 *   - Priority order: OPENROUTER > OPENAI > ANTHROPIC
 *   - Error path: zero env vars → actionable error message
 *   - Registry: registerProvider() idempotent + listProviders() snapshot
 *   - Escape hatch: tryResolveProvider() não throws
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  listProviders,
  registerProvider,
  resetProviderRegistry,
  resolveProvider,
  tryResolveProvider,
  type ProviderDescriptor,
} from '../../packages/theo/src/server/agent/provider-resolver.js'

// Snapshot original env keys — restore after each test
const ENV_KEYS_TO_CLEAR = [
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'SELF_HOSTED_API_KEY',
] as const

function clearLLMEnv() {
  for (const k of ENV_KEYS_TO_CLEAR) {
    delete process.env[k]
  }
}

describe('Provider Resolver — Strategy + Registry (FAANG-grade)', () => {
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    originalEnv = {}
    for (const k of ENV_KEYS_TO_CLEAR) {
      originalEnv[k] = process.env[k]
    }
    clearLLMEnv()
    resetProviderRegistry()
  })

  afterEach(() => {
    for (const k of ENV_KEYS_TO_CLEAR) {
      if (originalEnv[k] === undefined) delete process.env[k]
      else process.env[k] = originalEnv[k]
    }
    resetProviderRegistry()
  })

  describe('resolveProvider() — env-driven Strategy', () => {
    it('should resolve OpenRouter when OPENROUTER_API_KEY is present', () => {
      // Given: only OPENROUTER_API_KEY is set,
      process.env['OPENROUTER_API_KEY'] = 'sk-or-test'
      // When: resolveProvider() is called,
      const r = resolveProvider()
      // Then: OpenRouter wins with correct baseUrl.
      expect(r.name).toBe('openrouter')
      expect(r.apiKey).toBe('sk-or-test')
      expect(r.baseUrl).toBe('https://openrouter.ai/api/v1')
    })

    it('should resolve OpenAI when only OPENAI_API_KEY is present', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test'
      const r = resolveProvider()
      expect(r.name).toBe('openai')
      expect(r.baseUrl).toBe('https://api.openai.com/v1')
    })

    it('should resolve Anthropic when only ANTHROPIC_API_KEY is present', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
      const r = resolveProvider()
      expect(r.name).toBe('anthropic')
      expect(r.baseUrl).toBe('https://api.anthropic.com')
    })

    it('should PRIORITIZE OpenRouter when multiple env vars present', () => {
      // Given: OpenRouter AND OpenAI keys present,
      process.env['OPENROUTER_API_KEY'] = 'sk-or-test'
      process.env['OPENAI_API_KEY'] = 'sk-test'
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
      // When: resolve,
      const r = resolveProvider()
      // Then: priority order — OpenRouter wins (gateway > direct).
      expect(r.name).toBe('openrouter')
    })

    it('should throw actionable error when NO env var is set', () => {
      // Given: clean env,
      // When: resolveProvider() called,
      // Then: error message mentions all expected env vars + actionable hint.
      expect(() => resolveProvider()).toThrow(/OPENROUTER_API_KEY/)
      expect(() => resolveProvider()).toThrow(/openrouter\.ai\/keys/)
    })

    it('should treat empty-string env var as absent', () => {
      // Given: KEY presente mas vazia,
      process.env['OPENROUTER_API_KEY'] = ''
      process.env['OPENAI_API_KEY'] = 'sk-test'
      // When: resolve,
      const r = resolveProvider()
      // Then: OpenAI (next priority) wins — empty string treated como absent.
      expect(r.name).toBe('openai')
    })
  })

  describe('tryResolveProvider() — graceful degradation', () => {
    it('should return null when no env var (não throws)', () => {
      expect(tryResolveProvider()).toBeNull()
    })

    it('should return resolved when env present', () => {
      process.env['OPENROUTER_API_KEY'] = 'sk-or-test'
      const r = tryResolveProvider()
      expect(r).not.toBeNull()
      expect(r?.name).toBe('openrouter')
    })
  })

  describe('Registry — extension point', () => {
    it('listProviders() returns default 3 providers sorted by priority', () => {
      const list = listProviders()
      expect(list.length).toBe(3)
      expect(list[0]?.name).toBe('openrouter') // priority 1
      expect(list[1]?.name).toBe('openai') // priority 2
      expect(list[2]?.name).toBe('anthropic') // priority 3
    })

    it('registerProvider() adds new provider at specified priority', () => {
      const custom: ProviderDescriptor = {
        name: 'self-hosted',
        envKey: 'SELF_HOSTED_API_KEY',
        baseUrl: 'https://llm.internal.acme.com/v1',
        priority: 0, // highest
      }
      registerProvider(custom)
      const list = listProviders()
      expect(list.length).toBe(4)
      expect(list[0]?.name).toBe('self-hosted') // priority 0 wins

      // Resolve respects new priority
      process.env['SELF_HOSTED_API_KEY'] = 'custom-token'
      process.env['OPENROUTER_API_KEY'] = 'sk-or-test'
      const r = resolveProvider()
      expect(r.name).toBe('self-hosted')
    })

    it('registerProvider() is IDEMPOTENT — same name replaces, no duplicates', () => {
      const v1: ProviderDescriptor = {
        name: 'custom',
        envKey: 'CUSTOM_KEY',
        baseUrl: 'https://v1.acme.com',
        priority: 5,
      }
      const v2: ProviderDescriptor = { ...v1, baseUrl: 'https://v2.acme.com' }
      registerProvider(v1)
      registerProvider(v2)
      const list = listProviders()
      expect(list.filter((p) => p.name === 'custom').length).toBe(1)
      expect(list.find((p) => p.name === 'custom')?.baseUrl).toBe('https://v2.acme.com')
    })

    it('resetProviderRegistry() restores default 3-provider state', () => {
      registerProvider({
        name: 'temp',
        envKey: 'TEMP_KEY',
        baseUrl: 'https://temp.com',
        priority: 99,
      })
      expect(listProviders().length).toBe(4)
      resetProviderRegistry()
      expect(listProviders().length).toBe(3)
    })
  })
})
