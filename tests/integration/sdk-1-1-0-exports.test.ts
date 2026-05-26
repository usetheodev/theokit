/**
 * T0.1 — SDK v1.1.0 exports smoke (Phase 0).
 *
 * Contract verification: the new primitives shipped in @usetheo/sdk v1.1.0
 * are importable, structured, and instantiable.
 *
 * EC-4 (SHOULD TEST): use semver-aware version check (`^1.1.0`) instead of
 * brittle `starts-with` — accepts 1.1.x and 1.2.x; rejects 1.0.x and 2.0.x.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  Agent,
  AgentRunError,
  type AgentRunErrorCode,
  FileSystemConversationStorage,
  InMemoryConversationStorage,
} from '@usetheo/sdk'

/**
 * Minimal caret-range check (`^1.1.0`).
 *  - major MUST equal 1
 *  - minor MUST be ≥ 1
 *  - patch is free
 */
function satisfiesCaret1_1_0(version: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (m === null) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  if (major !== 1) return false
  return minor >= 1
}

describe('SDK v1.1.0 exports smoke (T0.1)', () => {
  it('test_sdk_version_satisfies_caret_range (EC-4) — @usetheo/sdk version is in ^1.1.0', () => {
    // Resolve via require to find the actually-installed package.json
    const sdkPkgPath = require.resolve('@usetheo/sdk/package.json')
    const pkg = JSON.parse(readFileSync(sdkPkgPath, 'utf8')) as { version: string }
    expect(satisfiesCaret1_1_0(pkg.version)).toBe(true)
  })

  it('test_agent_registry_has_configure_method — Agent.registry.configure is a function', () => {
    expect(typeof Agent.registry).toBe('object')
    expect(typeof Agent.registry.configure).toBe('function')
  })

  it('test_agent_run_error_has_code_field — instance carries code property', () => {
    const err = new AgentRunError('rate limited', {
      code: 'rate_limit' as AgentRunErrorCode,
      provider: 'openai',
      retriable: true,
    })
    expect(err.code).toBe('rate_limit')
    expect(err.provider).toBe('openai')
    expect(err.retriable).toBe(true)
  })

  it('test_file_system_conversation_storage_constructs — has getMessages/appendMessage/deleteConversation', () => {
    const s = new FileSystemConversationStorage()
    expect(typeof s.getMessages).toBe('function')
    expect(typeof s.appendMessage).toBe('function')
    expect(typeof s.deleteConversation).toBe('function')
  })

  it('test_in_memory_conversation_storage_constructs — same contract', () => {
    const s = new InMemoryConversationStorage()
    expect(typeof s.getMessages).toBe('function')
    expect(typeof s.appendMessage).toBe('function')
    expect(typeof s.deleteConversation).toBe('function')
  })

  it('caret check rejects 1.0.x', () => {
    expect(satisfiesCaret1_1_0('1.0.99')).toBe(false)
  })

  it('caret check rejects 2.0.0', () => {
    expect(satisfiesCaret1_1_0('2.0.0')).toBe(false)
  })

  it('caret check accepts 1.1.0', () => {
    expect(satisfiesCaret1_1_0('1.1.0')).toBe(true)
  })

  it('caret check accepts 1.99.99', () => {
    expect(satisfiesCaret1_1_0('1.99.99')).toBe(true)
  })

  it('caret check rejects malformed string', () => {
    expect(satisfiesCaret1_1_0('not-a-version')).toBe(false)
    expect(satisfiesCaret1_1_0('')).toBe(false)
  })
})
