'use client'

import { useState } from 'react'
import {
  AgentComposer,
  AgentTimeline,
  type AgentEvent as AgentTimelineRow,
} from '@usetheo/ui'

/**
 * Default scaffold — an Agent Surface.
 *
 * This page boots a working agent UI: timeline on the side, composer at the
 * bottom. Out of the box it talks to /api/chat (mock that emits 3 events).
 * Replace the mock at server/routes/chat.ts with your real LLM provider
 * (OpenAI / Anthropic / local). The shape of AgentEvent (theokit/server) is
 * your contract — any provider that emits compatible events plugs in.
 */
export default function Page() {
  const [composerValue, setComposerValue] = useState('')
  const [rows, setRows] = useState<AgentTimelineRow[]>([
    {
      id: 'seed',
      type: 'tool',
      label: 'Agent ready',
      status: 'success',
      timestamp: new Date().toISOString(),
    },
  ])

  async function handleSubmit() {
    if (!composerValue.trim()) return
    const userMessage = composerValue
    setComposerValue('')

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: userMessage }),
    })
    if (!res.body) return

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const chunks = buf.split('\n\n')
      buf = chunks.pop() ?? ''
      for (const chunk of chunks) {
        if (!chunk.startsWith('data:')) continue
        try {
          const event = JSON.parse(chunk.slice(5).trim()) as {
            type: string
            [k: string]: unknown
          }
          setRows((prev) => [
            ...prev,
            {
              id: String(prev.length + 1),
              type: event.type === 'tool_call' ? 'tool' : 'command',
              label:
                event.type === 'message'
                  ? String(event.content)
                  : event.type === 'tool_call'
                    ? `tool: ${String(event.name)}`
                    : event.type === 'error'
                      ? `error: ${String(event.message)}`
                      : event.type,
              status: event.type === 'error' ? 'failed' : 'success',
              timestamp: new Date().toISOString(),
            },
          ])
        } catch {
          // skip malformed chunk
        }
      }
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Theo Agent</h1>
        <p style={{ color: '#888', fontSize: 14 }}>
          Mock LLM connected. Replace <code>server/routes/chat.ts</code> with your provider.
        </p>
      </header>

      <section style={{ flex: 1, overflowY: 'auto' }}>
        <AgentTimeline events={rows} />
      </section>

      <footer>
        <AgentComposer
          value={composerValue}
          onValueChange={setComposerValue}
          onSubmit={handleSubmit}
          placeholder="Ask the agent…"
        />
      </footer>
    </main>
  )
}
