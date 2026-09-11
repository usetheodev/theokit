/**
 * Agent compiler — transforms decorator metadata into SDK calls.
 *
 * Per ADR D1: @Agent is a macro over Agent.create().
 * Per ADR D3: @Tool compiles to defineTool().
 *
 * EC-3: throws if toolbox instance is missing from the instances map.
 */
import type {
  ContextSettings,
  MemorySettings,
  SkillsSettings,
  SystemPromptResolver,
} from '@theokit/sdk'

import { ConfigurationError } from '../errors.js'
import type { Guardrail } from '../guardrails/index.js'
import type { SkillsSelection } from '../skills-resolver.js'
import type {
  ApprovalOptions,
  BudgetOptions,
  CheckpointOptions,
  HumanInTheLoopOptions,
  McpServersMap,
  MemoryOptions,
  ProjectContextOptions,
  ReasoningEffort,
  ToolOptions,
} from '../types.js'

import type { HookApprovalGate } from './sdk-adapter-create-options.js'
import type { GatedCompatSource, GatedSettingSource } from './setting-sources-gate.js'

/**
 * M53 — the input shape `compileTools`/`compileHitlGates` consume, declared WITH them now that the
 * metadata walk that used to own it is gone. `ToolboxCapability` builds this from a class'
 * `static tools` declaration.
 */
/** A guard/interceptor class token — identity only (the DI container instantiates it). */
export type ClassToken = abstract new (...args: never[]) => object

export interface ToolWalkResult {
  propertyKey: string | symbol
  config: ToolOptions
  guards: ClassToken[]
  approval?: ApprovalOptions
  capabilities?: string[]
  budget?: BudgetOptions
  trace: boolean
  audit: boolean
  /** HITL config when the tool is gated (M4); absent ⇒ not gated. */
  hitl?: HumanInTheLoopOptions
}

export interface ToolboxWalkResult {
  /** The toolbox class — used as the identity key into `toolboxInstances`. */
  class: ClassToken
  namespace: string
  tools: ToolWalkResult[]
  guards: ClassToken[]
}

/** A tool method on a toolbox instance. */
type ToolHandler = (input: unknown) => string | Promise<string>

/** Minimal interface matching defineTool() result shape. */
export interface CompiledTool {
  name: string
  description: string
  inputSchema: unknown
  /**
   * M7 — the optional 2nd `ctx` arg carries the SDK run context: `ctx.context` is the
   * `defineAgent({ context })` / per-run value, `ctx.signal` the abort signal. Optional so the
   * decorator `@Tool` handlers (which ignore it) stay assignable. The SDK calls the tool with
   * both args; a handler that needs run-context (e.g. a filesystem tool reading `projectRoot`)
   * reads `ctx?.context`.
   */
  handler: (
    input: unknown,
    ctx?: { signal?: AbortSignal; context?: unknown },
  ) => string | Promise<string>
}

/**
 * The charset `@theokit/sdk` accepts for a custom tool name.
 *
 * MIRROR of `@theokit/sdk@4.1.0 › validateToolName` (`TOOL_NAME_PATTERN`). The SDK does NOT export
 * the rule — it exists there as an internal constant plus prose in a JSDoc — so consuming it is
 * impossible and duplicating is the only option. The duplication is deliberate and alarmed: the
 * non-mocked contract suite (`tests/integration/tool-name-sdk-contract.test.ts`) exercises the real
 * `Agent.create`, so it fails the day the SDK tightens the rule.
 *
 * REVIEW TRIGGER (ADR D1): if the SDK ever exports `TOOL_NAME_PATTERN`/`validateToolName`, consume
 * it and delete this copy.
 */
const SDK_TOOL_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

/** Longest name {@link SDK_TOOL_NAME} admits (1 leading + 63) — split out so an overflow can say so. */
const SDK_TOOL_NAME_MAX_LENGTH = 64

/** Same charset as {@link SDK_TOOL_NAME} but unbounded — tells "too long" apart from "bad character". */
const SDK_TOOL_NAME_CHARSET = /^[a-zA-Z][a-zA-Z0-9_-]*$/

/**
 * Names the SDK refuses even when they match the charset. MIRROR of `RESERVED_TOOL_NAMES` plus the
 * `mcp_` prefix guard in the same function.
 *
 * This is the rule the #145 fix MISSED: it replicated the charset alone, so `namespace: 'mcp'`
 * minted `mcp_*`, passed our authoring check, and was rejected by `Agent.create` with
 * `tool_reserved_name` — the same defect class, by a different axis.
 */
const SDK_RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set([
  'shell',
  'memory_search',
  'memory_get',
])
const SDK_RESERVED_TOOL_PREFIX = 'mcp_'

