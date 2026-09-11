import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

import {
  currentOperatorPolicy,
  _resetOperatorPolicyForTests,
} from '../../src/config/operator-policy.js'

/**
 * A malformed operator policy was reported to whoever read it first, and to nobody else.
 *
 * `currentOperatorPolicy` is `cached ??= readOperatorPolicy(rootOverride, warn)`. The `warn` channel
 * therefore belongs to the FIRST caller in the process; every later caller passes a channel that is
 * never invoked. Measured 2026-09-11 with a policy declaring `disableSkillShellExecution: "true"` —
 * a string where a boolean is required:
 *
 *     first reader heard 1 warning, second reader heard 0
 *
 * Three modules read this policy — `mcp-file.ts`, `credential-helper.ts` and `command-template.ts` —
 * and nothing orders them. So whether an operator learns that their policy is malformed depends on
 * which code path happens to run first in a given application, which is not a property anybody
 * designed and not one a reader could have predicted.
 *
 * ## Why this is the policy module's problem and not the callers'
 *
 * The alternative was to thread a warn channel into every reader that lacks one — and the reader
 * that needs it most, `resolveCompatSources`, has none and sits two call sites away from anything
 * that does. That fix would be five edits that each have to be right, to restore a guarantee this
 * one function can simply keep.
 *
 * ## What it protects
 *
 * The whole operator tier is a set of REFUSALS — do not start this MCP server, do not let a skill
 * run shell, use this command for credentials. A refusal that silently fails to apply, in a process
 * where nobody is told, is the shape every item in this backlog has had. This is that shape in the
 * mechanism built to fix the others.
 */
function policyRootWith(settings: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'theokit-policy-replay-'))
  onTestFinished(() => {
    _resetOperatorPolicyForTests()
  })
  mkdirSync(join(root, 'claude-code'), { recursive: true })
  writeFileSync(join(root, 'claude-code', 'managed-settings.json'), JSON.stringify(settings))
  return root
}

describe('every reader of the operator policy hears what the first one heard', () => {
  it('replays a malformed-value refusal to the second reader', () => {
    // A string where a boolean is required. The operator believes shell execution is disabled.
    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: 'true' }))

    const first: string[] = []
    const second: string[] = []
    currentOperatorPolicy((w) => first.push(w))
    currentOperatorPolicy((w) => second.push(w))

    expect(first, 'the first reader heard nothing — the fixture is not malformed').not.toEqual([])
    expect(
      second,
      'the second reader heard nothing: the warning belongs to whoever ran first',
    ).toEqual(first)
  })

  it('replays to a third reader too, so the guarantee is not about pairs', () => {
    _resetOperatorPolicyForTests(policyRootWith({ apiKeyHelper: 42 }))

    const heard = [1, 2, 3].map(() => {
      const got: string[] = []
      currentOperatorPolicy((w) => got.push(w))
      return got
    })

    expect(heard[0]).not.toEqual([])
    expect(heard[1]).toEqual(heard[0])
    expect(heard[2]).toEqual(heard[0])
  })

  it('says nothing to anybody when the policy is well formed', () => {
    // The control. A module that replayed unconditionally would warn on every well-formed policy,
    // and a warning that always fires is one nobody reads.
    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: true }))

    const first: string[] = []
    const second: string[] = []
    expect(currentOperatorPolicy((w) => first.push(w)).disableSkillShellExecution).toBe(true)
    currentOperatorPolicy((w) => second.push(w))

    expect(first).toEqual([])
    expect(second).toEqual([])
  })

  it("does not carry a previous policy's warnings across a reset", () => {
    // The memo holds the warnings now, so the reset has to clear BOTH or a malformed policy keeps
    // complaining after it is replaced. Added because mutating the reset to forget `cachedWarnings`
    // left all four other assertions green — a gap the mutation found and the suite had not.
    //
    // This is not only a test-isolation concern: `_resetOperatorPolicyForTests` is the seam a host
    // uses to re-read a policy that changed on disk, and stale refusals replayed after a fix would
    // tell an operator their corrected policy is still wrong.
    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: 'true' }))
    const before: string[] = []
    currentOperatorPolicy((w) => before.push(w))
    expect(
      before,
      'the fixture is not malformed — the rest of this test proves nothing',
    ).not.toEqual([])

    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: true }))
    const after: string[] = []
    currentOperatorPolicy((w) => after.push(w))

    expect(after, 'the replaced policy is well formed and still complained').toEqual([])
  })

  it('says nothing when there is no policy file at all', () => {
    // The second control, and the load-bearing one: most machines have no operator tier, and a
    // reader that complained about its absence would make the feature a prerequisite for running.
    const root = mkdtempSync(join(tmpdir(), 'theokit-policy-none-'))
    onTestFinished(() => {
      _resetOperatorPolicyForTests()
    })
    _resetOperatorPolicyForTests(root)

    const heard: string[] = []
    currentOperatorPolicy((w) => heard.push(w))
    currentOperatorPolicy((w) => heard.push(w))

    expect(heard).toEqual([])
  })
})
