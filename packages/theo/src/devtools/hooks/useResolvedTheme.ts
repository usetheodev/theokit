/**
 * useResolvedTheme — resolves `'system'` to `'light'` / `'dark'` via
 * `prefers-color-scheme`. Tracks media query changes so flipping the
 * OS theme while devtools is open updates the UI immediately.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useEffect, useState } from 'react'

import type { DevtoolsTheme } from '../shared.js'

/**
 * Read `prefers-color-scheme`. `matchMedia` exists in every supported
 * browser, but `window` itself is absent in SSR and Node test runs — we
 * default to `'dark'` there. The `window`/`matchMedia` access is wrapped
 * in `typeof` checks rather than property dereferences so SSR never hits
 * a ReferenceError.
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useResolvedTheme(theme: DevtoolsTheme): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme())

  useEffect(() => {
    if (theme !== 'system') return
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      setSystemTheme(mq.matches ? 'light' : 'dark')
    }
    onChange() // initial sync
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
    }
  }, [theme])

  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'
  return systemTheme
}
