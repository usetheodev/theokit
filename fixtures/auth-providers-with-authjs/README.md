# Fixture — Auth.js + TheoKit session bridge

Demonstrates how to wire **Auth.js** (NextAuth's framework-agnostic engine) into a TheoKit app and mirror the resulting user into TheoKit's encrypted session for fast `requireAuth` checks.

## Why bridge

Auth.js owns the OAuth provider matrix (Google, GitHub, Facebook, Microsoft, …) — it's a moving target with constant scope/endpoint deltas. TheoKit owns the session cookie + per-route auth gate. The two compose cleanly:

```
                   ┌─────────────┐
   user click →    │  Auth.js    │  ──→ provider OAuth dance
                   │  catch-all  │
                   └──────┬──────┘
                          │  on success
                          ▼
            sessionManager.createSession(res, { userId, email, … })
                          │
                          ▼
                  ┌────────────────────┐
   any request →  │ requireAuth(...)    │ ← TheoKit-managed
                  └────────────────────┘
```

## What to copy from this fixture

1. `server/auth.ts` — Auth.js config + provider list (placeholder; bring your real providers).
2. `server/routes/auth/[...all].ts` — catch-all route that delegates to Auth.js's `handler`.
3. `server/context.ts` — TheoKit `createSessionManager` instance, reused on every request.
4. `server/routes/auth/sync.ts` — POST endpoint Auth.js's `signIn` event calls to mirror the user into TheoKit.

## Wiring summary

- Auth.js handles the OAuth round-trip and issues its own JWT/session cookie.
- On `signIn` event, we explicitly call `sessionManager.createSession(res, ...)` so all downstream TheoKit code (defineRoute handlers, requireAuth guards, server actions) sees one consistent session shape.
- For full production use, prefer Auth.js's database session strategy and skip the bridge — but this pattern is what you'd write if your app is mostly TheoKit-native with auth-as-a-bolt-on.

> **Note:** This fixture does NOT pin a specific `@auth/core` version. To run it for real, `pnpm add @auth/core` in your real app and tweak the imports.
