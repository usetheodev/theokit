# sessions-auth

Demonstrates `createSessionManager`, `requireAuth`, and the EC-2 production secret guard (`assertProductionSecret`).

## Routes

- `POST /api/login` — Zod-validated body `{ username, password }`. Creates a session cookie (encrypted via AES-256-GCM).
- `GET /api/me` — Protected by `requireAuth`. Returns 401 if no valid session.
- `POST /api/logout` — Destroys the session cookie.

## EC-2: Production secret guard

The fixture uses a placeholder SECRET:

```
SECRET=CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL
```

When `NODE_ENV !== 'production'`, the framework emits a `console.warn` about the placeholder and continues. When `NODE_ENV === 'production'`, **the server refuses to boot**, failing fast with a clear error before any request is served.

Replace the placeholder with a real 32+ random char secret before deploying:

```bash
SECRET=$(openssl rand -hex 32)
```

## Run the integration test

```bash
npx vitest run tests/integration/fixture-sessions-auth.test.ts
```

The test exercises:
1. `GET /api/me` without cookie → 401
2. `POST /api/login` → sets cookie
3. `GET /api/me` with cookie → 200 + body has username
4. Tampered cookie → 401 (not 500 — crypto errors don't leak)
