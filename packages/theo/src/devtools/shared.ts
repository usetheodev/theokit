/**
 * Devtools — shared types.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */

export type DevtoolsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type DevtoolsTab = 'requests' | 'routes' | 'agents' | 'errors' | 'csrf-readiness' | 'settings'
export type DevtoolsTheme = 'light' | 'dark' | 'system'

export interface RequestRecord {
  id: string
  traceId: string
  method: string
  path: string
  status: number
  durationMs: number
  startedAt: number
  csrfWarn?: { code: string; docsUrl: string }
  headers?: Record<string, string>
  bodyPreview?: string
  bodyLength?: number
  bodyTruncated?: boolean
}

export interface ErrorRecord {
  id: string
  type: 'console' | 'unhandled' | 'csrf.warn'
  message: string
  stack?: string
  code?: string
  docsUrl?: string
  timestamp: number
}

export interface CsrfWarnPayload {
  event: 'csrf.warn'
  code: string
  docsUrl: string
  method: string
  path: string
  reason: string
}

export interface RouteInfo {
  path: string
  absoluteFilePath: string
  layoutChain: string[]
  hasLoading: boolean
  hasError: boolean
  hasNotFound: boolean
}

export interface RouteManifest {
  routes: RouteInfo[]
}

/**
 * Per-agent-run telemetry surfaced to the Agents devtools tab.
 *
 * Emitted by `trackAgentRun` (server-side) via the dispatcher in dev mode;
 * prod tree-shakes the entire wire (v1.1 EC-4 `__IS_DEV` IIFE guard).
 * Type lives here (devtools/shared) since both producer (server/cost) and
 * consumer (AgentsTab) need the shape; following architecture v3 ADR-0001
 * rule "shared types in core/contracts" is the canonical home — for this
 * one we keep it in devtools/shared to minimize churn in core/contracts/.
 */
export interface AgentRunRecord {
  id: string
  timestamp: number
  userId: string
  model: string
  tokensInput: number
  tokensOutput: number
  costUsd: number
  status: 'finished' | 'error' | 'aborted'
}

export interface DevtoolsState {
  open: boolean
  visible: boolean
  position: DevtoolsPosition
  theme: DevtoolsTheme
  activeTab: DevtoolsTab
  requests: RequestRecord[]
  errors: ErrorRecord[]
  agentRuns: AgentRunRecord[]
  routeManifest: RouteManifest | null
  activeRoutePath: string | null
  activeChain: string[]
}

export type DevtoolsAction =
  | { type: 'TOGGLE_PANEL' }
  | { type: 'TOGGLE_VISIBLE' }
  | { type: 'SET_TAB'; tab: DevtoolsTab }
  | { type: 'SET_POSITION'; position: DevtoolsPosition }
  | { type: 'SET_THEME'; theme: DevtoolsTheme }
  | { type: 'REQUEST_ADD'; request: RequestRecord }
  | { type: 'ERROR_ADD'; error: ErrorRecord }
  | { type: 'CSRF_WARN'; payload: CsrfWarnPayload }
  | { type: 'MANIFEST_UPDATED'; manifest: RouteManifest }
  | { type: 'ROUTE_MATCHED'; path: string; chain: string[] }
  | { type: 'AGENT_RUN_ADD'; run: AgentRunRecord }
  | { type: 'RESET_REQUESTS' }
  | { type: 'RESET_ERRORS' }
  | { type: 'RESET_AGENT_RUNS' }

export const RING_BUFFER_CAP = 50
export const MAX_QUEUE_SIZE = 100
export const STORAGE_VERSION = 1

export const initialState: DevtoolsState = {
  open: false,
  visible: true,
  position: 'bottom-right',
  theme: 'system',
  activeTab: 'requests',
  requests: [],
  errors: [],
  agentRuns: [],
  routeManifest: null,
  activeRoutePath: null,
  activeChain: [],
}

export const CHANNEL_REQUEST = 'theo:devtools:request' as const
export const CHANNEL_ERROR = 'theo:devtools:error' as const
export const CHANNEL_CSRF_WARN = 'theo:devtools:csrf.warn' as const
export const CHANNEL_MANIFEST = 'theo:devtools:manifest' as const
export const CHANNEL_ROUTE_MATCHED = 'theo:devtools:route-matched' as const
export const CHANNEL_AGENT_RUN = 'theo:devtools:agent.run' as const
