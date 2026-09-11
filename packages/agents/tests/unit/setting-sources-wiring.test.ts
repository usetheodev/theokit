import { describe, expect, it } from 'vitest'

import type { CompiledAgentOptions } from '../../src/bridge/agent-compiler.js'
import { compileAgentDefinition, defineAgent } from '../../src/bridge/define-agent.js'
import {
  UntrustedSettingSourceError,
  type SettingSourceCapability,
} from '../../src/bridge/setting-sources-gate.js'
import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'
import { resolveSettingSources } from '../../src/bridge/setting-sources-gate.js'
import { resolveTrustPosture } from '../../src/index.js'
import type { TrustPosture } from '../../src/index.js'

/** Postures built through the SDK's real path, not object literals — provenance is the point. */
function posture(isTrusted: boolean): TrustPosture<SettingSourceCapability> {
  return resolveTrustPosture<SettingSourceCapability>({
    capabilities: ['projectSettings'],
    isTrusted: () => isTrusted,
  })
}
const denyingPosture = () => posture(false)
const grantingPosture = () => posture(true)

/**
 * M68 T4 — the trust gate has to sit ON the build path, not next to it.
 *
 * ## What was measured before this test existed
 *
 * `setting-sources-gate.ts` shipped a real gate: `resolveSettingSources(selection)` refuses
 * `project` unless a `TrustPosture` grants `projectSettings`. The CHANGELOG said so, and said
 * honestly that it was not wired yet.
 *
 * What it did NOT say is that `sdk-adapter-create-options.ts` declares a **local function of the
 * same name**, and that this one is what the build path calls. A grep for `resolveSettingSources`
 * finds the gate, its export, and its tests — and lands on a homonym that consults no posture at
 * all. The gate looked wired. That is worse than an absent gate, and it is the same defect shape
 * this codebase kept finding all cycle: the name promises what the oracle does not measure.
 *
 * ## Why this is the highest severity in the list
 *
 * `project` is the source that reads `<cwd>/.theokit/` — **including `hooks.json`, which executes
 * shell**. For the class of product this framework addresses (an agent whose `cwd` is a repository
 * the user just cloned) that content is attacker-controlled. Enabling `project` without evidence is
 * remote code execution on the first run.
 *
 * The two assertions below are the exploit, written as tests: an agent that never asked for
 * `project` gets it, and an agent that asks for it gets it without any posture being consulted.
 */

/** The minimum a compiled agent needs for the adapter to project it. */
function compiledWith(extra: Partial<CompiledAgentOptions>): CompiledAgentOptions {
  return {
    model: 'anthropic/claude-sonnet-5',
    tools: [],
    agents: {},
    ...extra,
  } as CompiledAgentOptions
}

