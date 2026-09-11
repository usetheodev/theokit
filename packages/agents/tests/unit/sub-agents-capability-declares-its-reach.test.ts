import { describe, expect, it } from 'vitest'

import { applyCapabilities } from '../../src/capability/capability.js'
import { SubAgentsCapability } from '../../src/capability/agent-capabilities.js'
import { ModelCapability } from '../../src/capability/capabilities.js'
import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'

/**
 * `@SubAgents` compiles, and what it compiles now reaches `Agent.create`.
 *
 * ## What this file used to pin, and why it changed
 *
 * It pinned the opposite: `compiled.agents` was NOT projected, recorded as ADR D3 — "a resolver
 * here is carried, not invoked". The test existed as a tripwire with an instruction attached: "if
 * someone later wires the projection, this file goes red and is the place to record that the
 * deferral ended". This is that record.
 *
 * The deferral ended because the shape a consumer meets could not be defended. `SubAgentsCapability`
 * crosses the public barrel (`capability/index.ts` re-exports `agent-capabilities.js`, and the root
 * barrel re-exports that), alongside `SubagentDefinition`, `discoverSubagents`,
 * `loadSubagentDefinition` and `listSubagentNames`. Someone reading the barrel assembles the
 * authoring chain and meets silence — the "the type crossed, the capability did not" failure this
 * package already names four times by issue number (#663, #668, #675, #686).
 *
 * ## Why projecting, rather than un-exporting
 *
 * The alternative was to stop exporting the capability. What made projection the smaller change is
 * that the SHAPES already agreed everywhere except in the one type nothing consumed.
 * `RuntimeOverrides.agents` — the per-run door that always worked — is
 * `Record<string, AgentDefinition>`, the SDK's own shape, and that same shape already crossed the
 * barrel as `SubagentDefinition`. The odd one out was `CompiledSubAgent` (`{ model?, systemPrompt? }`),
 * referenced in exactly two places, both of them its own declaration and the field that held it.
 *
 * It could not have been projected as it stood: `AgentDefinition` requires `description` and
 * `prompt`, and `CompiledSubAgent` carried neither — a sub-agent with no description is one the
 * parent model has no basis to delegate to. Adopting the SDK shape removes the mismatch instead of
 * inventing a mapping for it.
 *
 * ## Precedence
 *
 * Per-run `RuntimeOverrides.agents` still wins over the compiled set. It is named "overrides", and a
 * per-run value that lost to a compile-time one would be the opposite of what that word promises.
 */
// No `model` key: adopting the SDK shape means `model` is `ModelSelection | 'inherit'`, not a bare
// string, and the typechecker said so the moment this file was handed to it. The old local type
// took `model?: string` — one more way the two shapes had drifted apart.
const HELPER = {
  description: 'Looks a record up',
  prompt: 'You look records up.',
} as const

describe('the sub-agents capability reaches Agent.create', () => {
  it('test_compiled_agents_are_carried_on_the_compiled_options', () => {
    const compiled = applyCapabilities([
      new ModelCapability('m'),
      new SubAgentsCapability({ helper: HELPER }),
    ])
    expect(
      compiled.agents,
      'the capability stopped populating the field it exists to populate',
    ).toHaveProperty('helper')
  })

  it('test_compiled_agents_ARE_projected_into_the_sdk_options', () => {
    const compiled = applyCapabilities([
      new ModelCapability('m'),
      new SubAgentsCapability({ helper: HELPER }),
    ])
    const { options } = assembleM8CreateOptions(compiled)

    expect(
      (options as Record<string, unknown>).agents,
      'declaring a sub-agent through the authoring chain compiles cleanly and spawns nothing',
    ).toEqual({ helper: HELPER })
  })

  it('test_no_agents_key_when_none_were_declared', () => {
    // The control. A projection that always wrote the key would hand `Agent.create` an empty
    // `agents: {}` for every agent in the world, which is not the same as not declaring one.
    const compiled = applyCapabilities([new ModelCapability('m')])
    const { options } = assembleM8CreateOptions(compiled)
    expect((options as Record<string, unknown>).agents).toBeUndefined()
  })
})
