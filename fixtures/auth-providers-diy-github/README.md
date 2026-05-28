# Fixture — DIY GitHub OAuth (via TheoKit primitives)

Demonstrates how to wire GitHub OAuth from scratch using TheoKit's protocol primitives — no external auth library. Copy-paste into your real app for the smallest possible auth surface.

Primitives used:

- `generatePkceChallenge` — RFC 7636 PKCE
- `generateOAuthState` / `verifyOAuthState` — RFC 6749 §10.12 anti-CSRF
- `createSessionManager` — encrypted cookies (AES-256-GCM)
- `rotateSession` — OWASP A07:2021 session-fixation mitigation
- `requireAuth` — type-narrowing auth guard

## Endpoints

| Route | Purpose |
|---|---|
| `GET /api/auth/start` | Generate PKCE + state, store in session, redirect to GitHub |
| `GET /api/auth/callback` | Verify state, exchange code for token, fetch user, rotate session |
| `GET /api/me` | Protected — returns the current user via `requireAuth` |

## How to read this fixture

Start at `server/routes/auth/start.ts`, then `callback.ts`. Notice how `rotateSession` is called BEFORE writing the final session — this is the OWASP A07 fix.
