import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

import {
  currentOperatorPolicy,
  _resetOperatorPolicyForTests,
  type OperatorPolicy,
} from '../../src/config/operator-policy.js'

/**
 * A consumer could not see the operator policy, so it could not report what the policy refused.
 *
 * `disableAllHooks` shipped in 13.2.0 and the switch works. But `OperatorPolicy` and
 * `currentOperatorPolicy` were never exported, so nothing downstream could ASK whether a policy was
 * in force. Measured against the published package: an audit of all 628 exported symbols against the
 * built `.d.ts` found `OperatorPolicy` declared in none of them and `currentOperatorPolicy` present
 * only inside a docblock — a comment I wrote myself, which is why a grep read it as present.
 *
 * ## What that costs, concretely
 *
 * TheoCode's `doctor` tells its operator what is and is not in force. With the policy unreadable it
 * can only report `hooks: none`, which an operator cannot distinguish from "no hooks are configured"
 * — the exact ambiguity `disableAllHooks` exists to remove. A control that works and cannot be
 * observed produces the same silence as a control that does not work.
 *
 * ## Why this is the same defect, one layer up
 *
 * Every item in this batch has had the shape "declared, and unreachable". This one is in the TYPE
 * layer: the runtime behaviour is correct and the consumer has no way to name it. The five product
 * gates all passed green without noticing, which is the argument for the second verification layer
 * — the one that asks whether the surfaces a release claims are actually present.
 */
function policyRootWith(settings: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'theokit-policy-read-'))
  onTestFinished(() => {
    _resetOperatorPolicyForTests()
  })
  mkdirSync(join(root, 'claude-code'), { recursive: true })
  writeFileSync(join(root, 'claude-code', 'managed-settings.json'), JSON.stringify(settings))
  return root
}

describe('a consumer can read what the operator policy refuses', () => {
  it('reports that hooks are refused, distinguishably from none being configured', () => {
    // The whole point. A diagnostic must be able to say WHY there are no hooks.
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: true }))

    const policy: OperatorPolicy = currentOperatorPolicy(() => undefined)

    expect(policy.disableAllHooks).toBe(true)
  })

  it('distinguishes "no policy deployed" from "policy says false"', () => {
    // `undefined` and `false` must not collapse: the first means nobody decided, the second means
    // somebody decided hooks may run. A diagnostic that showed them alike would invent a decision.
    _resetOperatorPolicyForTests(policyRootWith({}))
    expect(currentOperatorPolicy(() => undefined).disableAllHooks).toBeUndefined()

    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: false }))
    expect(currentOperatorPolicy(() => undefined).disableAllHooks).toBe(false)
  })

  it('carries every key the policy governs, not only the hook switch', () => {
    // A consumer reporting policy state needs the whole shape. Exporting one field's worth would
    // make the next diagnostic reach past the type again.
    _resetOperatorPolicyForTests(
      policyRootWith({
        disableAllHooks: true,
        disableSkillShellExecution: true,
        deniedMcpServers: ['github'],
        allowedMcpServers: ['local'],
        apiKeyHelper: '/usr/bin/mint',
      }),
    )

    const policy = currentOperatorPolicy(() => undefined)

    expect(policy).toEqual({
      disableAllHooks: true,
      disableSkillShellExecution: true,
      deniedMcpServers: ['github'],
      allowedMcpServers: ['local'],
      apiKeyHelper: '/usr/bin/mint',
    })
  })

  it('hands the reader the same refusals the framework heard', () => {
    // B-075 made the warnings replay. A consumer reading the policy to build a diagnostic is exactly
    // the reader that needs them: a malformed key is something the operator must be told about, and
    // the diagnostic is where they would look.
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: 'true' }))

    const heard: string[] = []
    const policy = currentOperatorPolicy((w) => heard.push(w))

    expect(policy.disableAllHooks, 'a malformed value must still fail closed').toBe(true)
    expect(heard.join('\n')).toMatch(/disableAllHooks/)
  })
})
