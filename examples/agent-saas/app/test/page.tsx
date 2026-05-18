'use client'

import { useEffect, useState } from 'react'

export default function TestPage() {
  const [count, setCount] = useState(0)

  // Mount-time side effect — if this runs, hydration completed.
  useEffect(() => {
    document.body.setAttribute('data-hydrated', 'true')
    // eslint-disable-next-line no-console
    console.log('[test page] useEffect ran — hydration OK')
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Hydration smoke test</h1>
      <p>
        Count: <strong data-testid="count">{count}</strong>
      </p>
      <button
        type="button"
        onClick={() => {
          // eslint-disable-next-line no-console
          console.log('[test] clicked! count was', count)
          setCount((c) => c + 1)
          alert('clicked! count was ' + count)
        }}
        style={{
          padding: '12px 24px',
          fontSize: 18,
          background: '#7C3AED',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Click me ({count})
      </button>
      <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
        If clicking does nothing → React hydration is broken.<br />
        Check DevTools Console for `[test page] useEffect ran` log.
      </p>
    </div>
  )
}
