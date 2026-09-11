/**
 * M2 (theokit-ai-first) — `defineAgent`, the zero-config imperative agent surface.
 *
 * ADR-B1: `defineAgent({...})` (default-exported from a top-level `agents/<name>.ts`) is
 * the canonical zero-config surface; the `@Agent` class decorator stays the advanced/DI
 * surface. Both compile to {@link CompiledAgentOptions} and run through the same SDK
 * runtime (`createSdkAgentStream`) — one runtime, two syntaxes.
 *
 * This module is PURE metadata (sdk-runtime.md / G2): `defineAgent` describes an agent, it
 * NEVER calls an LLM. It imports only `zod` (types) + the compiler shape — no `theokit`
 * core, preserving the agents → (nothing) dependency direction (G1).
 */
import type { CustomTool, InlineSkill, MemorySettings } from '@theokit/sdk'
import type { z } from 'zod'

import type { Guardrail } from '../guardrails/index.js'
import type { SkillsSelection } from '../skills-resolver.js'
import type { HumanInTheLoopOptions } from '../types.js'
import type { McpServersMap } from '../types.js'
import type { ReasoningEffort } from '../types.js'

import type { CompiledAgentOptions, CompiledTool } from './agent-compiler.js'
import type { CodePlugin } from './code-plugins.js'
import type { HookHandlers } from './hook-handlers.js'
import type { HookApprovalGate } from './sdk-adapter-create-options.js'
import {
  resolveCompatSources,
  resolveSettingSources,
  type SettingSourcesSelection,
} from './setting-sources-gate.js'

/**
 * Brand tag for a `defineAgent` value. `Symbol.for` (global registry, not `Symbol()`) so
 * the brand survives duplicate module instances (dual-package / bundling) — the scanner's
 * brand-check then works regardless of which copy created the definition.
 */
export const AGENT_BRAND: unique symbol = Symbol.for('theokit.agent.definition')

