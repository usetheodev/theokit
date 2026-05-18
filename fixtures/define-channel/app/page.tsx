'use client'

import { useEffect, useState } from 'react'

/**
 * Minimal pub/sub demo over a WebSocket channel.
 *
 * The page joins the `lobby` room on mount, then any message sent is
 * broadcast to every connected client in the same room (including the
 * sender — for visual confirmation).
 */
export default function Page() {
  const [received, setReceived] = useState<string[]>([])
  const [draft, setDraft] = useState('hello')
  const [ws, setWs] = useState<WebSocket | null>(null)

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/channels/lobby`
    const socket = new WebSocket(url)
    socket.addEventListener('message', (e) => {
      setReceived((prev) => [...prev, String(e.data)])
    })
    setWs(socket)
    return () => socket.close()
  }, [])

  return (
    <main>
      <h1>Channel demo (lobby)</h1>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        type="button"
        onClick={() => ws?.send(JSON.stringify({ text: draft }))}
        disabled={!ws || ws.readyState !== WebSocket.OPEN}
      >
        Broadcast
      </button>
      <ul>
        {received.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </main>
  )
}
