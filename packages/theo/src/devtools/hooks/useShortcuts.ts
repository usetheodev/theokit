/**
 * T4.3 — Devtools keyboard shortcuts.
 *
 * - Escape: close panel (no-op when already closed)
 * - Cmd+Shift+D (Mac) / Ctrl+Shift+D (other): toggle chip visibility
 *
 * Pure helpers exported for testing (no DOM required).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useEffect } from 'react'
import { useDevtoolsContext } from './useDevtoolsContext.js'

export interface ShortcutEvent {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

export function isToggleVisibleShortcut(e: ShortcutEvent, isMac: boolean = isMacPlatform()): boolean {
  if (!e.shiftKey) return false
  if (e.key !== 'd' && e.key !== 'D') return false
  return isMac ? e.metaKey : e.ctrlKey
}

export function isCloseShortcut(e: ShortcutEvent): boolean {
  return e.key === 'Escape'
}

export function useShortcuts(): void {
  const { state, dispatch } = useDevtoolsContext()

  useEffect(() => {
    if (typeof window === 'undefined') return

    function onKeyUp(ev: KeyboardEvent) {
      if (isToggleVisibleShortcut(ev)) {
        ev.preventDefault()
        dispatch({ type: 'TOGGLE_VISIBLE' })
        return
      }
      if (isCloseShortcut(ev)) {
        if (state.open) {
          ev.preventDefault()
          dispatch({ type: 'TOGGLE_PANEL' })
        }
      }
    }

    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [dispatch, state.open])
}
