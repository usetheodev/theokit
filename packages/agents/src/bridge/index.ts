export {
  createAgentExecutionContext,
  isAgentContext,
  type AgentExecutionContext,
  type AgentRunInfo,
} from './agent-execution-context.js'

export {
  compileTools,
  type CompiledTool,
  type CompiledAgentOptions,
  type ToolboxWalkResult,
  type ToolWalkResult,
} from './agent-compiler.js'

export { compileSkills } from './compile-skills.js'
export { compileContextWindow, type CompiledContextWindow } from './compile-context-window.js'
export {
  compileProjectContext,
  projectContextMetadataOnlyKnobs,
} from './compile-project-context.js'

export { streamAgentResponse, type StreamEvent } from './agent-sse-handler.js'

export {
  type AgentStreamEvent,
  type TextDeltaEvent,
  type ToolCallEvent,
  type PartialToolCallEvent,
  type ToolResultEvent,
  type ThinkingEvent,
  type IterationEvent,
  type ApprovalRequiredEvent,
  type ErrorEvent,
  type DoneEvent,
  type AgentStopReason,
  type AgentTurnMetadata,
  type RunStartedEvent,
  isTextDelta,
  isToolCall,
  isPartialToolCall,
  isToolResult,
  isDone,
  isError,
  isApprovalRequired,
  type ArtifactStartEvent,
  type ArtifactChunkEvent,
  type StateUpdateEvent,
  type CheckpointSavedEvent,
  type FileEditEvent,
} from './agent-stream-events.js'

export {
  generateAgentRoutes,
  type AgentRoute,
  type AgentRouteContext,
} from './agent-route-generator.js'

export {
  createSdkAgentStream,
  toAgentFactory,
  type SdkAgentHandle,
  // M91 — the types that make `send` honest cross alongside it: without them the consumer cannot
  // name the return, and goes back to writing the adapter this milestone exists to delete.
  type SdkSendOptions,
  type SdkTurnHandle,
} from './sdk-adapter.js'
// M96 — the approval posture crosses the boundary: without it being nameable, the consumer cannot
// declare what `toAgentFactory` now requires. `AgentDefinition` (a name already taken just below, by
// the builder's branded type) is untouched — the posture has a name of its own.
/**
 * Coverage-matrix gap 28 — *"`applyPosture` unreachable by any surface"*, whose declared resolution
 * is "one implementation, reachable".
 *
 * T2.1 closed the half a TUI asks per event (`shouldAutoApprove`, below) and left this one absent,
 * so the gap stayed open while its task was recorded closed. A surface that builds its own agent
 * options — rather than going through `toAgentFactory` — has no way to install the gate its posture
 * describes, which is the same "type crossed, enforcement did not" shape the invention gate exists
 * to catch (T4.1). Exported here as a VALUE, not just a type.
 */
export { applyPosture, type ApprovalPosture } from './approval-posture.js'

/**
 * T2.1 — the auto-approve decision, callable by a SURFACE.
 *
 * `ApprovalPosture` above is a type; `applyPosture` installs the gate at factory time. Neither
 * answers the question a TUI asks before rendering a prompt: "may I auto-approve THIS tool now?".
 * That gap is why the rule was written twice downstream, which `approval-posture.ts:69-72` names as
 * a G12 violation. This is the half that was missing.
 */
