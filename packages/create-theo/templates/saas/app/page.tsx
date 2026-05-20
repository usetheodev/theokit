'use client'

import { useEffect, useState } from 'react'
import { AgentComposer, AgentTimeline, type AgentEvent as AgentRow } from '@usetheo/ui'
import { useAgentStream } from 'theokit/client'

interface Me {
  userId: string
  email: string
}

export default function Page() {
  const [me, setMe] = useState<Me | null>(null)
  const [email, setEmail] = useState('demo@example.com')
  const [composer, setComposer] = useState('')

  const { events, send, status } = useAgentStream<{ message: string }>('/api/agent')

  async function refreshMe() {
    const res = await fetch('/api/me')
    setMe(res.ok ? ((await res.json()) as Me) : null)
  }

  useEffect(() => {
    refreshMe()
  }, [])

  async function login() {
    await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'demo' }),
    })
    refreshMe()
  }
  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    refreshMe()
  }

  if (!me) {
    return (
      <main
        style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}
      >
        <h1>Sign in</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <button type="button" onClick={login}>
          Sign in (demo)
        </button>
      </main>
    )
  }

  const rows: AgentRow[] = events.map((e, i) => ({
    id: `e-${i}`,
    type: e.type === 'tool_call' ? 'tool' : 'command',
    label:
      e.type === 'message'
        ? e.content
        : e.type === 'tool_call'
          ? `tool: ${e.name}`
          : e.type === 'error'
            ? `error: ${e.message}`
            : e.type,
    status: e.type === 'error' ? 'failed' : 'success',
    timestamp: new Date().toISOString(),
  }))

  return (
    <main
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1>SaaS Agent</h1>
          <p style={{ color: '#888', fontSize: 14 }}>
            Signed in as {me.email} · status: <code>{status}</code>
          </p>
        </div>
        <button type="button" onClick={logout}>
          Sign out
        </button>
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
            if (v) {
              send({ message: v })
              setComposer('')
            }
          }}
          placeholder="Ask your agent…"
        />
      </footer>
    </main>
  )
}
