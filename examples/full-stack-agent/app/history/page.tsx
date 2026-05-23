import { useEffect, useState } from 'react'
import { Card, EmptyState, Badge } from '@usetheo/ui'
import { History } from 'lucide-react'

interface Conversation {
  id: string
  mtime: number
  bytes: number
}

function formatRelative(ms: number): string {
  const delta = Date.now() - ms
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${String(Math.floor(delta / 60_000))}m ago`
  if (delta < 86_400_000) return `${String(Math.floor(delta / 3_600_000))}h ago`
  return `${String(Math.floor(delta / 86_400_000))}d ago`
}

function formatBytes(b: number): string {
  if (b === 0) return 'empty'
  if (b < 1024) return `${String(b)} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/conversations', { headers: { 'X-Theo-Action': '1' } })
      .then((r) => r.json() as Promise<{ data?: { conversations: Conversation[] } }>)
      .then((body) => {
        if (cancelled) return
        setConversations(body.data?.conversations ?? [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error !== null) {
    return (
      <div className="p-6">
        <h1 className="font-display text-foreground text-title-md">History</h1>
        <p className="mt-2 text-body-sm text-destructive">Failed to load: {error}</p>
      </div>
    )
  }

  if (conversations === null) {
    return (
      <div className="p-6">
        <h1 className="font-display text-foreground text-title-md">History</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          icon={History}
          title="No conversations yet"
          description="Start a new chat on the main page — each conversation is persisted under .theokit/agents/ and will appear here."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-border/60 border-b px-6 py-4">
        <h1 className="font-display text-foreground text-title-md">History</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {String(conversations.length)} conversation{conversations.length === 1 ? '' : 's'} on disk
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {conversations.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-body-sm text-foreground">{c.id}</p>
                <p className="text-label text-muted-foreground">
                  {formatRelative(c.mtime)} · {formatBytes(c.bytes)}
                </p>
              </div>
              <Badge variant="outline">{c.bytes === 0 ? 'empty' : 'active'}</Badge>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
