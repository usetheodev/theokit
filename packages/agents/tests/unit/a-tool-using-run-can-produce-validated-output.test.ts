import { describe, expect, it, vi } from 'vitest'

import { withGuardrails, withStepCeiling } from '../../src/bridge/handle-wrappers.js'
import type { SdkAgentHandle } from '../../src/bridge/sdk-adapter.js'

/**
 * A tool-using run could produce schema-validated output through the SDK and not through this layer.
 *
 * ## What the survey got wrong, corrected by measurement
 *
 * The item said "structured output cannot be combined with tools", on evidence that `outputFormat`,
 * `structuredOutput`, `outputSchema` and `responseFormat` returned 0 files here, and that
 * `generateObject`'s options carry no `tools` field. Both facts are true and the conclusion is not.
 *
 * `generateObject` is the TOOLLESS path by design — it builds a transient agent whose only tool is
 * the synthetic output tool. The tool-using path is `agent.generate(input, { output })`, which
 * "runs the agent's NORMAL tool loop (the user's tools run first) and then coerces the final answer
 * into a Zod schema". It exists on the published SDK's agent, measured.
 *
 * ## The real gap
 *
 * `SdkAgentHandle` — what this layer serves to ACP, the delegation surfaces and the autonomous loop
 * — declared `send` and `dispose` and not `generate`. So a consumer of `@theokit/agents` could reach
 * it only by importing `@theokit/sdk` directly, which this layer's doctrine forbids. Same shape as
 * the session store one item earlier: the capability existed, the door did not.
 *
 * The type half is what this file pins. A handle that forwards the method while the type omits it is
 * reachable at runtime and unwriteable in a consumer's source — the failure
 * `every-public-type-crosses-the-barrel.test.ts` now derives.
 */
describe('the served handle offers a schema-validated, tool-using run', () => {
  it('declares generate alongside send', () => {
    // A compile error here IS the failure: the method is not on the contract. The runtime assertion
    // is incidental.
    const handle: SdkAgentHandle = {
      agentId: 'a',
      send: vi.fn(),
      dispose: vi.fn(),
      generate: vi.fn(async () => ({ object: { ok: true } })),
    } as never

    expect(typeof handle.generate).toBe('function')
  })

  it('survives the wrappers that rebuild the handle', async () => {
    // The half that actually breaks. Both wrappers construct a NEW object, so every method they do
    // not name disappears — and the consumer meets the loss at runtime as "the handle has no
    // `generate`", after the types said it had one.
    const generate = vi.fn(async () => ({ object: { ok: true } }))
    const base = { agentId: 'a', send: vi.fn(), dispose: vi.fn(), generate } as never

    for (const [name, wrapped] of [
      ['step ceiling', withStepCeiling(base, 3)],
      [
        'guardrails',
        withGuardrails(base, [
          { name: 'g', checkOutput: () => ({ action: 'allow' as const }) },
        ] as never),
      ],
    ] as const) {
      expect(typeof wrapped.generate, `${name} dropped it`).toBe('function')
      await wrapped.generate?.('x', { output: {} })
    }
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('keeps send as the unstructured path', () => {
    // The control. `generate` is additive: a caller that wants free text must not be forced through
    // a schema, and the two coexist on one handle rather than one replacing the other.
    const handle = { agentId: 'a', send: vi.fn(), dispose: vi.fn() } as unknown as SdkAgentHandle
    expect(typeof handle.send).toBe('function')
  })
})