describe('M68 — the project setting source requires evidence on the BUILD path', () => {
  it('test_declaring_skills_does_NOT_silently_enable_the_project_source', () => {
    // The escalation nobody asked for. Declaring inline skills is a statement about prompts; it is
    // not consent to execute shell from the working directory. The two got welded together as
    // "back-compat", which means every agent with a skill has been reading `<cwd>/.theokit/`.
    const { options } = assembleM8CreateOptions(
      compiledWith({ skills: { include: ['demo'] } } as Partial<CompiledAgentOptions>),
    )
    expect(
      options.local?.settingSources ?? [],
      'declaring skills enabled the `project` source, which reads shell-executing hooks from the ' +
        'working directory. Skills are a prompt concern; reading <cwd>/.theokit/ is a trust decision.',
    ).not.toContain('project')
  })

  it('test_defineAgent_refuses_the_project_source_without_a_granting_posture', () => {
    // The other half, asserted where the decision actually lives. The adapter cannot re-check it:
    // by then the grant is gone and only the resolved strings remain. So the property enforced is
    // that no AUTHORING path can put `project` into the compiled options without evidence — which
    // is stronger than a late check, because it fails before the value travels
    // (`error-handling.md` § 3).
    const def = defineAgent({
      model: 'anthropic/claude-sonnet-5',
      settingSources: { project: { trustedBy: denyingPosture() } },
    })
    // `defineAgent` only records the declaration; `compileAgentDefinition` is the point every
    // authoring path converges on, which is why the gate runs there and not in three places.
    expect(() => compileAgentDefinition(def)).toThrow(UntrustedSettingSourceError)
  })

  it('test_the_refusal_says_WHERE_the_decision_came_from', () => {
    // A denial that does not name its source sends the operator guessing between "my env var did
    // not take" and "the store says no". `TrustPosture.source` is exactly that provenance, and it
    // is why the gate takes the SDK's posture instead of a bare boolean.
    try {
      compileAgentDefinition(
        defineAgent({
          model: 'anthropic/claude-sonnet-5',
          settingSources: { project: { trustedBy: denyingPosture() } },
        }),
      )
      expect.unreachable('the project source was granted without a posture')
    } catch (error) {
      expect(error).toBeInstanceOf(UntrustedSettingSourceError)
      expect((error as UntrustedSettingSourceError).trustSource).toBeTypeOf('string')
      expect((error as UntrustedSettingSourceError).capability).toBe('projectSettings')
    }
  })

  it('test_a_GRANTING_posture_does_enable_the_project_source', () => {
    // The counter-proof that keeps this from being a blanket ban. Without it, hard-coding a throw
    // would pass every negative case above — a gate that refuses everything is not a gate, and the
    // consumer that measured this (TheoCode) already had the right decision and only needed a way
    // to pass it through.
    const compiled = compileAgentDefinition(
      defineAgent({
        model: 'anthropic/claude-sonnet-5',
        settingSources: { user: true, project: { trustedBy: grantingPosture() } },
      }),
    )
    expect(compiled.settingSources).toEqual(['user', 'project'])
  })

  it('test_the_user_source_is_still_allowed_without_evidence', () => {
    // Counter-proof, and the asymmetry that makes the gate meaningful rather than a blanket ban:
    // `~/.theokit/` is the operator's own machine, and no third party controls it. A gate that
    // refused both would be refused by users and turned off.
    const { options } = assembleM8CreateOptions(
      compiledWith({ settingSources: resolveSettingSources({ user: true }) }),
    )
    expect(options.local?.settingSources).toEqual(['user'])
  })

  it('test_an_agent_that_declares_nothing_reads_no_disk_at_all', () => {
    // The default has to be the safe one. Omitting a root is not enabling it.
    const { options } = assembleM8CreateOptions(compiledWith({}))
    expect(options.local?.settingSources).toBeUndefined()
  })

  it('test_plugins_is_refused_by_an_untrusting_posture', () => {
    // B-004 — `plugins` takes the same grant as `project` and not a weaker one: it loads executable
    // bundles from the same cwd-controlled tree, which usually arrived with the clone.
    expect(() => resolveSettingSources({ plugins: { trustedBy: denyingPosture() } })).toThrow(
      /plugins/,
    )
  })

  it('test_plugins_reaches_the_sdk_once_the_posture_grants_it', () => {
    // The half of B-004 that survived measurement: `includesSetting` is called with exactly
    // "project" and "plugins" (local-agent.ts:174-175), and this facade exposed neither `plugins`
    // nor a way to get it — so a consumer wanting plugin bundles had to bypass the gate entirely.
    expect(resolveSettingSources({ plugins: { trustedBy: grantingPosture() } })).toEqual([
      'plugins',
    ])
  })

  it('test_the_resolved_list_is_exactly_the_roots_the_sdk_reads', () => {
    // The half that did NOT survive. The item was filed about `team` and `mdm`; measured,
    // `includesSetting` is never called with either, so plumbing them through would forward a name
    // the runtime discards — a capability in the type and nothing at runtime.
    //
    // This asserted `not.toContain('team')` and `not.toContain('mdm')`, which could not fail:
    // nothing in `resolveSettingSources` can emit either name, so inverting the decision the test
    // is named after — plumbing them through — left it green. An EXACT list is what pins the
    // decision: adding a root here fails this line, which is the moment to ask whether the SDK
    // reads it.
    const resolved: readonly string[] = resolveSettingSources({
      user: true,
      project: { trustedBy: grantingPosture() },
      plugins: { trustedBy: grantingPosture() },
    })
    expect(resolved).toEqual(['user', 'project', 'plugins'])
  })
})
