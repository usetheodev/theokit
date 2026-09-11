import { describe, expect, it } from 'vitest'

import type { CompiledAgentOptions } from '../../src/bridge/agent-compiler.js'
import { compileAgentDefinition, defineAgent } from '../../src/bridge/define-agent.js'
import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'
import { applyCapabilities } from '../../src/capability/capability.js'
import {
  AgentConfigCapability,
  CheckpointCapability,
  ContextWindowCapability,
  GuardrailsCapability,
  HumanInTheLoopCapability,
  MainLoopCapability,
  McpServersCapability,
  MemoryCapability,
  PluginsCapability,
  ProjectContextCapability,
  RunContextCapability,
  SettingSourcesCapability,
  SkillsResolverCapability,
  HookApprovalCapability,
  CanUseToolCapability,
  SessionStoreCapability,
  SubAgentsCapability,
} from '../../src/capability/agent-capabilities.js'
import {
  ModelCapability,
  SkillsCapability,
  ToolsCapability,
} from '../../src/capability/capabilities.js'
import { CapabilityRegistry } from '../../src/capability/registry.js'

/**
 * M52 T0.4 — ZERO-BEHAVIOR proof. Equivalence is DEEP-EQUAL, not textual: top-level key order
 * differs between the two paths and is NOT part of the contract (nothing in the package serializes
 * or hashes compiled options — `Object.keys` appears only over nested values, see
 * sdk-adapter-create-options.ts:76,91). The capability path must produce the SAME `CompiledAgentOptions`
 * (the existing narrow waist) as the canonical `defineAgent` source, and therefore the SAME
 * `Agent.create` options out of the shared adapter. This proved the capability path equivalent to the canonical defineAgent source at the
 * waist AND at the adapter — the evidence M53 used to delete the decorator source (now gone).
 */

/**
 * The waist's COMPLETE field set, derived from the type — `satisfies` rejects a name that is not a
 * real field, and the `_Exhaustive` check below fails to COMPILE if `CompiledAgentOptions` gains a
 * field nobody classified. The universe cannot drift away from reality silently.
 */
type WaistField = keyof CompiledAgentOptions
const WAIST_FIELDS = [
  'model',
  'reasoningEffort',
  'parseThinkTags',
  'stripToolDialect',
  'recoverLeakedToolCalls',
  'systemPrompt',
  'settingSources',
  'compatSources',
  'plugins',
  'tools',
  'agents',
  'memory',
  'skills',
  'context',
  'runContext',
  'projectContext',
  'mcpServers',
  'maxIterations',
  'timeoutMs',
  'stream',
  'hitl',
  'checkpoint',
  'guardrails',
  'skillsResolver',
  'hookApproval',
  // B-060 — `SessionStoreCapability`. Added because this compile-time gate demanded it: a new waist
  // field must be classified before the tests compile, and it fired on the same commit that
  // introduced the field.
  'sessionStore',
  // B-056 — `CanUseToolCapability`. Same gate, same commit-time demand.
  'canUseTool',
] as const satisfies readonly WaistField[]

/**
 * Compile-time exhaustiveness: a new waist field must be classified here before tests compile.
 * ENFORCED BY THE ROOT `tsconfig.json` ONLY — it is the one whose `include` reaches the packages'
 * test trees. The package's own tsconfig covers sources only, and vitest strips types via esbuild,
 * so `npm run typecheck` at the repo root is what keeps this half of the gap pin alive. A CI that
 * only ran per-package checks would let it go dark; the runtime assertion below still fires.
 */
type _Exhaustive =
  Exclude<WaistField, (typeof WAIST_FIELDS)[number]> extends never
    ? true
    : ['unclassified waist field']
const WAIST_FIELDS_ARE_EXHAUSTIVE: _Exhaustive = true

/**
 * Waist fields NO capability can express — EMPTY since M53 § A landed the remaining twelve. This
 * being empty IS M53's entry criterion: the decorator source may only be deleted when nothing it
 * produces is left without a replacement. The assertion is exact set equality, so if a capability
 * ever stops producing its field the gap reappears and the test fails; `satisfies` makes a
 * fabricated name a compile error.
 */
const NOT_EXPRESSIBLE_YET = [] as const satisfies readonly WaistField[]

/** A posture that grants — built here rather than mocked, so the gate runs its real refusal path. */
const TRUSTING_POSTURE = {
  level: 'trusted',
  source: 'env',
  allows: { projectSettings: true },
} as const

/** The draft carries `provenance` (new diagnostics) — not part of the waist, so it is stripped. */
function waistOf(draft: Record<string, unknown>): Record<string, unknown> {
  const { provenance: _p, ...waist } = draft
  return waist
}

