import { describe, expect, it } from 'vitest'

import { moderateOutputStream } from '../../src/guardrails/index.js'
import type { Guardrail } from '../../src/guardrails/index.js'
import { textPayloadExtractor, UnreadableTextPayloadError } from '../../src/guardrails/index.js'

/**
 * A text event whose `content` was not a string skipped moderation entirely and was delivered.
 *
 * Both extractors test `typeof e.content === 'string'`. A `text_delta` or `thinking` carrying
 * anything else returns `undefined`, which `moderateOutputStream` reads as "this event carries no
 * text" — so the event is never accumulated, never shown to a guard, and yielded VERBATIM.
 *
 * The failure direction is DELIVER, not block. A guard declared to stop a payload silently never
 * sees it, and the run reports green. `StreamEvent` is `{ type: string; [key: string]: unknown }`
 * and `event-translator.ts` casts an unvalidated provider content block to `{ text?: string }`, so a
 * provider returning a non-string lands here; a consumer-supplied `streamFactory` is a public option
 * and reaches it trivially.
 *
 * ## Refused, not coerced
 *
 * Coercing would moderate `"[object Object]"` — a guard consulted about a string the model never
 * produced, returning a verdict about nothing, while the real payload rides along underneath. That
 * is the same shape as the redaction that was computed and discarded, with an extra step.
 *
 * The refusal only reaches runs that DECLARED an output guard: `moderateOutputStream` is a
 * transparent pass-through when no guard defines `checkOutput`, so the extractor is never consulted
 * otherwise. An agent with no guards is unaffected by construction.
 */
const REDACT: Guardrail = {
  name: 'redact',
  checkOutput: (text) => ({ action: 'redact' as const, text: text.replace('secret', '[R]') }),
}

interface Ev {
  type: string
  content?: unknown
}

// The PRODUCT's extractor, not a copy of its logic. The first version of this file defined its own
// and therefore tested itself: the defect lived in two hand-written copies of
// `typeof e.content === 'string'`, so a test that writes a third proves nothing about either.
const extract = textPayloadExtractor<Ev>('text_delta', (e) => e.content)

async function run(events: Ev[], guards: readonly Guardrail[]): Promise<Ev[]> {
  const src = (async function* (): AsyncGenerator<Ev, void> {
    for (const e of events) yield e
  })()
  const out: Ev[] = []
  for await (const e of moderateOutputStream(
    src,
    guards,
    extract,
    (content, replaced) => ({ ...replaced, content }),
    (_t, r) => r,
  )) {
    out.push(e)
  }
  return out
}

describe('an unreadable text payload is refused rather than delivered', () => {
  it('throws instead of passing an object through unexamined', async () => {
    await expect(
      run([{ type: 'text_delta', content: { text: 'secret' } }], [REDACT]),
      'a guard declared to stop this payload never saw it, and it reached the client',
    ).rejects.toThrow(UnreadableTextPayloadError)
  })

  it('names the event kind and the type it received', async () => {
    await expect(run([{ type: 'text_delta', content: 42 }], [REDACT])).rejects.toThrow(
      /text_delta[\s\S]*number/,
    )
  })

  it('still moderates an ordinary string', async () => {
    // The control. A change that refused everything would satisfy both tests above and stop
    // moderation working at all.
    const out = await run([{ type: 'text_delta', content: 'a secret here' }], [REDACT])
    expect(out.map((e) => e.content)).toEqual(['a [R] here'])
  })

  it('leaves an event of another kind alone', async () => {
    // The second control: `undefined` must keep meaning "not this kind". Collapsing the two would
    // make every tool call an unreadable payload.
    const out = await run(
      [
        { type: 'tool_call', content: { name: 'x' } },
        { type: 'text_delta', content: 'ok' },
      ],
      [REDACT],
    )
    expect(out).toHaveLength(2)
  })

  it('does not consult the extractor when no output guard was declared', async () => {
    // The third control, and the reason this refusal is proportionate. With no `checkOutput`,
    // `moderateOutputStream` is a transparent pass-through — so an agent that declared no guard
    // never meets this error, however malformed the provider's payload is.
    const out = await run([{ type: 'text_delta', content: { text: 'secret' } }], [])
    expect(out).toHaveLength(1)
  })
})
