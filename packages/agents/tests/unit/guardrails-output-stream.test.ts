/**
 * M9 — output guards on a stream: moderate the FULL accumulated output BEFORE any event
 * reaches the client (buffer → moderate → replay, or throw on block). This is the honest
 * "blocked before reaching the client" semantics the DoD requires — streaming is traded for
 * safety only when an output guard is present.
 */
import { describe, expect, it } from 'vitest'

import { moderateOutputStream } from '../../src/guardrails/stream.js'
import {
  GuardrailViolationError,
  outputModeration,
  type Guardrail,
} from '../../src/guardrails/index.js'

interface Ev {
  type: string
  content?: string
}

async function* source(events: Ev[], ret = 'RESULT'): AsyncGenerator<Ev, string> {
  for (const e of events) yield e
  return ret
}

/** B-012 made this argument required, so a redaction cannot be computed and dropped. */
const rebuildText = (content: string) => ({ type: 'text_delta', content })
const extractText = (e: Ev): string | undefined => (e.type === 'text_delta' ? e.content : undefined)

async function collect<E, R>(gen: AsyncGenerator<E, R>): Promise<{ events: E[]; ret: R }> {
  const events: E[] = []
  let r = await gen.next()
  while (!r.done) {
    events.push(r.value)
    r = await gen.next()
  }
  return { events, ret: r.value }
}

describe('moderateOutputStream', () => {
  it('passes every event through and preserves the return value when output is clean', async () => {
    const guards: Guardrail[] = [outputModeration({ moderate: () => false })]
    const events = [
      { type: 'text_delta', content: 'hello ' },
      { type: 'text_delta', content: 'world' },
      { type: 'done' },
    ]
    const { events: out, ret } = await collect(
      moderateOutputStream(source(events), guards, extractText, rebuildText),
    )
    expect(out).toEqual(events)
    expect(ret).toBe('RESULT')
  })

  it('BLOCKS: throws before emitting any event when the accumulated output is flagged', async () => {
    const guards: Guardrail[] = [outputModeration({ moderate: (t) => t.includes('secret') })]
    const events = [
      { type: 'text_delta', content: 'the secret ' },
      { type: 'text_delta', content: 'is 42' },
      { type: 'done' },
    ]
    const gen = moderateOutputStream(source(events), guards, extractText, rebuildText)
    await expect(collect(gen)).rejects.toBeInstanceOf(GuardrailViolationError)
  })

  it('is a transparent pass-through (streaming preserved) when no output guard is present', async () => {
    const inputOnly: Guardrail = { name: 'in', checkInput: () => ({ action: 'allow' }) }
    const events = [{ type: 'text_delta', content: 'x' }, { type: 'done' }]
    const { events: out } = await collect(
      moderateOutputStream(source(events), [inputOnly], extractText, rebuildText),
    )
    expect(out).toEqual(events)
  })
})

describe('B-012 — a computed redaction reaches the client', () => {
  interface Ev {
    type: string
    content?: string
  }
  async function* source(): AsyncGenerator<Ev, string> {
    yield { type: 'text_delta', content: 'the token is ' }
    yield { type: 'tool_call', content: undefined }
    yield { type: 'text_delta', content: 'sk-abc123' }
    return 'done'
  }
  const redactor: Guardrail = {
    name: 'redactor',
    checkOutput: (t) => ({ action: 'redact', text: t.replace(/sk-\w+/, '[REDACTED]') }),
  }
  const collect = async (g: AsyncGenerator<Ev, string>) => {
    const out: Ev[] = []
    let step = await g.next()
    while (!step.done) {
      out.push(step.value)
      step = await g.next()
    }
    return out
  }

  it('test_the_stream_delivers_the_redacted_text', async () => {
    const events = await collect(
      moderateOutputStream(
        source(),
        [redactor],
        (e) => e.content,
        (text) => ({
          type: 'text_delta',
          content: text,
        }),
      ),
    )
    const text = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => e.content)
      .join('')
    expect(text, 'the client received the unredacted secret').toBe('the token is [REDACTED]')
  })

  it('test_non_text_events_survive_a_redaction', async () => {
    const events = await collect(
      moderateOutputStream(
        source(),
        [redactor],
        (e) => e.content,
        (text) => ({
          type: 'text_delta',
          content: text,
        }),
      ),
    )
    expect(
      events.map((e) => e.type),
      'a redaction dropped the tool call',
    ).toContain('tool_call')
  })
})

describe('B-012 — what a redaction costs, pinned', () => {
  interface Ev {
    type: string
    content?: string
  }
  const redactor: Guardrail = {
    name: 'r',
    checkOutput: (t) => ({ action: 'redact', text: t.replace(/sk-\w+/, '[R]') }),
  }
  const drive = async (events: Ev[]) => {
    async function* src(): AsyncGenerator<Ev, string> {
      for (const e of events) yield e
      return 'done'
    }
    const out: Ev[] = []
    const g = moderateOutputStream(
      src(),
      [redactor],
      (e) => e.content,
      (content) => ({ type: 'text_delta', content }),
    )
    let s = await g.next()
    while (!s.done) {
      out.push(s.value)
      s = await g.next()
    }
    return out
  }

  it('test_stream_order_is_not_preserved_across_a_redaction', async () => {
    // Measured, not assumed, and pinned so nobody rediscovers it from a transcript that stopped
    // making sense. Text that FOLLOWED a tool call comes out before it, because the moderated string
    // lands on the first text event and the guard never saw the boundaries.
    const out = await drive([
      { type: 'text_delta', content: 'tok ' },
      { type: 'tool_call' },
      { type: 'text_delta', content: 'sk-abc' },
    ])
    expect(out.map((e) => e.type)).toEqual(['text_delta', 'tool_call'])
    expect(out[0]?.content).toBe('tok [R]')
  })

  it('test_a_non_text_event_is_never_dropped_by_a_redaction', async () => {
    // The half that must hold whatever the ordering does: a redaction may reorder, never delete.
    const out = await drive([
      { type: 'text_delta', content: 'a' },
      { type: 'tool_call' },
      { type: 'text_delta', content: ' sk-abc' },
      { type: 'done' },
    ])
    expect(out.filter((e) => e.type !== 'text_delta').map((e) => e.type)).toEqual([
      'tool_call',
      'done',
    ])
  })

  it('test_a_guard_may_add_text_to_a_stream_that_had_none', async () => {
    // The `if (!emittedText)` tail is reachable: a guard moderating '' into something non-empty owes
    // the client that text, and there is no existing text event to carry it.
    async function* noText(): AsyncGenerator<Ev, string> {
      yield { type: 'tool_call' }
      return 'done'
    }
    const inject: Guardrail = {
      name: 'i',
      checkOutput: () => ({ action: 'redact', text: 'NOTICE' }),
    }
    const out: Ev[] = []
    const g = moderateOutputStream(
      noText(),
      [inject],
      (e) => e.content,
      (content) => ({ type: 'text_delta', content }),
    )
    let s = await g.next()
    while (!s.done) {
      out.push(s.value)
      s = await g.next()
    }
    expect(out.map((e) => e.type)).toEqual(['tool_call', 'text_delta'])
    expect(out[1]?.content).toBe('NOTICE')
  })
})
