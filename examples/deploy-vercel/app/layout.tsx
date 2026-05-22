import '@usetheo/ui/styles.css'

import { Outlet } from 'react-router'
import { ThemeSwitcher, Tooltip } from '@usetheo/ui'

/**
 * Root layout for the deploy-vercel example.
 *
 * Uses TheoUI primitives (TopNav-like shell built from raw flex + Theo
 * components). Keeps the page chrome minimal so the smoke script can
 * still assert on the SSR content.
 */
export default function RootLayout() {
  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background text-foreground">
      <header className="border-border/60 flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Tooltip label="TheoKit + Vercel" side="bottom">
            <span
              aria-label="TheoKit logo"
              className="bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-lg font-bold"
            >
              T
            </span>
          </Tooltip>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">TheoKit deployed</span>
            <span className="text-muted-foreground text-xs leading-tight">via Vercel adapter</span>
          </div>
        </div>
        <ThemeSwitcher />
      </header>
      <main className="overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
