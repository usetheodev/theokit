# dynamic-routes

Demonstrates both routing patterns in one fixture:

- `app/blog/[id]/page.tsx` — single dynamic segment
- `app/docs/[...slug]/page.tsx` — catch-all
- `server/routes/posts/[id].ts` — server route with typed params via Zod

## Reading params

```tsx
import { useParams } from 'react-router'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <h1>Post: {params.id}</h1>
}
```

Server-side, params are Zod-validated like body/query:

```ts
export const GET = defineRoute({
  params: z.object({ id: z.string().min(1) }),
  handler: ({ params }) => { /* params.id is `string`, validated */ },
})
```

## Catch-all behavior

`[...slug]` matches one or more path segments. In react-router 7 the catch-all comes in as a `/`-joined string; `.split('/').filter(Boolean)` gives you the array view.

## Run

```bash
npx vitest run tests/unit/fixture-dynamic-routes.test.ts
```