/** Config accepted by {@link defineAgent}. */
export interface DefineAgentConfig<TInput extends z.ZodType = z.ZodType> {
  /** Zod schema for the request body — lifted into the typed client (M2, {@link InferAgentInput}). */
  input?: TInput
  /** Model id (e.g. `claude-sonnet-4-6`). Falls back to the SDK default when omitted. */
  model?: string
  /** Static system prompt. */
  system?: string
  /** Extended-thinking effort. */
  reasoningEffort?: ReasoningEffort
  /**
   * theokit#363 — hard ceiling on the agent's tool-calling turns within ONE run. Reaching it ends
   * the turn instead of letting the model keep calling tools; absent ⇒ the SDK's own ceiling (8).
   *
   * Named `maxIterations`, not `maxSteps`, because the concept already has exactly one name here —
   * `@Agent({ maxIterations })`, `@MainLoop({ maxIterations })`, `AgentRunner.stream({ maxIterations })`,
   * `delegate({ maxIterations })` — and one name in the SDK it lowers to (`SendOptions.maxIterations`).
   * A second name would be the only place needing translation, and the translation is invisible where
   * it costs most: the SDK rejects an invalid value with a message naming `SendOptions.maxIterations`,
   * which an author who typed `.maxSteps()` has no way to connect to what they wrote. Familiarity
   * argues for the ai-sdk spelling, but ai-sdk's own name is `stopWhen: stepCountIs(n)` — borrowing
   * "steps" would buy recognition of a word, not of an API.
   */
  maxIterations?: number
  /**
   * Pre-built tools. Accepts the `@theokit/sdk` `CustomTool` that `defineAgentTool`
   * (theokit/server) and every `@theokit/sdk-tools` factory return (issue #81) — they are
   * normalized to the internal {@link CompiledTool} shape at compile time.
   */
  tools?: readonly CustomTool[]
  /**
   * M7 — run-context: an opaque, per-agent object forwarded to every tool handler's
   * `ctx.context` at run time (injected by the theokit adapter's tool wrapper). Set shared config
   * (e.g. `{ projectRoot }`) ONCE at the agent level instead of baking it into each tool
   * factory. Mirrors ai-sdk `experimental_context`, mastra `RuntimeContext`, and
   * openai-agents-js `RunContext`. Distinct from `@Agent`'s context-window `context`.
   */
  context?: Record<string, unknown>
  /**
   * M9 — guardrails: input/output guards applied at the framework boundary (ADR-0040 § D2).
   * Input guards run on the user message before the SDK runtime; a `block` fails the run fast.
   * Built-ins live in `@theokit/agents` (`promptInjectionDetector`, `piiDetector`, `costGuard`,
   * `unicodeNormalizer`, `outputModeration`).
   */
  guardrails?: readonly Guardrail[]
  /**
   * M14 — HITL approvals keyed by tool name. Each gated tool pauses the run and emits an
   * `approval_required` event until approved (reuses the same `compiled.hitl` wiring the `@Agent`
   * + `@HumanInTheLoop` path produces). A key that does not match a declared tool fails fast at
   * compile time.
   */
  approvals?: Record<string, HumanInTheLoopOptions>
  /**
   * M13 — skills selection: a static list (compiled straight to the SDK `skills.enabled`) OR a
   * per-request resolver `(ctx) => string[]` (carried on `compiled.skillsResolver`, resolved by the
   * request path against the run-context). Absent ⇒ the SDK enables every discovered skill.
   */
  skills?: SkillsSelection
  /**
   * theokit-file-based-config — opt into `.theokit/` file-based config (skills, subagents, hooks,
   * MCP, context, cron). The SDK discovers config from these roots under the app's `cwd`:
   * `project` = `<cwd>/.theokit/`, `user` = `~/.theokit/`. Absent ⇒ inline (code) config only.
   *
   * SECURITY (M68): `project` reads `.theokit/hooks.json`, which **executes shell**, so it requires
   * a `TrustPosture` rather than a string. This field used to take `readonly SettingSource[]`, and
   * its own JSDoc justified the risk as *"opt-in because `.theokit/` is the app's own repo (informed
   * consent)"*. That premise holds for a web app whose `cwd` is its own deploy; it does not hold for
   * an agent whose `cwd` is a repository the user just cloned, where `.theokit/` is
   * attacker-controlled content.
   *
   * `user` stays a plain boolean — `~/.theokit/` is the operator's own machine. Omitting a root is
   * not enabling it. The SDK owns discovery + execution (G2 / ADR-0040); theokit resolves the
   * selection through `resolveSettingSources` and wires the result into
   * `Agent.create({ local.settingSources })`.
   */
  settingSources?: SettingSourcesSelection
  /**
   * #686 — decide whether a hook declared in a config root is spawned at all, BEFORE it runs.
   *
   * Covers any root, including a foreign dialect imported through `settingSources.claudeCode`.
   * Requires `@theokit/sdk >= 5.4.0`: declaring it against an older SDK is REFUSED at assembly
   * rather than forwarded, because a gate that silently does not gate is worse than none.
   */
  hookApproval?: HookApprovalGate
  /**
   * B-054 — `MEMORY.md` here is NOT the Claude Code CLI's auto-memory file. This is the durable
   * subsystem below: a SQLite+FTS5 store under `.theokit/memory/`, with `memory_search`/`memory_get`
   * tools and no index cap. The CLI's lives under its own home (`CLAUDE_CONFIG_DIR` or `~/.claude`),
   * is capped at 200 lines / 25 KB on read, and is swept on `cleanupPeriodDays` — none of which is
   * implemented here. The SDK READS that directory for interop and does not write to it.
   *
   * Same filename, different directory, different semantics. Stated at both ends because a checklist
   * that greps for `MEMORY.md` finds one and concludes the other exists.
   *
   * M49 — durable memory (the SDK's `.theokit/memory/` subsystem: `Remember:` capture, MEMORY.md
   * store, auto-injected `<memory>` block, `memory_search`/`memory_get` tools). The shape is the
   * SDK's own `MemorySettings` — the canonical runtime contract. Projected into
   * `Agent.create({ memory })` by `assembleM8CreateOptions`.
   */
  memory?: MemorySettings
  /**
   * Code `Plugin` objects forwarded to `Agent.create({ plugins })` — EXTENSION units (tools,
   * commands, model providers, memory adapters). For lifecycle interception use {@link hooks}.
   */
  /**
   * Code plugins — `{ name, register }`. NOT the Claude Code filesystem-bundle form, which is
   * declared by living in a `plugins/` directory rather than by being passed here (B-055).
   *
   * `readonly unknown[]` is what let the wrong shape through silently.
   */
  plugins?: readonly CodePlugin[]
  /**
   * Lifecycle hooks keyed by `HookName` (`pre_tool_call` may veto via `{ block, message }`). Set by
   * the builder's `hooks()`; converted into a code plugin at `build()` and never reaching the SDK
   * under this name — the plugin is the TRANSPORT, this is the contract callers write against.
   */
  hooks?: HookHandlers | Readonly<Record<string, unknown>>
  /**
   * MCP servers available to the agent — the builder-chain equivalent of the `@MCP` class
   * decorator. Each key is a server name; the value is the server configuration. Forwarded
   * unchanged to `Agent.create({ mcpServers })` (the SDK owns MCP execution). Absent ⇒ no MCP.
   */
  mcpServers?: McpServersMap
}

