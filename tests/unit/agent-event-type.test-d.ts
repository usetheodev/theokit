import { describe, it, expectTypeOf } from 'vitest'
import type {
  AgentEvent,
  AgentMessageEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentErrorEvent,
  AgentRunErrorCode,
} from '../../packages/theo/src/server/agent/agent-types.js'
import type { AgentEvent as AgentEventClient } from '../../packages/theo/src/client/index.js'

describe('AgentEvent runtime variant (T1.1 — standalone in TheoKit, no TheoUI coupling)', () => {
  it('AgentEvent is a discriminated union of 4 variants', () => {
    expectTypeOf<AgentEvent>().toExtend<
      AgentMessageEvent | AgentToolCallEvent | AgentToolResultEvent | AgentErrorEvent
    >()
  })

  it('message event has type and content fields', () => {
    expectTypeOf<AgentMessageEvent>().toExtend<{
      type: 'message'
      content: string
    }>()
  })

  it('tool_call event has type, name, args fields', () => {
    expectTypeOf<AgentToolCallEvent>().toExtend<{
      type: 'tool_call'
      name: string
      args: Record<string, unknown>
    }>()
  })

  it('tool_result event has type, name, data fields', () => {
    expectTypeOf<AgentToolResultEvent>().toExtend<{
      type: 'tool_result'
      name: string
      data: unknown
    }>()
  })

  it('error event has type and message fields', () => {
    expectTypeOf<AgentErrorEvent>().toExtend<{
      type: 'error'
      message: string
    }>()
  })

  // Phase 1 — Production-Readiness #3: error discrimination fields
  it('test_agent_error_event_has_optional_code (Phase 1)', () => {
    const ev: AgentErrorEvent = { type: 'error', message: 'x' }
    expectTypeOf(ev.code).toEqualTypeOf<AgentRunErrorCode | undefined>()
  })

  it('test_agent_error_event_has_optional_provider (Phase 1)', () => {
    const ev: AgentErrorEvent = { type: 'error', message: 'x' }
    expectTypeOf(ev.provider).toEqualTypeOf<string | undefined>()
  })

  it('test_agent_error_event_has_optional_retriable (Phase 1)', () => {
    const ev: AgentErrorEvent = { type: 'error', message: 'x' }
    expectTypeOf(ev.retriable).toEqualTypeOf<boolean | undefined>()
  })

  it('test_agent_error_event_has_optional_retry_after_ms (Phase 1)', () => {
    const ev: AgentErrorEvent = { type: 'error', message: 'x' }
    expectTypeOf(ev.retryAfterMs).toEqualTypeOf<number | undefined>()
  })

  it('test_agent_error_event_backward_compat — legacy shape still typechecks', () => {
    const legacy: AgentErrorEvent = { type: 'error', message: 'legacy' }
    expectTypeOf(legacy).toExtend<AgentErrorEvent>()
  })

  // EC-7 forward-compat (SHOULD TEST)
  it('test_agent_run_error_code_accepts_unknown_string (EC-7)', () => {
    // Hypothetical future SDK code not in the local union.
    // The `(string & {})` fallback in AgentRunErrorCode means assigning ANY
    // string is accepted at the type level (forward-compat) — autocompletion
    // for known codes still works because the union types appear first.
    const c1: AgentRunErrorCode = 'auth' // known code
    const c2: AgentRunErrorCode = 'future_unmapped_code_xyz' // unknown — must accept
    expectTypeOf(c1).toExtend<string>()
    expectTypeOf(c2).toExtend<string>()
  })

  it('AgentEvent is re-exported from theokit/client', () => {
    expectTypeOf<AgentEventClient>().toEqualTypeOf<AgentEvent>()
  })
})
