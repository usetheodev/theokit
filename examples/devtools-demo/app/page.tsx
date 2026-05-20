import { useState } from 'react'

export default function HomePage() {
  const [lastResult, setLastResult] = useState<string>(
    'Click a button — watch the devtools tabs light up.',
  )

  async function callApi() {
    setLastResult('Calling /api/hello...')
    try {
      const res = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
        body: JSON.stringify({ name: 'Devtools demo' }),
      })
      const data = await res.json()
      setLastResult(`OK — ${JSON.stringify(data)}`)
    } catch (err) {
      setLastResult(`ERROR — ${String(err)}`)
    }
  }

  async function callApiWithToken() {
    setLastResult(
      'Calling /api/hello?token=eyJabc123 (token will appear [REDACTED] in devtools)...',
    )
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
      const data = await res.json()
      setLastResult(
        `OK — ${JSON.stringify(data)} (check Requests tab — Authorization + ?token= are [REDACTED])`,
      )
    } catch (err) {
      setLastResult(`ERROR — ${String(err)}`)
    }
  }

  async function rawFetchNoCsrf() {
    setLastResult('Calling /api/hello WITHOUT X-Theo-Action — Errors tab will light up...')
    try {
      const res = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 1 }),
      })
      setLastResult(`Server returned ${res.status} — open Errors tab to see csrf.warn with docsUrl`)
    } catch (err) {
      setLastResult(`ERROR — ${String(err)}`)
    }
  }

  function logConsoleError() {
    setLastResult('Fired console.error — check the Errors tab')
    console.error('[demo] this is a demo console.error so devtools captures it')
  }

  function throwUnhandled() {
    setLastResult('Threw unhandled rejection — check the Errors tab')
    Promise.reject(new Error('[demo] unhandled rejection from demo button'))
  }

  return (
    <>
      <h2>What's running here</h2>
      <p>
        This page lives at <code>app/page.tsx</code>. The devtools <strong>Routes</strong> tab will
        highlight it. Click any link in the nav above to see the highlight follow you.
      </p>

      <h2>Try the buttons</h2>
      <div className="actions">
        <button type="button" onClick={callApi}>
          POST /api/hello (clean)
        </button>
        <button type="button" onClick={callApiWithToken}>
          POST with <code>?token=</code> + Auth header
        </button>
        <button type="button" className="danger" onClick={rawFetchNoCsrf}>
          Raw fetch (no CSRF header)
        </button>
        <button type="button" className="danger" onClick={logConsoleError}>
          console.error()
        </button>
        <button type="button" className="danger" onClick={throwUnhandled}>
          Unhandled rejection
        </button>
      </div>

      <h2>Last result</h2>
      <pre>{lastResult}</pre>

      <h2>What to do</h2>
      <ol>
        <li>
          Click the floating chip bottom-right (it says <code>theo</code>).
        </li>
        <li>
          Open <strong>Requests</strong> tab → click any button above → row appears within 100 ms.
        </li>
        <li>
          Click a row to expand: method, path, status, duration, traceId, headers (redacted!).
        </li>
        <li>
          Open <strong>Errors</strong> tab → click "Raw fetch" or "console.error" — entries with{' '}
          <code>code</code> + clickable <code>docsUrl</code>.
        </li>
        <li>
          Open <strong>Routes</strong> tab → see the tree of <code>app/**</code>; click another link
          in nav → leaf highlight follows.
        </li>
        <li>
          Open <strong>Settings</strong> tab → change position or theme → reload — preserved via
          localStorage.
        </li>
        <li>
          Press <strong>Escape</strong> to close the panel; <strong>Ctrl+Shift+D</strong> to
          hide/show the chip.
        </li>
        <li>Try dragging the chip — it springs to the nearest corner; position persists.</li>
      </ol>
    </>
  )
}