describe('capability path ≡ defineAgent path (zero-behavior)', () => {
  it('produces a deep-equal CompiledAgentOptions for the same logical agent', () => {
    const reference = compileAgentDefinition(
      defineAgent({ model: 'openai/gpt-5.4', skills: ['code-review', 'testing'] }),
    )
    const viaCapabilities = applyCapabilities([
      new ModelCapability('openai/gpt-5.4'),
      new SkillsCapability(['code-review', 'testing']),
    ])
    expect(waistOf(viaCapabilities as unknown as Record<string, unknown>)).toEqual(reference)
  })

  it('carries compatSources down BOTH paths, not just defineAgent (#634)', () => {
    // The zero-behavior contract is what makes this worth its own case: `compatSources` is derived
    // from the same `settingSources` selection, so a capability that resolves one and forgets the
    // other produces a waist that differs from `defineAgent` in a field nobody reads until the
    // foreign dialect silently fails to load.
    const selection = {
      project: { trustedBy: TRUSTING_POSTURE },
      claudeCode: { trustedBy: TRUSTING_POSTURE },
    }

    const reference = compileAgentDefinition(
      defineAgent({ model: 'openai/gpt-5.4', settingSources: selection }),
    )
    const viaCapabilities = applyCapabilities([
      new ModelCapability('openai/gpt-5.4'),
      new SettingSourcesCapability(selection),
    ])

    // `CompatSource` is `"claude-code"` in the SDK — kebab, verified against the published package
    // (see the note at the literal in `setting-sources-gate.ts` for how, and for why the type is
    // not imported while the floor is `^4.52.1`).
    expect(reference.compatSources).toEqual(['claude-code'])
    expect(waistOf(viaCapabilities as unknown as Record<string, unknown>)).toEqual(reference)
  })

  it('produces equivalent Agent.create options through the SHARED adapter', () => {
    const def = defineAgent({ model: 'openai/gpt-5.4', skills: ['code-review'] })
    const fromDefine = assembleM8CreateOptions(compileAgentDefinition(def))
    const fromCapabilities = assembleM8CreateOptions(
      waistOf(
        applyCapabilities([
          new ModelCapability('openai/gpt-5.4'),
          new SkillsCapability(['code-review']),
        ]) as unknown as Record<string, unknown>,
      ) as never,
    )
    expect(fromCapabilities.options).toEqual(fromDefine.options)
    expect(fromCapabilities.applied).toEqual(fromDefine.applied)
  })

  it('the FILE-BASED path (registry) reaches the same waist — the Agent Builder authoring route', () => {
    const registry = new CapabilityRegistry()
      .register('model', (id) => new ModelCapability(id as string))
      .register('skills', (names) => new SkillsCapability(names as string[]))
    const fromFile = applyCapabilities(
      [
        { name: 'model', arg: 'openai/gpt-5.4' },
        { name: 'skills', arg: ['code-review'] },
      ].map((c) => registry.resolve(c.name, c.arg)),
    )
    const reference = compileAgentDefinition(
      defineAgent({ model: 'openai/gpt-5.4', skills: ['code-review'] }),
    )
    expect(waistOf(fromFile as unknown as Record<string, unknown>)).toEqual(reference)
  })
})

/**
 * The waist-coverage pins. The decorator compiler these once compared against was DELETED in M53;
 * what survives is the structural guarantee it protected: the field universe stays exhaustive
 * (compile-time), and every waist field is expressible by some capability (`NOT_EXPRESSIBLE_YET`
 * is empty). If a capability ever stops producing its field, the gap reappears and this fails.
 */
describe('capability path — waist coverage is complete', () => {
  it('the waist field list is exhaustive (fails to COMPILE if a new field is unclassified)', () => {
    expect(WAIST_FIELDS_ARE_EXHAUSTIVE).toBe(true)
  })

  it('PINS the gap by DERIVING both sides — an over-claim fails as loudly as an omission', () => {
    // expressible = what the layer ACTUALLY produces when every capability it ships is applied.
    // Deriving it (instead of hardcoding) is what makes this assertion able to fail: the earlier
    // version unioned its own answer into the question and passed for any fabricated field.
    const everything = applyCapabilities([
      new ModelCapability('openai/gpt-5.4', 'high'),
      new ToolsCapability([{ name: 't' } as never]),
      new SkillsCapability(['a']),
      new AgentConfigCapability({
        systemPrompt: 's',
        parseThinkTags: true,
        stripToolDialect: true,
        recoverLeakedToolCalls: true,
        stream: true,
      }),
      new MainLoopCapability({ maxIterations: 1, timeoutMs: 1 }),
      new MemoryCapability({ provider: 'mem0' } as never),
      new ContextWindowCapability({ maxTokens: 1 } as never),
      new ProjectContextCapability({ enabled: true } as never),
      new McpServersCapability({} as never),
      new GuardrailsCapability([] as never),
      new CheckpointCapability({ storage: 'memory' } as never),
      new HumanInTheLoopCapability(new Map() as never),
      new SubAgentsCapability({ c: {} } as never),
      // B-060 — this fixture is "every capability, fully switched on", so a new one belongs here or
      // its field reads as inexpressible when it was simply not asked for.
      new SessionStoreCapability({} as never),
      new CanUseToolCapability((() => ({ behavior: 'allow' })) as never),
      // #686 — the pre-spawn hook approval gate. Present here for the same reason the selection
      // below declares the foreign dialect: this fixture is "every capability, fully switched on",
      // and a field only produced when asked for reads as inexpressible when it simply was not.
      new HookApprovalCapability({ approve: () => true }),
      // Declares the foreign dialect, because this fixture's job is "every capability, fully
      // switched on" — and `compatSources` only exists when it is asked for. An empty selection
      // here would report the field as inexpressible when it simply was not requested.
      new SettingSourcesCapability({ claudeCode: { trustedBy: TRUSTING_POSTURE } } as never),
      new PluginsCapability([] as never),
      new RunContextCapability({} as never),
      new SkillsResolverCapability((() => []) as never),
    ])
    const expressible = new Set(Object.keys(everything).filter((k) => k !== 'provenance'))
    const gap = WAIST_FIELDS.filter((f) => !expressible.has(f))

    expect([...gap].sort((a, b) => a.localeCompare(b))).toEqual(
      [...(NOT_EXPRESSIBLE_YET as readonly string[])].sort((a, b) => a.localeCompare(b)),
    )
  })
})
