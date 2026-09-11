// M31 builder-only: the `@Agent/@Tool/@Toolbox/@HumanInTheLoop/@Guardrails/@Skills/@MainLoop/
// @SubAgents/@Checkpoint/@Mixin/…` decorators are removed from the public API (ADR-0043 D1/D2). The
// `AgentBuilder.create()` / `tool()` builders are the single authoring surface. The decorator implementations +
// their metadata getters remain internal (the compiler reads them via source-path imports).
// The decorator OPTION TYPES stay public (the framework + consumers annotate with them — e.g. the
// HITL `TimeoutAction` used by the approval-registry and the `AgentBuilder.create().approval(...)` options).
// M103 — the SDK value + types behind the narrowed `Agent` re-export at the bottom of the M58 block.
import { Agent as AgentDoSdk } from '@theokit/sdk'
import type { ListAgentsOptions, ListResult, SDKAgentInfo } from '@theokit/sdk'

export type { HumanInTheLoopOptions, TimeoutAction } from './types.js'
// M35 — the settled HITL decision type is part of the public approval contract: an `awaitApproval`
// resolver (the HTTP registry or the in-process seam) may return a bare boolean OR this structured value.
export type { ApprovalRequest, HitlDecision } from './bridge/hitl-plugin.js'
// `ConfigurationError` is part of the public contract — consumers `catch` it. It used to reach the
// barrel via a compat re-export inside `capability/capabilities.ts` (removed in M56); export it here
// from its home module so removing that internal re-export does not drop it from the package API.
export { ConfigurationError } from './errors.js'
export * from './capability/index.js'
export * from './bridge/index.js'
export * from './loop/index.js'
export * from './guardrails/index.js'
export * from './a2a/agent-card.js'
export * from './a2a/mcp-server-manifest.js'
export * from './a2a/a2a-client.js'
export * from './conversation-scope.js'
export * from './skills-resolver.js'
export * from './acp/protocol.js'
export * from './acp/client.js'
export * from './manifest/agent-manifest.js'
export { agentsPlugin, type AgentsPluginOptions } from './theokit-plugin.js'
export type {
  AgentOptions,
  MainLoopOptions,
  MainLoopMeta,
  ToolboxOptions,
  ToolOptions,
  BudgetOptions,
  ApprovalOptions,
  PolicyHandler,
  ReasoningEffort,
  // M112 — the MCP server configuration crosses all the way to the ROOT. Without this the names
  // stay in `types.ts` and never reach `index.d.ts`: the consumer is back to being unable to name
  // the type of the map `loadMcpJson` returns, which is half of the P2 request this milestone serves.
  McpAuthConfig,
  McpHttpServerConfig,
  McpOAuthConfig,
  McpServerConfig,
  McpServersMap,
  McpStdioServerConfig,
} from './types.js'

// M58 — layered boundary `SDK → Theokit → AgentBuilder`: the consumer imports the SDK's already-OO
// core primitives from `@theokit/agents`, not from `@theokit/sdk` directly. PASS-THROUGH, never a
// wrapper (parsimony-ladder Rung 9): `Agent.create()` / `Tool.create()` / `Provider` are already the
// target OO shape, so wrapping them would be ceremony without value. The domains with their own
// infra surface (sandbox / persistence / interactive / pty) live on matching subpaths that mirror the
// SDK's own subpath split (`@theokit/agents/{sandbox,persistence,interactive,pty}`).
export { Squad, Tool, Provider } from '@theokit/sdk'
export type { SDKAgent, CustomTool, SessionRecord } from '@theokit/sdk'

// theokit#173 — the diagnostics channel crosses the layer too, for the same reason as the rest of
// this block: a consumer whose boundary forbids importing `@theokit/sdk` directly had no way to
// install a sink, so the channel existed and was unreachable from inside the boundary.
//
// The cost was measured before it was fixed. In theokit-sdk#165 a 429 was investigated on the wrong
// hypothesis — the retry WAS running, but silently, so the evidence could not distinguish "retried
// three times" from "never retried". The SDK fix that made it observable landed and still did not
// reach a layered consumer, because the sink receiving it could not be installed from here.
//
// Pass-through, never a wrapper (parsimony ladder, rung 5): the SDK's silent-by-default is already
// the right posture for a library, and WHERE to write stays the consumer's decision.
export { setDiagnosticsSink } from '@theokit/sdk'
export type { DiagnosticsSink } from '@theokit/sdk'

