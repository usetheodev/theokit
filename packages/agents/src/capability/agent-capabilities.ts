import type { CompiledAgentOptions } from '../bridge/agent-compiler.js'
import {
  compileContextWindow,
  type ContextWindowOptions,
} from '../bridge/compile-context-window.js'
import { compileSkills, type SkillsOptions } from '../bridge/compile-skills.js'
import {
  resolveCompatSources,
  resolveSettingSources,
  type SettingSourcesSelection,
} from '../bridge/setting-sources-gate.js'
import { ConfigurationError } from '../errors.js'

import { type Capability, type CompiledAgentOptionsDraft, setOnce } from './capability.js'

/**
 * M53 — the capabilities that replace the waist-bound agent decorators, one per field the decorator
 * pipeline produces today.
 *
 * M57 reverses ADR 0001 § 4 (which kept the pure-assignment ones as a factory function to avoid
 * "13 near-identical classes"): the authoring surface is now 100% classes, aligned with the SDK's
 * `X.create()`/class shape. The `FieldCapability` base keeps the assignment ones DRY (one line each);
 * the behaviour-carrying ones are written out. Rationale in ADR 0005.
 */

/**
 * Base for a capability whose only job is to assign one waist field — no validation, no merge, no
 * precedence. M57: this replaces the `fieldCapability(name, field)` factory function with a class, so
 * the authoring surface is 100% classes (aligned with the SDK's `X.create()` and the existing
 * `ModelCapability`). The subclasses below are one line each; the shared `apply` lives here (DRY).
 * NOT the Template-Method the ADR-0001 refused — that was inheritance of variable *behaviour*
 * (`shouldContinue`); here the base carries *data* (name/field) and `apply` is identical for all.
 */
export abstract class FieldCapability<
  K extends keyof CompiledAgentOptionsDraft,
> implements Capability {
  abstract readonly name: string
  protected abstract readonly field: K
  constructor(private readonly value: NonNullable<CompiledAgentOptionsDraft[K]>) {}
  apply(draft: CompiledAgentOptionsDraft): void {
    setOnce(draft, this.field, this.value as CompiledAgentOptionsDraft[K], this.name)
  }
}

/** `@Memory` → `memory`. */
export class MemoryCapability extends FieldCapability<'memory'> {
  readonly name = 'memory'
  protected readonly field = 'memory' as const
}
/**
 * `@ContextWindow` → `context`. DELEGATES to `compileContextWindow`, which is the canonical
 * `ContextWindowOptions → ContextSettings` conversion (it also reports the metadata-only knobs).
 * Taking a pre-converted value here would duplicate that knowledge — the exact divergence the M52
 * zero-behavior proof caught in `skills`.
 */
export class ContextWindowCapability implements Capability {
  readonly name = 'context-window'
  constructor(private readonly options: ContextWindowOptions) {}
  apply(draft: CompiledAgentOptionsDraft): void {
    setOnce(draft, 'context', compileContextWindow(this.options).context, this.name)
  }
}
/** `@ProjectContext` → `projectContext`. */
export class ProjectContextCapability extends FieldCapability<'projectContext'> {
  readonly name = 'project-context'
  protected readonly field = 'projectContext' as const
}
/** `@MCP` → `mcpServers`. */
export class McpServersCapability extends FieldCapability<'mcpServers'> {
  readonly name = 'mcp'
  protected readonly field = 'mcpServers' as const
}
/** `@Guardrails` → `guardrails`. */
export class GuardrailsCapability extends FieldCapability<'guardrails'> {
  readonly name = 'guardrails'
  protected readonly field = 'guardrails' as const
}
/**
 * `@Checkpoint` → `checkpoint`. Carries the non-durable WARNING the metadata walk used to emit: only
 * `'filesystem'` selects the SDK's durable store, so any other storage cannot resume across
 * requests. The warning moves WITH the feature — a declared checkpoint that silently cannot resume
 * is exactly the kind of no-op this project refuses to ship.
 *
 * ## This is RUN-STATE checkpointing. It is not file undo, and the name is shared (B-059)
 *
 * What this saves is the conversation: enough to RESUME a run. It does not snapshot the files an
 * agent edited and cannot restore one.
 *
 * The distinction is written here because the word is the whole problem. Measured 2026-09-11:
 * `rewindFiles`, `rewind_files`, `restoreFile` and `backup` return 0 files in this package, 0 in the
 * SDK's `.d.ts` and 0 in `@theokit/sdk-tools`, while `checkpoint` returns six — all of them this
 * subject. **Any parity checklist that greps for `checkpoint` is satisfied by the wrong one**, and
 * reports a capability that does not exist.
 *
 * So a consumer building an interactive coding agent implements snapshot and restore themselves.
 * There is no pre-write seam on the edit tools to hang it on either, which is the part that makes it
 * a feature rather than a wiring job — and the reason it is stated here instead of half-built.
 *
 * Pinned by `tests/unit/run-state-checkpointing-is-not-file-undo.test.ts`, which goes red if a file
 * surface ever appears — at which point this section should go with it.
 */
