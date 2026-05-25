import { describe, it, expectTypeOf } from 'vitest'
import type {
  AgentEvent,
  AgentMessageEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentErrorEvent,
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

  it('AgentEvent is re-exported from theokit/client', () => {
    expectTypeOf<AgentEventClient>().toEqualTypeOf<AgentEvent>()
  })
})
