# 0005. Webhook verification — inline function, not class hierarchy

* Status: accepted
* Date: 2026-05-24
* Accepted: 2026-05-24 (pre-condition for R0.5.10)
* Deciders: [TheoKit team]
* Tags: [webhook, api-design, abstraction-budget, ergonomics]

## Context and Problem Statement

`defineWebhook({ verify, handler })` (R0.5.10) needs a `verify` slot.
The verify step does ONE thing per provider: take the incoming `Request`,
read raw body + signature header, compute HMAC, compare constant-time,
return `{ ok: true }` or `{ ok: false; reason: string }`.

Webhook providers differ in:

- Signature header name (`stripe-signature`, `X-Hub-Signature-256`,
  `X-Slack-Signature`, `X-Twilio-Signature`)
- Basestring composition (Stripe: `timestamp.body`; Slack: `v0:ts:body`;
  GitHub: `body` only)
- Algorithm (HMAC-SHA256 for most; HMAC-SHA1 for Twilio legacy)
- Replay tolerance window (5min standard for Stripe + Slack; none for
  GitHub)
- Secret rotation support (Stripe supports multiple keys; Slack
  doesn't)

The deep-dive reference (`.claude/knowledge-base/reference/webhook-signing.md`,
§4, §5, §9.3) catalogs the prior art. Three API postures exist in the
ecosystem:

| Pattern | Example | Cost |
|---|---|---|
| **Inline function** | `verify: (req) => stripe.webhooks.verify(req, secret)` | Zero abstraction, 1-line per call site |
| **Helper factory** | `verify: stripe(secret)` | One small function; helper returns verifier closure |
| **Class hierarchy** | `verify: new StripeVerifier({ secret, tolerance })` | Inheritance, polymorphism, factories — overkill for stateless ops |
| **Middleware chain** | `app.use(stripeWebhook({ secret }))` | Express/Connect style; couples to a middleware engine |
| **Decorator** | `@Webhook({ provider: 'stripe' })` | NestJS style; requires decorator support, hides plumbing |

## Considered Options

* **Option 1 — Helper factory returning a verifier function (recommended).**
  `verify: stripe(secret)` — `stripe` is a regular function that returns
  the verifier closure. Zero class hierarchy. Maximum tree-shaking. User
  can also write `verify: async (req) => { ... }` inline if no helper
  fits.
* **Option 2 — Class hierarchy with base verifier.** `class StripeVerifier
  extends WebhookVerifier`. Java-style. Each verifier becomes a class
  with `.verify(req)` method. Inheritance overhead for stateless logic.
* **Option 3 — Plugin object.** `verify: { provider: 'stripe', secret: '...' }`.
  Framework looks up the verifier by `provider` field. Indirection;
  loses TypeScript inference on options shape.
* **Option 4 — Express-style middleware.** `app.useWebhook('stripe', { secret })`.
  Couples to middleware engine; doesn't compose with `defineRoute` /
  `defineAction` shape.

## Decision Outcome

Chosen option: **Option 1 — helper factory returning verifier
function.**

### Final shape

```typescript
// packages/theo/src/server/webhook/define-webhook.ts
export interface VerifyResult {
  ok: true
} | {
  ok: false
  reason: string
}

export interface DefineWebhookOptions {
  verify: (req: Request) => Promise<VerifyResult> | VerifyResult
  handler: (ctx: WebhookContext) => unknown
}

export function defineWebhook(opts: DefineWebhookOptions): WebhookDefinition
```

```typescript
// packages/theo/src/server/webhook/providers/stripe.ts
export interface StripeWebhookOptions {
  secret: string | string[]  // array for key rotation
  toleranceSeconds?: number   // default 300 (5min)
}

export function stripe(opts: StripeWebhookOptions): (req: Request) => Promise<VerifyResult>
```

```typescript
// packages/theo/src/server/webhook/providers/github.ts
export interface GitHubWebhookOptions {
  secret: string | string[]
}

export function github(opts: GitHubWebhookOptions): (req: Request) => Promise<VerifyResult>
```

```typescript
// packages/theo/src/server/webhook/providers/slack.ts
export interface SlackWebhookOptions {
  signingSecret: string
  toleranceSeconds?: number  // default 300
}

export function slack(opts: SlackWebhookOptions): (req: Request) => Promise<VerifyResult>
```

### Call site comparison

**Option 1 (CHOSEN):**

```typescript
// server/webhooks/stripe.ts
import { defineWebhook } from 'theokit/server'
import { stripe } from 'theokit/server/webhook/providers'

export default defineWebhook({
  verify: stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }),
  async handler({ rawBody, request }) {
    const event = JSON.parse(rawBody)
    // ... handle Stripe event
  },
})
```

**Option 2 (rejected — class hierarchy):**

```typescript
import { defineWebhook, StripeVerifier } from 'theokit/server'

export default defineWebhook({
  verify: new StripeVerifier({ secret: process.env.STRIPE_WEBHOOK_SECRET! }),
  // ...
})
```

Option 2 adds `new`, capital-letter ceremony, and requires the user to
understand the verifier hierarchy. Option 1 reads as "call stripe with
your secret to get a verifier". No new vocabulary.

### Inline custom verifier (escape hatch)

```typescript
// User builds their own — works the same way
export default defineWebhook({
  verify: async (req) => {
    const sig = req.headers.get('x-custom-sig')
    if (!sig || sig !== expectedSignature(req)) {
      return { ok: false, reason: 'bad signature' }
    }
    return { ok: true }
  },
  async handler({ rawBody }) { /* ... */ },
})
```

A user with a custom provider OR a SaaS not covered by first-party
helpers writes a verifier function directly. No subclassing
`WebhookVerifier`. No registering with a `providers` map. No magic.

### Why helper factory beats inline-only

If the framework offered ONLY inline (`verify: (req) => ...`), users
would copy-paste the Stripe HMAC algorithm into every webhook route.
That's a security footgun — they'd skip `crypto.timingSafeEqual`, get
the basestring concat order wrong, miss the replay window. Helper
factories make the security-critical primitive a single call.

### Why ship only Stripe + GitHub + Slack as first-party

The 0.5.0 scope caps at three first-party helpers. Reasoning:

- **Stripe** — most common webhook by deployment count; canonical
  reference for replay-tolerance + multi-key rotation
- **GitHub** — most common dev tooling integration; representative of
  "no timestamp, single-key" simple pattern
- **Slack** — most common workspace/chat integration; representative
  of "v0:ts:body basestring" pattern

Other providers (Twilio, Resend, PayPal, Shopify, Discord, Vercel,
Linear, ...) ship as separate `@theokit/webhook-*` packages OR remain
the user's custom `verify: async (req) => ...`. Locking the core to
three means:

- Maintenance burden bounded
- Tree-shaking effective (user importing one provider doesn't pull the
  other two)
- Clear extension path for community packages

### Why NOT make `verify` optional with sensible defaults

Tempting to do `verify: { provider: 'stripe', secret: '...' }` with no
function indirection. But this:

- Loses TypeScript inference on per-provider options (Stripe's
  `toleranceSeconds` vs Slack's `signingSecret` field names differ)
- Couples helper invocation to runtime string lookup ("which provider?")
- Makes adding a custom provider feel like an extension/registration
  rite, not a function definition

Helper factory keeps the function-first ergonomic with no surprises.

### What this rules out

| Forbidden API | Reason | Reject with link to this ADR |
|---|---|---|
| `class CustomVerifier extends WebhookVerifier` | Class hierarchy | `ADR-0005` |
| `@WebhookProvider('stripe')` decorator | Decorator dependency, hidden plumbing | `ADR-0005` |
| `webhookProviders.register('stripe', ...)` | Mutable global registry | `ADR-0005` |
| `verify: { type: 'stripe', secret: '...' }` | Object-as-discriminated-union; loses TS inference | `ADR-0005` |
| `app.useWebhook(...)` Express-style | Couples to middleware chain | `ADR-0005` |

## Consequences

* **Good:** API matches `defineRoute` / `defineAction` mental model
  (TheoKit's "define" pattern). No new abstraction vocabulary. Tree-shaking
  works perfectly — `import { stripe } from 'theokit/server/webhook/providers'`
  pulls only the Stripe verifier closure.
* **Good:** Custom providers cost zero framework code — user writes a
  `verify` function, done. Community can publish `@theokit/webhook-twilio`
  as a tiny package matching the same `(req) => Promise<VerifyResult>`
  signature.
* **Good:** TypeScript inference works on per-provider options because
  each helper is its own typed function. No discriminated-union juggling.
* **Bad:** Three first-party helpers means a user wanting Twilio has
  to write the verifier themselves OR install a community package OR
  wait for `@theokit/webhook-twilio`. We document the helper template
  in `docs/concepts/webhooks.md` so authoring is trivial.
* **Neutral:** Helper factories are stateless — the closure captures
  `secret` but does NO connection pooling or session state. If a future
  provider requires stateful setup (e.g., refreshing a public key from
  JWKS), we revisit with a more elaborate helper interface (not class
  hierarchy — still function-based, just async-init).

## Re-evaluation triggers

Reopen this ADR if:

1. **A first-party provider requires stateful setup (JWKS refresh,
   OAuth-protected webhook delivery, etc.)** that doesn't fit a pure
   closure. Add an async-init helper variant alongside, keep existing
   pattern.
2. **The number of "should be first-party" requests exceeds 6** AND
   each represents ≥3% of webhook deployments. Reopen with new option:
   ship more first-party helpers OR move to a `@theokit/webhooks`
   official-extras package.
3. **An ecosystem-wide standard (e.g., Standard Webhooks spec adoption
   reaches 50% of major providers)** that abstracts signing across
   providers. At that point, ship `standardWebhooks(opts)` as a
   first-party helper covering all conforming providers in one entry.

## Related artifacts

- Reference doc: `.claude/knowledge-base/reference/webhook-signing.md`
  (§5, §9.3 — verifier helper API; §3 per-provider algorithms)
- Roadmap items: R0.5.10 (`defineWebhook` with provider plugins)
- Sibling ADRs: ADR-0002 (`JobBackend` interface — same pattern: small
  composable surface, not class hierarchy), ADR-0006 (rejection of
  `defineWorker` — also avoids abstraction inflation)
- Prior art: Stripe Node SDK (`stripe.webhooks.constructEvent`),
  Slack Bolt JS (`verify-request.ts`), GitHub webhook docs.