// M103 (agent-builder) — `Agent` is the ONE exception to the pass-through doctrine above, and it is a
// narrowing of the TYPE only: the exported VALUE is the SDK's `Agent`, byte-identical.
//
// `ListAgentsOptions` promises `limit` and `cursor`; the runtime references NEITHER
// (`@theokit/sdk` `Agent.list` reads only `options.runtime`). A caller that passes `limit: 500`
// against a 688-entry registry believes it asked for a bounded page and silently receives the whole
// set — and the day the runtime starts honouring the parameter, the SAME code silently receives a
// TRUNCATED set instead. Both directions are silent, and one of them feeds a NEVER-delete guard in
// a garbage collector. The result type is narrowed for the same reason: `nextCursor` is never set,
// so a caller branching on it is branching on a value that cannot arrive.
//
// This is a closed-type control, not a lint: the call does not compile, so a new call site cannot
// be born wrong by omission. Residue (declared, not hidden): it binds TypeScript consumers only — a
// `.js` caller or an `as any` escapes.
//
// EXIT CRITERION: when the SDK runtime actually honours `limit`/`cursor`/`cwd` (tracked as the
// agent-builder's M107 upstream request), delete this block and restore `Agent` to the plain
// re-export on the line above.
type ListOptionsWithoutPagination = ListAgentsOptions & { limit?: never; cursor?: never }

/**
 * @deprecated Renamed to `ListOptionsWithoutPagination`. This alias exists so a consumer pinned to
 * the previous minor keeps compiling; it will be removed in the next major.
 */
// Redundant on purpose: this is the migration path for a consumer pinned to the previous minor.
// Sunset: the next major.
// eslint-disable-next-line sonarjs/redundant-type-aliases
export type ListOptionsWithoutPaginationAlias = ListOptionsWithoutPagination

/**
 * M71 — `Agent.delete` clears the REGISTRY ENTRY and never touches the transcript on disk.
 *
 * That asymmetry is not visible from the name, and the consumer that hit it had to discover it by
 * measuring: it called `delete`, believed the session was gone, and found the `.jsonl` still there.
 * A method whose name promises removal and delivers half of it is the kind of thing this layer is
 * supposed to say out loud — the same reason the `list` narrowing above carries its own note.
 *
 * The whole answer is `deleteSession` in `@theokit/agents/session`, which returns
 * `{ registryRemoved, transcriptRemoved }` precisely so the two stores are impossible to confuse,
 * and refuses by default when the session is protected. Reach for that unless you specifically want
 * the registry alone.
 *
 * Kept reachable rather than removed: narrowing it away would break a consumer that legitimately
 * wants only the registry entry gone, and this layer's rule is that enriching never reduces.
 */
type AgentWithNarrowedList = Omit<typeof AgentDoSdk, 'list'> & {
  list(
    options?: ListOptionsWithoutPagination,
  ): Promise<Omit<ListResult<SDKAgentInfo>, 'nextCursor'>>
}

/**
 * @deprecated Renamed to `AgentWithNarrowedList`. This alias exists so a consumer pinned to the
 * previous minor keeps compiling; it will be removed in the next major.
 */
// Redundant on purpose: this is the migration path for a consumer pinned to the previous minor.
// Sunset: the next major.
// eslint-disable-next-line sonarjs/redundant-type-aliases
export type AgentWithNarrowedListAlias = AgentWithNarrowedList

export const Agent: AgentWithNarrowedList = AgentDoSdk

