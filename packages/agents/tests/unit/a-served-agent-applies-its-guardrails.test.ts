import { describe, expect, it, vi } from 'vitest'

// A TYPE import, hoisted above `vi.mock` without consequence: types are erased, so this does not
// load the module the mock replaces. `import()` type annotations are forbidden by this repo's lint.
import type { Guardrail } from '../../src/guardrails/index.js'

interface FakeStreamEvent {
  type: string
  [key: string]: unknown
}

const h = vi.hoisted(() => ({
  events: [] as FakeStreamEvent[],
  sent: [] as string[],
}))

vi.mock('../../src/bridge/sdk-adapter.js', () => ({
  createSdkAgentStream:
    (_compiled: unknown, _tools: unknown, _apiKey: string, _overrides: unknown = {}) =>
    (message: string): AsyncIterable<FakeStreamEvent> => {
      h.sent.push(message)
      return (async function* () {
        for (const e of h.events) yield e
      })()
    },
}))

const { streamAgentUIMessages } = await import('../../src/bridge/agent-endpoint.js')
const { applyCapabilities } = await import('../../src/capability/capability.js')
const { ModelCapability } = await import('../../src/capability/capabilities.js')
const { GuardrailsCapability } = await import('../../src/capability/agent-capabilities.js')
const { GuardrailViolationError } = await import('../../src/guardrails/index.js')

/**
 * An agent served over HTTP or the terminal applied none of its declared guardrails.
 *
 * `streamAgentUIMessages` calls `createSdkAgentStream` directly, on both its paths. Guardrails are
 * applied in exactly two other places — `AgentRunner.stream()` and `withGuardrails`, the latter
 * reached only from `toAgentFactory` — so a `defineAgent({ guardrails: [...] })` served to a browser
 * ran no input guard, applied no `redact`, and a `block` never threw. Measured:
 * `grep -c guardrail agent-endpoint.ts` → 0, against 23 files in `packages/agents/src`.
 *
 * Its reachable callers are the HTTP mount, the terminal runner and the streamer builder — every
 * surface a deployed agent is actually reached through.
 *
 * This is the same shape as three defects already closed in this release, one layer up: a safety
 * property that holds on the path somebody looked at. B-014 and B-018 measured CHANNELS inside a
 * stream that was already being moderated; this is the surface where the moderation never starts.
 *
 * ## The composition is copied deliberately, not invented
 *
 * Two passes over two text-EVENT kinds, `text_delta` inner and `thinking` outer, exactly as
 * `AgentRunner.stream()` composes them. NOT one wider `extractText`: two kinds under one extractor
 * COLLAPSE into a single event, so the model's private reasoning would be promoted into a visible
 * one — the moderation would create the disclosure it exists to close.
 */
function agentWith(guardrails: readonly Guardrail[]) {
  return applyCapabilities([new ModelCapability('m'), new GuardrailsCapability(guardrails)])
}

const DONE: FakeStreamEvent = {
  type: 'done',
  result: 'hi',
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  durationMs: 1,
}

async function collect(gen: AsyncIterable<unknown>): Promise<{ type?: string; delta?: string }[]> {
  const out: { type?: string; delta?: string }[] = []
  for await (const chunk of gen) out.push(chunk as { type?: string; delta?: string })
  return out
}

async function drain(gen: AsyncIterable<unknown>): Promise<string> {
  return JSON.stringify(await collect(gen))
}

/** The text carried by chunks of ONE kind — the assertion a flattened JSON string cannot make. */
function deltasOf(chunks: { type?: string; delta?: string }[], type: string): string {
  return chunks
    .filter((c) => c.type === type && typeof c.delta === 'string')
    .map((c) => c.delta)
    .join('')
}

