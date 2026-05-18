# react-query-integration

Demonstrates `theokit/react-query` driving `@tanstack/react-query`.

## The pattern

```ts
import { useQuery } from '@tanstack/react-query'
import { buildUseTheoQueryConfig } from 'theokit/react-query'
import { theoFetch } from 'theokit/client'
import type { GET } from '../server/routes/users.js'

function useUsers(search: string) {
  return useQuery(
    buildUseTheoQueryConfig<User[]>(
      '/api/users',
      { query: { search } },
      (path, opts) => theoFetch<typeof GET>(path, opts as never),
    ),
  )
}
```

## EC-10 — stable queryKey from inline objects

Typing in a search box creates a **new** `{ query: { search } }` object on every keystroke. Naively passing that as `queryKey` would cause infinite refetches because React Query keys are compared by reference.

`buildUseTheoQueryConfig` (and `stableQueryKey` under the hood) derive the key from the **logical content** of `path + query + body + params`. Order and identity are normalized via deterministic stringification. Same content → same key, no matter how many times the user re-renders.

## QueryClientProvider in `app/layout.tsx`

`useState(() => new QueryClient())` is intentional. A top-level `new QueryClient()` would survive HMR but a `useState` initializer survives both HMR AND React StrictMode's double-mount without leaking clients.

## Run

```bash
npx vitest run tests/unit/fixture-react-query.test.ts
```
