/**
 * `createDelegateTool` — the agent asks the framework to delegate.
 *
 * Measured gap (`discoveries/blueprints/theocode-baseline-gaps-blueprint.md`): `@theokit/agents/tools`
 * ships 23 agent-facing factories and `@theokit/agents` ships `delegate()` / `delegateWithScoring()`
 * / `delegateBackground()` / `Squad`. Exactly one capability is app-facing with no agent-facing
 * counterpart — local sub-agent delegation. `createA2ATool` is not it: its target is a REMOTE peer
 * over the network, with no inheritance of the parent's tools, budget or authority.
 *
 * ADR-0040 § D2 places this in core: wrapping a shipped function as a tool the agent may call makes
 * no LLM call, dispatches nothing and owns no storage. It also cannot live beside the other 23 —
 * those are `@theokit/sdk-tools`, and `delegate()` is framework-owned, so an SDK-side factory would
 * invert G1's dependency direction.
 *
 * TDD RED-first. The tests inject a `DelegationPort` (`{run(message)}`) — the DIP seam the framework
 * already declares — so the whole suite runs with no credential and no network.
 */
import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { DelegationTimeoutError } from '../../src/bridge/delegation-lifecycle.js'
import {
  DelegationBudgetExceededError,
  DelegationError,
  type DelegationResult,
} from '../../src/bridge/delegation-types.js'
import { createDelegateTool, DelegateToolConfigError } from '../../src/tools/delegate-tool.js'
import { GuardrailViolationError } from '../../src/guardrails/index.js'

/** A `DelegationPort` double: records what it was asked, answers what the test dictates. */
function portReturning(response: string): {
  run: (message: string) => Promise<DelegationResult>
  seen: string[]
} {
  const seen: string[] = []
  return {
    seen,
    run: async (message: string) => {
      seen.push(message)
      return { response, toolCalls: [], cost: 0, tokens: 0 }
    },
  }
}

function portThrowing(error: Error) {
  return {
    run: async (): Promise<DelegationResult> => {
      throw error
    },
  }
}

/** Parse the emitted JSON-Schema `agent` enum without asserting on Zod internals. */
function agentEnum(schema: Record<string, unknown>): string[] {
  const props = (schema.properties ?? {}) as Record<string, { enum?: string[] }>
  return props.agent?.enum ?? []
}

describe('createDelegateTool — construction', () => {
  it('builds_a_tool_whose_schema_enumerates_the_roster', () => {
    const tool = createDelegateTool({
      roster: [
        { name: 'explorer', target: portReturning('') },
        { name: 'worker', target: portReturning('') },
      ],
    })

    expect(tool.name).toBe('delegate')
    // The roster is the model's only menu — a name absent here is unreachable by construction.
    expect([...agentEnum(tool.inputSchema)].sort((a, b) => a.localeCompare(b))).toEqual([
      'explorer',
      'worker',
    ])
  })

  it('names_the_roster_in_the_description_the_model_reads', () => {
    const tool = createDelegateTool({ roster: [{ name: 'explorer', target: portReturning('') }] })
    // R2: a vague description produces misuse. The names must be visible without a schema dump.
    expect(tool.description).toContain('explorer')
  })

  it('an_empty_roster_is_refused_at_factory_time', () => {
    // R4 — NEGATIVE. `z.enum([])` is representable; a tool offering no target is a defect, not a
    // configuration, and the failure belongs at construction rather than at the model's first call.
    expect(() => createDelegateTool({ roster: [] })).toThrow(DelegateToolConfigError)
    expect(() => createDelegateTool({ roster: [] })).toThrow(/empty/i)
  })

  it('duplicate_roster_names_are_refused_at_factory_time', () => {
    // EC-2 / R5 — NEGATIVE. Two entries named alike collapse in the enum and lookup resolves
    // non-deterministically: silent wrong-agent dispatch, which is worse than a crash because it
    // looks like it worked. `Toolset` already refuses this shape as `duplicate_tool`.
    const roster = [
      { name: 'worker', target: portReturning('a') },
      { name: 'worker', target: portReturning('b') },
    ]
    expect(() => createDelegateTool({ roster })).toThrow(DelegateToolConfigError)
    expect(() => createDelegateTool({ roster })).toThrow(/worker/)
  })

  it('a_spec_roster_without_an_api_key_is_refused_at_factory_time', () => {
    // EC-1 — NEGATIVE, and the reason this test exists at all: `delegate()` calls `requireApiKey`
    // and throws when `opts.apiKey` is empty. A factory that passes `{}` is dead on the real path
    // while a port-only suite stays green. Validating at construction converts a first-call runtime
    // failure into a startup one.
    const spec = { name: 'worker', compiled: {} } as never
    expect(() => createDelegateTool({ roster: [{ name: 'worker', target: spec }] })).toThrow(
      DelegateToolConfigError,
    )
    expect(() => createDelegateTool({ roster: [{ name: 'worker', target: spec }] })).toThrow(
      /apiKey/i,
    )

    // ...and is accepted once the credential is supplied.
    expect(() =>
      createDelegateTool({
        roster: [{ name: 'worker', target: spec }],
        defaults: { apiKey: 'sk-test' },
      }),
    ).not.toThrow()
  })
})

