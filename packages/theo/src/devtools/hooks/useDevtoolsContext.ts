/**
 * Devtools React context — shadow root + state + dispatch.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { createContext, useContext } from 'react'
import type { DevtoolsAction, DevtoolsState } from '../shared.js'
import type { StyleFactory } from '../styles/styles.js'

export interface DevtoolsContextValue {
  shadowRoot: ShadowRoot
  state: DevtoolsState
  dispatch: (action: DevtoolsAction) => void
  styles: StyleFactory
}

export const DevtoolsContext = createContext<DevtoolsContextValue | null>(null)

export function useDevtoolsContext(): DevtoolsContextValue {
  const ctx = useContext(DevtoolsContext)
  if (!ctx) throw new Error('useDevtoolsContext: must be used inside <Overlay />')
  return ctx
}
