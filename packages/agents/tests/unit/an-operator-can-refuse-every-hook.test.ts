import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

import { resolveCompatSources } from '../../src/bridge/setting-sources-gate.js'
import type { SettingSourcesSelection } from '../../src/bridge/setting-sources-gate.js'
import { _resetOperatorPolicyForTests } from '../../src/config/operator-policy.js'

/**
 * B-042 — hooks executed and nothing governed them.
 *
 * `.claude/hooks.json` runs shell commands out of a working directory, and the operator tier had no
 * switch for it. Measured 2026-09-11 with a control: `disableAllHooks`, `allowManagedHooksOnly`,
 * `allowedHttpHookUrls` and `httpHookAllowedEnvVars` returned 0 files each against `hooks` = 35, and
 * `currentOperatorPolicy` was consulted by exactly three modules — none of them a hook path.
 *
 * The registry recorded this as DONE. It was not: the operator tier B-065 built is real and governs
 * `disableSkillShellExecution`, `deniedMcpServers`, `allowedMcpServers` and `apiKeyHelper`, and never
 * received the hooks switch. A security control recorded as shipped and absent is worse than one
 * recorded as missing, because nobody goes looking for it. Confirmed at runtime from the downstream
 * product, whose own diagnostic says of `.claude/settings.json`: "they run WITHOUT this product's
 * per-hook approval".
 *
 * ## Why the gate is the enforcement point
 *
 * `resolveCompatSources` is what grants `<cwd>/.claude/`, and its own refusal message already says
 * "including hooks.json, which executes shell". Dropping the surface there is one place rather than
 * a new path, and it bites whether the consumer took the whole root or narrowed it.
 *
 * ## Why a malformed value fails CLOSED here, unlike every sibling key
 *
 * The other four keys ignore an unparseable value and warn. For this one that is fail-OPEN: an
 * operator who writes `"disableAllHooks": "true"` gets hooks running while believing they are off.
 * The asymmetry decides it — fail-open is silent and unsafe, fail-closed is loud and recoverable:
 * hooks stop, somebody notices, the typo gets fixed. For a control whose entire purpose is refusing,
 * failing toward the refusal is the only direction where the failure announces itself.
 */
const trusted = {
  trustedBy: { level: 'trusted', source: 'test', allows: { projectSettings: true } },
} as unknown as NonNullable<SettingSourcesSelection['claudeCode']>

function policyRootWith(settings: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'theokit-hooks-policy-'))
  onTestFinished(() => {
    _resetOperatorPolicyForTests()
  })
  mkdirSync(join(root, 'claude-code'), { recursive: true })
  writeFileSync(join(root, 'claude-code', 'managed-settings.json'), JSON.stringify(settings))
  return root
}

describe('an operator can refuse every hook', () => {
  it('drops hooks from the WHOLE root, leaving the other surfaces', () => {
    // The bare literal grants every surface, so enforcing means narrowing to the rest. A consumer
    // who took the whole root keeps their skills, subagents, commands and plugins.
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: true }))

    const resolved = resolveCompatSources({ claudeCode: trusted })

    expect(resolved).toEqual([
      { kind: 'claude-code', import: ['commands', 'plugins', 'skills', 'subagents'] },
    ])
  })

  it('drops hooks from a narrowed list and keeps what else it named', () => {
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: true }))

    const resolved = resolveCompatSources({
      claudeCode: { ...trusted, import: ['skills', 'hooks', 'subagents'] },
    })

    expect(resolved).toEqual([{ kind: 'claude-code', import: ['skills', 'subagents'] }])
  })

  it('grants NOTHING when hooks were the only surface asked for', () => {
    // Not an empty import list: `#686` refuses that as ambiguous. The honest answer is that no
    // compat source survives, which is what an empty result says.
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: true }))

    expect(resolveCompatSources({ claudeCode: { ...trusted, import: ['hooks'] } })).toEqual([])
  })

  it('treats a malformed value as ON, and says so', () => {
    // Fail CLOSED. An operator who wrote `"true"` as a string gets hooks refused, not hooks running.
    const warnings: string[] = []
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: 'true' }))

    const resolved = resolveCompatSources({ claudeCode: trusted }, (w) => warnings.push(w))

    expect(resolved).toEqual([
      { kind: 'claude-code', import: ['commands', 'plugins', 'skills', 'subagents'] },
    ])
    expect(warnings.join('\n'), 'the operator is not told which way it failed').toMatch(
      /disableAllHooks/,
    )
  })

  it('leaves the whole root alone when the operator said nothing', () => {
    // The control that keeps this from becoming a default. Most machines have no operator tier, and
    // a gate that narrowed every consumer by default would remove hooks nobody asked to remove.
    _resetOperatorPolicyForTests(policyRootWith({}))

    expect(resolveCompatSources({ claudeCode: trusted })).toEqual(['claude-code'])
  })

  it('leaves the whole root alone when the operator explicitly said false', () => {
    // The second control. `false` must be distinguishable from absent AND from malformed.
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: false }))

    expect(resolveCompatSources({ claudeCode: trusted })).toEqual(['claude-code'])
  })

  it('cannot be overridden from the project tree it governs', () => {
    // The DoD's second bullet. The switch lives in the operator policy, which is read from a
    // platform-owned path — a project `.claude/settings.json` has no way to reach it, and this
    // pins that the gate consults the operator tier rather than anything under `cwd`.
    _resetOperatorPolicyForTests(policyRootWith({ disableAllHooks: true }))

    const resolved = resolveCompatSources({ claudeCode: { ...trusted, import: ['hooks'] } })

    expect(resolved, 'a project cannot grant itself the surface the operator refused').toEqual([])
  })
})
