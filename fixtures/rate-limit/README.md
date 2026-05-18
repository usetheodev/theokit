# rate-limit

Demonstrates the framework's built-in rate limiter, configured at `theo.config.ts`:

```ts
export default defineConfig({
  rateLimit: {
    windowMs: 10_000, // 10s window
    max: 5,           // 5 requests per window per client
  },
})
```

## Headers

Every response includes:
- `X-RateLimit-Limit` — the `max` value
- `X-RateLimit-Remaining` — requests left in the current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets

When the limit is exceeded:
- Status `429 Too Many Requests`
- Header `Retry-After` indicates seconds until the window resets

## Client identification

By default the limiter keys per remote IP. Behind a reverse proxy you'll want to read `X-Forwarded-For` instead — see the rate-limit options in the framework docs.

## Run

```bash
npx vitest run tests/unit/fixture-rate-limit.test.ts
```
