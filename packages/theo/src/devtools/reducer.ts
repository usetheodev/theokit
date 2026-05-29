/**
 * Devtools reducer.
 *
 * EC-23 ring buffer cap 50 — requests/errors capped at RING_BUFFER_CAP.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import {
  type DevtoolsAction,
  type DevtoolsState,
  type ErrorRecord,
  RING_BUFFER_CAP,
  initialState,
} from './shared.js'

function appendCapped<T>(arr: T[], item: T, cap = RING_BUFFER_CAP): T[] {
  return [item, ...arr].slice(0, cap)
}

export function devtoolsReducer(state: DevtoolsState, action: DevtoolsAction): DevtoolsState {
  switch (action.type) {
    case 'TOGGLE_PANEL':
      return { ...state, open: !state.open }
    case 'TOGGLE_VISIBLE':
      return { ...state, visible: !state.visible }
    case 'SET_TAB':
      return { ...state, activeTab: action.tab }
    case 'SET_POSITION':
      return { ...state, position: action.position }
    case 'SET_THEME':
      return { ...state, theme: action.theme }
    case 'REQUEST_ADD':
      return { ...state, requests: appendCapped(state.requests, action.request) }
    case 'ERROR_ADD':
      return { ...state, errors: appendCapped(state.errors, action.error) }
    case 'CSRF_WARN': {
      const errorRecord: ErrorRecord = {
        // eslint-disable-next-line sonarjs/pseudo-random -- non-secret correlation id for devtools UI
        id: `csrf-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'csrf.warn',
        message: `CSRF warn: ${action.payload.method} ${action.payload.path} — ${action.payload.reason}`,
        code: action.payload.code,
        docsUrl: action.payload.docsUrl,
        timestamp: Date.now(),
      }
      return { ...state, errors: appendCapped(state.errors, errorRecord) }
    }
    case 'MANIFEST_UPDATED':
      return { ...state, routeManifest: action.manifest }
    case 'ROUTE_MATCHED':
      return { ...state, activeRoutePath: action.path, activeChain: action.chain }
    case 'AGENT_RUN_ADD':
      return { ...state, agentRuns: appendCapped(state.agentRuns, action.run) }
    case 'RESET_REQUESTS':
      return { ...state, requests: [] }
    case 'RESET_ERRORS':
      return { ...state, errors: [] }
    case 'RESET_AGENT_RUNS':
      return { ...state, agentRuns: [] }
    default:
      return state
  }
}

export { initialState }
