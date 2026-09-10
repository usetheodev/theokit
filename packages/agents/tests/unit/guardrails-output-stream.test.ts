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
const rebuildText = (content: string, _replaced: Ev | undefined) => ({
  type: 'text_delta',
  content,
})
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
    /** Per-event metadata a redaction must be able to preserve — see the rebuildText test. */
    id?: string
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
    // making sense. Text that PRECEDED a tool call comes out after it, because the moderated string
    // lands on the LAST text event and the guard never saw the boundaries.
    const out = await drive([
      { type: 'text_delta', content: 'tok ' },
      { type: 'tool_call' },
      { type: 'text_delta', content: 'sk-abc' },
    ])
    expect(out.map((e) => e.type)).toEqual(['tool_call', 'text_delta'])
    expect(out[1]?.content).toBe('tok [R]')
  })

  it('test_a_terminator_after_the_last_text_keeps_its_place', async () => {
    // Why LAST beats FIRST, in the one place the difference is observable rather than aesthetic:
    // the moderated text lands on the last TEXT-CARRYING event, not at the end of the stream, so a
    // trailing non-text event still arrives last. FIRST additionally put any completion claim the
    // model made ahead of the work that produced it.
    const out = await drive([
      { type: 'text_delta', content: 'a ' },
      { type: 'tool_call' },
      { type: 'text_delta', content: 'sk-abc' },
      { type: 'done' },
    ])
    expect(out.map((e) => e.type)).toEqual(['tool_call', 'text_delta', 'done'])
  })

  it('test_the_replaced_event_is_handed_to_rebuildText', async () => {
    // The review finding this closes: `extractText` may match SEVERAL event kinds while
    // `rebuildText` builds exactly one. Measured pre-fix — a `thinking` event and a `message`
    // collapsed into a single `text_delta`, promoting the model's private reasoning into visible
    // output. A security fix must not open a disclosure path of its own, so the caller now receives
    // the event being replaced and can keep its kind and its metadata.
    async function* src(): AsyncGenerator<Ev, string> {
      yield { type: 'thinking', content: 'the key is sk-abc' }
      yield { type: 'message', content: ' visible', id: 'm2' }
      return 'done'
    }
    const out: Ev[] = []
    const g = moderateOutputStream(
      src(),
      [redactor],
      (e) => e.content,
      (content, replaced) => ({ ...replaced, type: replaced?.type ?? 'text_delta', content }),
    )
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }
    // The kind survives — reasoning does NOT become visible output — and so does `id`.
    expect(out.map((e) => e.type)).toEqual(['message'])
    expect(out[0]?.id).toBe('m2')
    expect(out[0]?.content).toBe('the key is [R] visible')
  })

  it('test_an_empty_stream_moderated_into_text_hands_undefined_to_rebuildText', async () => {
    // The one case where `replaced` is undefined, and the reason the signature admits it instead of
    // asserting it away: nothing was buffered, so there is no event whose kind or metadata could be
    // preserved. Discarding the moderation here would be B-012's own defect one layer down.
    const notice: Guardrail = {
      name: 'notice',
      checkOutput: (t) => ({ action: 'redact', text: t === '' ? 'NOTICE' : t }),
    }
    // Yielding nothing IS the case under test: a stream that carried no event at all.
    // eslint-disable-next-line require-yield, sonarjs/generator-without-yield
    async function* empty(): AsyncGenerator<Ev, string> {
      return 'done'
    }
    const seen: (Ev | undefined)[] = []
    const out: Ev[] = []
    const g = moderateOutputStream(
      empty(),
      [notice],
      (e) => e.content,
      (content, replaced) => {
        seen.push(replaced)
        return { type: 'text_delta', content }
      },
    )
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }
    expect(seen).toEqual([undefined])
    expect(out).toEqual([{ type: 'text_delta', content: 'NOTICE' }])
  })

  it('test_an_equal_but_newly_allocated_string_takes_the_fast_path', async () => {
    // `moderated === accumulated` compares string PRIMITIVES, so value equality is what is tested
    // and a guard returning a fresh allocation of the same bytes still replays verbatim. Measured on
    // review and unpinned until now; without this, a future `Object.is`/reference rewrite would
    // silently start collapsing every stream that carries a tool call.
    const identity: Guardrail = {
      name: 'identity',
      checkOutput: (t) => ({ action: 'redact', text: t.split('').join('') }),
    }
    async function* src(): AsyncGenerator<Ev, string> {
      yield { type: 'text_delta', content: 'a' }
      yield { type: 'tool_call' }
      yield { type: 'text_delta', content: 'b' }
      return 'done'
    }
    const out: Ev[] = []
    const g = moderateOutputStream(
      src(),
      [identity],
      (e) => e.content,
      (content) => ({ type: 'text_delta', content }),
    )
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }
    expect(out.map((e) => e.type)).toEqual(['text_delta', 'tool_call', 'text_delta'])
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
    // The tail is reachable: a guard moderating '' into something non-empty owes the client that
    // text, and there is no existing text event to carry it. Note what does NOT reach it — a guard
    // that redacts every text event AWAY still replaces its last text event with `content: ''`.
    //
    // The `replaced` assertion below is the one that matters, and its absence let a real defect
    // through two reviews. This branch passed `buffered[0]` for one round, which for THIS stream is
    // the tool call — an event that is not being replaced and is also still yielded. A caller
    // spreading it, as `test_the_replaced_event_is_handed_to_rebuildText` documents, would emit a
    // second tool call carrying the first one's id and arguments. The suite looked like it covered
    // this branch and pinned nothing on it.
    async function* noText(): AsyncGenerator<Ev, string> {
      yield { type: 'tool_call' }
      return 'done'
    }
    const inject: Guardrail = {
      name: 'i',
      checkOutput: () => ({ action: 'redact', text: 'NOTICE' }),
    }
    const out: Ev[] = []
    const seen: (Ev | undefined)[] = []
    const g = moderateOutputStream(
      noText(),
      [inject],
      (e) => e.content,
      (content, replaced) => {
        seen.push(replaced)
        return { type: 'text_delta', content }
      },
    )
    let s = await g.next()
    while (!s.done) {
      out.push(s.value)
      s = await g.next()
    }
    expect(out.map((e) => e.type)).toEqual(['tool_call', 'text_delta'])
    expect(out[1]?.content).toBe('NOTICE')
    expect(seen, 'a non-text event is not "the event being replaced"').toEqual([undefined])
  })
})
