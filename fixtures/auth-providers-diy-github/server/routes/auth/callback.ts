import { defineRoute, verifyOAuthState } from 'theokit/server'
import { z } from 'zod'

/**
 * GET /api/auth/callback?code=...&state=...
 *
 * Validate the state token, exchange the code for an access token (PKCE),
 * fetch the user profile, then ROTATE the session (OWASP A07) and write
 * the real session.
 */
export const GET = defineRoute({
  query: z.object({ code: z.string(), state: z.string() }),
  async handler({ query, req, res, ctx }) {
    const pending = ctx.session?.pending
    if (!pending) {
      res.writeHead(400)
      res.end('no pending oauth state')
      return
    }
    if (!verifyOAuthState(query.state, pending.state)) {
      res.writeHead(403)
      res.end('state mismatch')
      return
    }

    // ── Exchange code → access_token ───────────────────────────────
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_ID,
        client_secret: process.env.GITHUB_SECRET,
        code: query.code,
        code_verifier: pending.codeVerifier,
      }),
    })
    if (!tokenRes.ok) {
      res.writeHead(502)
      res.end('token exchange failed')
      return
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) {
      res.writeHead(502)
      res.end('user fetch failed')
      return
    }
    const user = (await userRes.json()) as { id: number; login: string }

    // ── OWASP A07 — rotate session id BEFORE writing the real session ──
    await ctx.sessions.rotateSession(req, res)
    await ctx.sessions.createSession(res, {
      userId: String(user.id),
      login: user.login,
    })

    res.writeHead(302, { Location: '/dashboard' })
    res.end()
  },
})
