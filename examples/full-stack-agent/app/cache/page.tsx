import { useCallback, useState } from 'react'
import { Card, Badge, Button } from '@usetheo/ui'
import { Zap, RefreshCw, Trash2 } from 'lucide-react'

interface QuoteResponse {
  symbol: string
  price: number
  computedAt: string
  _meta: {
    handlerCallCount: number
    cachedFor: string
  }
}

interface HitLog {
  id: number
  ts: number
  status: 'HIT' | 'STALE' | 'MISS' | 'BYPASS' | 'ERROR'
  durationMs: number
  body: QuoteResponse | { error: string } | null
}

let logIdSeq = 0

export default function CachePage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [log, setLog] = useState<HitLog[]>([])
  const [busy, setBusy] = useState(false)

  const fetchQuote = useCallback(
    async (opts: { bypass?: boolean } = {}) => {
      setBusy(true)
      const started = performance.now()
      try {
        const res = await fetch(
          `/api/quote?symbol=${encodeURIComponent(symbol)}`,
          opts.bypass ? { headers: { 'X-No-Cache': '1' } } : undefined,
        )
        const status =
          (res.headers.get('X-Theo-Cache') as 'HIT' | 'STALE' | 'MISS' | null) ??
          (opts.bypass ? 'BYPASS' : 'MISS')
        const body = (await res.json()) as QuoteResponse
        const durationMs = Math.round(performance.now() - started)
        setLog((prev) => [
          { id: ++logIdSeq, ts: Date.now(), status, durationMs, body },
          ...prev.slice(0, 19),
        ])
      } catch (e) {
        const durationMs = Math.round(performance.now() - started)
        setLog((prev) => [
          {
            id: ++logIdSeq,
            ts: Date.now(),
            status: 'ERROR',
            durationMs,
            body: { error: e instanceof Error ? e.message : String(e) },
          },
          ...prev.slice(0, 19),
        ])
      } finally {
        setBusy(false)
      }
    },
    [symbol],
  )

  const revalidate = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/quote-bust', {
        method: 'POST',
        headers: { 'X-Theo-Action': '1' },
      })
      const data = (await res.json()) as { deleted: number; message: string }
      setLog((prev) => [
        {
          id: ++logIdSeq,
          ts: Date.now(),
          status: 'BYPASS',
          durationMs: 0,
          body: {
            symbol: '—',
            price: 0,
            computedAt: data.message,
            _meta: { handlerCallCount: data.deleted, cachedFor: 'invalidated' },
          },
        },
        ...prev.slice(0, 19),
      ])
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="font-display text-foreground text-title-md">Cache demo</h1>
        <p className="text-foreground/70 text-sm">
          <code>/api/quote?symbol=X</code> is wrapped with <code>defineCachedRoute</code> — maxAge
          5s, swr 30s, tag <code>'quote'</code>. Hit the buttons below and watch{' '}
          <strong>X-Theo-Cache</strong> transition through MISS → HIT → STALE.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label htmlFor="symbol" className="block font-medium text-foreground/70 text-xs">
              Symbol
            </label>
            <input
              id="symbol"
              type="text"
              value={symbol}
              onChange={(e) => {
                setSymbol(e.currentTarget.value)
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              maxLength={10}
            />
          </div>

          <Button
            onClick={() => {
              void fetchQuote()
            }}
            disabled={busy || symbol.length === 0}
          >
            <Zap className="size-4" aria-hidden />
            Fetch (cached)
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              void fetchQuote({ bypass: true })
            }}
            disabled={busy || symbol.length === 0}
          >
            <RefreshCw className="size-4" aria-hidden />
            Bypass cache
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              void revalidate()
            }}
            disabled={busy}
          >
            <Trash2 className="size-4" aria-hidden />
            revalidateTag('quote')
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-foreground/70 text-xs sm:grid-cols-3">
          <div>
            <strong className="text-foreground">Fetch (cached)</strong> — normal request through the
            cache layer.
          </div>
          <div>
            <strong className="text-foreground">Bypass cache</strong> — adds{' '}
            <code>X-No-Cache: 1</code> header; <code>bypassWhen</code> triggers, handler runs fresh.
          </div>
          <div>
            <strong className="text-foreground">revalidateTag</strong> — invalidates every entry
            tagged <code>'quote'</code>. Next request is a MISS.
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-border/60 border-b px-4 py-3">
          <h2 className="font-semibold text-foreground text-sm">
            Request log <span className="text-foreground/50 text-xs">(last 20 — newest first)</span>
          </h2>
        </div>
        {log.length === 0 ? (
          <div className="p-6 text-center text-foreground/60 text-sm">
            No requests yet. Click <strong>Fetch (cached)</strong> above to start.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="grid grid-cols-[80px_60px_1fr_auto] items-center gap-3 px-4 py-2 text-sm"
              >
                <Badge variant={badgeVariantFor(entry.status)}>{entry.status}</Badge>
                <span className="font-mono text-foreground/60 text-xs">{entry.durationMs}ms</span>
                <span className="truncate text-foreground/80">{formatBody(entry.body)}</span>
                <time className="font-mono text-foreground/40 text-xs">
                  {new Date(entry.ts).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold text-foreground text-sm">What to look for</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-foreground/80 text-sm">
          <li>
            First click: <strong>MISS</strong> badge, ~200+ ms duration (handler actually ran).
          </li>
          <li>
            Click again within 5 seconds: <strong>HIT</strong> badge, sub-10 ms duration (cache
            served).
          </li>
          <li>
            Wait 6+ seconds, click: <strong>STALE</strong> badge — instant response, handler runs in
            the background to refresh.
          </li>
          <li>
            Click again immediately: <strong>HIT</strong> on the freshly-revalidated entry.
          </li>
          <li>
            Click <strong>Bypass cache</strong>: handler always runs (no cache write or read).
          </li>
          <li>
            Click <strong>revalidateTag('quote')</strong>: next fetch is a clean MISS.
          </li>
          <li>
            Change the <strong>Symbol</strong> input — each unique symbol has its own cache entry
            (key includes <code>?symbol=...</code>).
          </li>
        </ol>
      </Card>
    </div>
  )
}

function badgeVariantFor(status: HitLog['status']): 'default' | 'outline' | 'destructive' {
  if (status === 'HIT') return 'default'
  if (status === 'STALE') return 'outline'
  if (status === 'ERROR') return 'destructive'
  return 'outline'
}

function formatBody(body: HitLog['body']): string {
  if (!body) return '(empty)'
  if ('error' in body) return `Error: ${body.error}`
  return `${body.symbol} @ $${body.price.toFixed(2)} · handler calls=${String(body._meta.handlerCallCount)} · ${body._meta.cachedFor}`
}
