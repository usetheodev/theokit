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
/**
 * These fixtures return a marker string ('RESULT'), not moderated text, so keeping it is correct
 * rather than a no-op. `test_the_aggregate_return_value_is_moderated_too` is the one that carries
 * real text, and it is what pins the second channel.
 */
const keepResult = <R>(_moderated: string, result: R): R => result

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
      moderateOutputStream(source(events), guards, extractText, rebuildText, keepResult),
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
    const gen = moderateOutputStream(source(events), guards, extractText, rebuildText, keepResult)
    await expect(collect(gen)).rejects.toBeInstanceOf(GuardrailViolationError)
  })

  it('is a transparent pass-through (streaming preserved) when no output guard is present', async () => {
    const inputOnly: Guardrail = { name: 'in', checkInput: () => ({ action: 'allow' }) }
    const events = [{ type: 'text_delta', content: 'x' }, { type: 'done' }]
    const { events: out } = await collect(
      moderateOutputStream(source(events), [inputOnly], extractText, rebuildText, keepResult),
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
        keepResult,
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
        keepResult,
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
      // `R` here is a marker string, not moderated text — identity is correct, not a no-op.
      (_t, r) => r,
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
    // What `replaced` actually buys, stated correctly after a fourth review round caught the
    // earlier wording asserting the opposite of what this very fixture produces.
    //
    // It does NOT stop a cross-kind collapse. Measured: two text-carrying kinds still collapse into
    // one event — see `test_matching_two_kinds_collapses_them_and_that_is_the_contract` below. What
    // it buys is that the SURVIVING event keeps the kind and metadata of the one it replaces,
    // rather than being rebuilt from the text alone.
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
      // `R` here is a marker string, not moderated text — identity is correct, not a no-op.
      (_t, r) => r,
    )
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }
    // The kind of the LAST text-carrying event survives, and so does its `id`.
    expect(out.map((e) => e.type)).toEqual(['message'])
    expect(out[0]?.id).toBe('m2')
    expect(out[0]?.content).toBe('the key is [R] visible')
  })

  it('test_a_channel_the_stream_does_not_carry_is_absent_not_empty', async () => {
    // THIS TEST ASSERTED THE OPPOSITE for one round, and the reversal is the point.
    //
    // It pinned that a guard turning `''` into text owed the client that text, reasoned from B-012's
    // thesis: a computed redaction must not be discarded. That reasoning was right for a SINGLE
    // pass over a stream that genuinely had no text.
    //
    // Composing two passes, one per event kind, made every ordinary stream have an absent channel —
    // and then measured: a guard that rewrites unconditionally emitted a PHANTOM `thinking` event
    // after the terminal `done`, every guard was consulted twice per turn (doubling a paid
    // moderation call), and a predicate flagging blank input blocked every turn outright.
    //
    // A channel the stream does not carry is ABSENT. Moderating absence produces content the model
    // never wrote.
    const notice: Guardrail = {
      name: 'notice',
      checkOutput: (t) => ({ action: 'redact', text: t === '' ? 'NOTICE' : t }),
    }
    // eslint-disable-next-line require-yield, sonarjs/generator-without-yield
    async function* empty(): AsyncGenerator<Ev, string> {
      return 'done'
    }
    const out: Ev[] = []
    const g = moderateOutputStream(empty(), [notice], (e) => e.content, rebuildText, keepResult)
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }

    expect(out, 'nothing carried text, so nothing is invented').toEqual([])
  })

  it('test_matching_two_kinds_collapses_them_and_that_is_the_contract', async () => {
    // Pinned because three documents claimed the opposite. `extractText` matching two kinds does
    // NOT keep them apart — they collapse into one event, and if one of them was reasoning, the
    // reasoning ends up inside a visible event. That is why the docblock requires exactly one kind
    // rather than suggesting it, and why a consumer who wants reasoning moderated runs a SECOND
    // pass over that kind instead of widening one extractor.
    async function* twoKinds(): AsyncGenerator<Ev, string> {
      yield { type: 'thinking', content: 'CoT: the key is sk-abc' }
      yield { type: 'message', content: ' Here you go.' }
      return 'done'
    }
    const out: Ev[] = []
    const g = moderateOutputStream(
      twoKinds(),
      [redactor],
      (e) => e.content,
      (content, replaced) => ({ ...replaced, type: replaced?.type ?? 'text_delta', content }),
      keepResult,
    )
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }

    expect(out).toHaveLength(1)
    expect(out[0]?.type, 'the surviving kind is the LAST text-carrying one').toBe('message')
    expect(
      out[0]?.content,
      'the reasoning is inside a visible event — the collapse `replaced` does not prevent',
    ).toBe('CoT: the key is [R] Here you go.')
  })

  it('test_the_aggregate_return_value_is_moderated_too', async () => {
    // The fourth-round BLOCKER, pinned where it can be seen cheapest. Every earlier test in this
    // file returned a marker string nobody asserted on, so a stream could redact its EVENTS and
    // return the original text — which is what `run()` hands the caller.
    async function* withAggregate(): AsyncGenerator<Ev, { response: string }> {
      yield { type: 'text_delta', content: 'the key is ' }
      yield { type: 'text_delta', content: 'sk-abc' }
      return { response: 'the key is sk-abc' }
    }
    const g = moderateOutputStream(
      withAggregate(),
      [redactor],
      (e) => e.content,
      (content) => ({ type: 'text_delta', content }),
      (content, result) => ({ ...result, response: content }),
    )
    let s2 = await g.next()
    while (!s2.done) s2 = await g.next()
    expect(s2.value.response).toBe('the key is [R]')
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
      // `R` here is a marker string, not moderated text — identity is correct, not a no-op.
      (_t, r) => r,
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

  it('test_a_tool_only_round_is_not_given_reasoning_it_never_had', async () => {
    // Renamed from `test_a_guard_may_add_text_to_a_stream_that_had_none`, which asserted the
    // opposite and was measured to be the wrong contract — see the test above for why the reversal.
    //
    // This is the shape that made it visible: `[tool_call]` with an unconditionally-rewriting guard
    // produced `[tool_call, text('<!>')]`. Under the two-pass composition in `agent-runner` that
    // happens on EVERY stream with no reasoning, which is the common case, and the phantom arrives
    // after the `done` frame clients key terminal state on.
    const rewriter: Guardrail = {
      name: 'disclaimer',
      checkOutput: (t) => ({ action: 'redact', text: `${t}<!>` }),
    }
    async function* toolOnly(): AsyncGenerator<Ev, string> {
      yield { type: 'tool_call' }
      return 'done'
    }
    const seen: (Ev | undefined)[] = []
    const out: Ev[] = []
    const g = moderateOutputStream(
      toolOnly(),
      [rewriter],
      (e) => e.content,
      (content, replaced) => {
        seen.push(replaced)
        return { type: 'text_delta', content }
      },
      keepResult,
    )
    let s2 = await g.next()
    while (!s2.done) {
      out.push(s2.value)
      s2 = await g.next()
    }

    expect(
      out.map((e) => e.type),
      'the tool call, and nothing invented',
    ).toEqual(['tool_call'])
    expect(seen, 'rebuildText is never called for a channel that is not there').toEqual([])
  })
})
