# fixtures/webhook-github

Minimal TheoKit fixture exercising `defineWebhook` + `github(...)` helper.

Set `GITHUB_WEBHOOK_SECRET` env. Verifies `X-Hub-Signature-256` against HMAC-SHA256(secret, rawBody).
