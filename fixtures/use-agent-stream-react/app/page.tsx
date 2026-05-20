'use client'

import { useState } from 'react'
import { useAgentStream } from 'theokit/client'

/**
 * useAgentStream in a plain React component (no extra UI library deps).
 *
 * The hook handles fetch + ReadableStream + SSE chunk parsing + AbortController
 * cleanup. The component only deals with React state.
 */
export default function Page() {
  const [draft, setDraft] = useState('')
  const { events, send, status, reset } = useAgentStream<{ message: string }>('/api/agent')

  return (
    <main>
      <h1>Agent stream — plain React</h1>
      <p>
        Status: <code>{status}</code>
      </p>
      <ul>
        {events.map((e, i) => (
          <li key={i}>{JSON.stringify(e)}</li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask the agent…"
      />
      <button
        type="button"
        onClick={() => {
          if (draft.trim()) {
            send({ message: draft })
            setDraft('')
          }
        }}
      >
        Send
      </button>
      <button type="button" onClick={reset}>
        Reset
      </button>
    </main>
  )
}
