import { useState } from 'react'
import { Badge, Button, Card } from '@usetheo/ui'
import { AlertTriangle, Bug, CheckCircle2, Eye, EyeOff, KeyRound, Sparkles } from 'lucide-react'

interface Action {
  label: string
  icon: React.ComponentType<{ className?: string }>
  variant: 'default' | 'outline' | 'destructive'
  description: string
  run: () => Promise<void> | void
}

export default function HomePage() {
  const [lastResult, setLastResult] = useState<string>(
    'Click a Run button — watch the devtools tabs light up.',
  )
  const [resultKind, setResultKind] = useState<'idle' | 'success' | 'error'>('idle')

  function setOk(msg: string): void {
    setLastResult(msg)
    setResultKind('success')
  }
  function setErr(msg: string): void {
    setLastResult(msg)
    setResultKind('error')
  }

  async function callApi(): Promise<void> {
    setLastResult('Calling /api/hello...')
    setResultKind('idle')
    try {
      const res = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
        body: JSON.stringify({ name: 'Devtools demo' }),
      })
      const data = (await res.json()) as unknown
      setOk(`OK — ${JSON.stringify(data)}`)
    } catch (err) {
      setErr(`ERROR — ${String(err)}`)
    }
  }

  async function callApiWithToken(): Promise<void> {
    setLastResult('POSTing with ?token= + Auth header — both [REDACTED] in devtools')
    setResultKind('idle')
    try {
      const res = await fetch('/api/hello?token=eyJabc123&public=ok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Theo-Action': '1',
          Authorization: 'Bearer SUPER-SECRET-XYZ',
        },
        body: JSON.stringify({ secret: 'should also redact bodies > 4KB' }),
      })
      const data = (await res.json()) as unknown
      setOk(`OK — ${JSON.stringify(data)} (check Requests tab — secrets redacted)`)
    } catch (err) {
      setErr(`ERROR — ${String(err)}`)
    }
  }

  async function rawFetchNoCsrf(): Promise<void> {
    setLastResult('POSTing without X-Theo-Action — Errors tab will light up...')
    setResultKind('idle')
    try {
      const res = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 1 }),
      })
      setErr(`Server returned ${String(res.status)} — open Errors tab for csrf.warn + docsUrl`)
    } catch (err) {
      setErr(`ERROR — ${String(err)}`)
    }
  }

  function logConsoleError(): void {
    setErr('Fired console.error — check the Errors tab')
    console.error('[demo] this is a demo console.error so devtools captures it')
  }

  function throwUnhandled(): void {
    setErr('Threw unhandled rejection — check the Errors tab')
    void Promise.reject(new Error('[demo] unhandled rejection from demo button'))
  }

  const actions: Action[] = [
    {
      label: 'POST /api/hello (clean)',
      icon: CheckCircle2,
      variant: 'default',
      description: 'Healthy request — appears in Requests tab.',
      run: callApi,
    },
    {
      label: 'POST with secrets',
      icon: KeyRound,
      variant: 'outline',
      description: '?token= + Authorization — both redacted by the devtools dispatcher.',
      run: callApiWithToken,
    },
    {
      label: 'Raw fetch (no CSRF)',
      icon: AlertTriangle,
      variant: 'destructive',
      description: 'POST without X-Theo-Action — Errors tab catches the csrf.warn.',
      run: rawFetchNoCsrf,
    },
    {
      label: 'console.error()',
      icon: Bug,
      variant: 'destructive',
      description: 'Direct console.error — devtools forwards to the Errors tab.',
      run: logConsoleError,
    },
    {
      label: 'Unhandled rejection',
      icon: Bug,
      variant: 'destructive',
      description: 'Promise.reject without .catch() — devtools captures via window.onerror.',
      run: throwUnhandled,
    },
  ]

  const resultStyle =
    resultKind === 'success'
      ? 'border-success/30 bg-success/5'
      : resultKind === 'error'
        ? 'border-destructive/30 bg-destructive/5'
        : 'border-border/60 bg-muted/30'

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* HERO */}
      <div>
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="h-3 w-3" />
          Devtools overlay demo
        </Badge>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">What&apos;s running here</h2>
        <p className="text-muted-foreground mt-2">
          This page lives at <code className="bg-muted rounded px-1.5 py-0.5">app/page.tsx</code>.
          The devtools <strong>Routes</strong> tab highlights it. Click a nav link to watch the
          highlight follow.
        </p>
      </div>

      {/* ACTIONS GRID */}
      <section>
        <h3 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
          Try the actions
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((a) => (
            <Card key={a.label} className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="bg-muted text-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <a.icon className="h-4 w-4" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold leading-tight">{a.label}</span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {a.description}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={a.variant}
                  onClick={() => {
                    void a.run()
                  }}
                  className="self-start"
                >
                  Run
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* LAST RESULT */}
      <section>
        <h3 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
          Last result
        </h3>
        <Card className={`p-4 ${resultStyle}`}>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm">
            {lastResult}
          </pre>
        </Card>
      </section>

      {/* WALKTHROUGH */}
      <section>
        <h3 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
          Walkthrough
        </h3>
        <Card className="p-6">
          <ol className="text-muted-foreground space-y-2.5 text-sm">
            <li className="flex gap-3">
              <Badge variant="secondary">1</Badge>
              <span>
                Click the floating chip bottom-right (it says{' '}
                <code className="bg-muted rounded px-1.5 py-0.5">theo</code>).
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">2</Badge>
              <span>
                Open <strong>Requests</strong> tab → click any Run button → row appears in &lt;100
                ms.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">3</Badge>
              <span>
                Click a row to expand: method, path, status, duration, traceId, headers (redacted).
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">4</Badge>
              <span>
                Open <strong>Errors</strong> tab → click Raw fetch / console.error → entry with{' '}
                <code className="bg-muted rounded px-1.5 py-0.5">code</code> + clickable{' '}
                <code className="bg-muted rounded px-1.5 py-0.5">docsUrl</code>.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">5</Badge>
              <span>
                Open <strong>Routes</strong> tab → see <code>app/**</code> tree; nav click → leaf
                highlight follows.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">6</Badge>
              <span>
                Open <strong>CSRF Readiness</strong> tab → emitted{' '}
                <code className="bg-muted rounded px-1.5 py-0.5">csrf.warn</code> events appear
                aggregated by route.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">7</Badge>
              <span>
                Open <strong>Settings</strong> tab → change position or theme → reload → persisted
                via localStorage.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary">8</Badge>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                <strong>Esc</strong> closes the panel · <EyeOff className="h-3.5 w-3.5" />
                <strong>Ctrl+Shift+D</strong> hides the chip.
              </span>
            </li>
          </ol>
        </Card>
      </section>
    </div>
  )
}
