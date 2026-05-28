import { useEffect, useState, useRef } from 'react'

/**
 * T6.1 — WebSocket echo client for the Playwright E2E spec.
 *
 * Connects to `/ws/echo`, surfaces connection state via `data-testid`
 * so the spec can assert on DOM. Reconnects on close (1006 abnormal
 * AND 1011 clean-abnormal) with backoff (1s, 3s, 7s).
 */
export default function Page() {
  const [state, setState] = useState<'connecting' | 'open' | 'reconnecting'>('connecting')
  const [messages, setMessages] = useState<string[]>([])
  const [input, setInput] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const attemptRef = useRef(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    const backoff = [1000, 3000, 7000]
    function connect(): void {
      if (cancelledRef.current) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/echo`)
      wsRef.current = ws
      ws.onopen = () => {
        attemptRef.current = 0
        setState('open')
      }
      ws.onmessage = (ev: MessageEvent<string>) => {
        setMessages((m) => [...m, ev.data])
      }
      ws.onclose = () => {
        if (cancelledRef.current) return
        setState('reconnecting')
        const delay = backoff[Math.min(attemptRef.current, backoff.length - 1)]
        attemptRef.current++
        setTimeout(connect, delay)
      }
    }
    connect()
    return () => {
      cancelledRef.current = true
      wsRef.current?.close()
    }
  }, [])

  return (
    <div>
      <h1>WebSocket Test</h1>
      <div data-testid="ws-state">{state}</div>
      <input
        data-testid="ws-input"
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
        }}
      />
      <button
        type="button"
        data-testid="ws-send"
        onClick={() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(input)
            setInput('')
          }
        }}
      >
        Send
      </button>
      <ul data-testid="ws-messages">
        {messages.map((m, i) => (
          <li key={String(i)}>{m}</li>
        ))}
      </ul>
    </div>
  )
}
