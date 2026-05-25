import './globals.css'

import { Outlet } from 'react-router'
import { TopNav, ThemeSwitcher, ThemeScript, Badge, Tooltip } from '@usetheo/ui'
import { Bot } from 'lucide-react'

/**
 * Root layout. The TheoUI provider is auto-injected by theokit/vite-plugin
 * when @usetheo/ui is detected — do not wrap manually here (double provider
 * resets persisted theme state).
 *
 * ThemeScript renders an inline script that runs BEFORE hydration and sets
 * data-theme / data-mode on html from localStorage. Without it, SSR renders
 * the default theme but client reads the persisted choice — the hydration
 * mismatch surfaces in ThemeSwitcher's sr-only label.
 */
export default function RootLayout(): React.ReactElement {
  return (
    <>
      <ThemeScript />
      <div className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background text-foreground">
        <TopNav className="border-border/60 border-b px-4 py-2">
          <TopNav.Left>
            <Tooltip label="TheoKit + OpenRouter demo" side="bottom">
              <span className="inline-flex items-center gap-2">
                <Bot className="size-5 text-primary" aria-hidden />
                <span className="font-semibold text-sm tracking-tight">TheoKit Demo</span>
              </span>
            </Tooltip>
            <Badge tone="primary" size="sm" className="ml-2">
              OpenRouter
            </Badge>
          </TopNav.Left>
          <TopNav.Right>
            <ThemeSwitcher />
          </TopNav.Right>
        </TopNav>
        <main className="overflow-hidden">
          <Outlet />
        </main>
      </div>
    </>
  )
}
