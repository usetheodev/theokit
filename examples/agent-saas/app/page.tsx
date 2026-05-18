'use client'

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Input, Label, EmptyState, ThemeSwitcher } from '@usetheo/ui'
import { theoFetch } from 'theokit/client'
import type { GET as GetMe } from '../server/routes/me.js'
import type { GET as ListConversations, POST as CreateConversation } from '../server/routes/conversations/index.js'

type Me = { userId: string; email: string; name: string }
type Conversation = {
  id: string
  title: string
  agentKind: string
  messageCount: number
  updatedAt: Date | string
}
type AgentKind = 'researcher' | 'writer' | 'coder'

/**
 * Demo credentials pre-seeded into the example.
 *
 * The "Sign in as Demo" button calls signup first (idempotent — returns
 * 409 if the user already exists) then login. So on first run the user
 * is created, on every subsequent run login just works.
 *
 * This is fixture behavior for the example. In a real product you'd
 * remove the demo button entirely and require explicit signup.
 */
const DEMO_EMAIL = 'demo@theokit.dev'
const DEMO_PASSWORD = 'theokit-demo-2026'
const DEMO_NAME = 'Demo User'

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null)
  const [convs, setConvs] = useState<Conversation[]>([])
  const [loginEmail, setLoginEmail] = useState(DEMO_EMAIL)
  const [loginPassword, setLoginPassword] = useState(DEMO_PASSWORD)
  const [newTitle, setNewTitle] = useState('')
  const [newKind, setNewKind] = useState<AgentKind>('researcher')
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function refreshMe() {
    try {
      const data = await theoFetch<typeof GetMe>('/api/me', {})
      setMe(data as Me)
      const list = (await theoFetch<typeof ListConversations>(
        '/api/conversations',
        {},
      )) as Conversation[]
      setConvs(list)
    } catch {
      setMe(null)
      setConvs([])
    }
  }

  useEffect(() => {
    refreshMe()
  }, [])

  async function login() {
    setErr(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      if (!res.ok) {
        setErr('Invalid credentials')
        return
      }
      await refreshMe()
    } finally {
      setSubmitting(false)
    }
  }

  async function signup() {
    setErr(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword || 'demo-password-123',
          name: loginEmail.split('@')[0] ?? 'User',
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setErr(body.error ?? 'Signup failed')
        return
      }
      await refreshMe()
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * One-click demo flow. Tries to sign up the demo user (idempotent —
   * 409 if it already exists), then signs in. Works on first run AND
   * on repeat runs.
   */
  async function signInAsDemo() {
    setErr(null)
    setSubmitting(true)
    try {
      // 1. Try signup. If 409 (user exists), that's fine — keep going.
      await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          name: DEMO_NAME,
        }),
      }).catch(() => {})

      // 2. Sign in (works whether signup just succeeded or user already existed).
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      })
      if (!res.ok) {
        setErr('Demo sign-in failed. Check server logs.')
        return
      }
      await refreshMe()
    } finally {
      setSubmitting(false)
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    refreshMe()
  }

  async function createConv() {
    if (!newTitle.trim()) return
    const created = (await theoFetch<typeof CreateConversation>(
      '/api/conversations',
      { body: { title: newTitle, agentKind: newKind } },
    )) as Conversation
    setConvs((prev) => [created, ...prev])
    setNewTitle('')
  }

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-display font-semibold tracking-tight">
              Agent SaaS
            </h1>
            <p className="text-sm text-muted-foreground">
              Personal agent platform built with TheoKit + TheoUI.
            </p>
          </div>

          {/* One-click demo path — primary entry for the example. */}
          <div className="space-y-2">
            <Button
              onClick={signInAsDemo}
              disabled={submitting}
              size="lg"
              className="w-full"
            >
              {submitting ? 'Signing in…' : 'Sign in as Demo'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              No setup needed — auto-creates a demo user on first run.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or use your own
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="at least 8 chars for signup"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Demo credentials pre-filled. Hit{' '}
              <span className="font-medium">Sign in</span> if the user
              already exists, or <span className="font-medium">Sign up</span>{' '}
              to create it.
            </p>
          </div>

          {err && (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={login}
              disabled={submitting}
              variant="outline"
              className="flex-1"
            >
              Sign in
            </Button>
            <Button
              onClick={signup}
              disabled={submitting}
              variant="outline"
              className="flex-1"
            >
              Sign up
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2 border-t">
            Built with <code className="font-mono">TheoKit</code> +{' '}
            <code className="font-mono">@usetheo/ui</code>
          </p>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between pb-4 border-b">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">
            Hello, {me.name}
          </h1>
          <p className="text-sm text-muted-foreground">{me.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <Button variant="ghost" asChild>
            <Link to="/settings">Settings</Link>
          </Button>
          <Button variant="outline" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold">New conversation</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What are we working on?"
            className="flex-1 min-w-[200px]"
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as AgentKind)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="researcher">Researcher</option>
            <option value="writer">Writer</option>
            <option value="coder">Coder</option>
          </select>
          <Button onClick={createConv} disabled={!newTitle.trim()}>
            Create
          </Button>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Your conversations{' '}
          <span className="text-muted-foreground">({convs.length})</span>
        </h2>
        {convs.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            description="Create one above to start chatting with a personal agent."
          />
        ) : (
          <div className="space-y-2">
            {convs.map((c) => (
              <Card
                key={c.id}
                className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
              >
                <div className="space-y-0.5">
                  <Link
                    to={`/conversations/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <code className="font-mono">{c.agentKind}</code> ·{' '}
                    {c.messageCount} {c.messageCount === 1 ? 'msg' : 'msgs'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.updatedAt).toLocaleString()}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
