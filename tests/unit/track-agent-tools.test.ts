/**
 * T5.1 — trackAgentTools factory tests.
 *
 * Covers the contract:
 *  - onToolStart records nothing (no duration yet)
 *  - onToolEnd records success + durationMs
 *  - onToolError records failure + errorMessage
 *  - Hooks swallow throws (don't crash the run)
 *  - EC-8: orphan starts pruned after TTL
 *  - EC-9: legacy record (no kind) backward-compat
 */
import { describe, it, expect, vi } from 'vitest'

import { trackAgentTools } from '../../packages/theo/src/server/cost/track-agent-tools.js'
import { InMemoryUsageStorage } from '../../packages/theo/src/server/cost/usage-storage-memory.js'
import type { ToolUsageRecord } from '../../packages/theo/src/server/cost/cost-types.js'

function makeStorage() {
  return new InMemoryUsageStorage()
}

describe('trackAgentTools factory (T5.1)', () => {
  it('test_on_tool_start_records_nothing — start does NOT call storage.record', () => {
    const storage = makeStorage()
    const spy = vi.spyOn(storage, 'record')
    const hooks = trackAgentTools({ storage, userId: 'u1', conversationId: 'c1' })
    hooks.onToolStart({ callId: 'a', name: 'calculator' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('test_on_tool_end_records_tool_usage — kind:tool success:true', async () => {
    const storage = makeStorage()
    const hooks = trackAgentTools({ storage, userId: 'u1', conversationId: 'c1' })
    hooks.onToolStart({ callId: 'a', name: 'calculator' })
    hooks.onToolEnd({ callId: 'a', name: 'calculator' })
    await new Promise((r) => setImmediate(r))
    const records = storage.__getRecords()
    expect(records).toHaveLength(1)
    const r = records[0] as ToolUsageRecord
    expect(r.kind).toBe('tool')
    expect(r.toolName).toBe('calculator')
    expect(r.callId).toBe('a')
    expect(r.success).toBe(true)
    expect(r.userId).toBe('u1')
    expect(r.conversationId).toBe('c1')
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('test_on_tool_error_records_failure — success:false + errorMessage', async () => {
    const storage = makeStorage()
    const hooks = trackAgentTools({ storage, userId: 'u1', conversationId: 'c1' })
    hooks.onToolStart({ callId: 'b', name: 'web_fetch' })
    hooks.onToolError({ callId: 'b', name: 'web_fetch', error: new Error('boom') })
    await new Promise((r) => setImmediate(r))
    const records = storage.__getRecords()
    const r = records[0] as ToolUsageRecord
    expect(r.success).toBe(false)
    expect(r.errorMessage).toBe('boom')
  })

  it('test_durationMs_computed — mocked clock yields correct duration', async () => {
    const storage = makeStorage()
    let t = 1_000_000
    const hooks = trackAgentTools({
      storage,
      userId: 'u',
      conversationId: 'c',
      now: () => new Date(t),
    })
    hooks.onToolStart({ callId: 'd', name: 'foo' })
    t += 250
    hooks.onToolEnd({ callId: 'd', name: 'foo' })
    await new Promise((r) => setImmediate(r))
    const r = storage.__getRecords()[0] as ToolUsageRecord
    expect(r.durationMs).toBe(250)
  })

  it('test_orphan_end_logs_warning_records_zero — end without start', async () => {
    const storage = makeStorage()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hooks = trackAgentTools({ storage, userId: 'u', conversationId: 'c' })
    hooks.onToolEnd({ callId: 'orphan', name: 'x' })
    await new Promise((r) => setImmediate(r))
    const r = storage.__getRecords()[0] as ToolUsageRecord
    expect(r.durationMs).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('test_hook_throw_swallowed — storage.record throw does not propagate', async () => {
    const storage = {
      name: 'broken' as const,
      async record() {
        throw new Error('db down')
      },
      async getUsage() {
        return { totalTokens: 0, totalCostUsd: 0, runs: 0 }
      },
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hooks = trackAgentTools({ storage, userId: 'u', conversationId: 'c' })
    expect(() => {
      hooks.onToolStart({ callId: 'x', name: 'x' })
      hooks.onToolEnd({ callId: 'x', name: 'x' })
    }).not.toThrow()
    await new Promise((r) => setImmediate(r))
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // EC-9 (SHOULD TEST)
  it('test_backward_compat_old_usage_record (EC-9) — input without kind treated as llm', async () => {
    const storage = makeStorage()
    await storage.record({
      userId: 'u',
      model: 'm',
      tokens: { input: 10, output: 20 },
      costUsd: 0.01,
      timestamp: new Date(),
      // NO `kind` field — legacy adapter shape
    })
    // Then external adapter must NOT crash and getUsage must include it
    const result = await storage.getUsage({
      userId: 'u',
      period: { from: new Date(0), to: new Date(Date.now() + 1000) },
    })
    expect(result.runs).toBe(1)
    expect(result.totalTokens).toBe(30)
    expect(result.totalCostUsd).toBe(0.01)
  })

  // EC-8 (SHOULD TEST)
  it('test_orphan_starts_pruned_after_ttl — starts older than 5 min cleared', async () => {
    const storage = makeStorage()
    let t = 1_000_000
    const hooks = trackAgentTools({
      storage,
      userId: 'u',
      conversationId: 'c',
      now: () => new Date(t),
    })
    hooks.onToolStart({ callId: 'old-orphan', name: 'a' })
    // Advance past TTL (5 min = 300_000 ms)
    t += 6 * 60_000
    hooks.onToolStart({ callId: 'fresh', name: 'b' })
    // Fire end for the old orphan — should now be treated as orphan (warn + duration:0)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    hooks.onToolEnd({ callId: 'old-orphan', name: 'a' })
    await new Promise((r) => setImmediate(r))
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