// M63 — the layered-boundary forwards. Same PASS-THROUGH doctrine as the M58 core above (Rung 9):
// these are already the target shape.
//
// T4.2 (2026-08-16) — this comment used to say the boundary was CLOSED: "the consumer imports ZERO
// `@theokit/sdk*` directly". Measured against the consumed SDK 4.52.1, that was false for 25 of its
// published subpaths, and false in the expensive direction: a documented-closed boundary is worse
// than a documented-partial one, because a consumer reads the claim and stops looking. That is how a
// builder ends up rebuilding what already ships.
//
// The honest statement is: SOME capabilities cross, each by a decision recorded at its export site
// below.
//
// AND THERE IS NO GATE. This comment used to name a decisions manifest, an integration test that
// "fails when the SDK adds a subpath nobody has decided about", and a parity script. None of the
// three is in the repository — so the next doorless subpath does NOT arrive as a named test failure.
// It arrives when a consumer needs it and cannot reach it, which is the cost this boundary exists to
// avoid. Naming absent machinery is worse than admitting the gap: a reader takes the claim and stops
// checking, which is the same failure as the CLOSED sentence this note replaced.
//
// Closing it means enumerating the SDK's 32 published subpaths, recording a decision for each, and
// failing on an undecided one. That is a milestone, not a comment.
//  - `SubAgent` (a2a delegation primitive): `SubAgent.create()` is already OO; wrapping it adds nothing.
//  - the path-safety helpers are pure functions — a class would be ceremony (parsimony-ladder Rung 5).
export { SubAgent } from '@theokit/sdk/a2a'
export { assertNoSymlinkEscape, isForbiddenPath, safePathJoin } from '@theokit/sdk/path-safety'

// M77 — the context-window resolver, so a surface can render a budget meter against the REAL window
// instead of a constant. Same PASS-THROUGH doctrine (Rung 9): `resolveEffectiveContextWindow` is a
// pure function and `CONTEXT_WINDOW_*` are constants — wrapping them in a class would be ceremony.
//
// The consumer needs this because its TUI hardcoded `contextWindow: 400_000`, decoupled from the
// configured model: change the model and the meter silently lies. A meter that lies is worse than no
// meter, because it is trusted.
export {
  CONTEXT_WINDOW_FLOOR,
  CONTEXT_WINDOW_MARGIN,
  ContextWindowMarginError,
  resolveEffectiveContextWindow,
} from '@theokit/sdk/compaction'
export type { ContextWindowSource, EffectiveContextWindow } from '@theokit/sdk/compaction'

// M78 — the declared coverage policy. Before this milestone the barrel grew REACTIVELY (symbol by
// symbol, under bug pressure) and covered 9 of the SDK's 28 subpaths, with nothing warning when a
// new subpath appeared. `tests/unit/subpath-coverage.test.ts` now demands a verdict for ALL 28 —
// `in` (verified) or `out` (with a written reason).
//
// The same PASS-THROUGH doctrine as M58/M63 (Rung 9): these are already the target shape — the
// error hierarchy is OO, `Retry`/`Semaphore` are classes, and the ones in `/messages` and `/models`
// are pure functions. Wrapping any of them would be ceremony with nothing inside.
//
// `/errors` is the axis of the milestone: the consumer holds typed errors as an UNBREAKABLE rule,
// and without access to this hierarchy the only legal way out was to create a PARALLEL one — which
// is what happened, five classes extending a bare `Error`. And since `isTransientError` requires
// `TheokitAgentError`, the predicate separating recoverable from unrecoverable was useless there by
// construction.
// `export *` and not a curated list, on purpose. The first version re-exported four hand-picked
// classes and `RateLimitError` — which the OAuth refresh needs to recognize a 429 — was left out
// with nothing flagging it. A HALF error hierarchy is exactly the defect this milestone closes:
// the consumer would go straight back to creating the missing class.
//
// The same holds for the other four: they are small, cohesive subpaths where "part of the domain"
// is not a meaningful unit. `tests/unit/subpath-coverage.test.ts` verifies TOTAL coverage of these,
// not a sample.
export * from '@theokit/sdk/errors'
export * from '@theokit/sdk/retry'
export * from '@theokit/sdk/concurrency'
export * from '@theokit/sdk/messages'
export * from '@theokit/sdk/models'
// M81 — the on-disk subagent loader. The opposite asymmetry (skills with a public door, subagents
// without) is what made the consumer write a SECOND `.md` parser — and then a test whose only job
// was to watch the two diverge. What crosses is the PARSED config, never the file format:
// exporting the format would freeze an internal detail as public API.
export { discoverSubagents, loadSubagentDefinition } from '@theokit/sdk/subagents-loader'
// M81 — the name-shaped answer, exported from the SAME place as the reader it selects over, so the
// inventory a product builds for an `/agents` command stops being a second oracle over
// `.theokit/agents/*.md`. Two readers of one convention disagree eventually, and the disagreement
// surfaces as a command listing an agent the runtime cannot find.
export { listSubagentNames } from './bridge/subagent-inventory.js'

