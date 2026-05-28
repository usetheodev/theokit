# Fixture — CSP report endpoint end-to-end (T5.1)

Demonstrates the built-in `/__theo/csp-report` endpoint receiving violation reports and forwarding them through the audit logger.

## How to exercise

1. `pnpm dev` in this fixture
2. POST a mock report:

```bash
curl -i -X POST http://localhost:3000/__theo/csp-report \
  -H "Content-Type: application/csp-report" \
  --data '{"csp-report":{"blocked-uri":"https://evil.example/x.js","document-uri":"http://localhost:3000/","violated-directive":"script-src '\''self'\''"}}'
```

3. Observe `{"level":"audit","action":"csp.violation",...}` in stdout

## What's wired

- Default CSP already carries `report-uri /__theo/csp-report` (security-hardening release)
- Endpoint accepts both legacy (`application/csp-report`) and modern (`application/reports+json`)
- EC-2 null-guarded: empty `{}`, `{"csp-report": null}`, and reports+json entries without `body` all 204 without crashing
- `JsonStdoutSink` is the configured audit logger; replace with any `AuditLogger` adapter

## Pattern reference

```ts
import { JsonStdoutSink } from 'theokit/server'
defineConfig({
  audit: { logger: new JsonStdoutSink() },
})
```
