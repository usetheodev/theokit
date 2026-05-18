# loading-states

Demonstrates per-segment `loading.tsx` — the Suspense fallback wired automatically by the router.

## Layout

```
app/
├── page.tsx          → /
├── loading.tsx       → top-level fallback
└── slow/
    ├── page.tsx      → /slow — wraps SlowFeed in <Suspense>
    ├── loading.tsx   → segment-level fallback (wins over parent)
    └── SlowFeed.tsx  → deferred component (200ms)
```

## Rules

- `loading.tsx` exports a default React component.
- The router wraps the segment in `<Suspense fallback={<Loading />}>`.
- Closest `loading.tsx` wins. Segments without one inherit the nearest parent.

## Run

```bash
npx vitest run tests/unit/fixture-loading-states.test.ts
```
