'use client'

import { useEffect, useState } from 'react'

interface Me {
  userId: string
  username: string
}

export default function Page() {
  const [me, setMe] = useState<Me | null>(null)
  const [username, setUsername] = useState('alice')

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
      body: JSON.stringify({ username, password: 'demo' }),
    })
    refreshMe()
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    refreshMe()
  }

  return (
    <main>
      <h1>Sessions + auth demo</h1>
      {me ? (
        <>
          <p>Logged in as {me.username}</p>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </>
      ) : (
        <>
          <p>Not logged in.</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
          <button type="button" onClick={login}>
            Login
          </button>
        </>
      )}
    </main>
  )
}
