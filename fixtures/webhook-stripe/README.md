# fixtures/webhook-stripe

Minimal TheoKit fixture exercising `defineWebhook` + `stripe(...)` helper.

## Layout

```
server/
  webhooks/
    stripe.ts  — verifies stripe-signature header + handler
```

Set `STRIPE_WEBHOOK_SECRET` env. Invalid signature → 401. Valid → handler runs.