// M82 — the `RunEvent` union crosses, TYPE-ONLY.
//
// Without it a consumer's health sink read `mcp_server_failed` STRUCTURALLY — duck-checking `type`
// and `serverName` — specifically to avoid pinning an SDK version. A sink doing that is compensating
// for a typed surface that does not reach it, and the compensation stops working silently the day a
// field is renamed.
//
// Top-risk 1 of the milestone is that exporting it pins the consumer to an SDK version. Two things
// answer that: it crosses as a TYPE (no runtime value, no bundle cost, nothing to be stale at
// runtime), and `tests/unit/mcp-health-sink.test.ts` plus the parity suites turn a shape change into
// a red build here rather than a silent drift downstream.
export type { RunEvent } from '@theokit/sdk'
//
// The SINK itself lives at `@theokit/agents/mcp-health`, not here: it is machinery only a product
// that RENDERS server status needs, and the main barrel measured 36 797 bytes against a 36 500
// ceiling with it inside. Same call as the M76 hook engine — the type crosses (types cost zero
// bytes), the implementation gets a subpath.
// M96 U2 — the TYPE the loader above returns, published on the neighbouring line (the literal pair
// from the peer, `gemini-cli/packages/core/src/index.ts:191-192`). The source name is TAKEN in this
// index — `bridge/index.js` already exports `AgentDefinition`, the builder's BRANDED type — so a
// consumer importing the source name would silently receive the wrong type, and the only remaining
// way out was to redeclare the shape by hand. The alias resolves the collision without touching the
// occupied name.
export type { AgentDefinition as SubagentDefinition } from '@theokit/sdk/subagents-loader'

// B-034 — the per-run sub-agent door, made nameable.
//
// `RuntimeOverrides` is what `createSdkAgentStream` / `toAgentFactory` accept, and its `agents`
// field was the only path that ever spawned a child. It was declared and exported by zero barrels,
// so a consumer could pass the value and could not NAME the type — no helper, no wrapper, no
// typed variable holding one. The parity survey filed that as its own half of this defect:
// "a consumer cannot build a helper around a type they cannot import."
//
// TYPE-ONLY, like `SubagentDefinition` on the line above: no runtime value crosses, so this costs
// nothing at run time and nothing in the barrel's byte budget.
export type { RuntimeOverrides } from './bridge/sdk-adapter.js'

// NAME COLLISION RESOLVED in M91 — and the FIRST attempt was wrong.
//
// `@theokit/sdk/errors` and `./bridge/index.js` both exported `BudgetExceededError`, and they were
// NOT the same thing: the SDK's is a per-WINDOW budget (`budgetName`, `window`, `spentUsd`, `mode`);
// the layer's is a per-DELEGATION budget (`agentName`, `actualCost`, `budgetLimit`). Since the
// consumer holds an unbreakable rule never to import `@theokit/sdk` directly, it never reached the
// SDK's — and an `instanceof` silently matched the wrong domain.
//
// ## What `4.26.0` got wrong, measured
//
// It **reused** the name: the barrel started exporting the SDK class as `BudgetExceededError`. For
// a consumer on `^4.25` doing `catch (e) { if (e instanceof BudgetExceededError) … }`, the
// delegation-budget branch **stopped matching, silently** — exactly the failure mode this milestone
// exists to kill, mirrored. And it shipped as a MINOR.
//
// ## The fix
//
// The old name goes back to being the DELEGATION class — the `@deprecated` alias the DoD asked for,
// the same referential identity as always, zero breakage for anyone on `^4.25`. The SDK class
// crosses under a name that does not collide, closing the original gap without reusing anybody's
// name: "enriching never reduces" (M73) also means not redefining what a name means.
export { DelegationBudgetExceededError } from './bridge/delegation-types.js'
export {
  // The alias EXISTS to be deprecated; re-exporting it is the compatibility contract, not an oversight.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  BudgetExceededError,
} from './bridge/delegation-types.js'
export { BudgetExceededError as WindowBudgetExceededError } from '@theokit/sdk/errors'

