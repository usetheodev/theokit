import { describe, expect, it } from 'vitest'

import { createDelegateTool } from '../../src/tools/delegate-tool.js'
import {
  GuardrailError,
  GuardrailViolationError,
  MalformedGuardrailResultError,
} from '../../src/guardrails/index.js'
import * as guardrails from '../../src/guardrails/index.js'

/**
 * The fix for one guardrail error class left its sibling in the same file leaking.
 *
 * B-015 made `GuardrailViolationError` pass through `run-reflective-loop.ts` unwrapped, because
 * `DelegationError` interpolates its cause and `delegation_failed` is on the message allowlist — so
 * a wrapped guard error reached the model with the guard's name and trigger intact.
 * `MalformedGuardrailResultError` sits in the same file, takes the same wrapping, and its message
 * also names the guard: `Guardrail "X" returned action 'redact' for output with no replacement
 * text.`
 *
 * Smaller payload than a violation — the guard's name and phase, not its trigger text — and the same
 * class of leak through the same allowlist. It additionally MISLABELS a guard *defect* to the model
 * as a delegation failure, which is a fact about the work the model would act on.
 *
 * ## Why a base class, and not a third `instanceof`
 *
 * The item asks for the passthrough to cover a third class **by construction**. Two `instanceof`
 * arms are a list that must be extended by hand, and this defect exists precisely because a list of
 * one was not extended. `GuardrailError` is the base every guardrail error shares, so a new class
 * is covered by its own declaration.
 *
 * A base is not airtight on its own — a new class could still extend `TheokitAgentError` directly.
 * The last test is what closes that: it walks the guardrails barrel and fails on any exported error
 * class that skipped the base. Together those are by construction; either alone is a convention.
 */
function portThrowing(error: Error) {
  return { run: () => Promise.reject(error) }
}

async function payloadFor(error: Error): Promise<{ ok: boolean; error: string; message: string }> {
  const tool = createDelegateTool({
    roster: [{ name: 'worker', target: portThrowing(error) }],
  })
  return JSON.parse((await tool.handler({ agent: 'worker', task: 't' })) as string) as {
    ok: boolean
    error: string
    message: string
  }
}

describe('a malformed guardrail result does not name its guard to the model', () => {
  it('withholds the message', async () => {
    const payload = await payloadFor(new MalformedGuardrailResultError('pii-detector', 'output'))

    expect(payload.message, 'the model was handed the guard that failed').not.toContain(
      'pii-detector',
    )
    expect(payload.message, 'the model still learns it was refused').toMatch(/refused|policy/i)
  })

  it('does not call a guard defect a delegation failure', async () => {
    const payload = await payloadFor(new MalformedGuardrailResultError('pii-detector', 'output'))

    expect(
      payload.error,
      'a guard written wrong was reported to the model as the delegation having failed',
    ).not.toBe('delegation_failed')
  })

  it('still withholds a violation, and still says it was refused', async () => {
    // The control. The class B-015 fixed must keep behaving as it did.
    const payload = await payloadFor(
      new GuardrailViolationError('pii-detector', 'output', 'ssn found'),
    )
    expect(payload.error).toBe('guardrail_violation')
    expect(payload.message).not.toContain('ssn found')
  })

  it('covers a THIRD class by construction, not by being remembered', () => {
    // A list of two is how this item exists. Every error class the guardrails barrel exports must
    // descend from `GuardrailError`, so a new one is covered by its own declaration — and this test
    // is what catches one that extends `TheokitAgentError` directly instead.
    const errorClasses = Object.entries(guardrails).filter(
      ([name, value]) => typeof value === 'function' && name.endsWith('Error'),
    )
    expect(
      errorClasses.length,
      'the barrel exported no error classes — the walk found nothing',
    ).toBeGreaterThan(1)

    for (const [name, value] of errorClasses) {
      if (name === 'GuardrailError') continue
      expect(
        Object.create((value as new (...a: never[]) => object).prototype) instanceof GuardrailError,
        `${name} does not extend GuardrailError, so the delegate passthrough will not cover it`,
      ).toBe(true)
    }
  })
})