/**
 * A branded agent definition — the value {@link defineAgent} returns.
 *
 * `TTools` (M8) is a phantom type parameter carrying the tool-name union: the `AgentBuilder.create()` builder
 * threads its accumulated literal tool names here (`.build()` returns `AgentDefinition<TInput,
 * 'a' | 'b'>`), so the generated client (`.theokit/agents.d.ts`) can expose them via
 * {@link InferAgentToolNames}. `defineAgent` leaves it `string` (its tools array carries no literal
 * names). Never present at runtime.
 */
export type AgentDefinition<
  TInput extends z.ZodType = z.ZodType,
  TTools extends string = string,
> = DefineAgentConfig<TInput> & {
  readonly [AGENT_BRAND]: true
  readonly __toolNames?: TTools
}

/** Infer the request type of an agent definition from its `input` Zod schema. */
export type InferAgentInput<T> =
  T extends AgentDefinition<infer S> ? (S extends z.ZodType ? z.infer<S> : never) : never

/**
 * Infer the tool-name union of an agent definition (M8). Yields the literal union for agents built
 * with the `AgentBuilder.create()` builder (`'read_file' | 'count_lines'`), or `string` for `defineAgent` agents
 * whose tools array carries no literal names.
 */
export type InferAgentToolNames<T> = T extends AgentDefinition<z.ZodType, infer N> ? N : never

/**
 * Define a zero-config agent. Identity/normalizer (like `defineRoute`) — returns the config
 * branded so the scanner recognizes it. Compilation is deferred to {@link compileAgentDefinition}.
 */
export function defineAgent<TInput extends z.ZodType = z.ZodType>(
  config: DefineAgentConfig<TInput>,
): AgentDefinition<TInput> {
  assertValidMaxIterations(config.maxIterations)
  return { ...config, [AGENT_BRAND]: true }
}

/**
 * Validate the declared step ceiling at the AUTHORING boundary (error-handling.md § 3), for both
 * `defineAgent({ maxIterations })` and `AgentBuilder.maxIterations()` — the builder's `.build()`
 * lands here, so one check covers both surfaces.
 *
 * The SDK rejects the same values, but only when the run reaches its `send`, and with a message
 * naming `SendOptions.maxIterations` — a surface the author never wrote. Failing here names what
 * they did write, before the value travels.
 */
function assertValidMaxIterations(value: number | undefined): void {
  if (value === undefined) return
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `[@theokit/agents] maxIterations must be a positive integer, got ${String(value)}.`,
    )
  }
}

/** Brand-check: is `value` a {@link defineAgent} result? */
export function isAgentDefinition(value: unknown): value is AgentDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as unknown as Record<PropertyKey, unknown>)[AGENT_BRAND] === true
  )
}

/**
 * Normalize a pre-built `@theokit/sdk` {@link CustomTool} to the internal
 * {@link CompiledTool} shape (issue #81). `CustomTool.handler` takes a narrower
 * `Record<string, unknown>` input than `CompiledTool.handler`'s `unknown`, so it cannot be
 * assigned directly (contravariance); this thin wrapper bridges the parameter. Runtime-safe:
 * the SDK always calls a tool handler with the parsed input object.
 */
