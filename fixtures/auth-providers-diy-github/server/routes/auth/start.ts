import { defineRoute, generatePkceChallenge, generateOAuthState } from 'theokit/server'
import { z } from 'zod'

/**
 * GET /api/auth/start
 *
 * Initiate the GitHub OAuth flow:
 *   1. Generate PKCE verifier + challenge (RFC 7636)
 *   2. Generate anti-CSRF state token (RFC 6749 §10.12)
 *   3. Stash both in the session so the callback can verify them
 *   4. Redirect the browser to GitHub's /authorize
 */
export const GET = defineRoute({
  query: z.object({}),
  async handler({ res, ctx }) {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = await generatePkceChallenge()
    const state = generateOAuthState()

    await ctx.sessions.createSession(res, {
      pending: { codeVerifier, state },
    })

    const clientId = process.env.GITHUB_ID ?? 'demo-client-id'
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173'
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', `${appUrl}/api/auth/callback`)
    url.searchParams.set('scope', 'read:user user:email')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', codeChallengeMethod)

    res.writeHead(302, { Location: url.toString() })
    res.end()
  },
})