describe('createDelegateTool — dispatch', () => {
  it('delegates_to_the_named_target_and_returns_its_text', async () => {
    const explorer = portReturning('found three call sites')
    const worker = portReturning('patched')
    const tool = createDelegateTool({
      roster: [
        { name: 'explorer', target: explorer },
        { name: 'worker', target: worker },
      ],
    })

    const out = await tool.handler({ agent: 'explorer', task: 'map the call sites' })

    expect(explorer.seen).toEqual(['map the call sites'])
    expect(worker.seen).toEqual([]) // the other target is untouched
    expect(out).toContain('found three call sites')
  })

  it('the_result_is_serialised_for_the_model', async () => {
    // EC-5 — NEGATIVE. `CustomTool.handler` returns `string | Promise<string>`; `delegate()`
    // resolves an OBJECT. Returning it raw reaches the model as "[object Object]".
    const tool = createDelegateTool({
      roster: [{ name: 'worker', target: portReturning('done') }],
    })

    const out = await tool.handler({ agent: 'worker', task: 't' })

    expect(typeof out).toBe('string')
    expect(out).not.toContain('[object Object]')
    expect(JSON.parse(out as string)).toMatchObject({ ok: true, response: 'done' })
  })

  it('an_agent_name_outside_the_roster_is_rejected', async () => {
    // NEGATIVE. The enum makes an off-roster name unrepresentable; a model that emits one anyway
    // must be refused AT THE SCHEMA, before dispatch.
    //
    // Asserted on the ZodError's `path`, not on a regex over its message. The first draft used
    // `rejects.toThrow(/agent/i)` and a review showed it passed for the wrong reason: Zod's default
    // `.message` is a JSON dump of the issue array, which happens to contain `"path": ["agent"]`.
    // That green depended on a third-party stringification format, not on this tool's contract —
    // and Zod has changed that shape across majors.
    const dispatched = portReturning('x')
    const tool = createDelegateTool({ roster: [{ name: 'worker', target: dispatched }] })

    let failure: unknown
    try {
      await tool.handler({ agent: 'nope', task: 't' })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(ZodError)
    expect((failure as ZodError).issues.map((issue) => issue.path.join('.'))).toContain('agent')
    // The contract, independent of WHICH layer validates: nothing was dispatched. A refusal that
    // still reached a sub-agent would be a refusal in name only, and would cost real tokens.
    expect(dispatched.seen).toEqual([])
  })

  it('an_empty_task_is_rejected_by_the_schema', async () => {
    // EC-4 — EDGE, the smallest valid-LOOKING input. Pinned so a future schema edit cannot silently
    // drop `min(1)` and start sending empty prompts to a paid provider.
    const tool = createDelegateTool({ roster: [{ name: 'worker', target: portReturning('x') }] })

    let failure: unknown
    try {
      await tool.handler({ agent: 'worker', task: '' })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(ZodError)
    expect((failure as ZodError).issues.map((issue) => issue.path.join('.'))).toContain('task')
  })
})

describe('createDelegateTool — failure surfacing (D3)', () => {
  it('a_budget_exhaustion_returns_structured_json_not_a_throw', async () => {
    // A thrown error inside a tool handler ends the PARENT's turn. Budget exhaustion is information
    // the model can act on — delegate less, or finish the work itself. Nothing is swallowed: the
    // typed error's identity crosses as a stable `error` code.
    const tool = createDelegateTool({
      roster: [
        { name: 'worker', target: portThrowing(new DelegationBudgetExceededError('worker', 1, 2)) },
      ],
    })

    const out = await tool.handler({ agent: 'worker', task: 't' })

    expect(JSON.parse(out as string)).toMatchObject({
      ok: false,
      error: 'delegation_budget_exceeded',
    })
  })

  it('a_timeout_returns_structured_json_not_a_throw', async () => {
    const tool = createDelegateTool({
      roster: [{ name: 'worker', target: portThrowing(new DelegationTimeoutError('worker', 5)) }],
    })

    const out = await tool.handler({ agent: 'worker', task: 't' })

    expect(JSON.parse(out as string)).toMatchObject({ ok: false, error: 'delegation_timeout' })
  })

  it('a_delegation_error_returns_structured_json_and_carries_its_message', async () => {
    const tool = createDelegateTool({
      roster: [
        { name: 'worker', target: portThrowing(new DelegationError('worker', 'no provider')) },
      ],
    })

    const out = await tool.handler({ agent: 'worker', task: 't' })

    const parsed = JSON.parse(out as string)
    expect(parsed).toMatchObject({ ok: false, error: 'delegation_failed' })
    expect(parsed.message).toContain('no provider')
  })

  it('an_unexpected_error_propagates', async () => {
    // The other half of D3, and the one that makes it a discipline rather than a blanket catch:
    // a plain `Error` is a DEFECT (a null spec, a bug in the roster). Catching it would hand the
    // model a message to reason about instead of failing where a human can see it.
    const tool = createDelegateTool({
      roster: [
        { name: 'worker', target: portThrowing(new TypeError('cannot read x of undefined')) },
      ],
    })

    await expect(tool.handler({ agent: 'worker', task: 't' })).rejects.toThrow(TypeError)
  })
})

describe('createDelegateTool — recursion (R1)', () => {
  it('recursion_terminates_on_budget_not_on_stack', async () => {
    // A sub-agent holding the same tool can delegate again. `delegate()` clamps the parent budget
    // into the child, so the bound is budget, not stack depth. Modelled here with a port that
    // delegates once more and then reports exhaustion.
    let depth = 0
    const recursive = {
      run: async (message: string): Promise<DelegationResult> => {
        depth += 1
        if (depth > 3) throw new DelegationBudgetExceededError('worker', 0, 1)
        const nested = await tool.handler({ agent: 'worker', task: message })
        return { response: String(nested), toolCalls: [], cost: 0, tokens: 0 }
      },
    }
    const tool = createDelegateTool({ roster: [{ name: 'worker', target: recursive }] })

    const out = await tool.handler({ agent: 'worker', task: 'go' })

    // It resolves rather than overflowing, and the exhaustion is visible in the payload.
    expect(typeof out).toBe('string')
    expect(out).toContain('delegation_budget_exceeded')
    expect(depth).toBeGreaterThan(1)
  })
})

describe('createDelegateTool — real delegate() path', () => {
  it('passes_the_factory_defaults_through_to_delegate', async () => {
    // The port path never reaches `delegate()`, so without this the spec branch would be untested —
    // exactly the "green by absence" shape EC-1 describes. `delegate` is spied, not called for real.
    const orchestrator = await import('../../src/bridge/agent-orchestrator.js')
    const spy = vi
      .spyOn(orchestrator, 'delegate')
      .mockResolvedValue({ response: 'ok', toolCalls: [], cost: 0, tokens: 0 })

    const spec = { name: 'worker', compiled: {} } as never
    const tool = createDelegateTool({
      roster: [{ name: 'worker', target: spec }],
      defaults: { apiKey: 'sk-test', timeoutMs: 1234 },
    })

    await tool.handler({ agent: 'worker', task: 'do it' })

    expect(spy).toHaveBeenCalledWith(
      spec,
      'do it',
      expect.objectContaining({ apiKey: 'sk-test', timeoutMs: 1234 }),
    )
    spy.mockRestore()
  })
})

describe('createDelegateTool — reachability (wiring)', () => {
  it('is_exported_from_the_tools_subpath_barrel', async () => {
    // Pillar (a) of the wiring triad. A factory that exists and cannot be imported costs a consumer
    // exactly what an absent one costs — the lesson `@theokit/sdk` #283 already taught this repo,
    // where a symbol shipped at runtime and was unreachable with types. Asserting the BARREL, not
    // the module, is what makes that failure visible here rather than in someone's app.
    const barrel = await import('../../src/tools-entry.js')

    expect(barrel.createDelegateTool).toBe(createDelegateTool)
    expect(barrel.DelegateToolConfigError).toBe(DelegateToolConfigError)
  })

  it('test_a_guardrail_block_crosses_as_a_refusal_not_a_crash', async () => {
    // B-015 made `GuardrailViolationError` reachable from `delegate()` for the first time. Before
    // that it could not come out of this handler, so it fell to the `undefined` arm and was rethrown
    // as "a defect" — ending the parent's turn, while this tool's own description promises
    // `{ ok: false, error, message }` on a refusal. Found by review, unmentioned in the commit that
    // introduced it.
    const tool = createDelegateTool({
      roster: [
        {
          name: 'worker',
          target: portThrowing(new GuardrailViolationError('pii-detector', 'output', 'ssn found')),
        },
      ],
    })

    const out = await tool.handler({ agent: 'worker', task: 't' })

    expect(JSON.parse(out as string)).toMatchObject({ ok: false, error: 'guardrail_violation' })
  })

  it('test_a_guardrail_refusal_does_not_hand_the_model_a_map_around_the_guard', async () => {
    // Every other code passes the typed error's message through, because a budget or a timeout is a
    // fact about the work. This one does not: the message reads
    // `Guardrail "pii-detector" blocked output: ssn found`, naming the guard and its exact trigger.
    // A model given that learns which words to avoid, not that it should stop.
    const tool = createDelegateTool({
      roster: [
        {
          name: 'worker',
          target: portThrowing(new GuardrailViolationError('pii-detector', 'output', 'ssn found')),
        },
      ],
    })

    const payload = JSON.parse((await tool.handler({ agent: 'worker', task: 't' })) as string) as {
      message: string
    }

    expect(payload.message).not.toContain('pii-detector')
    expect(payload.message).not.toContain('ssn found')
    expect(payload.message, 'the model still learns it was refused').toMatch(/refused|policy/i)
  })

  it('test_a_code_nobody_listed_withholds_its_message_by_default', async () => {
    // The direction of forgetting, pinned. `messageForModel` began as a denylist — a check for the
    // ONE code that must withhold — so a code added to `errorCodeOf` later would have passed its
    // typed message through by default, silently, on the function whose entire purpose is
    // withholding. `errorCodeOf` above is an allowlist; this is now one too.
    //
    // `DelegationError` is in the allowlist and `GuardrailViolationError` is not, so this drives the
    // pair and asserts they diverge — a future code that nobody lists behaves like the second.
    const listed = createDelegateTool({
      roster: [
        {
          name: 'worker',
          target: portThrowing(new DelegationError('worker', new Error('disk full'))),
        },
      ],
    })
    const unlisted = createDelegateTool({
      roster: [
        {
          name: 'worker',
          target: portThrowing(new GuardrailViolationError('pii', 'output', 'ssn found')),
        },
      ],
    })

    const a = JSON.parse((await listed.handler({ agent: 'worker', task: 't' })) as string) as {
      message: string
    }
    const b = JSON.parse((await unlisted.handler({ agent: 'worker', task: 't' })) as string) as {
      message: string
    }

    expect(a.message, 'a listed code passes its own message').toContain('disk full')
    expect(b.message, 'an unlisted code does not').not.toContain('ssn found')
  })

  it('test_a_guard_that_throws_mid_round_is_not_renamed_into_a_delegation_failure', async () => {
    // The leak the allowlist could not close, because the defect was upstream of it.
    //
    // `run-reflective-loop` wrapped any non-delegation round error into `DelegationError`, whose
    // message is `Delegation to agent "X" failed: ${cause.message}`. `delegation_failed` IS on the
    // message allowlist — a delegation failure's text is a fact about the work — so the wrapper
    // carried the guard's own words through: `Guardrail "pii-detector" blocked output: ssn found`.
    //
    // Measured with a consumer-supplied `streamFactory` that throws mid-round, which is a public
    // option. Fixed by CLASSIFICATION rather than by suppressing text downstream: a guard refusal is
    // not a delegation failure, and a layer that renames it cannot be expected to keep a list of
    // what the new name must hide.
    const spec = {
      name: 'worker',
      compiled: { model: 'm', tools: [], agents: {}, stream: true },
    } as never
    // Throwing before any yield IS the case under test: a guard that refuses mid-round.
    // eslint-disable-next-line require-yield, sonarjs/generator-without-yield
    async function* refusesMidRound(): AsyncGenerator<never, void> {
      throw new GuardrailViolationError('pii-detector', 'output', 'ssn found')
    }
    const throwsMidRound = () => refusesMidRound()

    const tool = createDelegateTool({
      roster: [{ name: 'worker', target: spec }],
      defaults: { apiKey: 'k', streamFactory: throwsMidRound } as never,
    })

    const payload = JSON.parse((await tool.handler({ agent: 'worker', task: 't' })) as string) as {
      error: string
      message: string
    }

    expect(payload.error, 'a guard refusal is not a delegation failure').toBe('guardrail_violation')
    expect(payload.message).not.toContain('pii-detector')
    expect(payload.message).not.toContain('ssn found')
  })
})
