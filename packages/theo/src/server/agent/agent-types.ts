/**
 * T1.1 — Agent runtime event variant.
 *
 * **T2.2 (architecture-cleanup):** The canonical home for AgentEvent moved to
 * `core/contracts/agent-events.ts` so `client/`, `cache/`, `devtools/` can
 * import the contract without a `client → server` direction edge.
 *
 * This file remains as a re-export ONLY for backwards compatibility of
 * consumers that import from `theokit/server/agent/agent-types` directly.
 * New code should import from `theokit/server` or from `core/contracts/`.
 */

export type {
  AgentRunErrorCode,
  AgentMessageEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentErrorEvent,
  AgentEvent,
} from '../../core/contracts/agent-events.js'
