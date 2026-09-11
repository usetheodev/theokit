/**
 * M8 — `AgentBuilder.create()`, the fluent agent builder with accumulative **type-state**.
 *
 * `AgentBuilder.create().context<C>().tool(t).model(id).system(s).build()` accumulates type parameters the way
 * the most-loved TS DX does (tRPC `t.procedure.input().query()`, Zod, Hono) and resolves to the
 * **SAME branded `AgentDefinition`** that {@link defineAgent} produces — one runtime, N syntaxes
 * (ADR-B1). The value is entirely at the type level; `.build()` delegates to `defineAgent`, so
 * convergence with the `defineAgent` / `@Agent` surfaces is by construction.
 *
 * Compile-time guarantees (proven by `tests/type/agent-builder.test-d.ts`):
 * - `.build()` is a compile error when `.model()` was never called (UnsetMarker technique — tRPC
 *   `utils.ts:2-4` / `procedureBuilder.ts:362-379`).
 * - `.tool(t)` is a compile error when the tool declares a required run-context ⊄ the agent's `C`.
 * - tool names accumulate into a union type parameter (`TTools`).
 *
 * PURE metadata (sdk-runtime.md / G2): the builder describes an agent, it NEVER calls an LLM.
 */
import type { CustomTool, MemorySettings, ModelSelection, TelemetrySettings } from '@theokit/sdk'
import type { z } from 'zod'

import type { Guardrail } from '../guardrails/index.js'
import type { SkillsSelection } from '../skills-resolver.js'
import type { HumanInTheLoopOptions } from '../types.js'
import type { McpServersMap } from '../types.js'
import type { ReasoningEffort } from '../types.js'

import type { CodePlugin } from './code-plugins.js'
import { defineAgent, type AgentDefinition, type DefineAgentConfig } from './define-agent.js'
import type { HookHandlers } from './hook-handlers.js'
import type { HookApprovalGate } from './sdk-adapter-create-options.js'
import type { SettingSourcesSelection } from './setting-sources-gate.js'

/**
 * A required-but-unset builder field. Branded (a literal intersected with a unique brand) so no
 * ordinary value can satisfy it — the terminal-method guards below key off it. tRPC's UnsetMarker.
 */
type UnsetMarker = 'theokit.unset' & { readonly __brand: 'theokit.unset' }

/**
 * Compile-error carriers. When a guarded method's precondition fails, its signature demands an
 * argument of one of these types, which the caller cannot supply — the labeled tuple element
 * surfaces the reason in the error. (Idiomatic gate for zero-arg terminal methods.)
 */
interface MissingModelError {
  readonly __theokitError: 'call .model(id) before .build()'
}
interface ToolContextError<TRequired> {
  readonly __theokitError: 'this tool requires a run-context not provided via .context()'
  readonly required: TRequired
}

/** The agent context before `.context()` is called — satisfies only tools with no requirement. */
type EmptyContext = Record<never, never>

/**
 * A tool that MAY declare, at the type level, the run-context shape it needs. A plain
 * {@link CustomTool} (`TRequired = unknown`) is satisfied by any agent context. Build one that
 * carries a literal name + optional required-context via {@link ContextualTool.of}.
 */
export interface ContextualTool<
  TName extends string = string,
  TRequired = unknown,
> extends CustomTool {
  readonly name: TName
  /** Phantom — never present at runtime; carries the required run-context type for `.tool()`. */
  readonly __requiredContext?: TRequired
}

/**
 * The union of literal tool names in a tuple of {@link ContextualTool}s.
 *
 * Written as a distributed conditional rather than `TList[number]['name']` so an EMPTY list yields
 * `never` (which unions away, leaving `TTools` untouched) instead of `string` (which would widen the
 * accumulated union and silently destroy the type-state for the rest of the chain).
 */
export type ToolNamesOf<TList> = TList extends readonly (infer TElement)[]
  ? TElement extends ContextualTool<infer TName>
    ? TName
    : never
  : never

/**
 * The combined run-context every tool in the tuple requires.
 *
 * The singular `.tool()` guards one `TRequired` against the agent's `TContext`; a list has to guard
 * ALL of them, so this intersects them. Without it, `.tools([...])` would be a hole in the exact
 * check `.tool()` performs — a batch API that quietly accepts what the single-item API rejects is
 * worse than no batch API.
 *
 * Intersection, not union: satisfying every element means the agent's context must have what each
 * one needs. `unknown` (a plain tool) intersects away, so a list of plain tools stays unconstrained.
 */