// M82 — the public type of the `.hooks()` handlers. Published because the alternative is the
// consumer declaring its own (which is what agent-builder did, with `ctx: unknown` in four of five).
export type { HookHandlers } from './bridge/hook-handlers.js'

// M84 — the in-process transport came from the CLI package, where it was a leaf. It lives on the
// main bar (and not in a new subpath) because "run an agent turn" is exactly what the main bar does;
// splitting it would multiply surface without separating anything. The CLI now re-exports from here.
export { streamAgentTurnInProcess, InProcessApprovalRequiredError } from './in-process-turn.js'
export type {
  StreamAgentTurnInProcessInput,
  StreamAgentTurnDeps,
  InProcessApprovalRequest,
  InProcessAwaitApproval,
} from './in-process-turn.js'

// M67 — the config/trust/wiring family. Same PASS-THROUGH doctrine as M58/M63/M77 (Rung 9): these
// are pure functions and derivations, and wrapping them would be ceremony with nothing inside.
//
// ## Why they were missing, and why that is not the story it looks like
//
// M63 declared this boundary closed. It was not — and the cause was NOT a forgotten line here. Seven
// of these eight symbols DID NOT EXIST in the `@theokit/sdk` this package depended on. Measured by
// downloading every published tarball and grepping `dist/`: 4.40.0 → 0/7, 4.45.0 → 1/7, 4.46.0 → 3/7,
// 4.47.0 → 4/7, 4.48.0 → 6/7, 4.49.0 → 7/7. The floor moved to `^4.49.0` (ADR 0060) so that this
// block could be written at all.
//
// ## The evidence that they were wanted
//
// The consumer holds "never import `@theokit/sdk` directly" as an unbreakable rule, and broke it SIX
// times in production to reach exactly this family: `config/layers.ts:10` (foldLayers,
// verifyLayerOrdering), `config/config.ts:1` (auditEnvReachability), `config/trust-posture.ts:8-11`
// (resolveTrustPosture), `config/security-floor.ts:22` (applySecurityFloor),
// `wired-capabilities.ts:22` (recordWiring, WiredEntity), `tools/view-image.ts:15`
// (ToolResultContentBlock). A team breaking its own rule rather than reimplementing is the strongest
// signal available that the door, not the appetite, was what was missing.
//
// ## Named list, never `export *`
//
// `export *` is used above for five small cohesive subpaths (`/errors`, `/retry`, …) where "part of
// the domain" is not a meaningful unit. This is NOT a subpath: it is a slice of the SDK's root bar,
// and starring it would drag the SDK's entire surface into this barrel and erase the boundary M63
// drew. `tests/unit/subpath-coverage.test.ts` now demands a verdict for every root-bar VALUE, so the
// next addition upstream breaks the build ONCE instead of disappearing for nine minors (ADR 0061).
export {
  applySecurityFloor,
  auditEnvReachability,
  foldLayers,
  recordWiring,
  resolveTrustPosture,
  verifyLayerOrdering,
} from '@theokit/sdk'
export type { ToolResultContentBlock, WiredEntity } from '@theokit/sdk'

// M67 (review fix) — the typed errors of the root bar. `export * from '@theokit/sdk/errors'` above
// covers the `/errors` SUBPATH; these five are `@public` and live only on the root bar, so that line
// never reached them. Verified against the SDK's own `.d.ts`: each carries `@public`, and
// `grep -c <name> dist/errors.d.ts` returns 0.
//
// `LayerOrderError` is the one that made the omission indefensible: the SDK documents it as
// `@throws` of `verifyLayerOrdering` — a function THIS block re-exports two lines above. A consumer
// could call our `verifyLayerOrdering` and be unable to `catch` its declared error by type without
// importing `@theokit/sdk` directly: the precise rule-break this milestone exists to remove,
// reintroduced by the milestone itself.
//
// The reasoning is not new — `index.ts` states it above for `/errors`: "a HALF error hierarchy is
// exactly the defect this milestone closes". The first version of the root-bar verdict table filed
// all five under "internal helper with no consumer-facing contract", which the `.d.ts` contradicts
// word for word. Caught by the `/review` gate; the table now says `in` and the export makes it true.
export {
  GenerateObjectError,
  LayerOrderError,
  StreamObjectError,
  ToolError,
  UngatedCapabilityError,
} from '@theokit/sdk'

