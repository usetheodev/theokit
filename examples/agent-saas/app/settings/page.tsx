'use client'

import { useEffect, useState } from 'react'
import { Link } from 'react-router'

interface UploadResult {
  id: string
  filename: string
  mimeType: string
  size: number
}

interface NotificationEvent {
  kind: string
  payload?: unknown
}

export default function SettingsPage() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [notifications, setNotifications] = useState<NotificationEvent[]>([])
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle')

  // WebSocket subscription to the notifications channel.
  useEffect(() => {
    setWsStatus('connecting')
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/channels/notifications/me`
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(url)
      ws.addEventListener('open', () => setWsStatus('open'))
      ws.addEventListener('close', () => setWsStatus('closed'))
      ws.addEventListener('error', () => setWsStatus('closed'))
      ws.addEventListener('message', (e) => {
        try {
          const evt = JSON.parse(String(e.data)) as NotificationEvent
          setNotifications((prev) => [...prev, evt])
        } catch {
          // ignore malformed
        }
      })
    } catch {
      setWsStatus('closed')
    }
    return () => ws?.close()
  }, [])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    if (res.ok) {
      setUploadResult((await res.json()) as UploadResult)
    } else {
      setUploadResult(null)
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Link to="/">← Back</Link>
      <h1>Settings</h1>

      <section style={{ marginTop: 24, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
        <h2>Upload attachment</h2>
        <p style={{ color: '#666', fontSize: 14 }}>
          Multipart upload via <code>parseRequestBody</code>. Max 5 MB.
        </p>
        <form onSubmit={handleUpload} encType="multipart/form-data" style={{ display: 'flex', gap: 8 }}>
          <input name="file" type="file" required />
          <button type="submit">Upload</button>
        </form>
        {uploadResult && (
          <pre style={{ marginTop: 12, background: '#f6f6f6', padding: 12, borderRadius: 6 }}>
            {JSON.stringify(uploadResult, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop: 24, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
        <h2>Real-time notifications</h2>
        <p style={{ color: '#666', fontSize: 14 }}>
          WebSocket channel <code>/channels/notifications/me</code> — status:{' '}
          <strong>{wsStatus}</strong>
        </p>
        <ul>
          {notifications.length === 0 ? (
            <li style={{ color: '#999' }}>(no events yet)</li>
          ) : (
            notifications.map((n, i) => (
              <li key={i}>
                <code>{n.kind}</code>: {JSON.stringify(n.payload ?? null)}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  )
}