export type ToolContextOf<TList> = (
  TList extends readonly (infer TElement)[]
    ? TElement extends ContextualTool<string, infer TRequired>
      ? (required: TRequired) => void
      : never
    : never
) extends (required: infer TIntersection) => void
  ? TIntersection
  : never

/**
 * Static factory for {@link ContextualTool}. M57: OO surface (`ContextualTool.of(...)`) aligned with
 * the SDK's `X.create()` shape — was the free `contextualTool(...)` function. `ContextualTool` is a
 * TYPE (the interface above) and a VALUE (this const) at once, the same dual-space pattern the SDK
 * uses for `Tool`/`Agent`. No instance state, so the factory is `static`-style (`of`), not `create`.
 */
export const ContextualTool = {
  /**
   * Tag a {@link CustomTool} with a literal name (so `.tool()` can accumulate the tool-name union)
   * and, optionally, a required run-context type. The `requiredContext` argument is a type-only
   * witness — pass `undefined as C` or a sample value; it is never read at runtime.
   */
  of<TName extends string, TRequired = unknown>(
    tool: CustomTool & { name: TName },
    _requiredContext?: TRequired,
  ): ContextualTool<TName, TRequired> {
    return tool
  },
}

/**
 * The fluent builder. Each method returns a NEW builder type with the relevant type parameter
 * advanced (immutable chaining). Runtime state is a plain {@link DefineAgentConfig} accumulator.
 */
export interface AgentBuilder<
  TInput extends z.ZodType | UnsetMarker = UnsetMarker,
  TModel extends string | UnsetMarker = UnsetMarker,
  TContext = EmptyContext,
  TTools extends string = never,
