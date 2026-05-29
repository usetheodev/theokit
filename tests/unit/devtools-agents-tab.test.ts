/**
 * theokit-evolution-ci-and-dx Phase 3 (T3.2) — AgentsTab unit tests.
 *
 * Validates:
 *   - dispatcher.onAgentRun queues + flushes on setDispatch
 *   - reducer AGENT_RUN_ADD appends + RESET_AGENT_RUNS clears
 *   - ring buffer cap preserved
 *   - initial state has empty agentRuns
 *
 * E2E rendering coverage lives in tests/e2e/devtools-agents-tab.spec.ts
 * (Playwright) — this file is the unit-level contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatcher } from '../../packages/theo/src/devtools/dispatcher.js'
import { devtoolsReducer } from '../../packages/theo/src/devtools/reducer.js'
import {
  type AgentRunRecord,
  RING_BUFFER_CAP,
  initialState,
} from '../../packages/theo/src/devtools/shared.js'

beforeEach(() => {
  dispatcher._reset()
})

afterEach(() => {
  dispatcher._reset()
})

function makeRun(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: `run-${String(Math.random()).slice(2, 8)}`,
    timestamp: Date.now(),
    userId: 'alice@example.com',
    model: 'gpt-4o-mini',
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0.0001,
    status: 'finished',
    ...overrides,
  }
}

describe('dispatcher.onAgentRun (T3.1 wire)', () => {
  it('queues agent run before setDispatch + flushes on registration', () => {
    const run = makeRun()
    dispatcher.onAgentRun(run)
    expect(dispatcher._queueLength()).toBe(1)

    const d = vi.fn()
    dispatcher.setDispatch(d)
    expect(d).toHaveBeenCalledTimes(1)
    expect(d).toHaveBeenCalledWith({ type: 'AGENT_RUN_ADD', run })
  })

  it('dispatches immediately after setDispatch wired', () => {
    const d = vi.fn()
    dispatcher.setDispatch(d)
    const run = makeRun({ userId: 'bob' })
    dispatcher.onAgentRun(run)
    expect(d).toHaveBeenCalledWith({ type: 'AGENT_RUN_ADD', run })
  })
})

describe('reducer AGENT_RUN_ADD / RESET_AGENT_RUNS', () => {
  it('initial state has empty agentRuns', () => {
    expect(initialState.agentRuns).toEqual([])
  })

  it('AGENT_RUN_ADD appends to head (newest first)', () => {
    const r1 = makeRun({ id: 'r1' })
    const r2 = makeRun({ id: 'r2' })
    let state = devtoolsReducer(initialState, { type: 'AGENT_RUN_ADD', run: r1 })
    state = devtoolsReducer(state, { type: 'AGENT_RUN_ADD', run: r2 })
    expect(state.agentRuns.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('caps agentRuns at RING_BUFFER_CAP (v1.1 EC-10 perf invariant)', () => {
    let state = initialState
    for (let i = 0; i < RING_BUFFER_CAP + 10; i++) {
      state = devtoolsReducer(state, { type: 'AGENT_RUN_ADD', run: makeRun({ id: `r${i}` }) })
    }
    expect(state.agentRuns.length).toBe(RING_BUFFER_CAP)
    // newest 50 kept, oldest 10 evicted
    expect(state.agentRuns[0]?.id).toBe(`r${RING_BUFFER_CAP + 10 - 1}`)
  })

  it('RESET_AGENT_RUNS clears all runs', () => {
    const r = makeRun()
    let state = devtoolsReducer(initialState, { type: 'AGENT_RUN_ADD', run: r })
    expect(state.agentRuns.length).toBe(1)
    state = devtoolsReducer(state, { type: 'RESET_AGENT_RUNS' })
    expect(state.agentRuns).toEqual([])
  })

  it('AGENT_RUN_ADD does not mutate other state slices', () => {
    const before = devtoolsReducer(initialState, {
      type: 'REQUEST_ADD',
      request: {
        id: 'req1',
        traceId: 't',
        method: 'GET',
        path: '/x',
        status: 200,
        durationMs: 1,
        startedAt: 0,
      },
    })
    const after = devtoolsReducer(before, { type: 'AGENT_RUN_ADD', run: makeRun() })
    expect(after.requests).toEqual(before.requests)
    expect(after.errors).toEqual(before.errors)
  })
})
