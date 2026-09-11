import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { expandCommandTemplate, type TemplateDeps } from '../../src/config/command-template.js'
import { _resetOperatorPolicyForTests } from '../../src/config/operator-policy.js'

/**
 * A skill body could run shell and nothing could stop it except not reading skills at all.
 *
 * A skill is a markdown file a repository can carry, and `` !`command` `` in its body executes at
 * expansion time. Measured: `disableSkillShellExecution` returned 0 files here and 0 in the SDK dist,
 * against a control of 31 on the word `hooks`. The only way to decline was to stop reading skills.
 *
 * ## Why the switch lives INSIDE the expander
 *
 * This module's invariant was "never spawns anything and never opens a file — `shell` and `readFile`
 * are injected, [because] the trust decision is the caller's, not this module's."
 *
 * That reason is the one B-065 overturned. An operator who did not write the code can now impose
 * policy on it (`packages/agents/README.md` § "Who decides policy"), so "the caller decides" is no
 * longer the whole answer — it is the answer for everything the operator has not spoken about.
 * Leaving the check to the caller would have made it a constructor argument again, which is the
 * shape the decision replaced.
 *
 * The module still spawns nothing: it refuses BEFORE calling the injected `shell`.
 *
 * ## What this does not pretend
 *
 * `expandCommandTemplate` has zero production callers — measured across `theokit`, `theokit-sdk`,
 * `theokit-tui`, `theokit-studio` and `theokit-hub`. So this closes a hazard that has no live path
 * today. Enforcing it at a call site that does not exist would have been the unreachable-control
 * failure; enforcing it here means the switch bites the moment a caller appears, rather than being
 * remembered then.
 */
function policyRootWith(settings: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'theokit-skill-shell-'))
  onTestFinished(() => {
    _resetOperatorPolicyForTests()
  })
  mkdirSync(join(root, 'claude-code'), { recursive: true })
  writeFileSync(join(root, 'claude-code', 'managed-settings.json'), JSON.stringify(settings))
  return root
}

function deps(): TemplateDeps & {
  shell: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
} {
  return {
    warn: vi.fn(),
    shell: vi.fn(async () => ({ text: 'RAN', ok: true })),
    readFile: vi.fn(() => 'file body'),
  } as never
}

describe('an operator can stop a skill body from running shell', () => {
  it('refuses the inline command when the policy forbids it', async () => {
    const d = deps()
    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: true }))

    await expect(
      expandCommandTemplate('before !`rm -rf /` after', '', d),
      'a repository-carried skill ran shell and the operator had no way to decline',
    ).rejects.toThrow(/disableSkillShellExecution|policy/i)

    expect(d.shell, 'the command was spawned before the refusal').not.toHaveBeenCalled()
  })

  it('still runs the command when no policy forbids it', async () => {
    // The control. A refusal that fired without an operator saying so would break every command
    // template in every project — the opposite failure, and a louder one.
    const d = deps()
    _resetOperatorPolicyForTests(policyRootWith({}))

    expect(await expandCommandTemplate('x !`echo hi` y', '', d)).toBe('x RAN y')
    expect(d.shell).toHaveBeenCalledTimes(1)
  })

  it('ignores a policy value it cannot read, and says so', async () => {
    // `"disableSkillShellExecution": "true"` — a string, not a boolean, which is the shape somebody
    // writing JSON by hand produces. Accepting it by truthiness would make `"false"` forbid shell
    // too; accepting it silently either way leaves the organisation believing something applies.
    const d = deps()
    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: 'true' }))

    expect(await expandCommandTemplate('x !`echo hi` y', '', d)).toBe('x RAN y')
    expect(
      d.warn.mock.calls.map((c) => String(c[0])).join(''),
      'a policy value this layer could not read was dropped without a word',
    ).toContain('disableSkillShellExecution')
  })

  it('leaves everything that is not a command alone', async () => {
    // The second control: the switch governs SHELL, not expansion. A `@file` reference and a `$1`
    // placeholder are not command execution and must survive a policy that forbids it.
    const d = deps()
    _resetOperatorPolicyForTests(policyRootWith({ disableSkillShellExecution: true }))

    expect(await expandCommandTemplate('see @notes.md for $1', 'alpha', d)).toBe(
      'see file body for alpha',
    )
  })
})