export class CheckpointCapability implements Capability {
  readonly name = 'checkpoint'
  constructor(private readonly options: CompiledAgentOptions['checkpoint']) {}
  apply(draft: CompiledAgentOptionsDraft): void {
    if (this.options !== undefined && this.options.storage !== 'filesystem') {
      console.warn(
        `[THEO_AGENT_CHECKPOINT_STORAGE_METADATA_ONLY] checkpoint({ storage: '${this.options.storage ?? 'memory'}' }) ` +
          `does NOT resume across requests — only 'filesystem' selects the SDK's durable conversation ` +
          `store. Use checkpoint({ storage: 'filesystem' }) for cross-request resume.`,
      )
    }
    setOnce(draft, 'checkpoint', this.options, this.name)
  }
}
/**
 * `@HumanInTheLoop` → `hitl`, keyed `"<namespace>_<tool>"` — the same key `compileHitlGates` mints
 * via `toolRuntimeName`. The separator is `_`, not `.`: the dot is outside the charset the SDK
 * accepts, and a gate keyed with a dot silently failed to match its tool (theokit#145).
 */
export class HumanInTheLoopCapability extends FieldCapability<'hitl'> {
  readonly name = 'human-in-the-loop'
  protected readonly field = 'hitl' as const
}
/**
 * `@SubAgents` → `agents`. MERGES instead of `setOnce`: `agents` is a pre-seeded collection on the
 * draft (`createDraft` gives it `{}`), so a `setOnce` would conflict against the seed itself — the
 * same trap the pre-seeded `stream` sprang in M52. Merging also lets a preset declare a baseline
 * child set that a call site extends.
 *
 * ## How far this reaches
 *
 * **What it populates IS projected into `Agent.create`.** `assembleM8CreateOptions` forwards
 * `compiled.agents` to `Agent.create({ agents })`, so declaring a sub-agent through this capability
 * spawns one.
 *
 * That was not true until B-034. `M8CreateOptions` had no `agents` field, `agent-compiler.ts`
 * recorded the gap as ADR D3 — "a resolver here is carried, not invoked" — and declaring a sub-agent
 * through this capability compiled cleanly and spawned nothing, while the class crossed the public
 * barrel alongside `SubagentDefinition`, `discoverSubagents`, `loadSubagentDefinition` and
 * `listSubagentNames`. A consumer read the barrel, assembled the authoring chain and met silence:
 * the "the type crossed, the capability did not" shape `bridge/index.ts` names four times by issue
 * number. The deferral was a decision; the consumer discovering it at runtime was not.
 *
 * The children are SDK `AgentDefinition`s (`SubagentDefinition` on the barrel), the same shape the
 * per-run door `RuntimeOverrides.agents` always took. A per-run value still WINS over this one —
 * `sdk-adapter.ts` spreads `...m8, ...extra`, and a per-run override that lost to a compile-time
 * value would be the opposite of what "override" promises.
 */
