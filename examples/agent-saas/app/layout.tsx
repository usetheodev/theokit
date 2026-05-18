import { Outlet } from 'react-router'
import './globals.css'

/**
 * Root layout. The TheoUI Provider is auto-wired by the framework's
 * Vite plugin (config.ui), so this layout is intentionally minimal.
 * Child routes render at `<Outlet />` (react-router 7).
 *
 * `globals.css` brings in Tailwind directives + TheoUI tokens so the
 * Violet Forge color variables (--background, --foreground, --primary…)
 * resolve at runtime.
 */
export default function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Outlet />
    </div>
  )
}
