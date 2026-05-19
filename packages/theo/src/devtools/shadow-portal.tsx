/**
 * Render React children inside the devtools Shadow Root via createPortal.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDevtoolsContext } from './hooks/useDevtoolsContext.js'

export function ShadowPortal({ children }: { children: ReactNode }) {
  const { shadowRoot } = useDevtoolsContext()
  return createPortal(children, shadowRoot as unknown as Element)
}