export class SubAgentsCapability implements Capability {
  readonly name = 'sub-agents'
  constructor(private readonly children: CompiledAgentOptions['agents']) {}
  apply(draft: CompiledAgentOptionsDraft): void {
    for (const [name, child] of Object.entries(this.children)) {
      if (name in draft.agents && draft.agents[name] !== child) {
        throw new ConfigurationError(
          `sub-agents: child "${name}" declared twice with different definitions`,
        )
      }
      draft.agents[name] = child
    }
    draft.provenance.push({ capability: this.name, contributed: ['agents'] })
  }
}
/**
 * `@Skills({ include, autoDiscover })` → `skills`. Delegates to `compileSkills` (same reason as
 * `contextWindow`). Distinct from the M52 `skills([...])`, which takes the plain name/inline list.
 */
export class SkillsOptionsCapability implements Capability {
  readonly name = 'skills'
  constructor(private readonly options: SkillsOptions) {}
  apply(draft: CompiledAgentOptionsDraft): void {
    setOnce(draft, 'skills', compileSkills(this.options), this.name)
  }
}

/**
 * `.settingSources({ user, project })` → the resolved SDK roots.
 *
 * NOT a `FieldCapability` (M68). A raw pass-through here would let a bare `'project'` string reach
 * `CompiledAgentOptions` — and `project` reads `<cwd>/.theokit/`, **including `hooks.json`, which
 * executes shell**. Resolving through the gate is what makes the compiled value unable to express a
 * root that no posture authorized.
 *
 * The refusal happens at `apply()` — build time — rather than at run assembly, per
 * `error-handling.md` § 3: validate at the entry, fail before the value travels.
 */
export class SettingSourcesCapability implements Capability {
  readonly name = 'setting-sources'
  constructor(private readonly selection: SettingSourcesSelection) {}
  apply(draft: CompiledAgentOptionsDraft): void {
    setOnce(draft, 'settingSources', resolveSettingSources(this.selection), this.name)
    // #634 — one selection, two fields, and BOTH have to be resolved here. `defineAgent` derives
    // `compatSources` from this same object, so resolving only `settingSources` would make the two
    // compile paths disagree on a field nobody reads directly: the foreign dialect would simply
    // never load for anyone building through capabilities, with no error to explain it.
    // Set only when declared, because the waist distinguishes "not declared" from "declared empty".
    if (this.selection.claudeCode !== undefined) {
      setOnce(draft, 'compatSources', resolveCompatSources(this.selection), this.name)
    }
  }
}
/**
 * #686 — the pre-spawn hook approval gate. A capability so the two compile paths agree: the waist
 * distinguishes "not declared" from "declared", and a field only `defineAgent` could set would make
 * anyone building through capabilities silently ungated.
 */
export class HookApprovalCapability extends FieldCapability<'hookApproval'> {
  readonly name = 'hook-approval'
  protected readonly field = 'hookApproval' as const
}
/**
 * B-060 — `sessionStore`, the store the SDK resumes from.
 *
 * A `FieldCapability` like its neighbours: one field, set once. There is nothing to merge — two
 * declared stores is a contradiction about where history lives, not a composition.
 */
export class SessionStoreCapability extends FieldCapability<'sessionStore'> {
  readonly name = 'session-store'
  protected readonly field = 'sessionStore' as const
}
/**
 * B-056 — `canUseTool`, the seam that sees an `ask` verdict.
 *
 * A `FieldCapability`: one gate, set once. Two gates would be two answers to one question, and
 * composing them would mean inventing a precedence nobody declared.
 */
export class CanUseToolCapability extends FieldCapability<'canUseTool'> {
  readonly name = 'can-use-tool'
  protected readonly field = 'canUseTool' as const
}
export class PluginsCapability extends FieldCapability<'plugins'> {
  readonly name = 'plugins'
  protected readonly field = 'plugins' as const
}
export class RunContextCapability extends FieldCapability<'runContext'> {
  readonly name = 'run-context'
  protected readonly field = 'runContext' as const
}
export class SkillsResolverCapability extends FieldCapability<'skillsResolver'> {
  readonly name = 'skills-resolver'
  protected readonly field = 'skillsResolver' as const
}

