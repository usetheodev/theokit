/**
 * T1.1 runtime — JSON shape of AgentErrorEvent.
 *
 * Phase 1 (Production-Readiness #3): error events on the SSE wire MAY carry
 * structured discrimination fields. Verifies serialization keeps optional
 * fields when present and omits them when absent (backward compat with
 * legacy clients reading only `message`).
 */
import { describe, it, expect } from 'vitest'
import type {
  AgentErrorEvent,
  AgentRunErrorCode,
} from '../../packages/theo/src/server/agent/agent-types.js'

describe('AgentErrorEvent JSON shape (Phase 1)', () => {
  it('legacy event with only message serializes round-trip', () => {
    const ev: AgentErrorEvent = { type: 'error', message: 'boom' }
    const json = JSON.parse(JSON.stringify(ev)) as AgentErrorEvent
    expect(json).toEqual({ type: 'error', message: 'boom' })
    expect(json.code).toBeUndefined()
    expect(json.provider).toBeUndefined()
    expect(json.retriable).toBeUndefined()
    expect(json.retryAfterMs).toBeUndefined()
  })

  it('full event with all fields serializes round-trip', () => {
    const ev: AgentErrorEvent = {
      type: 'error',
      message: 'rate limited',
      code: 'rate_limit' as AgentRunErrorCode,
      provider: 'openai',
      retriable: true,
      retryAfterMs: 30_000,
      id: 'err-1',
    }
    const json = JSON.parse(JSON.stringify(ev)) as AgentErrorEvent
    expect(json).toEqual(ev)
  })

  it('retryAfterMs: 0 is preserved (not stripped as falsy)', () => {
    const ev: AgentErrorEvent = {
      type: 'error',
      message: 'retry now',
      code: 'rate_limit' as AgentRunErrorCode,
      retryAfterMs: 0,
    }
    const json = JSON.parse(JSON.stringify(ev)) as AgentErrorEvent
    expect(json.retryAfterMs).toBe(0)
  })

  it('forward-compat: unknown code value still serializes', () => {
    const ev: AgentErrorEvent = {
      type: 'error',
      message: 'new code',
      code: 'content_filter' as AgentRunErrorCode, // hypothetical future code
    }
    const json = JSON.parse(JSON.stringify(ev)) as AgentErrorEvent
    expect(json.code).toBe('content_filter')
  })
})