> {
  /** Set the request schema (lifted into the typed client via {@link AgentDefinition}). */
  input<S extends z.ZodType>(schema: S): AgentBuilder<S, TModel, TContext, TTools>
  /**
   * Set the model. Required before `.build()`. COMPILE ERROR when called twice — the argument
   * type collapses to `never` once the model is set (tRPC's set-once technique).
   *
   * M94 — accepts a `ModelSelection` as well as the raw id. The SDK implementation **always**
   * accepted it (`agent-builder.ts:50`: `model(m: string | ModelSelection)`); it was this facade that
   * narrowed to `string`, and the narrowing made every field of the selection unreachable — including
   * the `contextWindow` the SDK had started publishing. A facade diverging from the implementation is
   * the same class of defect M91 paid two patches to fix.
   */
  model(
    id: TModel extends UnsetMarker ? string | ModelSelection : never,
  ): AgentBuilder<TInput, string, TContext, TTools>
  /** Set the static system prompt. */
  system(prompt: string): AgentBuilder<TInput, TModel, TContext, TTools>
  /** Set the extended-thinking effort. */
  reasoningEffort(effort: ReasoningEffort): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * theokit#363 — cap the agent's tool-calling turns within ONE run. A positive integer; throws at
   * `.build()` otherwise. Unset ⇒ the SDK's own ceiling (8) applies, unchanged.
   *
   * This is the chain the scaffold writes, and until now it had no way to say "stop after N steps":
   * the declaration existed on the decorator path only, and even there nothing on the served path
   * read it. See {@link DefineAgentConfig.maxIterations} for why the name is `maxIterations`.
   */
  maxIterations(limit: number): AgentBuilder<TInput, TModel, TContext, TTools>
  /** Set the run-context (M7) — the object every tool handler receives as `ctx.context`. */
  context<C extends Record<string, unknown>>(value: C): AgentBuilder<TInput, TModel, C, TTools>
  /**
   * Add a tool. Accumulates its name into `TTools`. COMPILE ERROR when the tool declares a
   * required run-context (`ContextualTool<_, TRequired>`) that the agent's `TContext` does not
   * satisfy — set it first with `.context()`.
   */
  tool<TName extends string, TRequired>(
    tool: ContextualTool<TName, TRequired>,
    ...guard: TContext extends TRequired ? [] : [error: ToolContextError<TRequired>]
  ): AgentBuilder<TInput, TModel, TContext, TTools | TName>
  /**
   * M69 — add MANY tools at once, accumulating the union of their names.
   *
   * The chain only had the singular `.tool()`, so a tool set computed at runtime — the normal case,
   * since which tools an agent gets depends on sandbox mode, surface profile and trust — could not
   * be expressed in the chain. The measured workaround was a fold outside it:
   *
   *     allTools.reduce((acc, tool) => acc.tool(tool), chain)
   *
   * That works and loses the type-state: the accumulated name union collapses, so
   * `InferAgentToolNames` stops seeing the literal names the generated client is built from. The
   * escape hatch cost exactly the guarantee the builder exists for.
   *
   * An empty list is a typed no-op — `never` unions away, so `TTools` is untouched rather than
   * widened.
   */
  tools<const TList extends readonly ContextualTool[]>(
    list: TList,
    ...guard: TContext extends ToolContextOf<TList>
      ? []
      : [error: ToolContextError<ToolContextOf<TList>>]
  ): AgentBuilder<TInput, TModel, TContext, TTools | ToolNamesOf<TList>>
  /**
   * M69 — apply a sub-chain only when `condition` holds, preserving the type-state either way.
   *
   * `.use(preset)` composes a whole sub-chain but cannot skip a link in the MIDDLE of one, which is
   * what a conditional element needs.
   *
   * The condition is a plain `boolean`, already computed — never a predicate with access to
   * context. A predicate would make this a door for business logic inside the authoring chain (the
   * milestone's named risk); a boolean keeps the decision where the caller made it.
   *
   * The returned type is the same on both branches, because the condition is a runtime value and a
   * type cannot depend on it: the union is what the branch COULD add. That is what lets `.when` sit
   * mid-chain without collapsing what came before.
   */
  when<TResult extends AgentBuilder<TInput, TModel, TContext, string>>(
    condition: boolean,
    apply: (builder: AgentBuilder<TInput, TModel, TContext, TTools>) => TResult,
  ): TResult
  /** M9 — add one input/output guardrail (appends). Runs at the framework boundary before the SDK. */
  guardrail(g: Guardrail): AgentBuilder<TInput, TModel, TContext, TTools>
  /** M9 — set the full guardrail list (replaces any previously added). */
  guardrails(gs: readonly Guardrail[]): AgentBuilder<TInput, TModel, TContext, TTools>
  /** M14 — gate one tool behind a HITL approval (merges into the approvals map, keyed by tool name). */
  approval(
    toolName: TTools extends never ? string : TTools,
    options: HumanInTheLoopOptions,
  ): AgentBuilder<TInput, TModel, TContext, TTools>
  /** M14 — set the full approvals map (replaces any previously added). */
  approvals(
    map: Record<string, HumanInTheLoopOptions>,
  ): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * M13 — the skills the agent can consult mid-turn: a static list OR a per-request
   * resolver `(ctx) => string[]`. Each entry is a `createSkill(...)` object OR a
   * filesystem skill NAME (a string) — mix freely.
   *
   * Progressive disclosure (cheap by default): every turn the SDK lists each skill's
   * name + description in a `<skills>` block (so the model KNOWS the skill exists) AND
   * auto-provisions a `skill_read` tool the model calls to load the full body ON DEMAND
   * (so a long procedure only enters the prompt when it is actually needed).
   */
  skills(selection: SkillsSelection): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * theokit-file-based-config — opt into `.theokit/` file-based config (skills, subagents, hooks,
   * MCP, context, cron), discovered by the SDK from the app root (`project` = `<cwd>/.theokit/`,
   * `user` = `~/.theokit/`). Unset ⇒ inline (code) config only.
   *
   * SECURITY (M68): takes a {@link SettingSourcesSelection}, not a string array. `project` reads
   * `.theokit/hooks.json`, which **executes shell**, so it requires a `TrustPosture` as evidence;
   * `user` is a plain boolean because `~/.theokit/` is the operator's own machine. The previous
   * signature called `project` "opt-in because `.theokit/` is your own repo" — true for a web app
   * whose `cwd` is its own deploy, false for an agent pointed at a repository someone else wrote.
   */
  settingSources(selection: SettingSourcesSelection): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * #686 — decide whether a hook declared in a config root is spawned AT ALL, before it runs.
   *
   * The fluent twin of `defineAgent({ hookApproval })`. It exists because a consumer that builds
   * through this chain had no way to reach the gate: `.use()` composes presets rather than sinking
   * capabilities, and the definition reaches `streamAgentTurnInProcess` with `local` already
   * assembled, so there was no downstream place to inject it either.
   *
   * Distinct from {@link AgentBuilder.hooks} below, which ATTACHES lifecycle hooks. This one decides
   * whether hooks somebody ELSE declared — in `.theokit/`, or in a foreign dialect imported through
   * `settingSources` — are allowed to run.
   *
   * Requires `@theokit/sdk >= 5.4.0`. Declaring it against an older SDK is refused at assembly
   * rather than forwarded: a gate that silently does not gate is worse than none.
   */
  hookApproval(gate: HookApprovalGate): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * M49 — enable the SDK's durable memory for this agent (`.theokit/memory/` in the run cwd:
   * `Remember:` capture with secret redaction, auto-injected recall, memory tools). Takes the SDK's
   * `MemorySettings` verbatim — `{ enabled: true }` is the minimal opt-in.
   */
  memory(settings: MemorySettings): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * B-072 — emit OpenTelemetry spans for this agent's runs (`agent.send`, `llm.call`, `tool.call`,
   * `memory.search`). Takes the SDK's `TelemetrySettings` verbatim; `{ enabled: true }` is the
   * minimal opt-in, and content (prompts, responses, tool args) is omitted unless
   * `includeContent: true` is set.
   *
   * Distinct from a diagnostics sink, which answers "what did this run LOG". A trace answers "where
   * did this run SPEND its time, and which call was the slow one" — two questions, and the sink
   * could never answer the second.
   */
  telemetry(settings: TelemetrySettings): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * Attach LIFECYCLE HOOKS in code, keyed by `HookName` — the builder-chain seam for intercepting
   * the agent loop. `pre_tool_call` may VETO a tool by returning `{ block: true, message }` before
   * it runs; the other events are observational.
   *
   * ```ts
   * AgentBuilder.create().hooks({
   *   pre_tool_call: (c) => guard(c.name) ? undefined : { block: true, message: 'not allowed' },
   *   on_session_start: () => log('session up'),
   * })
   * ```
   *
   * A hook is delivered internally as a code plugin, but that is TRANSPORT, not the contract — use
   * this instead of hand-wrapping a plugin, so the caller expresses interception rather than
   * assembling plumbing. Call once — a later call replaces the map. Composes with
   * {@link AgentBuilder.plugins}: hooks and plugins are additive, not exclusive.
   */
  hooks(
    map: HookHandlers | Readonly<Record<string, unknown>>,
  ): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * Register code `Plugin` objects for this agent — the builder-chain equivalent of
   * `Agent.create({ plugins })`. A plugin is an EXTENSION UNIT: it can register tools and commands,
   * or supply a model provider / memory adapter (`kind: 'general' | 'model-provider' | 'memory'`).
   *
   * For lifecycle interception prefer {@link AgentBuilder.hooks} — a hook needs a plugin only as its
   * transport, and `plugins()` makes the caller assemble that transport by hand. Reach for this when
   * you genuinely have a plugin (a provider, a memory adapter, a tool-registering extension).
   *
   * NOT the Claude Code filesystem-bundle form (B-055). `[{ type: 'local', path: './p' }]` used to
   * typecheck here against `readonly unknown[]` and do nothing — the typecheck that should have
   * caught it was what let it through. A bundle is declared by living in a `plugins/` directory
   * under `.theokit/` or `.claude/`, where its `skills/` and `agents/` are discovered.
   */
  plugins(list: readonly CodePlugin[]): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * Declare MCP (Model Context Protocol) servers available to this agent — the builder-chain
   * equivalent of the `@MCP` class decorator. Each key is a server name; the value is its config
   * (`command` / `args` / `env` / `cwd`). Forwarded to `Agent.create({ mcpServers })`; the SDK owns
   * MCP execution. Call once — a later call replaces the map.
   */
  mcp(servers: McpServersMap): AgentBuilder<TInput, TModel, TContext, TTools>
  /**
   * Apply a reusable partial chain (Spring-Boot-style composition). `preset` receives the current
   * builder and returns an advanced one; its accumulated type-state flows through.
   */
  use<TResult>(
    preset: (builder: AgentBuilder<TInput, TModel, TContext, TTools>) => TResult,
  ): TResult
  /**
   * Resolve to the branded {@link AgentDefinition} — the SAME value `defineAgent` returns.
   * COMPILE ERROR when `.model()` was never called.
   */
  build(
    ...guard: TModel extends UnsetMarker ? [error: MissingModelError] : []
  ): AgentDefinition<TInput extends z.ZodType ? TInput : z.ZodType, TTools>
  /** Phantom — lets type tests read the accumulated tool-name union. Never present at runtime. */
  readonly __toolNames?: TTools
}

