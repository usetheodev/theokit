# @theokit/react-query

React Query adapter primitives for TheoKit. Stable `queryKey` derivation + `useQuery` config builder. Apache-2.0.

## Install

```bash
pnpm add @theokit/react-query @tanstack/react-query
```

## Use

```typescript
import { useQuery } from '@tanstack/react-query'
import { buildUseTheoQueryConfig } from '@theokit/react-query'
import { theoFetch } from 'theokit/client'
import type { GET } from '../../server/routes/users'

function useUsers(search: string) {
  return useQuery(
    buildUseTheoQueryConfig(
      '/api/users',
      { query: { search } },
      (path, opts) => theoFetch<typeof GET>(path, opts as never),
    ),
  )
}
```

The `queryKey` derived from `(path, options)` is **stable** — re-renders with the same logical query/body content do **not** trigger refetches even when the options object is created inline (EC-10 from the TheoKit cross-domain-uplift plan).

```typescript
// Same key — no refetch:
stableQueryKey('/api/users', { query: { a: 1, b: 2 } })
stableQueryKey('/api/users', { query: { b: 2, a: 1 } })
```
