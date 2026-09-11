import { describe, expect, it } from 'vitest'

import { isPort } from '../../src/bridge/delegation-scoring.js'
import type { DelegationTarget } from '../../src/bridge/delegation-scoring.js'

/**
 * `isPort` discriminated on the PRESENCE of `run`, and its docblock argued from the declared type:
 * "a `SubAgentSpec` is a plain record with `name`/`compiled` and has no method, so the two cannot be
 * confused".
 *
 * That is the identical reasoning `auth/permission-gate.ts` records as having failed open — there
 * the gate read whether the `governed` KEY was present, and any object carrying it was waved
 * through. TypeScript rejects an excess property on a FRESH LITERAL and accepts the same object
 * through a variable or a spread, and every real caller goes through one of those.
 *
 * The direction of the failure is what makes it worth a test rather than a comment. The port branch
 * calls `target.run(task)` directly; the spec branch calls `delegate()`, which is where the
 * guardrails run (`agent-orchestrator.ts` — input guards after `onDelegationStart`, output
 * moderation after `onDelegationComplete`), where the parent's veto is inherited, and where the
 * budget is clamped. A misread hands the model an unguarded path.
 *
 * So a tie goes to the spec: the branch that applies the protections is the safe default, exactly
 * as `grantGate` treats anything that is not literally `false` as governed.
 */
describe('a target that looks like both is treated as a spec', () => {
  it('test_an_object_carrying_compiled_and_run_is_not_a_port', () => {
    // Built through a spread, which is how it arrives in practice — a roster entry extended from a
    // base that happens to carry a `run`.
    const base = { run: () => Promise.resolve({ response: 'unguarded' }) }
    const target = { ...base, name: 'helper', compiled: {} } as unknown as DelegationTarget

    expect(
      isPort(target),
      'a target carrying `compiled` takes the branch that applies the guardrails',
    ).toBe(false)
  })

  it('test_a_real_port_is_still_a_port', () => {
    const port = { run: () => Promise.resolve({ response: 'ok' }) } as unknown as DelegationTarget
    expect(isPort(port), 'the additive shape keeps working').toBe(true)
  })

  it('test_a_run_that_is_not_callable_is_not_a_port', () => {
    // A JS consumer, or an `as` cast, can hand back `run: 'yes'`. Taking the port branch would then
    // throw `target.run is not a function` mid-delegation instead of delegating.
    const notAPort = { run: 'yes' } as unknown as DelegationTarget
    expect(isPort(notAPort)).toBe(false)
  })

  it('test_a_plain_spec_is_not_a_port', () => {
    const spec = { name: 'helper', compiled: {} } as unknown as DelegationTarget
    expect(isPort(spec)).toBe(false)
  })
})
