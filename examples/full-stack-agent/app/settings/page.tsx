import { Card } from '@usetheo/ui'
import { Settings as SettingsIcon } from 'lucide-react'

/**
 * /settings — read-only view of the runtime configuration.
 *
 * Pure-client component: env vars + import.meta.env values that are
 * inlined at build time. No server route needed for this surface.
 */

interface Row {
  label: string
  value: string
  hint?: string
}

const ROWS: Row[] = [
  {
    label: 'Mode',
    value: import.meta.env.DEV ? 'development' : 'production',
    hint: 'Vite-served dev vs the built `theokit start` bundle',
  },
  {
    label: 'Model',
    value: '(server-side via OPENROUTER_API_KEY)',
    hint: 'See server/routes/chat.ts. Override via MODEL_ID env var.',
  },
  {
    label: 'SDK',
    value: '@usetheo/sdk · Agent.getOrCreate + Run.stream',
    hint: 'Conversation auto-persisted under .theokit/agents/<id>/messages.jsonl',
  },
  {
    label: 'UI library',
    value: '@usetheo/ui ^0.5.1-next.0',
    hint: 'Tailwind v4 zero-config via @tailwindcss/vite + ./vite-plugin',
  },
]

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-border/60 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <SettingsIcon className="size-5 text-primary" aria-hidden />
          <h1 className="font-display text-foreground text-title-md">Settings</h1>
        </div>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Runtime configuration of this example. To change values, edit{' '}
          <code className="font-mono text-label">theo.config.ts</code> or your
          <code className="font-mono text-label">.env</code>.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {ROWS.map((row) => (
            <Card key={row.label} className="px-4 py-3">
              <p className="font-mono text-label-caps text-muted-foreground uppercase">
                {row.label}
              </p>
              <p className="mt-1 font-mono text-body-sm text-foreground">{row.value}</p>
              {row.hint !== undefined && (
                <p className="mt-1 text-label text-muted-foreground">{row.hint}</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
