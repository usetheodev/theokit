import { describe, expect, it, vi } from 'vitest'

import { streamAgentRun } from '../../packages/theo/src/server/agent/stream-agent-run.js'
import type {
  AgentRunLike,
  AgentRunResult,
  AgentRunStreamMessage,
} from '../../packages/theo/src/server/agent/stream-agent-run.js'
import type { AgentEvent } from '../../packages/theo/src/server/agent/agent-types.js'

/**
 * T2.1 — streamAgentRun unit tests.
 *
 * Mock Run: plain object with `stream` (async generator) and `wait` (Promise).
 * No live network. No SDK runtime dependency at test-time.
 */

function mockRun(
  messages: AgentRunStreamMessage[],
  result: AgentRunResult = { status: 'finished' },
): AgentRunLike & { waitSpy: ReturnType<typeof vi.fn> } {
  const waitSpy = vi.fn(async () => result)
  async function* stream() {
    for (const m of messages) yield m
  }
  return {
    stream,
    wait: waitSpy,
    waitSpy,
  }
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

describe('streamAgentRun', () => {
  it('yields message event for assistant text block', async () => {
    const run = mockRun([
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'message', content: 'hi' }])
  })

  it('yields tool_call then tool_result for happy lifecycle', async () => {
    const run = mockRun([
      {
        type: 'tool_call',
        status: 'running',
        name: 'greet',
        args: { name: 'world' },
        call_id: 'c1',
      },
      {
        type: 'tool_call',
        status: 'completed',
        name: 'greet',
        result: 'Hello, world!',
        call_id: 'c1',
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([
      { type: 'tool_call', name: 'greet', args: { name: 'world' }, id: 'c1' },
      { type: 'tool_result', name: 'greet', data: 'Hello, world!', id: 'c1' },
    ])
  })

  it('yields error event for tool_call status=error', async () => {
    const run = mockRun([
      {
        type: 'tool_call',
        status: 'error',
        name: 'greet',
        result: 'invalid input',
        call_id: 'c2',
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'error', message: 'invalid input', id: 'c2' }])
  })

  it('yields terminal error when run.wait() resolves status=error', async () => {
    const run = mockRun([], {
      status: 'error',
      error: { message: 'auth failed', code: 'llm_4xx' },
    })
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'error', message: 'auth failed' }])
  })

  it('does not yield for empty assistant text block', async () => {
    const run = mockRun([
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: '' }] },
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([])
  })

  it('does not yield for internal SDK message types', async () => {
    const run = mockRun([
      { type: 'system', subtype: 'init', agent_id: 'a', run_id: 'r' },
      { type: 'thinking', agent_id: 'a', run_id: 'r', text: 't' },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'RUNNING' },
      { type: 'task', agent_id: 'a', run_id: 'r' },
      { type: 'request', agent_id: 'a', run_id: 'r', request_id: 'req-1' },
      { type: 'object_delta', agent_id: 'a', run_id: 'r', partial: {}, attempt: 0 },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([])
  })

  it('does not yield terminal error on cancelled run', async () => {
    const run = mockRun([], { status: 'cancelled' })
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([])
  })

  it('defaults tool error message when result is undefined', async () => {
    const run = mockRun([{ type: 'tool_call', status: 'error', name: 'greet', call_id: 'c1' }])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'error', message: 'Tool greet failed', id: 'c1' }])
  })

  // EC-1 — non-JSON-serializable tool result
  it('EC-1 — coerces bigint tool result to [Unserializable]', async () => {
    const run = mockRun([
      {
        type: 'tool_call',
        status: 'completed',
        name: 't',
        result: 42n,
        call_id: 'c1',
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'tool_result', name: 't', data: '[Unserializable]', id: 'c1' }])
  })

  it('EC-1 — coerces circular ref tool result to [Unserializable]', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const run = mockRun([
      {
        type: 'tool_call',
        status: 'completed',
        name: 't',
        result: circular,
        call_id: 'c1',
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events[0]).toMatchObject({ type: 'tool_result', name: 't', data: '[Unserializable]' })
  })

  it('EC-1 — serializes plain object tool result', async () => {
    const run = mockRun([
      {
        type: 'tool_call',
        status: 'completed',
        name: 't',
        result: { ok: true },
        call_id: 'c2',
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'tool_result', name: 't', data: '{"ok":true}', id: 'c2' }])
  })

  // EC-3 — args type-guard
  it('EC-3 — safeArgs returns {} for null args', async () => {
    const run = mockRun([
      { type: 'tool_call', status: 'running', name: 't', args: null, call_id: 'c1' },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'tool_call', name: 't', args: {}, id: 'c1' }])
  })

  it('EC-3 — safeArgs returns {} for array args', async () => {
    const run = mockRun([
      { type: 'tool_call', status: 'running', name: 't', args: [1, 2, 3], call_id: 'c1' },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'tool_call', name: 't', args: {}, id: 'c1' }])
  })

  it('EC-3 — safeArgs returns {} for primitive args', async () => {
    const run = mockRun([
      { type: 'tool_call', status: 'running', name: 't', args: 'str', call_id: 'c1' },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([{ type: 'tool_call', name: 't', args: {}, id: 'c1' }])
  })

  // EC-4 — interleaved assistant + tool lifecycle
  it('EC-4 — preserves interleaved assistant text + tool lifecycle order', async () => {
    const run = mockRun([
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'let me check' }] },
      },
      {
        type: 'tool_call',
        status: 'running',
        name: 'current_time',
        args: {},
        call_id: 'c1',
      },
      {
        type: 'tool_call',
        status: 'completed',
        name: 'current_time',
        result: '12:00',
        call_id: 'c1',
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: "It's noon" }] },
      },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([
      { type: 'message', content: 'let me check' },
      { type: 'tool_call', name: 'current_time', args: {}, id: 'c1' },
      { type: 'tool_result', name: 'current_time', data: '12:00', id: 'c1' },
      { type: 'message', content: "It's noon" },
    ])
  })

  // EC-5 — no dedup at adapter level
  it('EC-5 — does not dedup duplicate call_id across two running messages', async () => {
    const run = mockRun([
      { type: 'tool_call', status: 'running', name: 'x', args: {}, call_id: 'c1' },
      { type: 'tool_call', status: 'running', name: 'x', args: {}, call_id: 'c1' },
    ])
    const events = await collect(streamAgentRun(run))
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.type === 'tool_call')).toBe(true)
  })

  // EC-8 — consumer abort doesn't await wait()
  it('EC-8 — does not call run.wait() when consumer returns early', async () => {
    const run = mockRun([
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'first' }] },
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] },
      },
    ])
    const gen = streamAgentRun(run)
    const first = await gen.next()
    expect(first.value).toEqual({ type: 'message', content: 'first' })
    // Consumer aborts after first yield
    await gen.return()
    expect(run.waitSpy).not.toHaveBeenCalled()
  })

  it('does not yield terminal error when wait() returns error but error field is undefined (malformed)', async () => {
    const run = mockRun([], { status: 'error' }) // missing error field
    const events = await collect(streamAgentRun(run))
    expect(events).toEqual([])
  })
})
