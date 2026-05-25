import { describe, expectTypeOf, it } from 'vitest'

import { streamAgentRun } from '../../packages/theo/src/server/agent/stream-agent-run.js'
import type { AgentRunLike } from '../../packages/theo/src/server/agent/stream-agent-run.js'
import type { AgentEvent } from '../../packages/theo/src/server/agent/agent-types.js'

/**
 * T2.1 — streamAgentRun type tests.
 *
 * Pins the return type and the accepted Run shape.
 */

describe('streamAgentRun (types)', () => {
  it('returns AsyncGenerator<AgentEvent, void, unknown>', () => {
    const run: AgentRunLike = {
      stream: () =>
        (async function* () {
          yield { type: 'assistant', message: { role: 'assistant', content: [] } }
        })(),
      wait: async () => ({ status: 'finished' as const }),
    }
    const gen = streamAgentRun(run)
    expectTypeOf(gen).toEqualTypeOf<AsyncGenerator<AgentEvent, void, unknown>>()
  })

  it('accepts any structurally-compatible Run (e.g. an SDK Run)', () => {
    // Simulate the SDK's Run shape — extra properties allowed because
    // AgentRunLike is structural.
    interface MoreFields {
      id: string
      agentId: string
      stream: () => AsyncIterable<{ type: string }>
      wait: () => Promise<{ status: 'finished' | 'error' | 'cancelled' }>
    }
    const sdkLike: MoreFields = {
      id: 'r-1',
      agentId: 'a-1',
      stream: () =>
        (async function* () {
          yield { type: 'system' }
        })(),
      wait: async () => ({ status: 'finished' }),
    }
    // No `as` cast — must compile due to structural matching.
    expectTypeOf(streamAgentRun(sdkLike)).toEqualTypeOf<AsyncGenerator<AgentEvent, void, unknown>>()
  })
})