/**
 * Build the runtime accumulator. The public method signatures carry the type-state generics + the
 * compile-time guards; the runtime cannot track generics, so the object is bridged to the typed
 * interface once here (the single, documented type-state impl seam — same technique tRPC uses).
 */
function makeBuilder(config: DefineAgentConfig): AgentBuilder {
  const runtime = {
    input: (schema: z.ZodType) => makeBuilder({ ...config, input: schema }),
    model: (id: string) => makeBuilder({ ...config, model: id }),
    system: (prompt: string) => makeBuilder({ ...config, system: prompt }),
    reasoningEffort: (effort: ReasoningEffort) =>
      makeBuilder({ ...config, reasoningEffort: effort }),
    // theokit#363 — accumulates like every other scalar; validation happens once, at `.build()` →
    // `defineAgent`, so the fluent and functional surfaces cannot disagree about what is valid.
    maxIterations: (limit: number) => makeBuilder({ ...config, maxIterations: limit }),
    context: (value: Record<string, unknown>) => makeBuilder({ ...config, context: value }),
    tool: (tool: CustomTool) => makeBuilder({ ...config, tools: [...(config.tools ?? []), tool] }),
    tools: (list: readonly CustomTool[]) =>
      makeBuilder({ ...config, tools: [...(config.tools ?? []), ...list] }),
    // `when` is deliberately not a conditional-typed return: the branch runs or it does not, and
    // either way the caller gets a builder carrying the same accumulated state. Returning `builder`
    // unchanged on `false` is what makes it a true no-op rather than a reset.
    when: (condition: boolean, apply: (b: unknown) => unknown) => {
      const builder = makeBuilder(config)
      return condition ? apply(builder) : builder
    },
    guardrail: (g: Guardrail) =>
      makeBuilder({ ...config, guardrails: [...(config.guardrails ?? []), g] }),
    guardrails: (gs: readonly Guardrail[]) => makeBuilder({ ...config, guardrails: gs }),
    approval: (toolName: string, options: HumanInTheLoopOptions) =>
      makeBuilder({ ...config, approvals: { ...(config.approvals ?? {}), [toolName]: options } }),
    approvals: (map: Record<string, HumanInTheLoopOptions>) =>
      makeBuilder({ ...config, approvals: map }),
    skills: (selection: SkillsSelection) => makeBuilder({ ...config, skills: selection }),
    settingSources: (selection: SettingSourcesSelection) =>
      makeBuilder({ ...config, settingSources: selection }),
    hookApproval: (gate: HookApprovalGate) => makeBuilder({ ...config, hookApproval: gate }),
    memory: (settings: MemorySettings) => makeBuilder({ ...config, memory: settings }),
    telemetry: (settings: TelemetrySettings) => makeBuilder({ ...config, telemetry: settings }),
    hooks: (map: HookHandlers | Readonly<Record<string, unknown>>) =>
      makeBuilder({ ...config, hooks: map }),
    plugins: (list: readonly CodePlugin[]) => makeBuilder({ ...config, plugins: list }),
    mcp: (servers: McpServersMap) => makeBuilder({ ...config, mcpServers: servers }),
    use: (preset: (b: unknown) => unknown) => preset(runtime),
    build: () => defineAgent(config),
  }
  return runtime as unknown as AgentBuilder
}

/**
 * Static entry point for the fluent builder. M57: OO surface (`AgentBuilder.create()`) aligned with
 * the SDK's `X.create()` shape — was the free `agent()` function. `AgentBuilder` is a TYPE (the
 * generic interface above) and a VALUE (this const) at once; in type position the interface wins, in
 * value position the const wins — no collision, the same dual-space pattern the SDK uses for `Agent`.
 */
export const AgentBuilder = {
  /**
   * Start a fluent agent definition. Chain `.model()` (required) + `.context()` / `.system()` /
   * `.input()` / `.tool()` / `.use()`, then `.build()` to get the branded {@link AgentDefinition}.
   */
  create(): AgentBuilder {
    return makeBuilder({})
  },
}
