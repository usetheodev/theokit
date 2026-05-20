/**
 * Devtools public exports.
 *
 * EC-17 mitigation: positive-prod check (NODE_ENV === 'production') rather than
 * negative-dev check (NODE_ENV !== 'development'). Reason: vitest sets
 * NODE_ENV='test' which is neither 'production' nor 'development' — with a
 * negative-dev check, vitest would see the noop, blocking real component tests.
 * The positive-prod check makes 'test', 'development', and undefined NODE_ENV
 * all resolve to the real component. Tree-shake still works in `vite build`
 * because bundlers constant-fold `NODE_ENV === 'production'` to `true` in prod
 * builds and dead-code-eliminate the real branch.
 *
 * Two exports:
 * - `Devtools`        — noop in production, real Overlay elsewhere
 * - `DevtoolsInProd`  — always real (escape hatch — opt-in inspection in prod)
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { Overlay } from './Overlay.js'

const NoopDevtools = () => null

export const Devtools =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? NoopDevtools : Overlay

export const DevtoolsInProd = Overlay

export { Overlay }
export type {
  DevtoolsAction,
  DevtoolsPosition,
  DevtoolsState,
  DevtoolsTab,
  DevtoolsTheme,
  ErrorRecord,
  RequestRecord,
  RouteManifest,
  RouteInfo,
  CsrfWarnPayload,
} from './shared.js'
