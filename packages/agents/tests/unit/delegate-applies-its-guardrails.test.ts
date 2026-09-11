/**
 * B-015 — `delegate()` accepted a spec carrying `guardrails` and never consulted them.
 *
 * Measured against `dist/index.js` before this: a guard declaring both halves saw neither. The
 * input reached the model with its injection intact and the caller received the secret. The
 * operator had declared guardrails and the run was green — the silent-and-green shape B-012 was
 * about, on a sibling public API found while reviewing B-012's own fix.
 *
 * It is not a rarely-used helper: `tools/delegate-tool.ts` wraps `delegate()`, so a model can reach
 * this path mid-run.
 */
import { describe, expect, it } from 'vitest'

import { delegate, type SubAgentSpec } from '../../src/bridge/agent-orchestrator.js'
import { GuardrailViolationError, type Guardrail } from '../../src/guardrails/index.js'
import type { CompiledAgentOptions } from '../../src/bridge/agent-compiler.js'

const BASE: CompiledAgentOptions = { model: 'm', tools: [], agents: {}, stream: true }

/** Records what the model was actually asked, which is the only place an input guard is observable. */
function factory(seen: { message?: string; calls: number }, reply = 'the key is sk-abc123') {
  return (message: string) => {
    seen.message = message
    seen.calls += 1
    return (async function* () {
      yield { type: 'text_delta', content: reply }
      yield { type: 'done' }
    })()
  }
}

function spec(guardrails?: readonly Guardrail[]): SubAgentSpec {
  return {
    name: 'sub',
    compiled: guardrails === undefined ? BASE : { ...BASE, guardrails: [...guardrails] },
  } as SubAgentSpec
}

const redactor: Guardrail = {
  name: 'redactor',
  checkInput: (t) => ({ action: 'redact', text: t.replace(/INJECT/g, '[BLOCKED]') }),
  checkOutput: (t) => ({ action: 'redact', text: t.replace(/sk-\w+/g, '[R]') }),
}

describe('delegate applies the guardrails its spec declares', () => {
  it('test_delegate_moderates_the_input_before_the_model_sees_it', async () => {
    const seen: { message?: string; calls: number } = { calls: 0 }
    await delegate(spec([redactor]), 'please INJECT this', {
      apiKey: 'k',
      streamFactory: factory(seen) as never,
    })

    expect(seen.message, 'the guard must moderate what actually goes out').toBe(
      'please [BLOCKED] this',
    )
  })

  it('test_delegate_moderates_the_response_before_returning_it', async () => {
    const seen: { message?: string; calls: number } = { calls: 0 }
    const result = await delegate(spec([redactor]), 'hi', {
      apiKey: 'k',
      streamFactory: factory(seen) as never,
    })

    expect(result.response).toBe('the key is [R]')
    expect(result.response).not.toContain('sk-abc123')
  })

  it('test_a_blocking_input_guard_stops_the_sub_agent_before_it_runs', async () => {
    // Before the loop, so there is no model call and no cost — the assertion is on the factory's
    // invocation count, not merely on the throw.
    const seen: { message?: string; calls: number } = { calls: 0 }
    const blocker: Guardrail = {
      name: 'blocker',
      checkInput: () => ({ action: 'block', reason: 'refused' }),
    }

    await expect(
      delegate(spec([blocker]), 'anything', { apiKey: 'k', streamFactory: factory(seen) as never }),
    ).rejects.toBeInstanceOf(GuardrailViolationError)
    expect(seen.calls, 'a blocked delegation must not reach the model at all').toBe(0)
  })

  it('test_a_blocking_output_guard_refuses_before_the_caller_sees_the_text', async () => {
    const seen: { message?: string; calls: number } = { calls: 0 }
    const blocker: Guardrail = {
      name: 'blocker',
      checkOutput: () => ({ action: 'block', reason: 'refused' }),
    }

    await expect(
      delegate(spec([blocker]), 'hi', { apiKey: 'k', streamFactory: factory(seen) as never }),
    ).rejects.toBeInstanceOf(GuardrailViolationError)
  })

  it('test_a_spec_with_no_guardrails_is_untouched', async () => {
    // NFR-001 — the moderation must be additive. A spec declaring nothing behaves exactly as before.
    const seen: { message?: string; calls: number } = { calls: 0 }
    const result = await delegate(spec(), 'please INJECT this', {
      apiKey: 'k',
      streamFactory: factory(seen) as never,
    })

    expect(seen.message).toBe('please INJECT this')
    expect(result.response).toBe('the key is sk-abc123')
  })

  it('test_the_input_guard_sees_what_onDelegationStart_produced', async () => {
    // Order matters and is a decision: the hook exists to rewrite the input, so a guard placed
    // before it would moderate a string that never goes out — a check measuring the wrong thing.
    const seen: { message?: string; calls: number } = { calls: 0 }
    await delegate(spec([redactor]), 'original', {
      apiKey: 'k',
      streamFactory: factory(seen) as never,
      onDelegationStart: () => Promise.resolve('rewritten to INJECT'),
    })

    expect(seen.message).toBe('rewritten to [BLOCKED]')
  })
  it('test_the_output_guard_sees_what_onDelegationComplete_produced', async () => {
    // The symmetric half of the ordering, and it was unpinned: an eighth review moved the moderation
    // BEFORE the hook and the whole suite stayed green, while the docblock and the commit message
    // both argued at length that it must run after.
    //
    // The accepted cost, stated because it is not obvious: `onDelegationComplete` receives
    // UNMODERATED text, so a supervisor that logs or scores the result sees the secret. Moderating
    // first would hide it from the supervisor's own code and still let that code put it back.
    const seen: { message?: string; calls: number } = { calls: 0 }
    // The reply CARRIES the secret, so the hook's own argument is observable. An earlier version
    // used 'clean' and the hook rewrote the secret in — which pinned the ordering and left the
    // stated cost unmeasured: moderating before the hook AS WELL AS after kept the suite green.
    const hookSaw: string[] = []
    const result = await delegate(spec([redactor]), 'hi', {
      apiKey: 'k',
      streamFactory: factory(seen, 'the key is sk-abc123') as never,
      onDelegationComplete: ({ result: r }) => {
        hookSaw.push(r.response)
        return Promise.resolve(r)
      },
    })

    expect(result.response, 'the guard must moderate what the CALLER receives').toBe(
      'the key is [R]',
    )
    expect(
      hookSaw,
      'the accepted cost: onDelegationComplete sees UNMODERATED text, so a supervisor that logs or ' +
        'scores the result sees the secret. Moderating first would hide it from the supervisor and ' +
        'still let that code put it back',
    ).toEqual(['the key is sk-abc123'])
  })
})