describe('an agent served through the endpoint applies its guardrails', () => {
  it('runs input guards before the message reaches the model', async () => {
    h.events = [DONE]
    h.sent = []
    const redactInput: Guardrail = {
      name: 'redact-input',
      checkInput: (text) => ({ action: 'redact' as const, text: text.replace('sk-abc123', '[R]') }),
    }

    await drain(
      streamAgentUIMessages(agentWith([redactInput]), 'key', {
        message: 'my key is sk-abc123',
        sessionId: 's',
      }),
    )

    expect(h.sent[0], 'the declared redaction never ran and the secret reached the model').toBe(
      'my key is [R]',
    )
  })

  it('ends the turn before any chunk reaches the client when a guard blocks', async () => {
    h.events = [DONE]
    h.sent = []
    const block: Guardrail = {
      name: 'no-injection',
      checkInput: () => ({ action: 'block' as const, reason: 'prompt injection' }),
    }

    await expect(
      drain(streamAgentUIMessages(agentWith([block]), 'key', { message: 'bad', sessionId: 's' })),
      'a declared block did not stop the turn on the surface a browser reaches',
    ).rejects.toThrow(GuardrailViolationError)
    expect(h.sent, 'the model was sent a message a guard had already refused').toEqual([])
  })

  it('moderates visible text output', async () => {
    h.events = [{ type: 'text_delta', content: 'the key is sk-abc123' }, DONE]
    h.sent = []
    const redactOutput: Guardrail = {
      name: 'redact-output',
      checkOutput: (text) => ({
        action: 'redact' as const,
        text: text.replace('sk-abc123', '[R]'),
      }),
    }

    const seen = await drain(
      streamAgentUIMessages(agentWith([redactOutput]), 'key', { message: 'x', sessionId: 's' }),
    )

    expect(seen).toContain('the key is [R]')
    expect(seen, 'the redaction was computed and the secret was delivered anyway').not.toContain(
      'sk-abc123',
    )
  })

  it('moderates reasoning WITHOUT promoting it into visible text', async () => {
    // The channel a single wider extractor would destroy: two kinds under one `extractText` collapse
    // into one event, so the model's private reasoning would arrive as the assistant's answer.
    h.events = [
      { type: 'thinking', content: 'CoT: the key is sk-abc123' },
      { type: 'text_delta', content: 'Here you go.' },
      DONE,
    ]
    h.sent = []
    const redactOutput: Guardrail = {
      name: 'redact-output',
      checkOutput: (text) => ({
        action: 'redact' as const,
        text: text.replace('sk-abc123', '[R]'),
      }),
    }

    const chunks = await collect(
      streamAgentUIMessages(agentWith([redactOutput]), 'key', { message: 'x', sessionId: 's' }),
    )

    expect(JSON.stringify(chunks)).not.toContain('sk-abc123')
    // Per CHANNEL, not over the flattened stream. A single wider `extractText` collapses both kinds
    // into one event, and the flattened text then still contains every word — so a JSON-string
    // assertion passes while the model's private reasoning has been promoted into the visible
    // answer, or the answer swallowed into the reasoning. Measured: that mutation survived until
    // these two assertions replaced it.
    expect(
      deltasOf(chunks, 'reasoning-delta'),
      'the visible answer was swallowed into the reasoning channel',
    ).toBe('CoT: the key is [R]')
    expect(
      deltasOf(chunks, 'text-delta'),
      'the private reasoning was promoted into the visible answer',
    ).toBe('Here you go.')
  })

  it('is a transparent pass-through when nothing was declared', async () => {
    // The control. Wrapping unconditionally would buffer every served stream to enforce an empty
    // list — `moderateOutputStream` is only transparent when no guard defines `checkOutput`.
    h.events = [{ type: 'text_delta', content: 'plain' }, DONE]
    h.sent = []
    const seen = await drain(
      streamAgentUIMessages(applyCapabilities([new ModelCapability('m')]), 'key', {
        message: 'x',
        sessionId: 's',
      }),
    )
    expect(seen).toContain('plain')
    expect(h.sent).toEqual(['x'])
  })
})
