import { Outlet, Link } from 'react-router'
import { ThemeSwitcher, Tooltip } from '@usetheo/ui'
import { Bug, Home, Info, Package } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/about', label: 'About', icon: Info },
  { to: '/products', label: 'Products', icon: Package },
]

export default function RootLayout() {
  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background text-foreground">
      <header className="border-border/60 flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Tooltip label="Theo Devtools live demo" side="bottom">
            <span
              aria-label="TheoKit"
              className="bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-lg"
            >
              <Bug className="h-4 w-4" />
            </span>
          </Tooltip>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">Theo Devtools — Live Demo</span>
            <span className="text-muted-foreground text-xs leading-tight">
              The chip bottom-right is the overlay. Click. Try the buttons.
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="hover:bg-accent hover:text-accent-foreground text-muted-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          ))}
          <div className="ml-2 border-l pl-2">
            <ThemeSwitcher />
          </div>
        </nav>
      </header>
      <main className="overflow-y-auto">
        <div className="container py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