function toCompiledTool(tool: CustomTool): CompiledTool {
  // M7 — forward the run-context `ctx` (2nd arg) to the underlying tool so `defineAgent({ context })`
  // reaches `ctx.context` in the handler (dropping it silently severs the context seam).
  // `CustomTool.handler` takes `Record<string, unknown>` as input; `CompiledTool.handler` takes the
  // wider `unknown`. Contravariance on the input parameter prevents direct assignment — `as unknown as`
  // is the SDK-boundary seam for this widening. Runtime-safe: SDK always passes a plain object for input.
  const handler = tool.handler as unknown as (
    input: unknown,
    ctx?: { signal?: AbortSignal; context?: unknown },
  ) => string | Promise<string>
  const compiled: CompiledTool = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    handler: (input, ctx) => handler(input, ctx),
  }
  // Preserve SYMBOL-keyed metadata the SDK installs on a tool — notably the `@theokit/sdk/a2a` subagent
  // credential-inheritance sink (`Symbol.for("theokit.subagent.inheritCredentials")`). Copying only the
  // four known fields drops it, so the SDK runtime can't hand the parent's `apiKey` down to a delegated
  // child → the child fails with `provider_unresolved` ("(no response)"). The wrapped handler still calls
  // the original tool's handler, so the sink (which mutates that handler's closure) stays effective.
  for (const sym of Object.getOwnPropertySymbols(tool)) {
    ;(compiled as unknown as Record<symbol, unknown>)[sym] = (
      tool as unknown as Record<symbol, unknown>
    )[sym]
  }
  return compiled
}

/**
 * Lower a definition to the SDK-ready {@link CompiledAgentOptions} — the same shape
 * `compileAgent` (decorator path) produces, so both surfaces converge on one runtime.
 */
export function compileAgentDefinition(def: AgentDefinition): CompiledAgentOptions {
  return {
    model: def.model,
    reasoningEffort: def.reasoningEffort,
    systemPrompt: def.system,
    tools: (def.tools ?? []).map(toCompiledTool),
    agents: {},
    stream: true,
    // M7 — run-context flows to CompiledAgentOptions.runContext (distinct from the
    // context-window `context` field the decorator path uses); absent ⇒ no key.
    ...(def.context !== undefined ? { runContext: def.context } : {}),
    // M9 — guardrails flow through unchanged; the runner applies them at the input boundary.
    ...(def.guardrails !== undefined ? { guardrails: def.guardrails } : {}),
    // theokit#363 — the declared step ceiling reaches `CompiledAgentOptions.maxIterations`, which the
    // adapter lowers to `SendOptions.maxIterations`. Absent ⇒ no key, so the SDK default is untouched.
    ...(def.maxIterations !== undefined ? { maxIterations: def.maxIterations } : {}),
    // M14 — HITL approvals compile into the same `hitl` map the decorator path produces.
    ...(def.approvals !== undefined ? { hitl: compileApprovals(def) } : {}),
    // M13 — skills: a static list → SDK skills.enabled; a resolver → carried for the request path.
    ...compileSkillsSelection(def.skills),
    // theokit-file-based-config + M68 — the selection is resolved here, and refusing at compile time
    // rather than at run assembly is `error-handling.md` § 3: validate at the entry, fail before the
    // value travels.
    //
    // This comment used to add "so `CompiledAgentOptions.settingSources` can only ever hold roots
    // that some posture authorized", and it was false. This is NOT "the earliest point every
    // authoring path converges on": a `Capability` is an authoring path and writes the draft
    // directly, so `setOnce(draft, 'settingSources', ['mdm'], 'cap')` typechecked cast-free —
    // measured against the emitted `.d.ts`. What holds the invariant now is the TYPE:
    // `resolveSettingSources` returns `GatedSettingSource[]`, a brand only it mints, so a raw root
    // no longer fits the field. See its docblock for what that does and does not cover.
    ...(def.settingSources !== undefined
      ? { settingSources: resolveSettingSources(def.settingSources) }
      : {}),
    // #634 — the same selection carries `claudeCode`, resolved through the same gate at the same
    // point. Separate field because the SDK takes it on a separate option; the same
    // `ProjectSettingsGrant` NOT because the two questions are the same (they are not — see the
    // field's docblock), but because a separate capability could not carry the distinction:
    // `TrustPosture.allows` moves every value with the trust level.
    //
    // `SettingSourcesCapability` resolves this too. Both compile paths, or the capability path
    // silently produces an agent with no foreign dialect at all.
    ...(def.settingSources?.claudeCode !== undefined
      ? { compatSources: resolveCompatSources(def.settingSources) }
      : {}),
    // #686 — the pre-spawn hook approval gate. Named `hookApproval` and not `hooks`, because
    // `defineAgent({ hooks })` is already the LIFECYCLE seam: two security-relevant things under one
    // name is how a consumer configures the wrong one and believes they configured the other.
    ...(def.hookApproval !== undefined ? { hookApproval: def.hookApproval } : {}),
    // M49 — memory flows to the projection layer; `assembleM8CreateOptions` forwards it to Agent.create.
    ...(def.memory !== undefined ? { memory: def.memory } : {}),
    // Hooks are converted here — the layer EVERY path converges on — rather than on the builder, so
    // `defineAgent({ hooks })` cannot type-check and silently no-op. A lifecycle hook that is
    // declared but never registered is a security gate that does not gate.
    ...compileHooksAndPlugins(def),
    // MCP — builder/`defineAgent` servers converge on the same `mcpServers` field the `@MCP`
    // decorator path populates; the SDK adapter forwards it to `Agent.create({ mcpServers })`.
    ...(def.mcpServers !== undefined ? { mcpServers: def.mcpServers } : {}),
  }
}

