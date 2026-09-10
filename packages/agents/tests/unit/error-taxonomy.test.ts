import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { TheokitAgentError } from '@theokit/sdk/errors'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * M80 — the framework eats its own error contract.
 *
 * ## The defect
 *
 * `index.ts` re-exports `@theokit/sdk/errors` and `/retry` whole, with the reason written down:
 * without it the consumer was pushed into a PARALLEL hierarchy of five classes. The base was right.
 *
 * What was not right is that the framework did not obey it. Ten error classes under
 * `packages/agents/src` extended plain `Error`, and `isTransientError` is defined over
 * `TheokitAgentError` — so those ten were invisible to it, and the consumer's only recourse was the
 * string matching the rules forbid: a regex over an eight-level `cause` chain.
 *
 * Two of them were only fixed AFTER a consumer reported it. That is the shape this file exists to
 * change: a reactive fix becomes an invariant, the way `check-auth-parity.mjs` pins the pass-through
 * surfaces.
 *
 * ## Why a source scan and not a registry of known classes
 *
 * A list of classes to check is a list somebody forgets to append to — exactly how the last two got
 * through. Scanning the source for the SHAPE catches the class nobody remembered to register,
 * including one added tomorrow.
 */

const AGENTS_SRC = resolve(__dirname, '../../src')

/** Every `.ts` under `packages/agents/src`. */
function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full)
  }
  return found
}

/**
 * Every source file, READ ONCE.
 *
 * B-009: the walk ran at collection and the read ran inside each `it()`, so scanning 400-odd files
 * sat inside vitest's 5-second per-test budget. Measured 2026-09-10: this file timed out at load
 * average 32.9 and passed idle minutes later — a failure indistinguishable from a regression until
 * somebody measured the load, which cost two investigations before anyone did.
 *
 * Reading once in a hook with its own allowance is the fix. Raising the budget is not: it moves the
 * same failure to higher load, and CI runners are shared.
 */
const sources = new Map<string, string>()

beforeAll(() => {
  for (const file of sourceFiles(AGENTS_SRC)) sources.set(file, readFileSync(file, 'utf8'))
}, 30_000)

describe('no error class in packages/agents/src extends plain Error', () => {
  const files = () => [...sources.keys()]

  it('test_there_are_sources_to_scan', () => {
    // Anti-vacuity: a walk that finds nothing makes every assertion below pass trivially.
    expect(files().length).toBeGreaterThan(50)
  })

  it('test_no_exported_error_class_extends_Error_directly', () => {
    // The invariant. `extends Error` puts the class outside `isTransientError`'s reach, and the only
    // thing left to the consumer is matching on message text.
    const offenders: string[] = []
    for (const [file, source] of sources) {
      for (const [index, line] of source.split('\n').entries()) {
        if (/^export class \w*Error extends Error\b/.test(line)) {
          offenders.push(`${relative(AGENTS_SRC, file)}:${String(index + 1)}`)
        }
      }
    }
    expect(
      offenders,
      `these extend plain Error and are therefore invisible to isTransientError — extend ` +
        `TheokitAgentError with a stable \`code\` and an explicit \`isRetryable\` instead:\n` +
        offenders.join('\n'),
    ).toEqual([])
  })
})

describe('the boundary-facing errors carry a stable code and an explicit retryability', () => {
  /**
   * The ones a consumer catches at the turn boundary, named by the milestone.
   *
   * Listed explicitly here — unlike the scan above — because this asserts a per-class DECISION
   * (`code`, `isRetryable`) that no scan can derive. A missing entry is caught by the scan; a wrong
   * decision is caught here.
   */
  const cases = [
    {
      mod: '../../src/guardrails/types.js',
      name: 'GuardrailViolationError',
      args: ['pii', 'input', 'blocked'],
      retryable: false,
    },
    {
      mod: '../../src/guardrails/types.js',
      name: 'MalformedGuardrailResultError',
      args: ['pii', 'output'],
      retryable: false,
    },
    {
      mod: '../../src/guardrails/types.js',
      name: 'CostBudgetExceededError',
      args: [100, 50],
      retryable: false,
    },
    {
      mod: '../../src/bridge/delegation-types.js',
      name: 'DelegationError',
      args: ['planner', new Error('inner')],
      retryable: false,
    },
    {
      mod: '../../src/bridge/delegation-types.js',
      name: 'DelegationBudgetExceededError',
      args: ['planner', 1.5, 1],
      retryable: false,
    },
    {
      mod: '../../src/in-process-turn.js',
      name: 'InProcessApprovalRequiredError',
      args: [['run_shell']],
      retryable: false,
    },
    {
      mod: '../../src/client/in-process-transport.js',
      name: 'ApprovalAbortedError',
      args: ['approval-1', 'cancelled'],
      retryable: false,
    },
    {
      mod: '../../src/bridge/agent-endpoint.js',
      name: 'AgentDefinitionError',
      args: ['agents/x.ts'],
      retryable: false,
    },
  ] as const

  for (const testCase of cases) {
    it(`test_${testCase.name}_is_a_TheokitAgentError_with_a_code`, async () => {
      const mod = (await import(testCase.mod)) as Record<string, unknown>
      const Ctor = mod[testCase.name] as new (...args: never[]) => TheokitAgentError
      expect(Ctor, `${testCase.name} is not exported from ${testCase.mod}`).toBeTypeOf('function')

      // Each case carries its OWN constructor arguments. The arities and types genuinely differ
      // across the seven, and a generic placeholder tuple made one of them throw inside its own
      // message template — proving nothing about the contract under test.
      const instance = new (Ctor as new (...args: readonly unknown[]) => TheokitAgentError)(
        ...testCase.args,
      )

      expect(
        instance,
        'must extend TheokitAgentError to be visible to isTransientError',
      ).toBeInstanceOf(TheokitAgentError)
      expect(instance.code, 'a stable `code` is what survives a rename of the class').toBeTypeOf(
        'string',
      )
      expect(instance.name).toBe(testCase.name)
      expect(
        instance.isRetryable,
        'retryability must be DECLARED — the default silently makes a policy decision',
      ).toBe(testCase.retryable)
    })
  }

  it('test_a_guardrail_violation_exposes_its_guard_and_phase_as_readable_fields', async () => {
    // The first version of this test asserted that the case was in the array above — which is to say
    // it asserted nothing about the code. What matters is that the fields the HTTP boundary's
    // extractor reads are actually THERE, so telemetry counts blocks per guard without parsing a
    // message. A count derived from message text breaks the first time somebody improves the
    // wording, and the improvement looks harmless right up until the dashboard goes flat.
    const { GuardrailViolationError } = await import('../../src/guardrails/types.js')
    const error = new GuardrailViolationError('pii-detector', 'input', 'ssn found')

    expect(error.guardName).toBe('pii-detector')
    expect(error.phase).toBe('input')
    expect(error.message).toContain('pii-detector')
  })
})
