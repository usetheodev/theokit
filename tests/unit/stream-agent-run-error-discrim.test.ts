/**
 * T4.1 — streamAgentRun maps AgentRunError to AgentEvent with structured fields.
 *
 * Tests:
 *  - Each AgentRunErrorCode propagates to event.code
 *  - retryAfterMs zero is preserved (EC: not stripped as falsy)
 *  - providerError NEVER leaks via JSON serialization
 *  - Plain Error falls back to legacy shape (backward compat)
 *  - EC-6: minimal AgentRunError (only `code`) still detected by type guard
 *  - EC-7: unknown code (forward-compat) preserved
 */
import { describe, it, expect } from 'vitest'

import { errorToEvent } from '../../packages/theo/src/server/agent/stream-agent-run.js'

const CODES = [
  'auth',
  'rate_limit',
  'quota_exceeded',
  'invalid_model',
  'invalid_request',
  'invalid_input',
  'context_too_large',
  'safety_blocked',
  'provider_unreachable',
  'tool_runtime_error',
  'aborted',
  'unknown',
] as const

class FakeAgentRunError extends Error {
  code: string
  provider?: string
  retriable?: boolean
  retryAfterMs?: number
  providerError?: unknown
  constructor(opts: {
    message: string
    code: string
    provider?: string
    retriable?: boolean
    retryAfterMs?: number
    providerError?: unknown
  }) {
    super(opts.message)
    this.code = opts.code
    this.provider = opts.provider
    this.retriable = opts.retriable
    this.retryAfterMs = opts.retryAfterMs
    this.providerError = opts.providerError
  }
}

describe('streamAgentRun errorToEvent mapping (T4.1)', () => {
  it.each(CODES)('test_maps_code_to_event — code %s flows to event', (code) => {
    const err = new FakeAgentRunError({ message: `${code} msg`, code, provider: 'openai' })
    const ev = errorToEvent(err)
    expect(ev.type).toBe('error')
    expect(ev.code).toBe(code)
    expect(ev.message).toBe(`${code} msg`)
  })

  it('test_maps_retry_after_ms — retryAfterMs is forwarded', () => {
    const err = new FakeAgentRunError({
      message: 'rate limited',
      code: 'rate_limit',
      retryAfterMs: 30_000,
    })
    const ev = errorToEvent(err)
    expect(ev.retryAfterMs).toBe(30_000)
  })

  it('test_retry_after_ms_zero_valid — 0 preserved (not undefined)', () => {
    const err = new FakeAgentRunError({
      message: 'retry now',
      code: 'rate_limit',
      retryAfterMs: 0,
    })
    const ev = errorToEvent(err)
    expect(ev.retryAfterMs).toBe(0)
  })

  it('test_does_not_leak_provider_error — providerError absent from JSON', () => {
    const err = new FakeAgentRunError({
      message: 'unreachable',
      code: 'provider_unreachable',
      providerError: { secret: 'leaked-internal-data' },
    })
    const ev = errorToEvent(err)
    const json = JSON.stringify(ev)
    expect(json).not.toContain('leaked-internal-data')
    expect(json).not.toContain('providerError')
  })

  it('test_falls_back_for_plain_error — non-AgentRunError throws yield legacy shape', () => {
    const ev = errorToEvent(new Error('plain boom'))
    expect(ev).toEqual({ type: 'error', message: 'plain boom' })
    // None of the discriminated fields populated
    expect(ev.code).toBeUndefined()
    expect(ev.provider).toBeUndefined()
    expect(ev.retriable).toBeUndefined()
    expect(ev.retryAfterMs).toBeUndefined()
  })

  it('test_falls_back_for_string_throw — string thrown', () => {
    const ev = errorToEvent('a string')
    expect(ev).toEqual({ type: 'error', message: 'a string' })
  })

  // EC-6 (SHOULD TEST)
  it('test_type_guard_matches_minimal_agent_run_error — only code required', () => {
    const minimal = new FakeAgentRunError({ message: 'minimal', code: 'auth' })
    // provider, retriable, retryAfterMs all undefined
    const ev = errorToEvent(minimal)
    expect(ev.code).toBe('auth')
    expect(ev.message).toBe('minimal')
    expect(ev.provider).toBeUndefined()
    expect(ev.retriable).toBeUndefined()
  })

  // EC-7 — forward-compat unknown code
  it('test_unknown_code_preserved (EC-7) — future SDK code flows through', () => {
    const err = new FakeAgentRunError({
      message: 'new code',
      code: 'content_filter', // hypothetical future code
    })
    const ev = errorToEvent(err)
    expect(ev.code).toBe('content_filter')
  })

  it('test_id_propagated_when_provided', () => {
    const err = new FakeAgentRunError({ message: 'x', code: 'auth' })
    const ev = errorToEvent(err, 'err-1')
    expect(ev.id).toBe('err-1')
  })
})
