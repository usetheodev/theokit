# Fixture — Per-route + per-user rate limit (T2.2)

Demonstrates the per-route + per-user rate-limit shape:

- `/api/login` — strict (5 attempts per minute, brute-force defense)
- everything else — loose default (100/min)
- bucketed by `session` (hashed cookie) when present; falls back to IP

## How to test the strict bucket

```bash
# Hit /api/login 6 times rapidly — the 6th should return 429
for i in 1 2 3 4 5 6; do curl -i -X POST http://localhost:3000/api/login; done
```

## How to test other endpoints stay loose

```bash
# /api/health can be hit 100x within the same window without limit
for i in {1..50}; do curl -s http://localhost:3000/api/health > /dev/null; done
```

## Pattern reference

```ts
rateLimit: {
  default: { windowMs: 60_000, max: 100 },
  routes: { '/api/login': { windowMs: 60_000, max: 5 } },
  keyBy: 'session',
}
```
