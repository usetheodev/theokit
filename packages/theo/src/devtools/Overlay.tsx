/**
 * Devtools root component.
 *
 * Phase 1: shell (chip + panel).
 * Phase 2: dispatcher wiring via useInsertionEffect + HMR subscription.
 *
 * EC-24: setDispatch is idempotent (NULL → non-null only). React.StrictMode
 *   double-effect safe — second mount sets the same dispatch fn; no double-flush.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useEffect, useInsertionEffect, useMemo, useReducer } from 'react'
import { Indicator } from './components/Indicator.js'
import { Panel } from './components/Panel.js'
import { dispatcher } from './dispatcher.js'
import { DevtoolsContext } from './hooks/useDevtoolsContext.js'
import { useActiveRoute } from './hooks/useActiveRoute.js'
import { useResolvedTheme } from './hooks/useResolvedTheme.js'
import { useShortcuts } from './hooks/useShortcuts.js'
import { subscribeToServerEvents } from './hmr-bridge.js'
import { loadFromStorage, writeToStorage } from './persistence.js'
import { devtoolsReducer, initialState } from './reducer.js'
import { ShadowPortal } from './shadow-portal.js'
import { createStyles } from './styles/styles.js'
import { buildThemeCssVars } from './styles/tokens.js'

function ActiveRouteTracker() {
  useActiveRoute()
  return null
}

function ShortcutsTracker() {
  useShortcuts()
  return null
}

/**
 * Inject CSS custom properties for the resolved theme into the shadow root.
 *
 * `:host` targets the shadow host element (<theo-devtools-portal>), so the
 * vars cascade to EVERY descendant in the shadow tree (chip + panel + all
 * portal-rendered children). Without `:host`, scoping by
 * `[data-theo-devtools-root]` would miss the portal-rendered children that
 * createPortal mounts as direct children of the shadow root (siblings of
 * the React root div, NOT descendants).
 */
function ThemeVars({ resolved }: { resolved: 'light' | 'dark' }) {
  const css = `:host { color-scheme: ${resolved}; ${buildThemeCssVars(resolved)} }`
  return <style data-theo-devtools-theme={resolved}>{css}</style>
}

export function Overlay({ shadowRoot }: { shadowRoot: ShadowRoot }) {
  const [state, dispatch] = useReducer(
    devtoolsReducer,
    initialState,
    // T4.2 — lazy init merges persisted preferences over defaults
    (initial) => ({ ...initial, ...loadFromStorage() }),
  )
  const styles = useMemo(() => createStyles(shadowRoot), [shadowRoot])
  const resolvedTheme = useResolvedTheme(state.theme)

  // T4.2 — persist on every change to preferences (open/position/theme/tab/visible)
  useEffect(() => {
    writeToStorage({
      position: state.position,
      theme: state.theme,
      open: state.open,
      activeTab: state.activeTab,
      visible: state.visible,
    })
  }, [state.position, state.theme, state.open, state.activeTab, state.visible])

  // useInsertionEffect runs DURING commit, before any DOM mutations —
  // earliest hook React gives us. Lets queued events (Pattern F) flush
  // before any component reads state.
  useInsertionEffect(() => {
    dispatcher.setDispatch(dispatch)
    return () => {
      dispatcher.setDispatch(null)
    }
  }, [])

  // HMR bridge subscription runs in useEffect (after paint OK — events
  // either queue or dispatch synchronously, both safe paths).
  useEffect(() => {
    const sub = subscribeToServerEvents(dispatcher)
    return () => sub.unsubscribe()
  }, [])

  return (
    <DevtoolsContext.Provider value={{ shadowRoot, state, dispatch, styles }}>
      <ShadowPortal>
        <ThemeVars resolved={resolvedTheme} />
        <ActiveRouteTracker />
        <ShortcutsTracker />
        <Indicator />
        <Panel />
      </ShadowPortal>
    </DevtoolsContext.Provider>
  )
}

export default Overlay
