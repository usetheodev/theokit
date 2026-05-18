'use client'

import { useEffect, useState, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import {
  AgentComposer,
  AgentTimeline,
  type AgentEvent as AgentRow,
} from '@usetheo/ui'
import { useAgentStream } from 'theokit/client'

interface ConversationDetail {
  id: string
  title: string
  agentKind: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: string | Date
  }>
}

export default function ConversationPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [composer, setComposer] = useState('')
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // useAgentStream handles fetch + SSE + abort + state.
  const { events, send, status, reset } = useAgentStream<{ message: string }>(
    `/api/conversations/${id}/chat`,
  )

  async function loadConversation() {
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) {
        setLoadErr(res.status === 401 ? 'Please sign in.' : 'Conversation not found.')
        return
      }
      setConv((await res.json()) as ConversationDetail)
    } catch (e) {
      setLoadErr((e as Error).message)
    }
  }

  useEffect(() => {
    loadConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // After a stream finishes, refresh the conversation so the assistant
  // reply gets persisted into the visible message list.
  useEffect(() => {
    if (status === 'done') {
      loadConversation()
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Combined rows: stored messages first, then live stream events.
  const rows: AgentRow[] = useMemo(() => {
    if (!conv) return []
    const stored: AgentRow[] = conv.messages.map((m) => ({
      id: `m-${m.id}`,
      type: m.role === 'user' ? 'command' : 'command',
      label: `${m.role === 'user' ? 'You' : m.agentKind ?? 'Agent'}: ${m.content}`,
      status: 'success',
      timestamp:
        typeof m.createdAt === 'string'
          ? m.createdAt
          : new Date(m.createdAt).toISOString(),
    }))
    const live: AgentRow[] = events.map((e, i) => ({
      id: `e-${i}`,
      type: e.type === 'tool_call' || e.type === 'tool_result' ? 'tool' : 'command',
      label:
        e.type === 'message' ? e.content
        : e.type === 'tool_call' ? `tool: ${e.name}`
        : e.type === 'tool_result' ? `result: ${e.name}`
        : e.type === 'error' ? `error: ${e.message}`
        : e.type,
      status: e.type === 'error' ? 'failed' : 'success',
      timestamp: new Date().toISOString(),
    }))
    return [...stored, ...live]
  }, [conv, events])

  if (loadErr) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: '#c00' }}>{loadErr}</p>
        <Link to="/">← Back home</Link>
      </main>
    )
  }
  if (!conv) {
    return (
      <main style={{ padding: 24 }}>
        <p>Loading conversation…</p>
      </main>
    )
  }

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: 24,
        gap: 16,
        maxWidth: 880,
        margin: '0 auto',
      }}
    >
      <header style={{ borderBottom: '1px solid #eee', paddingBottom: 12 }}>
        <Link to="/">← Conversations</Link>
        <h1 style={{ margin: '8px 0 0' }}>{conv.title}</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Agent: <code>{conv.agentKind}</code> · Status: <code>{status}</code>
        </p>
      </header>

      <section style={{ flex: 1, overflowY: 'auto' }}>
        <AgentTimeline events={rows} />
      </section>

      <footer>
        <AgentComposer
          value={composer}
          onValueChange={setComposer}
          onSubmit={() => {
            const v = composer.trim()
            if (!v || status === 'streaming') return
            send({ message: v })
            setComposer('')
          }}
          placeholder={`Ask the ${conv.agentKind}…`}
        />
      </footer>
    </main>
  )
}