/** The scalar agent config (name/route are HTTP concerns, never agent config). */
export interface AgentConfig {
  readonly systemPrompt?: CompiledAgentOptions['systemPrompt']
  readonly parseThinkTags?: boolean
  readonly stripToolDialect?: boolean
  readonly recoverLeakedToolCalls?: boolean
  readonly stream?: boolean
  readonly maxIterations?: number
  readonly timeoutMs?: number
}

/**
 * Scalar waist fields (formerly the `@Agent` options). CLASS, not a factory: it validates, and it is the one
 * capability that writes fields another capability may legitimately override (see
 * {@link MainLoopCapability}).
 */
export class AgentConfigCapability implements Capability {
  readonly name = 'agent-config'
  constructor(private readonly config: AgentConfig) {
    // The registry hands this `unknown` straight from a config file, so the guard is real at
    // runtime even though the declared type makes it look redundant to the compiler.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary check: the value may not be an object at runtime
    if (typeof config !== 'object' || config === null) {
      throw new ConfigurationError('agent-config: expected a configuration object')
    }
    for (const field of ['maxIterations', 'timeoutMs'] as const) {
      const value = config[field]
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new ConfigurationError(`agent-config: \`${field}\` must be a positive number`)
      }
    }
  }

  apply(draft: CompiledAgentOptionsDraft): void {
    // `maxIterations`/`timeoutMs` are the two fields `main-loop` outranks (see MainLoopCapability).
    // Skipping them when main-loop already contributed makes the precedence ORDER-INDEPENDENT while
    // still letting two agent-config declarations conflict with each other.
    const claimedByMainLoop = (field: string): boolean =>
      draft.provenance.some((p) => p.capability === 'main-loop' && p.contributed.includes(field))
    if (!claimedByMainLoop('maxIterations')) {
      setOnce(draft, 'maxIterations', this.config.maxIterations, this.name)
    }
    if (!claimedByMainLoop('timeoutMs')) {
      setOnce(draft, 'timeoutMs', this.config.timeoutMs, this.name)
    }
    setOnce(draft, 'systemPrompt', this.config.systemPrompt, this.name)
    setOnce(draft, 'parseThinkTags', this.config.parseThinkTags, this.name)
    setOnce(draft, 'stripToolDialect', this.config.stripToolDialect, this.name)
    setOnce(draft, 'recoverLeakedToolCalls', this.config.recoverLeakedToolCalls, this.name)
    setOnce(draft, 'stream', this.config.stream, this.name)
  }
}

/**
 * `@MainLoop({ maxIterations, timeoutMs })` → the same two fields `@Agent` can write.
 *
 * PRECEDENCE, preserved deliberately: `compileAgent` resolves these as
 * `mainLoop.x ?? agentConfig.x` — the main-loop declaration WINS when both are present. A plain
 * `setOnce` would raise a conflict where the pipeline has a defined winner, so this capability
 * OVERRIDES instead. That is the one place in the layer where a later write beats an earlier one,
 * and it exists to keep behavior identical, not for convenience.
 */
export class MainLoopCapability implements Capability {
  readonly name = 'main-loop'
  constructor(private readonly config: { maxIterations?: number; timeoutMs?: number }) {}

  apply(draft: CompiledAgentOptionsDraft): void {
    const contributed: string[] = []
    if (this.config.maxIterations !== undefined) {
      draft.maxIterations = this.config.maxIterations
      contributed.push('maxIterations')
    }
    if (this.config.timeoutMs !== undefined) {
      draft.timeoutMs = this.config.timeoutMs
      contributed.push('timeoutMs')
    }
    if (contributed.length > 0) draft.provenance.push({ capability: this.name, contributed })
  }
}
