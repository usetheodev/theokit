# Fixture — CORS enabled

Demonstrates the CORS middleware wired via `config.security.cors`. The fixture allows `http://localhost:5174` (typical second-origin dev server) to call any `/api/*` route, including state-mutating POSTs.

## Wire summary

```ts
security: {
  cors: {
    origins: ['http://localhost:5174'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Theo-Action'],
    exposedHeaders: ['X-Trace-Id'],
    credentials: true,
    maxAge: 600,
  },
}
```

Browser sends `OPTIONS /api/hello` (preflight). The framework's CORS middleware (registered FIRST in the pipeline per D10) responds 204 with the `Access-Control-Allow-*` headers BEFORE rate limit, CSRF, or any route matching runs.

For non-preflight requests, the matched origin is echoed in `Access-Control-Allow-Origin` (never `'*'` when `credentials: true` — required by spec). `Vary: Origin` is set so caches don't poison.