/**
 * The runtime name the SDK loop reports in `pre_tool_call` — `namespace_tool` when a toolbox
 * declares a namespace, else the bare tool name.
 *
 * This function is the ONLY place a runtime name is minted, and it validates what it produces
 * (M55). Validating anywhere else leaves the gap #145 exposed twice: a caller that composes the
 * name itself, or a public entry point ({@link compileTools} is exported) that skips the check.
 * "Validate where you mint" is the invariant; both {@link compileTools} and {@link compileHitlGates}
 * key off this function, so the HITL gate map and the SDK tool registry cannot disagree on a name.
 *
 * SEPARATOR (theokit#145): `_`, not `.`. The dot is outside {@link SDK_TOOL_NAME}, so every
 * namespaced toolbox produced a name `Agent.create` REJECTS — a documented path that never once
 * worked against a real provider. Nothing caught it because the other suites mock the SDK.
 *
 * @throws ConfigurationError with a message naming the offending COMPOSED name — the parts often
 *   look valid on their own, so echoing them back would send the author hunting in the wrong place.
 */
export function toolRuntimeName(namespace: string, toolName: string): string {
  // OUR rule, stricter than the SDK's, and deliberately so: `ns` + `''` mints "ns_", which passes
  // the charset and `Agent.create` ACCEPTS — a nonsense tool reaches the LLM. The SDK cannot know a
  // part was empty; at authoring time we can.
  if (toolName.trim().length === 0) {
    const where = namespace ? ` in namespace "${namespace}"` : ''
    throw new ConfigurationError(`tool: empty name${where} — declare a non-empty name for the tool`)
  }

  const name = namespace ? `${namespace}_${toolName}` : toolName

  if (!SDK_TOOL_NAME.test(name)) {
    // Length is reported apart from charset: when the only problem is the total, a generic
    // "must match /regex/" sends the author looking for an invalid character that is not there.
    if (SDK_TOOL_NAME_CHARSET.test(name)) {
      throw new ConfigurationError(
        `tool: name "${name}" has length ${name.length} — the composition ` +
          `namespace + "_" + tool exceeds the maximum of ${SDK_TOOL_NAME_MAX_LENGTH} the SDK accepts`,
      )
    }
    throw new ConfigurationError(
      `tool: invalid name "${name}" — it must match ${String(SDK_TOOL_NAME)} ` +
        '(the SDK rejects the rest; check the namespace and the tool name)',
    )
  }

  if (SDK_RESERVED_TOOL_NAMES.has(name) || name.startsWith(SDK_RESERVED_TOOL_PREFIX)) {
    throw new ConfigurationError(
      `tool: reserved name "${name}" — the SDK reserves ` +
        `${[...SDK_RESERVED_TOOL_NAMES].join(', ')} and the prefix "${SDK_RESERVED_TOOL_PREFIX}"`,
    )
  }

  return name
}

/**
 * Build the HITL gate map: runtime tool name → its `@HumanInTheLoop` config, for every gated tool.
 * The HITL plugin ({@link createHitlPlugin}) pauses the run only for tools present here. Empty map
 * ⇒ no gated tools ⇒ the non-HITL stream path (M2, byte-unchanged).
 */
export function compileHitlGates(
  toolboxes: ToolboxWalkResult[],
): Map<string, HumanInTheLoopOptions> {
  const gates = new Map<string, HumanInTheLoopOptions>()
  for (const tb of toolboxes) {
    for (const tool of tb.tools) {
      if (tool.hitl) {
        gates.set(toolRuntimeName(tb.namespace, tool.config.name), tool.hitl)
      }
    }
  }
  return gates
}

/**
 * Compile @Tool metadata into tool definitions.
 *
 * @param toolboxes - Walked toolbox metadata
 * @param toolboxInstances - Map of Toolbox class → instantiated object (for `this` binding)
 */
export function compileTools(
  toolboxes: ToolboxWalkResult[],
  toolboxInstances: Map<ClassToken, object>,
): CompiledTool[] {
  const tools: CompiledTool[] = []

  for (const tb of toolboxes) {
    // EC-3: guard against missing toolbox instance
    const instance = toolboxInstances.get(tb.class)
    if (!instance) {
      // M56 — typed, not a bare `Error`: the same module already throws `ConfigurationError` for
      // name validation, and `rules/error-handling.md` § 2 requires explicit typed errors so a
      // caller can distinguish an authoring mistake from an unexpected runtime failure.
      throw new ConfigurationError(
        `toolbox: ${tb.class.name} was not instantiated — pass the instance in \`toolboxInstances\``,
      )
    }

    for (const tool of tb.tools) {
      const handler = (instance as unknown as Record<string | symbol, ToolHandler>)[
        tool.propertyKey
      ]
      if (typeof handler !== 'function') {
        throw new ConfigurationError(
          `toolbox: ${tb.class.name}.${String(tool.propertyKey)} is not a method ` +
            `(tool "${tool.config.name}")`,
        )
      }

      const name = toolRuntimeName(tb.namespace, tool.config.name)

      tools.push({
        name,
        description: tool.config.description,
        inputSchema: tool.config.input,
        handler: (input: unknown) => handler.call(instance, input),
      })
    }
  }

  return tools
}