/**
 * M13 — split a {@link SkillsSelection} into the compiled fields (static → `skills`, fn →
 * `skillsResolver`). A static array may mix filesystem skill NAMES (`string` → `skills.enabled`) with
 * inline `createSkill` objects (`InlineSkill` → `skills.inline`, injected into the `<skills>` block).
 */
/**
 * Convert a `hooks` map into the code plugin that carries it, appended to any explicitly registered
 * plugins. Hooks and plugins are DIFFERENT concepts — a hook is a lifecycle interception point, a
 * plugin is an extension unit — but the SDK dispatches hooks through the plugin seam, so the map
 * needs a transport. Doing the conversion HERE (not on the builder) means every entry point that
 * reaches `defineAgent` gets it, so `hooks` can never be declared-but-dropped.
 */
function compileHooksAndPlugins(def: AgentDefinition): { plugins?: readonly CodePlugin[] } {
  const map = (def as { hooks?: Readonly<Record<string, unknown>> }).hooks
  const entries = Object.entries(map ?? {}).filter(([, h]) => typeof h === 'function')
  const explicit = def.plugins ?? []

  if (entries.length === 0) {
    return def.plugins !== undefined ? { plugins: def.plugins } : {}
  }

  // `kind: 'general'` is load-bearing — the SDK's `isCodePlugin()` drops any plugin without it and
  // no hook fires (proven against a real run; see the M26/M28 dispatch investigation).
  const plugin = {
    name: 'theokit-builder-hooks',
    version: '1.0.0',
    kind: 'general' as const,
    register(ctx: { on: (hook: string, handler: (c: never) => unknown) => void }): void {
      for (const [hookName, handler] of entries) {
        ctx.on(hookName, handler as (c: never) => unknown)
      }
    },
  }
  return { plugins: [...explicit, plugin] }
}

export function compileSkillsSelection(
  skills: SkillsSelection | undefined,
): Pick<CompiledAgentOptions, 'skills' | 'skillsResolver'> {
  if (skills === undefined) return {}
  if (typeof skills === 'function') return { skillsResolver: skills }
  const enabled: string[] = []
  const inline: InlineSkill[] = []
  for (const entry of skills) {
    if (typeof entry === 'string') enabled.push(entry)
    else inline.push(entry)
  }
  return {
    skills: { enabled, autoInject: true, ...(inline.length > 0 ? { inline } : {}) },
  }
}

/**
 * Build the HITL gate map from `defineAgent({ approvals })`, keyed by tool name — the same shape
 * `agent-endpoint.ts` consumes. Fails fast (error-handling.md) if an approval names a tool the
 * agent does not declare, so a typo is caught at compile time, not silently ignored at runtime.
 */
function compileApprovals(def: AgentDefinition): Map<string, HumanInTheLoopOptions> {
  const toolNames = new Set((def.tools ?? []).map((t) => t.name))
  const gates = new Map<string, HumanInTheLoopOptions>()
  for (const [toolName, options] of Object.entries(def.approvals ?? {})) {
    if (!toolNames.has(toolName)) {
      throw new Error(
        `[@theokit/agents] defineAgent approval references unknown tool "${toolName}". ` +
          `Declared tools: ${[...toolNames].join(', ') || '(none)'}.`,
      )
    }
    gates.set(toolName, options)
  }
  return gates
}
