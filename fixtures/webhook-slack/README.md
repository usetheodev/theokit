# fixtures/webhook-slack

Minimal TheoKit fixture exercising `defineWebhook` + `slack(...)` helper.

Set `SLACK_SIGNING_SECRET` env. Verifies `X-Slack-Signature` against
HMAC-SHA256 of `v0:{timestamp}:{rawBody}`.
