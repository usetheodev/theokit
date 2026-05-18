# typed-client

Demonstrates **end-to-end type inference** from Zod-validated route schemas to `theoFetch` calls.

## The pattern

```ts
// app/page.tsx
import { theoFetch } from 'theokit/client'
import type { GET, POST } from '../server/routes/users.js'

// query.search is `string | undefined` — inferred from the Zod schema.
const users = await theoFetch<typeof GET>('/api/users', { query: { search: 'theo' } })

// body is `{ name: string; email: string }` — inferred + validated.
const user = await theoFetch<typeof POST>('/api/users', { body: { name: 'X', email: 'x@example.com' } })
```

**No `as` casts. No manual interfaces duplicated on the client side.**

## Why the `import type`

The compiler erases `import type {...}` at compile time — there's no runtime coupling between the client bundle and the server route module. Only the *type shape* is carried over. The TheoKit boundary check hook (`.claude/hooks/boundary-check.sh`) allows type-only imports for this reason.

## Run the test

```bash
npx vitest run tests/unit/fixture-typed-client.test-d.ts
```
