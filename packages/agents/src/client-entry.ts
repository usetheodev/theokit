/**
 * M84 — `@theokit/agents/client`: the agent's client chain, moved over from the CLI package.
 *
 * ## Why it changed package
 *
 * These nine modules lived in `theokit/client` (the **CLI** package), and nothing inside the CLI
 * depended on them — they were leaves there. What held them was history, not design. The consequence
 * was concrete: a consumer of the layer that wanted an in-process transport had to declare a runtime
 * dependency on the CLI, that is, on a package the `SDK → Theokit → AgentBuilder` boundary forbids it
 * from treating as a layer. agent-builder carried six exemptions written purely to sustain that
 * contradiction.
 *
 * ## Why TWO subpaths, and not the main bar
 *
 * `use-agent.ts` — **one** of the nine — imports React. Putting the chain on the main bar would make
 * every consumer of the layer carry React in its graph, including those that never render anything.
 *
 * And one subpath was not enough: a Node consumer (a transport in a process with no UI) would import
 * the barrel and drag React along. This entry is **React-free** by contract — pinned by
 * `test_client_core_entry_imports_no_react`, a gate that already existed in the CLI and caught the
 * regression on its first run. The hook lives in `@theokit/agents/client/react`.
 *
 * The CLI now re-exports FROM HERE (a pure pass-through): two implementations of the same transport
 * in the same process is exactly what M79 just eliminated.
 */

// The transport seam: `ai`'s ChatTransport + optional approval, and the store `useAgent` observes.
export type { AgentTransport, ApprovalDecision, RequestContext } from './client/transport.js'

export { HttpTransport } from './client/http-transport.js'
export type { HttpTransportOptions, HeadersResolver } from './client/http-transport.js'

export { InProcessTransport } from './client/in-process-transport.js'
export type {
  InProcessTransportOptions,
  InProcessRunner,
  InProcessRunInput,
  InProcessApprovalRequestLike,
  InProcessAwaitApproval,
} from './client/in-process-transport.js'

export { ChannelTransport } from './client/channel-transport.js'
export type {
  ChannelTransportOptions,
  ChannelPushSource,
  ChannelTurnHandlers,
} from './client/channel-transport.js'

export { AgentClient } from './client/agent-client.js'
export type { AgentClientState } from './client/agent-client.js'
// usetheokit/theokit#392 — the outstanding HITL decision the snapshot publishes. Exported because a
// non-React surface (TUI, desktop, a plain script) reads it off `getState()` and needs to type it.
export type { PendingApproval } from './client/agent-client.js'
// M92 — without these the consumer cannot turn on coalescing nor tell an aborted approval from a
// denied one; the capability would exist and be unreachable across the boundary.
export type { AgentClientOptions } from './client/agent-client.js'
export { ApprovalAbortedError } from './client/in-process-transport.js'
// theokit#384 — the class a consumer needs to tell "the connection dropped" (resumable) from any
// other `status: 'error'` (not). Unexported, the only recourse left is matching on message text.
export { AgentStreamInterruptedError } from './client/agent-client.js'

export { agentHandle, isAgentHandle } from './client/agent-handle.js'
export type { AgentHandle } from './client/agent-handle.js'

export {
  consumeUIMessageStream,
  responseToChunkStream,
  consumeChunkStream,
} from './client/consume-ui-message-stream.js'
// theokit#384 — a custom transport reading the wire itself needs the same distinction the store
// makes, and it is the reader's return type.
export type { ChunkStreamOutcome } from './client/consume-ui-message-stream.js'

export { extractLastUserText } from './client/last-user-text.js'

// `useAgent` does NOT live here — see `client-react-entry.ts`. This entry is React-free by contract.
export type { UseAgentStatus } from './client/agent-client.js'

/**
 * B-061 — the type this barrel's own signatures NAME.
 *
 * It appeared in an exported signature and crossed nothing: a consumer could read the shape in the
 * emitted `.d.ts` and could only name it by importing the upstream package directly. The sixth
 * instance of the shape `bridge/index.ts` enumerates by issue number, and the first caught by a
 * guard that DERIVES the requirement from the built barrels rather than listing it
 * (`tests/unit/every-public-type-crosses-the-barrel.test.ts`).
 */
export type { WireTransport } from '@theokit/presenter/wire'