/** Compiled sub-agent definition matching SDK AgentDefinition shape. */
export interface CompiledSubAgent {
  model?: string
  /**
   * V4-L.1: typed as the union for consistency with `AgentOptions.systemPrompt`,
   * so `compileSubAgents` carries whatever the sub-agent declared. Sub-agent
   * resolver EXECUTION is out of scope this slice (ADR D3): `compiled.agents` is
   * not spread into `Agent.create` by `createSdkAgentStream`; a resolver here is
   * carried, not invoked. Top-level agent resolvers are the supported path.
   */
  systemPrompt?: string | SystemPromptResolver
}

/** Compiled agent options ready for SDK Agent.create(). */
export interface CompiledAgentOptions {
  model?: string
  /** Extended-thinking effort; mapped to SDK ModelSelection.params. */
  reasoningEffort?: ReasoningEffort
  /** Opt-in `<think>`-tag extraction (M2); wraps the stream when true. */
  parseThinkTags?: boolean
  /** Opt-in tool-dialect stripping (theocode#32); strips leaked `<function=…></tool_call>` from text when true. */
  stripToolDialect?: boolean
  /** Opt-in leaked-dialect recovery (theokit#58); enables the SDK route's `extractToolCallsFromContent` so leaked tool calls EXECUTE when true. */
  recoverLeakedToolCalls?: boolean
  /** Static prompt OR a per-request {@link SystemPromptResolver} (V4-L.1, Axis-B). */
  systemPrompt?: string | SystemPromptResolver
  /**
   * theokit-file-based-config — opt-in `.theokit/` file-based config roots (`"project"`/`"user"`/…).
   * Projected into `Agent.create({ local: { settingSources } })` by `assembleM8CreateOptions`
   * (merged with `cwd`, decoupled from inline skills). Absent ⇒ inline (code) config only.
   */
  settingSources?: readonly GatedSettingSource[]
  /**
   * Foreign configuration dialects, already authorised (usetheokit/theokit#634).
   *
   * Resolved at compile time by `resolveCompatSources`, exactly like `settingSources`: a value here
   * can only hold a source some posture granted, so the adapter projects rather than decides.
   */
  compatSources?: readonly GatedCompatSource[]
  /**
   * #686 — the consumer's pre-spawn approval gate, forwarded to `Agent.create({ local: { hooks } })`.
   *
   * Distinct from `hitl` (which gates TOOLS at run time) and from the lifecycle `plugins` below
   * (which react to events). This one decides whether a hook declared in a config root — including
   * a foreign dialect imported through `compatSources` — is spawned at all.
   */
  hookApproval?: HookApprovalGate
  /** Code `Plugin` objects forwarded to `Agent.create({ plugins })` (lifecycle-hook seam). */
  plugins?: readonly unknown[]
  tools: CompiledTool[]
  agents: Record<string, CompiledSubAgent>
  memory?: MemoryOptions | MemorySettings
  skills?: SkillsSettings
  context?: ContextSettings
  /**
   * M7 — run-context injected into every tool handler's `ctx.context` by the theokit adapter
   * (`buildSdkTools` wrapper). Populated by `defineAgent({ context })` (functional surface).
   * NAME NOTE: distinct from the context-window `context` (`ContextSettings`) above — this is
   * per-run user data for tools, not token-budget config.
   */
  runContext?: Record<string, unknown>
  /** Raw @ProjectContext config; the adapter builds the (async) systemPrompt resolver from it. */
  projectContext?: ProjectContextOptions
  mcpServers?: McpServersMap
  maxIterations?: number
  timeoutMs?: number
  stream: boolean
  /**
   * HITL gate map (M4): runtime tool name → `@HumanInTheLoop` config. Absent/empty ⇒ no gated
   * tools. The harness (`mountAgent`) turns this into the `pre_tool_call` pause wiring.
   */
  hitl?: Map<string, HumanInTheLoopOptions>
  /**
   * `@Checkpoint` config (M4): when present the harness emits `checkpoint_saved` and selects the
   * durable SDK conversation storage (`storage: 'filesystem'`) so a same-`sessionId` request resumes.
   */
  checkpoint?: CheckpointOptions
  /**
   * M9 — guardrails: input/output guards applied at the framework boundary (ADR-0040 § D2).
   * Input guards run on the user message BEFORE the SDK runtime sees it (fail-fast on `block`).
   * They REUSE the runtime; they never reimplement it. Absent/empty ⇒ no guards.
   */
  guardrails?: readonly Guardrail[]
  /**
   * M13 — per-request skills resolver (from `defineAgent({ skills: (ctx) => [...] })`). The request
   * path resolves it against the run-context (`resolveEnabledSkills`) and sets `skills.enabled`
   * before the SDK runs. Not consumed by the SDK directly (it reads `skills`). Absent ⇒ no resolver.
   */
  skillsResolver?: SkillsSelection
}
