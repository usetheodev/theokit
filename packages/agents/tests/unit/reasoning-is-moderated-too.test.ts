/**
 * B-014 — an output guard never saw the model's reasoning.
 *
 * `agent-runner.ts` handed `moderateOutputStream` an `extractText` matching `text_delta` and nothing
 * else, while `thinking` is a public `AgentStreamEvent` that reaches the client like any other.
 * Measured before this: a guard declared over the agent's output, and
 * `thinking "the key is sk-abc123"` delivered verbatim.
 *
 * The third channel of a shape this cycle has now fixed twice — a redaction computed and discarded,
 * and `delegate()` consulting no guards at all. Each time the operator declared a guard, the run was
 * green, and one path the client reads was untouched.
 *
 * The fix is TWO passes and not a wider matcher, which is the part worth not re-deriving: two kinds
 * under one `extractText` COLLAPSE into one event, so the reasoning would be promoted into a visible
 * one — a disclosure created by the moderation. `test_widening_one_extractor_collapses_the_kinds`
 * in `guardrails-output-stream.test.ts` pins that.
 */
import { describe, expect, it, vi } from 'vitest'

interface Ev {
  type: string
  [k: string]: unknown
}

const h = vi.hoisted(() => ({ rounds: [] as Ev[][], calls: 0 }))

vi.mock('../../src/bridge/sdk-adapter.js', () => ({
  createSdkAgentStream:
    () =>
    (_m: string, _s: string): AsyncIterable<Ev> => {
      const ev = h.rounds[Math.min(h.calls, h.rounds.length - 1)] ?? []
      h.calls += 1
      return (async function* () {
        for (const e of ev) yield e
      })()
    },
}))

const { AgentRunner } = await import('../../src/loop/agent-runner.js')
const { applyCapabilities } = await import('../../src/capability/capability.js')
const { ModelCapability } = await import('../../src/capability/capabilities.js')
const { MainLoopCapability, GuardrailsCapability } =
  await import('../../src/capability/agent-capabilities.js')
const { GuardrailViolationError } = await import('../../src/guardrails/index.js')

const redactor = {
  name: 'redactor',
  checkOutput: (t: string) => ({ action: 'redact' as const, text: t.replace(/sk-\w+/g, '[R]') }),
}

function script(rounds: Ev[][]): void {
  h.rounds = rounds
  h.calls = 0
}

function runnerWith(guards?: readonly { name: string }[]): InstanceType<typeof AgentRunner> {
  const caps = [new ModelCapability('m'), new MainLoopCapability({ maxIterations: 1 })]
  if (guards) caps.push(new GuardrailsCapability(guards as never) as never)
  return AgentRunner.fromSpec({
    compiled: applyCapabilities(caps),
    name: 'a',
    strategy: 'simple-chat',
    maxIterations: 1,
  }).build()
}

async function drain(
  gen: AsyncGenerator<unknown, { response: string }>,
): Promise<{ events: Ev[]; result: { response: string } }> {
  const events: Ev[] = []
  let s = await gen.next()
  while (!s.done) {
    events.push(s.value as Ev)
    s = await gen.next()
  }
  return { events, result: s.value }
}

const SECRET_IN_REASONING: Ev[] = [
  { type: 'thinking', content: 'the key is sk-abc123, I must not say it' },
  { type: 'text_delta', content: 'Here is your answer.' },
  { type: 'done' },
]

describe('an output guard reaches the reasoning too', () => {
  it('test_a_secret_in_reasoning_is_redacted_before_the_client_sees_it', async () => {
    script([SECRET_IN_REASONING])
    const { events } = await drain(runnerWith([redactor]).stream('hi', { apiKey: 'k' }) as never)

    expect(JSON.stringify(events), 'the operator declared a guard over the output').not.toContain(
      'sk-abc123',
    )
  })

  it('test_reasoning_stays_a_thinking_event_and_does_not_become_visible_text', async () => {
    // FR-002. Widening one `extractText` over both kinds would also remove the secret — by
    // COLLAPSING the two events into one, which promotes the reasoning into visible output. The
    // kinds and their count are asserted so that "fix" cannot pass as this one.
    script([SECRET_IN_REASONING])
    const { events } = await drain(runnerWith([redactor]).stream('hi', { apiKey: 'k' }) as never)

    expect(events.map((e) => e.type)).toEqual(['thinking', 'text_delta', 'done'])
    expect(events[0]?.content).toBe('the key is [R], I must not say it')
    expect(events[1]?.content).toBe('Here is your answer.')
  })

  it('test_a_block_on_reasoning_emits_nothing_at_all', async () => {
    script([SECRET_IN_REASONING])
    const blocker = { name: 'b', checkOutput: () => ({ action: 'block' as const, reason: 'no' }) }

    await expect(
      drain(runnerWith([blocker]).stream('hi', { apiKey: 'k' }) as never),
    ).rejects.toBeInstanceOf(GuardrailViolationError)
  })

  it('test_the_aggregate_response_comes_from_the_visible_channel_not_the_reasoning', async () => {
    // FR-004, and the assertion matters more than it looks. `response` accumulates from `text_delta`
    // upstream, so the VISIBLE pass owns it and the reasoning pass must pass the result through.
    //
    // An earlier version of this test counted markers from an appending guard and did NOT catch the
    // mutation: when the reasoning pass also writes the aggregate it REPLACES `response` with the
    // moderated reasoning rather than double-marking it, so the count stayed at one. The failure
    // mode is substitution, so substitution is what is asserted.
    script([SECRET_IN_REASONING])
    const { result } = await drain(runnerWith([redactor]).stream('hi', { apiKey: 'k' }) as never)

    expect(result.response, 'the aggregate is the visible answer').toBe('Here is your answer.')
    expect(result.response, 'not the reasoning, even redacted').not.toContain('the key is')
  })

  it('test_a_runner_with_no_output_guard_is_untouched', async () => {
    script([SECRET_IN_REASONING])
    const { events } = await drain(runnerWith().stream('hi', { apiKey: 'k' }) as never)

    expect(events).toEqual(SECRET_IN_REASONING)
  })
})