export {
  APPROVAL_MODES,
  shouldAutoApprove,
  WRITE_SCOPED_TOOLS,
  type ApprovalMode,
  type ShouldAutoApproveOptions,
} from './approval-decision.js'
export type { DefinitionOrThunk } from './definition-or-thunk.js'
// M107 — the read crosses alongside the write. While only the write was public, the consumer
// reassembled the param key by hand to read it, which is a second oracle over the same fact.
export { buildModelSelection, reasoningEffortOf } from './model-selection.js'
export {
  createThinkTagExtractor,
  extractThinkTagStream,
  type Segment,
} from './think-tag-extractor.js'
export { translateSdkEvent, type SdkMessage } from './event-translator.js'
export { presentUIMessageStream } from './present-ui-message-stream.js'
// M31 builder-only: `AgentBuilder.create()` (below) is the public authoring surface; `defineAgent` is now
// internal (the AgentBuilder.create() builder's `.build()` delegates to it via source path), removed from the
// public API. `compileAgentDefinition` + the branded types stay public (the framework adapter
// consumes them).
export {
  compileAgentDefinition,
  isAgentDefinition,
  AGENT_BRAND,
  type AgentDefinition,
  type DefineAgentConfig,
  type InferAgentInput,
  type InferAgentToolNames,
} from './define-agent.js'
// `AgentBuilder` / `ContextualTool` are each a TYPE (generic interface) and a VALUE (static factory:
// `AgentBuilder.create()` / `ContextualTool.of()`) — M57 replaced the free `agent()`/`contextualTool()`
// functions with the SDK's `X.create()` shape. A plain re-export carries both spaces.
export { AgentBuilder, ContextualTool } from './agent-builder.js'
export {
  compileAgentModule,
  compileLoadedAgentModule,
  streamAgentUIMessages,
  AgentDefinitionError,
  type AgentModule,
} from './agent-endpoint.js'

// #686 — the hook gate's vocabulary crosses WITH the capability that takes it. `HookApprovalCapability`
// was reachable while the type of its argument and the class of its refusal were not, so a consumer
// could build the gate and neither type it nor catch it. Fourth instance of that shape (#663, #668,
// #675), and the first with a guard that reads the emitted barrel instead of the source.
export {
  // B-004 — FIFTH instance of the shape the comment above enumerates (#663, #668, #675, #686). The
  // refusal shipped without crossing this barrel while the class it was written to mirror sat one
  // line below it, so a consumer could only match the message string.
  CompatImportUnsupportedError,
  HookGateUnsupportedError,
  type HookApprovalGate,
  type HookApprovalRequest,
} from './sdk-adapter-create-options.js'

export {
  delegate,
  DelegationBudgetExceededError,
  // The alias EXISTS to be deprecated; re-exporting it is M91's compatibility contract, not careless
  // usage. It goes in a major.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  BudgetExceededError,
  DelegationError,
  type DelegateOptions,
  type DelegationResult,
} from './agent-orchestrator.js'

export {
  createToolHooksPlugin,
  type ToolHooks,
  type ToolHooksPlugin,
  type BeforeToolCallContext,
  type AfterToolCallContext,
  type LLMCallContext,
  type ProcessInputContext,
  type ToolCallVeto,
} from './tool-hooks-plugin.js'

export {
  runWithApiErrorHandling,
  createApiErrorHandler,
  type ApiErrorPolicy,
  type ApiErrorDecision,
  type ApiErrorContext,
} from './api-error-handler.js'

export {
  delegateBackground,
  delegateWithScoring,
  type BackgroundDelegation,
  type DelegateFn,
  // M81 — the PORT and its union cross too. Exporting `delegateWithScoring` while withholding the
  // type its parameter accepts is the shape this milestone exists to fix: a consumer holding an SDK
  // `SubAgent` could reach the function and not the vocabulary to satisfy it. Knip caught that the
  // types were exported from the module and reachable from nothing.
  type DelegationPort,
  type DelegationTarget,
  type Scorer,
  type ScoreVerdict,
  type ScoredDelegation,
} from './delegation-scoring.js'

// M81 — the ephemeral-agent lifecycle, including the shape a caller's factory returns. Withholding
// `EphemeralAgent` would leave a typed factory unwritable, which is how the two hand-written
// acquire/dispose sites came to exist in the first place.
export {
  DelegationTimeoutError,
  withClockCap,
  withEphemeralAgent,
  type EphemeralAgent,
} from './delegation-lifecycle.js'

export {
  resolveMcpServers,
  mcpRegistry,
  mcpToolApprovals,
  type McpSelection,
  type McpRequestContext,
  type McpRegistryConfig,
  type McpApprovalSpec,
} from './mcp-resolver.js'
// M107 — the neighbour that TOUCHES disk. `mcp-resolver` decides which servers a request receives;
// this one reads `<cwd>/.mcp.json`. The layer exposed the rare cases and not the common one, so every
// consumer wrote the loader by hand.
export { loadMcpJson, McpFileError } from './mcp-file.js'

// M68 — the `settingSources` trust gate (ADR 0063/0064/0065).
export * from './setting-sources-gate.js'
