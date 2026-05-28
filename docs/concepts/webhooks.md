# Webhooks

First-class HMAC signature verification + handler dispatch for TheoKit agent apps. One file per webhook in `server/webhooks/`.

## API surface

```ts
// server/webhooks/stripe.ts
import { defineWebhook } from 'theokit/server'
import { stripe } from 'theokit/server/webhook/providers'

export default defineWebhook({
  verify: stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }),
  async handler({ rawBody, traceId }) {
    const event = JSON.parse(rawBody) as { id: string; type: string }
    // ... process event
    return { received: true }
  },
})
```

## First-party provider helpers (ADR-0005)

Three providers ship in core:

| Helper | Algorithm | Header | Replay window |
|---|---|---|---|
| `stripe({ secret, toleranceSeconds })` | HMAC-SHA256 of `${t}.${rawBody}` | `stripe-signature: t=..., v1=...` | 300s (configurable) |
| `github({ secret })` | HMAC-SHA256 of `rawBody` | `X-Hub-Signature-256: sha256=...` | none (no timestamp) |
| `slack({ signingSecret, toleranceSeconds })` | HMAC-SHA256 of `v0:${ts}:${rawBody}` | `X-Slack-Signature: v0=...` + `X-Slack-Request-Timestamp` | 300s |

All three support `secret: string | string[]` (multi-key rotation) for Stripe and GitHub. Slack uses a single signing secret per app.

## Custom verify template

If you receive webhooks from a provider not in the first-party set:

```ts
import { defineWebhook, timingSafeEqual } from 'theokit/server'
import { createHmac } from 'node:crypto'

export default defineWebhook({
  async verify(req) {
    const sig = req.headers.get('x-custom-sig')
    if (!sig) return { ok: false, reason: 'missing signature header' }

    const body = await req.text()
    const expected = createHmac('sha256', process.env.MY_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex')

    const sigBytes = Buffer.from(sig, 'hex')
    const expBytes = Buffer.from(expected, 'hex')
    if (sigBytes.length !== expBytes.length) return { ok: false, reason: 'length mismatch' }
    if (!timingSafeEqual(new Uint8Array(sigBytes), new Uint8Array(expBytes))) {
      return { ok: false, reason: 'signature mismatch' }
    }
    return { ok: true }
  },
  async handler({ rawBody }) {
    // ...
  },
})
```

Use `timingSafeEqual` (re-exported from `theokit/server`) — NEVER `===` or `Buffer.compare` for signature bytes.

## Body size limits

> **EC-101 — `maxBodyBytes` default is 1MB.**
>
> Default `maxBodyBytes: 1_000_000` (1MB) covers Stripe (256KB max), Slack (4MB but compressed payloads are smaller).
>
> GitHub webhooks can be up to **25MB**. To accept them, opt in:
>
> ```ts
> defineWebhook({
>   verify: github({ secret: ... }),
>   maxBodyBytes: 25_000_000,
>   handler: async ({ rawBody }) => { ... },
> })
> ```
>
> Requests over the limit return `413 BODY_TOO_LARGE` BEFORE `verify` is called (saves CPU + protects against OOM).

## Verify failures

> **EC-103 — verify exceptions are treated as `{ok: false, reason: 'verify threw: ...'}`.**
>
> If your custom `verify` function throws (sync or async), the framework catches it and returns 401 with the error message. The handler is NEVER invoked when verify fails.
>
> This guarantees "fail closed" — a buggy verifier can never accidentally let a request through.

## Proxy / compression warning

> **EC-113 — HMAC is computed against the wire bytes.**
>
> If you have a proxy / CDN that decompresses `Content-Encoding: gzip` BEFORE TheoKit receives the request, signature verification will FAIL even with the correct secret.
>
> The three first-party providers (Stripe, GitHub, Slack) do NOT send gzipped webhooks. If you have a custom provider that does, configure your proxy to forward bodies unchanged.

## Request flow

```
1. Request arrives → readRawBody (with maxBodyBytes guard)
2. EC-101: body > limit → 413 (verify NOT called)
3. EC-103: try { verify(req) } catch (err) { result = { ok: false, reason: 'verify threw: ...' } }
4. !result.ok → 401 with reason header + JSON body (handler NOT called)
5. ok → handler({ request, rawBody, traceId, signal })
6. Handler return:
     - Response → returned as-is
     - undefined/null → 204 No Content
     - other → wrapped in JSON 200
```

## CSRF interaction (post-0.3.0)

Webhook routes are exempt from CSRF by design — they receive POSTs from third parties without TheoKit's `X-Theo-Action` header. The dispatch pipeline marks webhook requests as CSRF-exempt automatically.

## When this fails

| Symptom | Cause | Fix |
|---|---|---|
| Stripe webhooks return 401 in production but work in dev | `STRIPE_WEBHOOK_SECRET` mismatch between dev mode and prod | Confirm the secret is set per env |
| GitHub webhook returns 413 | Body > 1MB (default) | Set `maxBodyBytes: 25_000_000` |
| Signature always fails for one provider | Proxy decompressing body | Forward `Content-Encoding` unchanged |
| Verify works locally, fails behind load balancer | LB modifies body (e.g., gzip, line endings) | Configure LB to passthrough |

## See also

- [ADR-0005](../adr/0005-webhook-verify-inline-function.md) — function-factory pattern
- [`.claude/knowledge-base/reference/webhook-signing.md`](../../.claude/knowledge-base/reference/webhook-signing.md) — full deep-dive (11.4k words)
- [Jobs](./jobs.md) — enqueue work from webhook handlers
