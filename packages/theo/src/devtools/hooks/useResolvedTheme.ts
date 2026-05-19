/**
 * useResolvedTheme — resolves `'system'` to `'light'` / `'dark'` via
 * `prefers-color-scheme`. Tracks media query changes so flipping the
 * OS theme while devtools is open updates the UI immediately.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useEffect, useState } from 'react'
import type { DevtoolsTheme } from '../shared.js'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useResolvedTheme(theme: DevtoolsTheme): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme())

  useEffect(() => {
    if (theme !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemTheme(mq.matches ? 'light' : 'dark')
    onChange() // initial sync
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'
  return systemTheme
}
