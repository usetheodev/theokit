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
  // `navigator.platform` is deprecated in favor of `navigator.userAgentData`,
  // but the modern API is still gated by an origin trial on most browsers
  // (2026). Falling back to `userAgent` covers Safari and older Firefox,
  // where the data API is absent. The combined check is intentional.
  const ua = navigator.userAgent
  // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation -- userAgentData not widely available yet
  const platform = navigator.platform
  return /Mac|iPhone|iPad/.test(platform) || /Macintosh|iPhone|iPad/.test(ua)
}

export function isToggleVisibleShortcut(
  e: ShortcutEvent,
  isMac: boolean = isMacPlatform(),
): boolean {
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
      if (isCloseShortcut(ev) && state.open) {
        ev.preventDefault()
        dispatch({ type: 'TOGGLE_PANEL' })
      }
    }

    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [dispatch, state.open])
}