// M68 — the trust vocabulary. The `project` source of `settingSources` now requires a
// `TrustPosture` as evidence (ADR 0063), and an API demanding a value whose TYPE the consumer
// cannot name is unusable: they would redeclare the shape by hand, and a second declaration of a
// security contract diverges from the first in silence.
//
// Pure pass-through, like the rest of the M67 family — `resolveTrustPosture` (the value) already
// crosses in the block above. These are the types it produces and consumes.
//
// Closes, for these four, the type-coverage gap ADR 0061 recorded honestly: the ROOT-BAR gate
// enumerates the namespace's `Object.keys` and by construction cannot see an `export type`.
export type { TrustLevel, TrustPosture, TrustPostureInput, TrustSource } from '@theokit/sdk'

// M70 — the turn-lifecycle fold and the wire vocabulary, re-exported so a consumer reaches them
// through the layer it already depends on.
//
// The gap this closes is the same one `fromWireChunk` closed on the other side: an embedded
// consumer drives a transport, holds `WireChunk`s, and had to add `@theokit/presenter` to its own
// manifest just to name the type of the value it was already holding. A dependency declared only to
// reach a type is a dependency the consumer cannot explain — and `theokit/client` already
// establishes the pattern of re-exporting the wire vocabulary rather than making every consumer
// find it.
export { foldTurnLifecycle } from '@theokit/presenter'
export type {
  ContentChunk,
  LifecycleItem,
  LifecycleVocabulary,
  TurnLifecycle,
  TurnOutcome,
} from '@theokit/presenter'
export type { WireChunk, WireDataPart } from '@theokit/presenter/wire'

// M75 — the hook engine lives at `@theokit/agents/hooks`, NOT in this barrel.
//
// It was here first, and that pushed the main bundle from 34.1K to 42.9K against a 35K budget. The
// budget is a decision, not an obstacle: an engine for running subprocesses should not be paid for
// by every app that imports this package to define an agent.
//
// Measured after the fact, which is the part worth recording — M75 merged with the ceiling already
// blown because I read the test COUNT and not the bundle gate. The same lesson B-M74-01 had just
// taught, one milestone earlier, about `@theokit/http`.

/**
 * B-061 — the types an exported signature NAMES, so a consumer can write them.
 *
 * Each of these appeared in a public signature of this barrel and crossed nothing: a caller could
 * read the shape in the emitted `.d.ts` and could only name it by importing `@theokit/sdk` directly,
 * which this layer's doctrine forbids and which has already made a consumer hand-write parallel
 * copies twice.
 *
 * The SIXTH instance of the shape `bridge/index.ts` enumerates by issue number (#663, #668, #675,
 * #686, B-004), and the last one added by hand: `tests/unit/every-public-type-crosses-the-barrel.test.ts`
 * now DERIVES the requirement from the built barrels instead of listing it, so a seventh is a red
 * build rather than a consumer's bug report.
 *
 * TYPE-ONLY: no runtime value crosses, so this costs nothing at run time and nothing in the barrel's
 * byte budget.
 */
export type {
  BudgetTracker,
  // B-060 — the store the SDK resumes from, nameable alongside the capability that takes it.
  // Forwarding a capability whose type cannot be named does not close the gap; the item says so.
  SessionStore,
  InlineSkill,
  Plugin,
  PluginsSettings,
  ProviderRoutingSettings,
} from '@theokit/sdk'
// A subpath type, like the two below it — named from where it lives rather than guessed at the root.
export type { RetryOptions } from '@theokit/sdk/retry'
export type { DiscoverSubagentsOptions } from '@theokit/sdk/subagents-loader'
export type { ContextWindowOptions } from './bridge/compile-context-window.js'
export type { SkillsOptions } from './bridge/compile-skills.js'
