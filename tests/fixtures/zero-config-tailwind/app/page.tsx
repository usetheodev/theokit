import type { ReactElement } from 'react'

/**
 * zero-config-tailwind fixture page. Imports a TheoUI component WITHOUT any
 * consumer-side tailwind.config or postcss.config — the framework's
 * integrateUseTheoUI() must auto-wire @tailwindcss/vite + @usetheo/ui/vite-plugin.
 *
 * The fixture is the proof of T3.4.
 */
export default function Page(): ReactElement {
  return (
    <div className="bg-primary p-4">
      zero-config tailwind fixture — if styled, framework auto-wired the plugins.
    </div>
  )
}
