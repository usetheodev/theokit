# Reference: Webhook Signing and `defineWebhook`

**Date:** 2026-05-24
**Depth:** exhaustive (default)
**Frameworks analyzed:** Next.js (Stripe example, raw body handling), Fastify (`fastify-raw-body` ecosystem), Hono (Web Crypto + timing-safe utils), Rails ActionMailbox (Mandrill/Mailgun/Postmark/Sendgrid HMAC ingresses), SvelteKit (raw body posture), Nitro (no built-in webhook primitive — control case)
**Providers analyzed (authoritative web sources):** Stripe (canonical reference), GitHub, Slack, Twilio, Resend (Svix), Standard Webhooks specification, Cloudflare Workers / Hono lite middleware
**TheoKit package affected:** `packages/theo/src/server/webhook/` (new module), `packages/theo/src/server/define/index.ts` (re-export of `defineWebhook`), `packages/theo/src/server/index.ts` (public re-export), `packages/theo/src/server/scan/` (build manifest), `fixtures/webhook-*` (3 first-party fixtures), `examples/full-stack-agent/server/webhooks/` (canonical demo)
**Related references:** [`oauth-oidc-delegation.md`](oauth-oidc-delegation.md) (same delegation-vs-bundle posture; webhook delegation chose `keep core small + 3 first-party helpers` rather than ship one per provider), [`caching-and-revalidation.md`](caching-and-revalidation.md) (revalidate after webhook is the canonical wiring example — Section 9 below shows the integration), [`enforcement-cutover.md`](enforcement-cutover.md) (webhook routes are the canonical case of `csrf: false` exemption — already wired in `define-route.ts:16-22`)
**Locked design constraints (from CLAUDE.md R0.5.10 + ADR-0005, NOT to be re-litigated by this doc):**
1. HMAC signature verification is a first-class TheoKit primitive
2. Failed verify ⇒ 401 returned, handler is NOT invoked
3. Provider helpers exposed as plain functions (`verify: stripe(secret)`), NOT a class hierarchy (ADR-0005)
4. Three first-party provider helpers ship in `theokit/server`: **Stripe, GitHub, Slack**. Others come as separate `@theokit/webhook-*` packages OR user-defined inline `verify` functions
5. Each first-party provider ships a fixture demonstrating signature roundtrip
6. Replay protection (timestamp tolerance windowing) is REQUIRED for all 3 first-party helpers

---

## 1. Problem statement

### What

TheoKit has zero webhook primitives today. `defineRoute` already understands the surface — it carries an explicit `csrf: false` opt-out documented as "for endpoints that legitimately receive third-party POSTs (Stripe webhooks, GitHub webhooks, OAuth callbacks)" (`packages/theo/src/server/define/define-route.ts:14-22`) — but every consumer who wants to receive a Stripe webhook today has to:

1. Mark the route `csrf: false`
2. Manually parse the `stripe-signature` header
3. Re-read the raw body **outside** of TheoKit's existing body parser (`body-parser-web.ts` consumes the `Request`, breaking signature verification — see Section 8, EC-7)
4. Compute HMAC-SHA256 with their secret
5. Compare with `crypto.timingSafeEqual` and the right length-equality pre-check
6. Validate the timestamp tolerance window for replay protection
7. Build error responses with the right status codes

That is ~40 LOC of crypto-adjacent plumbing per provider. The framework's wedge ("the app the agent lives in") collapses the moment a developer who wants to ship a Stripe-integrated agent has to write all of that themselves. Hermes-style agent apps that ingress from Telegram / Slack / Stripe gateways need this primitive to exist before they can ship at all.

### Current state (verified by grep on `develop` branch, 2026-05-24)

```bash
$ grep -rn "webhook\|signing.secret\|X-Hub-Signature\|stripe-signature" \
  packages/theo/src/ --include="*.ts" -l
packages/theo/src/server/define/define-route.ts   # only a comment in the csrf: false docstring
packages/theo/src/cache/revalidate.ts             # "safe to call ... from a webhook" comment
```

No primitive, no provider helpers, no fixtures. The entire surface is greenfield.

### Why now

Three independent forcing functions converged in the 0.5.0 ondo planning (CLAUDE.md, "Roadmap items — 0.5.0"):

- **R0.5.10 explicitly schedules `defineWebhook({ verify, handler })`** — locked in the 0.5.0 work matrix
- **R0.5.4–R0.5.6 ship jobs + queue primitives**, and the textbook job trigger is "Stripe webhook → enqueue invoice-processing job" — without `defineWebhook`, the queue primitive lacks the canonical ingress
- **R0.5.11 ships `trackAgentRun({ userId, model, tokens, costUsd })`** for per-user tier enforcement, and the dominant cost-reset trigger is "Stripe `customer.subscription.updated` → reset usage counter" — again gated on having a webhook primitive

The same 0.5.0 onda also lists `cache/revalidate` (already shipped 2026-05-22) — the canonical revalidate trigger is "Stripe `invoice.paid` webhook ⇒ `revalidate('user:123:billing')`". Without `defineWebhook`, the cache invariant "revalidate from a webhook is one line" stays theoretical.

The framework-scope-guardian review baked into the 0.5.0 macro entry already explicitly rejected `defineWorker` (stream consumers) and `enqueue().then(result)` (workflow API) — webhooks were greenlit in the same review precisely because they are **request-shaped**, not stream-shaped, and slot directly into the existing `defineRoute` runtime.

---

## 2. Inventário completo de arquivos (mandatório)

Lista exaustiva — todo arquivo capturado nas 3 passadas (filename + content + docs/specs), triado em `core` / `support` / `test` / `doc`. Sem cherry-picking.

### 2.1 Next.js — inventário (Stripe official example only — Next.js itself ships no webhook primitive)

| File | Category | LOC | Read in full? | Anchored in this doc |
|---|---|---|---|---|
| `referencias/next.js/examples/with-stripe-typescript/app/api/webhooks/route.ts` | core | 67 | yes | §3.1, §8 (EC-7: `await (await req.blob()).text()` pattern), §9 |
| `referencias/next.js/examples/with-stripe-typescript/lib/stripe.ts` | support | 13 | yes | §3.1 |
| `referencias/next.js/packages/next/src/compiled/raw-body/index.js` | support | (vendored) | no (vendored npm `raw-body` package, not a Next.js implementation) | §3.5, §6 (deps rationale — Next.js inherits this from Express ecosystem) |
| `referencias/next.js/packages/next/src/server/api-utils/node/parse-body.ts` | support | ~200 | partial | §3.5 (shows the legacy Pages-Router raw-body bridging; App Router uses `await req.text()` directly) |
| `referencias/next.js/examples/with-stripe-typescript/README.md` | doc | — | partial | §3.1 (positioning: "we use the App Router to receive the webhook via a POST route, and verify it using the Stripe SDK") |

### 2.2 Fastify — inventário

| File | Category | LOC | Read in full? | Anchored in this doc |
|---|---|---|---|---|
| `referencias/fastify/docs/Guides/Ecosystem.md` lines 578–579 | doc | 2 | yes | §3.3 (canonical pointer: `fastify-raw-body` — the entire Fastify ecosystem delegates raw-body to a single plugin) |
| `referencias/fastify/lib/content-type-parser.js` | support | ~400 | partial (grep'd for `rawBody`) | §3.3, §8 EC-7 (the parser **consumes** the body — raw access requires a pre-parsing hook) |
| `referencias/fastify/types/content-type-parser.d.ts` | support | ~30 | yes | §3.3 |
| `referencias/fastify/lib/hooks.js` | support | ~200 | partial (grep'd for `preParsing`) | §3.3 (the `preParsing` hook is where `fastify-raw-body` attaches) |
| `referencias/fastify/docs/Guides/Serverless.md` | doc | — | partial | discarded — not webhook-specific |

### 2.3 Hono — inventário (most useful for the Web-Crypto pattern)

| File | Category | LOC | Read in full? | Anchored in this doc |
|---|---|---|---|---|
| `referencias/hono/src/utils/buffer.ts` | core | 117 | yes | §3.4 (the `equal`, `constantTimeEqualString`, and `timingSafeEqual` helpers — the textbook pattern for Web-Crypto-first runtimes) |
| `referencias/hono/src/utils/crypto.ts` | core | 59 | yes | §3.4 (the `sha256`/`sha1`/`md5`/`createHash` helpers — pure Web Crypto, no `node:crypto` import) |
| `referencias/hono/src/middleware/jwt/jwt.ts` | support | ~180 | partial | §3.4 (precedent: `crypto.subtle.importKey` + verify against `importKey`'s `verify` usage) |
| `referencias/hono/src/middleware/bearer-auth/index.ts` | support | ~200 | partial | §3.4 (consumer of `timingSafeEqual`) |
| `referencias/hono/src/middleware/basic-auth/index.ts` | support | ~150 | partial | §3.4 (consumer of `timingSafeEqual` — same auth pattern, different transport) |
| `referencias/hono/src/utils/buffer.test.ts` | test | ~60 | partial | §9.5 (BDD test cases for `timingSafeEqual('a','a') === true`, `('','') === true` — empty-string edge case is real) |

### 2.4 Rails ActionMailbox — inventário (the most complete prior art for multi-provider HMAC ingresses in a framework)

| File | Category | LOC | Read in full? | Anchored in this doc |
|---|---|---|---|---|
| `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/mandrill/inbound_emails_controller.rb` | core | 86 | yes | §3.6 (the `Authenticator` inner class, `secure_compare` usage, `OpenSSL::HMAC.digest(SHA1, ...)`) — and the **lesson that each provider gets its own controller, not a base class with provider strategies** (ADR-0005 alignment) |
| `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/mailgun/inbound_emails_controller.rb` | core | 110 | yes | §3.6 (the **2-minute** replay tolerance — Mailgun's chosen window, smaller than the Stripe/Slack default of 5 — `Time.at(timestamp) >= 2.minutes.ago`) |
| `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/sendgrid/inbound_emails_controller.rb` | core | 69 | yes | §3.6 (provider with **no HMAC** — uses HTTP Basic Auth — instructive negative case; the TheoKit `verify` function must be able to express "authenticate via header X" too, not only HMAC) |
| `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/postmark/inbound_emails_controller.rb` | core | ~50 | yes | §3.6 (also Basic Auth; same lesson as Sendgrid) |
| `referencias/rails/actionmailbox/test/controllers/ingresses/mailgun/inbound_emails_controller_test.rb` | test | 128 | yes | §9.5 (full BDD test matrix: "receiving inbound email", "rejecting a delayed inbound email" (replay), "rejecting a forged inbound email" (signature mismatch), "raising when key is nil/blank") |
| `referencias/rails/actionmailbox/test/controllers/ingresses/mandrill/inbound_emails_controller_test.rb` | test | ~80 | partial | §9.5 (same matrix shape, different provider) |
| `referencias/rails/actionmailbox/lib/action_mailbox/relayer.rb` | support | ~80 | partial | §3.6 (outbound side — confirms ActionMailbox treats inbound and outbound as separate code paths; we follow suit: `defineWebhook` is inbound-only) |
| `referencias/rails/actionmailbox/config/routes.rb` | doc | ~30 | yes | §3.6 (the canonical route mounting under `/rails/action_mailbox/{provider}/inbound_emails` — informs whether webhooks should appear in TheoKit's `routes.json` manifest, see Open Questions §10) |

### 2.5 SvelteKit — inventário

| File | Category | LOC | Read in full? | Anchored in this doc |
|---|---|---|---|---|
| `referencias/sveltekit/packages/kit/test/apps/basics/src/routes/load/raw-body.json/+server.js` | test | 13 | yes | §3.2 (positioning: SvelteKit has **no** webhook primitive; raw body is `await request.text()` — same as TheoKit's intended posture) |
| `referencias/sveltekit/packages/kit/types/index.d.ts` | support | (large) | grep'd | §3.2 — no `defineWebhook`, no signature helper |

### 2.6 Nitro — inventário (control case: explicit non-coverage)

| File | Category | LOC | Read in full? | Anchored in this doc |
|---|---|---|---|---|
| `referencias/nitro/docs/1.docs/7.cache.md` line 333 | doc | 1 | yes | §3.7 — single mention: "invalidate from a webhook" (i.e., they describe the use case but ship no primitive). Same gap TheoKit closes. |

### 2.7 Discarded — files found in inventory but NOT load-bearing for the design

| File | Why discarded |
|---|---|
| `referencias/next.js/turbopack/crates/turbopack-tracing/tests/node-file-trace/integration/stripe.js` | Turbopack tracing test fixture — incidental keyword hit |
| `referencias/next.js/test/e2e/middleware-fetches-with-body/index.test.ts` | Generic middleware body test, unrelated to webhooks |
| `referencias/next.js/.github/actions/pr-auto-label/README.md` | GitHub Actions automation README — only the literal word "webhook" appears |
| `referencias/next.js/run-tests.js` | Test runner, not webhook-related |
| `referencias/next.js/.claude-plugin/plugins/cache-components/skills/cache-components/REFERENCE.md` | Cache-components docs, only mentions "webhook" in a passing example |
| `referencias/remix/packages/fetch-router/demos/cf-workers/worker-configuration.d.ts` | Cloudflare Worker type stub, no webhook code |
| `referencias/remix/demos/bookstore/app/utils/password-hash.ts` | Auth example, not webhook |
| `referencias/remix/demos/social-auth/app/utils/password-hash.ts` | Same |
| `referencias/hono/src/middleware/csrf/index.test.ts` | CSRF middleware, unrelated to webhook signature schemes |
| `referencias/hono/src/middleware/etag/index.test.ts` | ETag, only a `crypto.subtle.digest` callsite — already covered by §3.4 via `crypto.ts` |
| `referencias/sveltekit/packages/adapter-{node,netlify,vercel}/CHANGELOG.md` | Adapter changelogs, no webhook code |
| `referencias/sveltekit/packages/kit/CHANGELOG-pre-1.md` | Pre-1.0 changelog, no webhook design |
| `referencias/nitro/src/presets/{vercel,azure}/runtime/*` | Cron/adapter runtimes, only the word "webhook" in a comment |
| `referencias/astro/packages/astro/CHANGELOG.md` | No webhook primitive — single keyword hit in a Markdown changelog |
| `referencias/tanstack-router/.../worker-configuration.d.ts` (×5) | Cloudflare Worker type stubs |
| `referencias/vite/packages/vite/src/node/server/ws.ts` | Vite dev WebSocket server, unrelated |
| `referencias/rails/activestorage/app/assets/javascripts/activestorage.{esm.,}js` | ActiveStorage JS bundle — incidental "signature" keyword |
| `referencias/rails/guides/source/action_mailbox_basics.md` | Read for context, but the per-provider controllers (§2.4) are the implementation source of truth |
| `referencias/fastify/test/internals/content-type-parser.test.js` | Internal tests for content-type parser, not webhook-specific |
| `referencias/fastify/lib/four-oh-four.js`, `lib/handle-request.js`, `lib/route.js` | Generic Fastify internals — confirms no built-in webhook primitive exists |

---

## 3. Prior art deep dive — per framework AND per provider

### 3.1 Next.js (Stripe official example — `referencias/next.js/examples/with-stripe-typescript/app/api/webhooks/route.ts`)

```ts
export async function POST(req: Request) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await (await req.blob()).text(),                   // raw body — line 12
      req.headers.get("stripe-signature") as string,     // header   — line 13
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (err) {
    // 400 on verification failure — line 21-25
  }
  // permitted-events allowlist (lines 30-34), per-type switch (40-55), 200 ack (65)
}
```

Three takeaways for TheoKit's `defineWebhook` design:

1. **Next.js ships no webhook helper of its own** — it delegates entirely to the Stripe SDK. The route file is 67 LOC of which ~10 are verification glue and the rest is `switch (event.type)` business logic. TheoKit can do better by absorbing the glue into the framework while leaving the `switch` to the user.
2. **The body reading pattern is `await (await req.blob()).text()`** — explicitly `blob` → `text` to guarantee a byte-faithful copy. `await req.text()` works identically on standards-compliant runtimes but the `blob().text()` chain is the defensive form that survives even broken middleware that wrapped the `Request` (Section 8, EC-7).
3. **Errors are caught generically (`catch (err)`)** and returned as `400 Webhook Error: <message>` — informative for debug but **leaks the verification reason** ("Timestamp outside the tolerance zone" vs "No signatures found matching the expected signature for payload"). TheoKit's `verify` contract returns a discriminated `{ ok: true } | { ok: false; reason: string }` so the framework can log the reason server-side at `info` level but respond with a generic `401 Unauthorized` to the caller (Section 3 of the public-copy banned-terms list — never leak internals to an unauthenticated caller).

### 3.2 SvelteKit (control case — no webhook primitive)

`referencias/sveltekit/packages/kit/test/apps/basics/src/routes/load/raw-body.json/+server.js`:

```js
export async function POST({ request }) {
  const rawBody = await request.text();
  const body = JSON.parse(rawBody);
  return json({ body, rawBody });
}
```

SvelteKit's posture: do nothing. `request.text()` is the user's responsibility, and any signing logic is fully outside the framework. This is the same posture as Next.js App Router. **TheoKit deliberately diverges** — webhook signature verification is a horizontal cross-cutting concern (security baseline + scope guardian invariant: "secure defaults") and belongs in the framework, not in every consumer's hand-written route.

### 3.3 Fastify (the raw-body lesson)

Fastify's docs (`referencias/fastify/docs/Guides/Ecosystem.md:578-579`) point at exactly one package — `fastify-raw-body` — to solve a problem that is otherwise architecturally hostile to webhooks. The `content-type-parser.js` (lib/) **consumes the body during parsing**; once the parser has fired, `request.body` is a parsed JSON object and the raw bytes are gone. `fastify-raw-body` works by attaching a `preParsing` hook that buffers the stream into `request.rawBody` before the parser runs.

**TheoKit lesson:** This is the *exact* failure mode that hits production Stripe webhook integrations. Our existing `parseWebRequestBody` (`packages/theo/src/server/body-parser-web.ts:43-50`) uses a `WeakMap<Request, Promise<ParsedWebBody>>` cache so multiple parse calls are idempotent — but the cache holds the *parsed* result. The first thing a webhook route does is call `request.text()` (or `request.bytes()`) to get bytes for HMAC. If `parseWebRequestBody` already ran (e.g., from middleware), `request.body` is locked and `request.text()` throws `TypeError: body used already`.

The Section 9 implementation MUST therefore:

1. Read the raw bytes **before** any other consumer of the body (via a wrapper around the route handler that calls `request.bytes()` once and re-creates the `Request` for downstream handlers with `new Request(originalUrl, { ...init, body: rawBuffer })`)
2. OR mark webhook routes as a separate executor path that bypasses `parseWebRequestBody` entirely. This is the cleaner option and what the Section 9 design picks.

### 3.4 Hono (the Web-Crypto pattern reference)

The Hono codebase is the cleanest prior art for **runtime-portable** signature verification — pure Web Crypto, zero `node:crypto`. The two load-bearing files:

`referencias/hono/src/utils/crypto.ts` — `createHash`:

```ts
if (crypto && crypto.subtle) {
  const buffer = await crypto.subtle.digest({ name: algorithm.name }, sourceBuffer)
  const hash = Array.prototype.map
    .call(new Uint8Array(buffer), (x) => ('00' + x.toString(16)).slice(-2))
    .join('')
  return hash
}
return null
```

That bytes-to-hex `('00' + x.toString(16)).slice(-2)` pattern is the canonical zero-dep hex encoder in TypeScript and identical to the one we ship in `packages/theo/src/server/auth/crypto.ts` already.

`referencias/hono/src/utils/buffer.ts:8-27` — `equal` (constant-time over ArrayBuffer):

```ts
export const equal = (a: ArrayBuffer, b: ArrayBuffer): boolean => {
  if (a === b) return true
  if (a.byteLength !== b.byteLength) return false
  const va = new DataView(a)
  const vb = new DataView(b)
  let i = va.byteLength
  while (i--) {
    if (va.getUint8(i) !== vb.getUint8(i)) return false
  }
  return true
}
```

Lines 29–40 — `constantTimeEqualString` (constant-time over strings of unequal length):

```ts
const constantTimeEqualString = (a: string, b: string): boolean => {
  const aLen = a.length
  const bLen = b.length
  const maxLen = Math.max(aLen, bLen)
  let out = aLen ^ bLen
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < aLen ? a.charCodeAt(i) : 0
    const bChar = i < bLen ? b.charCodeAt(i) : 0
    out |= aChar ^ bChar
  }
  return out === 0
}
```

Note the trick on line 33: `out = aLen ^ bLen` seeds the result with a non-zero value if the lengths differ, **without short-circuiting** — the loop still iterates `maxLen` times to keep the comparison time data-independent. This is the algorithm TheoKit's `timing-safe-equal.ts` adopts (Section 9.2), unified behind a single `timingSafeEqualHex(a: string, b: string): boolean` function whose Node implementation calls `crypto.timingSafeEqual` and whose Web implementation falls back to this constant-time string comparison.

The double-hash pattern (lines 44–63 of `buffer.ts`) — hashing both sides with SHA-256 before constant-time string-compare — is a defense against the still-leakable timing of `String.prototype.charCodeAt` on JIT'd engines. Hono uses it for `Bearer auth`. For HMAC verification, the inputs are already hex strings of known equal length (64 chars for SHA-256), so the simpler `constantTimeEqualString` is sufficient. We don't double-hash.

### 3.5 Next.js raw-body bridging (Pages Router only — historical)

`referencias/next.js/packages/next/src/compiled/raw-body/index.js` is the vendored npm `raw-body` package. It's only used by the legacy Pages Router (`api-utils/node/parse-body.ts`). The App Router relies on Web Standards `Request.text()`. **TheoKit is App-Router-equivalent only** — we do not need `raw-body` as a dependency.

### 3.6 Rails ActionMailbox (multi-provider HMAC, the cleanest framework prior art)

The four ingresses (Mandrill, Mailgun, Postmark, Sendgrid) demonstrate every dimension of variance TheoKit's `verify` contract must absorb:

| Provider | Header | Algorithm | Basestring | Replay window | Tolerance source |
|---|---|---|---|---|---|
| Mandrill | `X-Mandrill-Signature` | HMAC-SHA1 (legacy) | URL + alphabetically-sorted POST params, Base64 | none documented | `referencias/rails/actionmailbox/app/controllers/.../mandrill/inbound_emails_controller.rb:69-83` |
| Mailgun | `signature` field (in POST body, not a header!) | HMAC-SHA256, hex | `timestamp + token` | **2 minutes** | `.../mailgun/inbound_emails_controller.rb:96-107` |
| Postmark | HTTP Basic Auth | n/a | n/a | n/a | `.../postmark/inbound_emails_controller.rb` |
| Sendgrid | HTTP Basic Auth | n/a | n/a | n/a | `.../sendgrid/inbound_emails_controller.rb:47-48` |

**Five lessons baked into the TheoKit design:**

1. **`secure_compare` is the universally-named constant-time primitive** (`referencias/rails/actionmailbox/app/controllers/.../mandrill/inbound_emails_controller.rb:69`: `ActiveSupport::SecurityUtils.secure_compare given_signature, expected_signature`). TheoKit calls ours `timingSafeEqualHex` to match Node's terminology and lower the cognitive bridge for users coming from Node ecosystems.
2. **Each provider gets its own controller (not a base class with strategies)** — ADR-0005 in advance. The Rails team validated this pattern across 4 providers with no shared `BaseSignedIngressController` — each one is self-contained, ~80 LOC, no class hierarchy. TheoKit's `providers/{stripe,github,slack}.ts` follow suit: three independent files, no shared `BaseProvider` class.
3. **The "key is nil/blank" failure mode is its own test scenario** (`referencias/rails/actionmailbox/test/controllers/ingresses/mailgun/inbound_emails_controller_test.rb:93-119`). It raises a developer-facing error eagerly, NOT silently disables verification. TheoKit's `stripe({ secret: '' })` and `stripe({ secret: undefined as unknown as string })` both throw a typed `WebhookConfigurationError` at construction time, not at request time.
4. **Replay tolerance is configurable per-provider** — Mailgun chose 2 minutes; Stripe/Slack chose 5. TheoKit's provider helpers expose `toleranceSeconds?: number` per ADR-0004's spirit (provider-portable defaults but per-provider override).
5. **Not every webhook scheme is HMAC** — Postmark and Sendgrid use Basic Auth. The `defineWebhook` `verify` contract must NOT bake in HMAC; it must accept any `(req: Request) => Promise<{ok: true} | {ok: false; reason: string}>`. The first-party `stripe(...)`, `github(...)`, `slack(...)` factories ARE HMAC-based, but a user-provided `verify: async (req) => req.headers.get('authorization') === expected ? {ok: true} : {ok: false, reason: 'bad auth'}` is equally legitimate.

### 3.7 Nitro (control case — no primitive)

The only Nitro reference is `referencias/nitro/docs/1.docs/7.cache.md:333`: "Cached entries can be invalidated programmatically at runtime (for example from a webhook when the underlying data changes)". Documents the use case, ships no primitive. Same gap-shape as Next.js and SvelteKit.

### 3.8 Stripe (canonical web-source reference)

Source: <https://docs.stripe.com/webhooks/signatures>. Verbatim algorithm:

**Header format** (from `referencias/next.js/examples/with-stripe-typescript/app/api/webhooks/route.ts:13`, confirmed against Stripe docs):

```
Stripe-Signature: t=1492774577,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd,v0=6ffbb59b2300aae63f272406069a9788598b792a944a07aba816edb039989a39
```

**Algorithm (4 steps from Stripe docs):**

1. Extract `t=` (timestamp) and **all** `v1=` (signature) entries from the comma-delimited header. Ignore `v0=` (per Stripe: "To avoid downgrade attacks, ignore all schemes that are not v1").
2. Construct `signed_payload = "{timestamp}.{raw_request_body}"` — period as separator, no whitespace.
3. Compute `expected_signature = HMAC-SHA256(secret, signed_payload)` and hex-encode.
4. For each `v1` value extracted in step 1, constant-time compare against `expected_signature`. If at least one matches AND `current_time - timestamp <= tolerance`, accept.

**Default tolerance:** 300 seconds (5 minutes). Stripe's docs explicitly warn: "Do not use a tolerance value of 0. Using a tolerance value of 0 completely disables freshness verification." TheoKit's `stripe({ toleranceSeconds: 0 })` throws a `WebhookConfigurationError` at construction time mirroring this constraint.

**Reference implementation** (`stripe-node` `Webhooks.ts`):

```js
function parseHeader(header, scheme) {
  if (typeof header !== 'string') return null
  scheme = scheme || signature.EXPECTED_SCHEME      // 'v1'
  return header.split(',').reduce((accum, item) => {
    const kv = item.split('=')
    if (kv[0] === 't')      accum.timestamp = parseInt(kv[1], 10)
    if (kv[0] === scheme)   accum.signatures.push(kv[1])
    return accum
  }, { timestamp: -1, signatures: [] })
}

function makeHMACContent(payload, details) {
  return `${details.timestamp}.${payload}`
}

// Multi-signature support (key rotation):
const signatureFound = !!details.signatures
  .filter(platformFunctions.secureCompare.bind(platformFunctions, expectedSignature))
  .length
```

The multi-signature support is **key rotation** in action: during a secret rotation, Stripe sends two `v1=...` values, one per active secret. The TheoKit `stripe({ secret })` factory accepts `secret: string | string[]` — when an array is passed, ALL secrets are tried (constant-time each), and verification succeeds if any one matches. Same shape as Slack's signing-secret rotation (24-hour grace window).

**Critical test cases** from `stripe-node/test/Webhook.spec.ts` (verbatim):

- *"should raise a SignatureVerificationError when the header does not have the expected format"* — message: `/Unable to extract timestamp and signatures from header/`
- *"should raise a SignatureVerificationError when the header is null or empty"* — message: `/No stripe-signature header value was provided./`
- *"should raise a SignatureVerificationError when the timestamp is not within the tolerance of the provided timestamp"* — message: `/Timestamp outside the tolerance zone/`
- *"should return true when the header contains at least one valid signature"* — even when concatenated with garbage like `,v1=potato`
- *"should return an Event instance from a payload and header with type Uint8Array"* — verification must work whether the body is delivered as `string` or `Uint8Array`

TheoKit's `stripe(...)` helper reproduces every one of these test cases byte-for-byte in `tests/unit/webhook-providers-stripe.test.ts` (Section 9.5).

### 3.9 GitHub (web source)

Source: <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries>.

**Header:** `X-Hub-Signature-256` (the `-256` suffix matters — the legacy `X-Hub-Signature` uses SHA-1 and is explicitly recommended against by GitHub's docs).

**Format:** `sha256=<hex-digest>` — the algorithm prefix is *required* and is part of the literal string compared (do not strip and compare the hex alone — keep the prefix and use `timingSafeEqual` on the full `sha256=...` strings).

**Basestring:** the raw request body, byte-for-byte. No timestamp prefix.

**Replay protection:** GitHub does **not** include a timestamp in the signed payload. The official guidance is to use `X-GitHub-Delivery` (a UUID per delivery) for **idempotency dedup**, not replay protection. This is a notable security gap relative to Stripe/Slack — the `defineWebhook` integration with `cache/revalidate` and the queue primitive can mitigate replay risk by treating `X-GitHub-Delivery` as the dedup key (Section 9 wiring).

**Response window:** GitHub considers the delivery failed if your server does not respond `2xx` within 10 seconds. TheoKit's `defineWebhook` wrapper enforces a soft deadline by passing a 9-second `AbortSignal` (default, configurable per-call) to the handler's `ctx.signal`.

**Secret rotation:** Not addressed in the docs. The `github(secret)` factory accepts `secret: string | string[]` for symmetry with Stripe.

### 3.10 Slack (web source + bolt-js source)

Source: <https://docs.slack.dev/authentication/verifying-requests-from-slack> and `referencias` cross-checked with <https://raw.githubusercontent.com/slackapi/bolt-js/main/src/receivers/verify-request.ts>.

**Headers:** `X-Slack-Signature` (the signature) and `X-Slack-Request-Timestamp` (separate timestamp header — Slack diverges from Stripe by NOT embedding the timestamp in the signature header).

**Basestring:** `v0:${timestamp}:${rawBody}` — three colons, no whitespace.

**Algorithm:** HMAC-SHA256, hex-encoded, prefixed with `v0=` literal.

**Tolerance:** 5 minutes (300 seconds). The bolt-js source confirms:

```ts
const requestTimestampMaxDeltaMin = 5
const fiveMinutesAgoSec = Math.floor(nowMs / 1000) - 60 * requestTimestampMaxDeltaMin
```

**HMAC construction:**

```ts
const hmac = createHmac('sha256', options.signingSecret)
hmac.update(`${signatureVersion}:${requestTimestampSec}:${options.body}`)
const ourSignatureHash = hmac.digest('hex')
```

**Comparison:** bolt-js uses `tsscmp` (the `timing-safe-string-compare` npm package). TheoKit uses its own internal `timingSafeEqualHex` instead — zero deps.

**Key rotation:** Slack docs say "the previous secret remains valid for 24 hours unless revoked manually". `slack(secret)` factory accepts `secret: string | string[]` for the same reason as Stripe.

### 3.11 Twilio (the deliberate outlier — documented but not first-party)

Source: <https://www.twilio.com/docs/usage/webhooks/webhooks-security>.

Twilio's signature scheme is **structurally incompatible** with the raw-body-first design pattern:

- For `application/x-www-form-urlencoded` payloads: signature is over `URL + sorted-and-concatenated-form-params`, NOT over the raw body
- For `application/json` payloads: Twilio appends a `bodySHA256` query parameter and signs `URL + bodySHA256`, where the `bodySHA256` is computed by Twilio and the server re-derives + cross-checks
- Algorithm: HMAC-**SHA1** (not SHA-256 — Twilio is the only modern provider still using SHA-1)
- Encoding: Base64 (not hex)

This is why Twilio is **deliberately NOT a first-party TheoKit provider** in 0.5.0. Three reasons:

1. The `verify` function signature `(req: Request) => Promise<...>` is sufficient — Twilio's verification logic is fully expressible as a user-defined `verify` because the `Request` exposes both the URL (`req.url`) and the form fields (`await req.formData()`).
2. Twilio's pattern is asymmetric with the other 4 providers (Stripe, GitHub, Slack, Resend/Svix) — bundling it forces an internal `if (provider === 'twilio') { ... }` branch in shared helpers, violating ADR-0005's "plain functions, no class hierarchy" stance by re-introducing the hierarchy at the algorithm layer.
3. There is a well-maintained `twilio` npm package whose `validateRequest(authToken, signature, url, params)` (or `validateRequestWithBody` for JSON) is one line to call. TheoKit's `verify` contract is exactly the right escape hatch: `verify: async (req) => twilio.validateRequest(...) ? {ok: true} : {ok: false, reason: 'twilio.invalid'}`. Documented in the "user-defined verify" example in §9.3.

If 0.6.0+ demand justifies it, Twilio ships as `@theokit/webhook-twilio`, owned by its own package and shipping its own SHA-1 + base64 + form-params plumbing.

### 3.12 Resend / Svix (Standard Webhooks)

Source: <https://docs.svix.com/receiving/verifying-payloads/how> and <https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md>.

The Standard Webhooks specification (Svix-driven, adopted by Resend, OpenAI, ClickUp, and a growing list of providers — see <https://www.standardwebhooks.com/>) prescribes:

- **Headers:** `webhook-id`, `webhook-timestamp`, `webhook-signature`
- **Signature header format:** space-delimited list, each entry like `v1,<base64-signature>` (note: the `v1,` is comma-separated within the entry, but multiple entries are space-separated for key rotation)
- **Algorithm:** HMAC-SHA256 (`v1` prefix) or Ed25519 (`v1a` prefix — out of scope for TheoKit MVP)
- **Basestring:** `${msg_id}.${timestamp}.${body}` (period-separated, like Stripe)
- **Secret format:** Base64-encoded, prefixed with `whsec_`. Decode the base64 part before using as the HMAC key.
- **Replay tolerance:** Recommended but not numerically specified; community convention is 5 minutes (matching Stripe/Slack)
- **Timing-safe comparison:** required, explicit in the spec

Standard Webhooks is **not** a first-party TheoKit provider in 0.5.0. Justification:

1. The 3 locked first-party helpers (Stripe, GitHub, Slack) cover the top 3 webhook senders by traffic in the agent-app ecosystem (per Stripe = payments, GitHub = repo events, Slack = bot interactions).
2. Resend (the most prominent Standard Webhooks consumer for agent apps) is an outbound email provider — agent apps mostly **send** through Resend's API, only the bounce/click webhooks come back. The userbase that needs Resend webhooks is a strict subset of the userbase that needs the queue primitive (R0.5.5), and a user-defined `verify` is one straightforward function (Section 9.3 includes a `standardWebhook(secret)` factory **as a fixture-only example**, not exported from `theokit/server`).
3. Shipping Standard Webhooks support pre-1.0 would force a base64-secret normalization helper into the public API surface, which is one more degree of API commitment than necessary before user demand validates it.

In 0.6.0+, `@theokit/webhook-standard` could ship a `standardWebhook(secret)` factory that re-uses the internal HMAC primitives (Section 9.2 makes those primitives exportable from `webhook/_internal/hmac.ts` for this exact future).

---

## 4. Convergent patterns (≥5 — required)

These hold across **every** prior art (frameworks + providers) read for this doc:

1. **HMAC-SHA256 dominates** — Stripe, GitHub, Slack, Resend/Svix all use SHA-256. Mailgun does too. The only modern outlier is Twilio (still HMAC-SHA1 for form payloads). Mandrill is HMAC-SHA1 because the ingress is legacy. **Design implication:** TheoKit's 3 first-party helpers ship SHA-256 only. The internal HMAC primitive accepts an algorithm parameter so future providers (or `@theokit/webhook-twilio`) can opt into SHA-1.

2. **Timestamp + payload concatenation is the de-facto replay-protection pattern** — Stripe (`{timestamp}.{body}`), Slack (`v0:{timestamp}:{body}`), Standard Webhooks (`{id}.{timestamp}.{body}`), Mailgun (`{timestamp}{token}` — the only one without a separator). **Design implication:** the internal `hmacBasestring` is constructed per-provider (no shared helper) — too much divergence in delimiters to justify abstraction.

3. **5-minute replay window is the standard** — Stripe (default 300s, configurable), Slack (300s hardcoded in bolt-js), Standard Webhooks (recommended but unspecified — convention 300s). Outlier: Mailgun (120s). **Design implication:** TheoKit's per-provider defaults: Stripe 300, GitHub none (GitHub does not sign timestamps; we treat `X-GitHub-Delivery` as dedup key), Slack 300. Each is overridable via `toleranceSeconds`.

4. **Constant-time comparison is non-negotiable** — Stripe's `secureCompare`, Slack's `tsscmp`, GitHub's `crypto.timingSafeEqual`, Rails's `ActiveSupport::SecurityUtils.secure_compare`, Hono's `timingSafeEqual`. Every prior art either documents the requirement explicitly or implements it directly. **Design implication:** TheoKit ships `timing-safe-equal.ts` as a first-class internal module, with both Node (`crypto.timingSafeEqual` + buffer length pre-check) and Web Crypto (constant-time string compare per Hono pattern) paths.

5. **Raw body must be preserved (no JSON parse before verify)** — Stripe docs ("Stripe requires the raw request body"), Slack docs ("Use the raw request body, without headers, before it has been deserialized from JSON"), GitHub docs (implicit — `crypto.createHmac().update(payload)` where `payload` is the raw bytes), Fastify's `fastify-raw-body` ecosystem confirms this is **the** #1 failure mode in production. **Design implication:** The `defineWebhook` wrapper takes the body OUT of TheoKit's normal `parseWebRequestBody` flow — webhook routes are a separate execution branch.

6. **Multiple signatures for key rotation is the convergent solution to "rotate a secret without dropping in-flight webhooks"** — Stripe (parses all `v1=...` entries, accepts if any matches), Slack (24-hour grace where both secrets validate), Standard Webhooks (space-delimited multiple signatures in `webhook-signature` header). **Design implication:** All 3 TheoKit first-party helpers accept `secret: string | string[]` — single string for the common case, array for the rotation case.

7. **Signature verification failure returns 401, NOT 400** — the Stripe Next.js example returns 400, but this conflates "bad payload format" (a 400 condition) with "untrusted caller" (a 401 condition). The Rails ingresses get this right: `head :unauthorized` on signature mismatch. **Design implication:** TheoKit returns `401 Unauthorized` on signature failure (matches CLAUDE.md R0.5.10 lock: "Failed verify → 401").

---

## 5. Divergent patterns + TheoKit choice

| Divergence | Examples | TheoKit choice | Rationale |
|---|---|---|---|
| Header format | Stripe: `t=ts,v1=sig`. Slack: separate `X-Slack-Signature` + `X-Slack-Request-Timestamp`. GitHub: `sha256=hex`. Svix: `v1,base64 v1,base64`. | The `verify` function abstracts the parser per-provider — no shared "header parser" in `webhook/_internal/`. Each `providers/{stripe,github,slack}.ts` parses its own header. | Mirrors Rails's per-controller approach (§3.6 lesson 2). Sharing a parser would re-introduce the class hierarchy ADR-0005 rejected. |
| Timestamp embedding | Stripe in header. Slack in separate header. Standard Webhooks in separate header. GitHub: no timestamp. | First-party providers each document their own timestamp source. The internal `hmacBasestring` is provider-specific. No shared `withTimestamp(basestring, ts)` helper. | Each provider's basestring assembly is small (~5 lines); abstracting would obscure more than it shares. |
| Twilio's URL+form-params signing | Twilio (form), Twilio JSON (URL + body-SHA-256 query param) | **NOT first-party.** Document as a user-defined `verify` callsite. | §3.11 — bundling forces algorithm-layer hierarchy. |
| Multiple keys for rotation | Stripe: yes (server emits multiple `v1=...`). Slack: yes (server emits one, 24h grace). Standard Webhooks: yes (multiple entries in header). | All 3 first-party helpers accept `secret: string | string[]`. Verification tries each in constant time and accepts if any matches. | §4 convergent pattern 6. Lower-friction for users in a rotation window. |
| Body encoding | Stripe: `string` or `Uint8Array`. GitHub/Slack: documented as string but `Uint8Array` works on edge. | All providers accept either via TextEncoder normalization at the helper entry. | §3.8 — `stripe-node` test cases explicitly cover both. Edge runtimes (Cloudflare Workers) emit `Uint8Array` natively. |
| Secret base64 vs raw | Stripe: raw `whsec_...` string used as-is. Standard Webhooks: base64-encoded after the `whsec_` prefix, must decode. | TheoKit's `stripe(secret)` treats the secret as opaque bytes (uses the literal string as HMAC key). Standard Webhooks support (deferred 0.6.0+) handles base64 decode in its own helper. | Each provider's own helper owns its secret normalization. The internal HMAC primitive accepts `Uint8Array` keys only — no string handling. |
| Replay tolerance | Stripe: 300s default, configurable. Slack: 300s hardcoded in bolt-js. Mailgun: 120s. GitHub: none. | Per-provider defaults (300/none/300), all overridable via `toleranceSeconds?: number`. `toleranceSeconds: 0` throws (matches Stripe's warning). | §3.6 lesson 4 + §3.8 explicit warning. |
| Response timeout SLA | GitHub: 10s. Stripe: ~30s practical. Slack: 3s for slash commands, no SLA for events. | `defineWebhook` wrapper passes `ctx.signal` with 9s deadline by default (under GitHub's 10s), overridable via `timeoutMs?: number`. | Conservative default that satisfies all 3 first-party providers. |

---

## 6. Dependency inventory

**Argument: stay zero-runtime-dep.** All cryptography in `webhook/` uses:

1. **Web Crypto API** (`globalThis.crypto.subtle`) for HMAC computation — available in Node 20+, Bun, Deno, Cloudflare Workers, browsers. The framework's `packages/theo/src/server/auth/crypto.ts` already standardizes this access pattern (`cachedWebCrypto`), so `webhook/` reuses the cached `crypto.subtle` reference instead of paying the per-call overhead.
2. **Node's `crypto.timingSafeEqual`** when running under Node, with a Web-Crypto-only fallback (constant-time string compare per Hono pattern §3.4) for edge runtimes.

**No `crypto-js`, no `jsonwebtoken`, no `@octokit/webhooks`, no `@slack/bolt`, no `stripe`** as runtime dependencies of `theokit`.

**Optional dev dependency** for the test suite only: `standardwebhooks` npm package (~3 kB) used in a single cross-validation test (`tests/integration/webhook-cross-validation.test.ts`) to assert our internal HMAC implementation produces byte-identical signatures against the Standard Webhooks reference implementation. This is **dev-only**, never in the published bundle.

**Dependency hygiene table** (per `dependency-hygiene-auditor` skill criteria):

| Candidate | Verdict | Rationale |
|---|---|---|
| `crypto-js` | rejected | Pure-JS HMAC, slower than Web Crypto, adds 24 kB to bundle. Web Crypto is universally available now. |
| `@octokit/webhooks` | rejected | Pulls in `@octokit/request` (~120 kB transitively), opinionated event-type dispatcher we don't need, framework lock-in. We need ~30 LOC of HMAC. |
| `stripe` (full SDK) | rejected | 1.2 MB, includes the entire REST API surface for charges/customers/subscriptions. Webhook verification needs ~50 LOC of it. The lite middleware approach (`@nakanoaas/hono-stripe-webhook-middleware-lite`) proves this is the right call — they specifically extract the webhook verification logic to avoid the bundle. |
| `tsscmp` | rejected | 3 LOC of constant-time string compare. We can write that ourselves (and do, in `timing-safe-equal.ts`). |
| `raw-body` (Express ecosystem) | rejected | Node-only, designed for Node streams. We use `request.bytes()` which is universal. |
| `standardwebhooks` | dev-only | Cross-validation test sentinel. Not in published bundle. |

**Bundle budget impact:** `webhook/` adds an estimated 2.5 kB gzipped to `theokit/server` (3 provider helpers × ~250 LOC + shared primitives × ~150 LOC). Bundle CI gate (R0.5.3, 0.4.0 prereq) must absorb this delta — current default-template bundle is 193.90 kB gzipped against a 350 kB budget, so the headroom is sufficient.

---

## 7. Algorithms (detailed pseudo-code)

### 7.1 Stripe — `verify` algorithm

```ts
async function stripeVerify(
  rawBody: Uint8Array,
  signatureHeader: string,
  secrets: Uint8Array[],
  toleranceSeconds: number,
  nowSeconds: number,
): Promise<{ok: true} | {ok: false; reason: string}> {
  // 1. Parse header — extract t and ALL v1 entries.
  const parts = signatureHeader.split(',')
  let timestamp = -1
  const v1Signatures: string[] = []
  for (const part of parts) {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) continue
    const key = part.slice(0, eqIdx)
    const value = part.slice(eqIdx + 1)
    if (key === 't') timestamp = parseInt(value, 10)
    else if (key === 'v1') v1Signatures.push(value)
  }
  if (timestamp < 0) return { ok: false, reason: 'stripe.header.missing_timestamp' }
  if (v1Signatures.length === 0) return { ok: false, reason: 'stripe.header.no_v1_signatures' }

  // 2. Replay window check.
  const age = nowSeconds - timestamp
  if (age > toleranceSeconds) return { ok: false, reason: 'stripe.timestamp.expired' }
  if (age < -toleranceSeconds) return { ok: false, reason: 'stripe.timestamp.future' }  // clock skew

  // 3. Construct basestring: `${timestamp}.${rawBody}` — period-separator, no whitespace.
  const enc = new TextEncoder()
  const tsBytes = enc.encode(`${timestamp}.`)
  const basestring = new Uint8Array(tsBytes.length + rawBody.length)
  basestring.set(tsBytes, 0)
  basestring.set(rawBody, tsBytes.length)

  // 4. For each candidate secret, compute expected; for each received v1, constant-time compare.
  for (const secret of secrets) {
    const expectedHex = await hmacSha256Hex(secret, basestring)
    for (const received of v1Signatures) {
      if (timingSafeEqualHex(expectedHex, received)) return { ok: true }
    }
  }
  return { ok: false, reason: 'stripe.signature.mismatch' }
}
```

### 7.2 GitHub — `verify` algorithm

```ts
async function githubVerify(
  rawBody: Uint8Array,
  signatureHeader: string | null,   // X-Hub-Signature-256
  secrets: Uint8Array[],
): Promise<{ok: true} | {ok: false; reason: string}> {
  if (!signatureHeader) return { ok: false, reason: 'github.header.missing' }
  if (!signatureHeader.startsWith('sha256=')) {
    return { ok: false, reason: 'github.header.bad_prefix' }
  }
  const receivedHex = signatureHeader.slice('sha256='.length)
  // GitHub does NOT include a timestamp — no replay window check.
  for (const secret of secrets) {
    const expectedHex = await hmacSha256Hex(secret, rawBody)
    if (timingSafeEqualHex(expectedHex, receivedHex)) return { ok: true }
  }
  return { ok: false, reason: 'github.signature.mismatch' }
}
```

### 7.3 Slack — `verify` algorithm

```ts
async function slackVerify(
  rawBody: Uint8Array,
  signatureHeader: string | null,           // X-Slack-Signature
  timestampHeader: string | null,           // X-Slack-Request-Timestamp
  secrets: Uint8Array[],
  toleranceSeconds: number,
  nowSeconds: number,
): Promise<{ok: true} | {ok: false; reason: string}> {
  if (!signatureHeader) return { ok: false, reason: 'slack.header.missing_signature' }
  if (!timestampHeader) return { ok: false, reason: 'slack.header.missing_timestamp' }
  if (!signatureHeader.startsWith('v0=')) return { ok: false, reason: 'slack.header.bad_version' }

  const timestamp = parseInt(timestampHeader, 10)
  if (Number.isNaN(timestamp)) return { ok: false, reason: 'slack.timestamp.malformed' }

  const age = nowSeconds - timestamp
  if (age > toleranceSeconds) return { ok: false, reason: 'slack.timestamp.expired' }
  if (age < -toleranceSeconds) return { ok: false, reason: 'slack.timestamp.future' }

  // Basestring: `v0:${timestamp}:${rawBody}`
  const enc = new TextEncoder()
  const prefix = enc.encode(`v0:${timestamp}:`)
  const basestring = new Uint8Array(prefix.length + rawBody.length)
  basestring.set(prefix, 0)
  basestring.set(rawBody, prefix.length)

  const receivedHex = signatureHeader.slice('v0='.length)
  for (const secret of secrets) {
    const expectedHex = await hmacSha256Hex(secret, basestring)
    if (timingSafeEqualHex(expectedHex, receivedHex)) return { ok: true }
  }
  return { ok: false, reason: 'slack.signature.mismatch' }
}
```

### 7.4 `hmacSha256Hex` — shared internal

```ts
async function hmacSha256Hex(secret: Uint8Array, message: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, message)
  return bytesToHex(new Uint8Array(sig))
}

function bytesToHex(bytes: Uint8Array): string {
  // Pattern from referencias/hono/src/utils/crypto.ts:52-55, vetted.
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16)
  }
  return out
}
```

### 7.5 `timingSafeEqualHex` — shared internal, with Node fast path

```ts
function timingSafeEqualHex(a: string, b: string): boolean {
  // Fast path: Node 20+ exposes crypto.timingSafeEqual.
  // Required pre-check: buffers must be equal length, else timingSafeEqual throws RangeError.
  // We compare hex strings — convert both to Uint8Array via TextEncoder.
  // We do NOT short-circuit on length mismatch BEFORE the encode (would leak length).
  // We DO require length equality after encode (timingSafeEqual requirement).
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  if (aBytes.length !== bBytes.length) {
    // Force a "fake" compare against a same-length buffer to keep this branch
    // timing-equivalent to the equal-length branch (Hono pattern, §3.4).
    const fake = new Uint8Array(aBytes.length)
    nodeTimingSafeEqualMaybe(aBytes, fake)
    return false
  }
  if (typeof nodeCryptoTimingSafeEqual === 'function') {
    return nodeCryptoTimingSafeEqual(aBytes, bBytes)
  }
  // Web Crypto fallback: constant-time string compare (Hono `constantTimeEqualString`).
  let out = 0
  for (let i = 0; i < aBytes.length; i++) out |= aBytes[i] ^ bBytes[i]
  return out === 0
}
```

Note: `nodeCryptoTimingSafeEqual` is lazily imported via dynamic `import('node:crypto')` guarded by `typeof process !== 'undefined' && process.versions?.node`. On non-Node runtimes the import path is dead-code-eliminated at build (Vite recognizes the guard).

---

## 8. Edge cases (≥10 — required, each with source)

| EC | Scenario | Source / Why it matters | Mitigation in TheoKit |
|---|---|---|---|
| **EC-1** | **Replay attack outside tolerance window** | Stripe docs §3.8 ("Timestamp outside the tolerance zone"), Mailgun test `"rejecting a delayed inbound email"` (`referencias/rails/.../mailgun/inbound_emails_controller_test.rb:65-77`) | `nowSeconds - timestamp > toleranceSeconds` ⇒ return `{ok: false, reason: '<provider>.timestamp.expired'}`. Framework logs at `warn` level with `requestId` + the masked-header signature for postmortem. |
| **EC-2** | **Clock skew (sender's clock is ahead of receiver's)** | Stripe docs implicit ("difference between current time and t value"). Real-world: NTP-unsynced VMs drift seconds; cross-region drift is normally <1s but spikes happen. | Same `toleranceSeconds` envelope checked on both sides: `Math.abs(age) > tolerance` rejects future timestamps too. Tested in `tests/unit/webhook-providers-stripe.test.ts` "rejects timestamps from the future beyond tolerance". |
| **EC-3** | **Missing or malformed signature header** | Stripe test `"should raise a SignatureVerificationError when the header does not have the expected format"` and `"... when the header is null or empty"` | Each `verify` function checks for `null`/`undefined`/empty header first, returns `{ok: false, reason: '<provider>.header.missing'}`. Framework responds `401 Unauthorized`. |
| **EC-4** | **Multiple `t=...` entries in Stripe header (malformed sender)** | Stripe's `parseHeader` (`stripe-node/src/Webhooks.ts`) overwrites on duplicate: `if (kv[0] === 't') accum.timestamp = parseInt(kv[1], 10)` — last wins. | TheoKit matches Stripe's behavior: last `t=...` wins. Documented in the helper's JSDoc. Adding a defensive "reject duplicate t=" would diverge from `stripe-node`'s behavior and break interop. |
| **EC-5** | **Empty body (legal? depends on provider)** | GitHub `ping` event has an `{}` body. Stripe's `account.application.deauthorized` has a near-empty body. Mailgun's `bounce` events can have empty `body-mime`. | `rawBody.length === 0` is legal — HMAC is computed normally (HMAC of empty input is well-defined). The signature still validates if the sender computed HMAC over empty bytes too. Tested. |
| **EC-6** | **Body with trailing whitespace (must be byte-exact)** | Stripe docs ("Stripe requires the raw request body. If using a framework, ensure it does not manipulate the raw body"). Real-world failures: middleware that strips trailing `\n`, frameworks that re-serialize JSON. | TheoKit's webhook execution path bypasses `parseWebRequestBody` entirely (§3.3 lesson). The raw body is read **once** via `request.bytes()` and passed to `verify` byte-faithfully. Never JSON-parsed before verify. |
| **EC-7** | **Body parsed-before-verify (the canonical bug)** | Common in Express + body-parser, Fastify without raw-body plugin, any user who mounts a JSON parser before the webhook handler. | TheoKit's `defineWebhook` is a **separate route kind** in the route scanner — not a `defineRoute`. The executor branch for webhook routes pre-reads `request.bytes()` and constructs a **fresh `Request`** for the handler (so the user can still call `await ctx.request.json()` to get the parsed body in their handler, but the bytes used for `verify` are pristine). |
| **EC-8** | **Secret rotation (multiple keys must be tried until success)** | Stripe key rotation, Slack 24-hour grace, GitHub user-driven. | `secret: string | string[]` on every first-party helper. For each candidate secret, compute expected, constant-time compare against each received signature. Tested in `tests/unit/webhook-providers-stripe.test.ts` "accepts signature from the second secret in a rotation array". |
| **EC-9** | **Timing attack via early-return string compare** | Hono `buffer.ts` comment / Stripe `secureCompare` docs. | `timingSafeEqualHex` always iterates the full length. Even when lengths differ, the function dispatches a fake equal-length compare so the timing of the rejected path doesn't differ from the matched path. |
| **EC-10** | **Webhook delivery retry (idempotent handler required)** | GitHub docs ("`X-GitHub-Delivery` is unique per event, same UUID on redeliveries"), Stripe docs ("Stripe will deliver the same event multiple times"). | Framework exposes `ctx.deliveryId` (extracted from the conventional header per-provider: `X-GitHub-Delivery` for GitHub, `Stripe-Event-Id` for Stripe via the event JSON, `X-Slack-Request-Timestamp` is NOT a dedup key for Slack — use `event_id` from the payload). Handlers responsible for dedup. **Section 9 fixture** wires `ctx.deliveryId` into the cache primitive's `revalidateTag('webhook:<id>')` as the dedup mechanism. |
| **EC-11** | **Provider sends test/ping payload** | Stripe sends a test webhook from the dashboard "Send test webhook" button. GitHub sends a `ping` event with `{ zen: "...", hook_id: ... }`. Slack sends an `url_verification` event during app installation. | Verify still runs (the signatures are real). The handler's job to switch on event type and respond appropriately. Slack's `url_verification` requires echoing the `challenge` field — documented in the Slack fixture (`fixtures/webhook-slack/`). |
| **EC-12** | **Forwarded request through proxy/load balancer (signature still valid only if proxy preserves body byte-for-byte)** | Real-world: Cloudflare proxy strips `Connection: close`, ngrok preserves bodies; some corporate load balancers re-encode form fields. | Out of TheoKit's control. Documented in `docs/concepts/webhooks.md` under "When verification fails in production but works locally". |
| **EC-13** | **Body read twice (`request.text()` then `request.json()` ⇒ `TypeError: Body already used`)** | Web Standards Request body is a one-shot stream. User who reads body in middleware and then in handler hits this. | `defineWebhook` executor reads bytes once into a buffer and constructs a fresh `new Request(originalUrl, {..., body: buffer})` for the handler. `ctx.rawBody` exposes the raw bytes for HMAC if the user wants to re-verify; `ctx.request.json()` works because the new request's body has not been consumed. |
| **EC-14** | **CSRF middleware blocks webhook (since R0.3 default-enforced)** | Existing `define-route.ts:14-22` doc — webhooks need `csrf: false`. After R0.3 default flips to `strict`, every webhook without explicit `csrf: false` returns 403. | `defineWebhook` **automatically opts out of CSRF**. The framework's route scanner registers webhook routes with `csrf: false` set, so users do not have to set it manually. This is the entire point of having a dedicated `defineWebhook` instead of "just use `defineRoute` with `csrf: false`". |
| **EC-15** | **Body size exceeds limit (DoS via giant payload)** | Snyk advisor on `raw-body`: "to prevent reading arbitrarily large bodies", best practice is to cap. | Per-route `maxBodyBytes?: number` option, default **1 MB** (matches Stripe largest payload + headroom). Webhook executor pre-checks `Content-Length`; if missing, reads up to limit then aborts. Throws `WebhookBodyTooLargeError` mapped to `413 Payload Too Large`. |
| **EC-16** | **Provider sends `Content-Encoding: gzip` (rare but real)** | Some HTTP-2 servers auto-compress request bodies. The signature was computed over the uncompressed body by the sender; the receiver must decompress before HMAC. | Webhook executor checks `Content-Encoding`. If `gzip`/`deflate`/`br`, decompresses via `DecompressionStream` (Web Standards, available in Node 18+/Bun/Deno/Workers) before passing to `verify`. Documented as a recipe in `docs/concepts/webhooks.md`. |

---

## 9. Implementation Guide

### 9.1 Architecture (ASCII)

```
+------------------------------------------------------------------+
|  user's project: server/webhooks/stripe.ts                        |
|                                                                   |
|  import { defineWebhook } from 'theokit/server'                  |
|  import { stripe } from 'theokit/server'                         |
|                                                                   |
|  export const POST = defineWebhook({                              |
|    verify: stripe({                                               |
|      secret: process.env.STRIPE_WEBHOOK_SECRET,                  |
|      toleranceSeconds: 300,                                       |
|    }),                                                            |
|    handler: async (ctx) => {                                      |
|      const event = JSON.parse(ctx.rawBody)                        |
|      await ctx.queue.enqueue('process-stripe-event', event)      |
|      return Response.json({ received: true })                     |
|    },                                                             |
|  })                                                               |
+------------------------------------------------------------------+
                              |
                              | scan() at build time
                              v
+------------------------------------------------------------------+
|  packages/theo/src/server/scan/                                  |
|  - detects `defineWebhook(...)` callsites                         |
|  - registers route with kind='webhook', csrf=false               |
|  - emits .theo/webhooks.json manifest                             |
+------------------------------------------------------------------+
                              |
                              | dev / build / start
                              v
+------------------------------------------------------------------+
|  packages/theo/src/server/webhook/                               |
|  +-- define-webhook.ts        # public API: defineWebhook(...)    |
|  +-- webhook-types.ts         # WebhookContext, VerifyResult     |
|  +-- raw-body.ts              # request.bytes() + size cap + gzip |
|  +-- timing-safe-equal.ts     # Node fast path + Web fallback    |
|  +-- _internal/                                                   |
|      +-- hmac.ts              # hmacSha256Hex(key, message)      |
|      +-- hex.ts               # bytesToHex, hexToBytes           |
|  +-- providers/                                                   |
|      +-- stripe.ts            # stripe(opts) ⇒ verify fn         |
|      +-- github.ts            # github(opts) ⇒ verify fn         |
|      +-- slack.ts             # slack(opts) ⇒ verify fn          |
|      +-- index.ts             # re-export public providers       |
+------------------------------------------------------------------+
                              |
                              | at request time
                              v
+------------------------------------------------------------------+
|  Webhook executor (in packages/theo/src/server/http/)            |
|  1. Pre-read raw bytes via request.bytes() (size-capped)         |
|  2. Optional decompress via DecompressionStream                  |
|  3. Construct fresh Request with rawBuffer body                  |
|  4. Call verify(freshRequest). Failed ⇒ 401, log warn, abort.    |
|  5. Construct WebhookContext (rawBody, deliveryId, signal, ...)  |
|  6. Invoke handler(ctx). Handler return ⇒ Response to caller.    |
|  7. Map handler throws to 500 with stable error code.            |
+------------------------------------------------------------------+
```

### 9.2 Files to create

| File | New / modified | Purpose |
|---|---|---|
| `packages/theo/src/server/webhook/define-webhook.ts` | NEW | Public API: `defineWebhook({ verify, handler })`. Returns a `WebhookConfig` consumed by the route scanner. |
| `packages/theo/src/server/webhook/webhook-types.ts` | NEW | `WebhookContext`, `WebhookConfig`, `VerifyFn`, `VerifyResult` (discriminated `{ok: true} \| {ok: false; reason: string}`) |
| `packages/theo/src/server/webhook/timing-safe-equal.ts` | NEW | `timingSafeEqualHex(a, b)` — Node fast path + Web Crypto fallback per §7.5 |
| `packages/theo/src/server/webhook/raw-body.ts` | NEW | `readWebhookBody(request, maxBytes)` — preserves raw body across IncomingMessage / Web Request paths, handles `Content-Encoding`, enforces size cap |
| `packages/theo/src/server/webhook/_internal/hmac.ts` | NEW | `hmacSha256Hex(key: Uint8Array, message: Uint8Array): Promise<string>` per §7.4 |
| `packages/theo/src/server/webhook/_internal/hex.ts` | NEW | `bytesToHex(bytes)`, `hexToBytes(s)` |
| `packages/theo/src/server/webhook/providers/stripe.ts` | NEW | `stripe(opts: StripeOpts): VerifyFn` per §7.1 |
| `packages/theo/src/server/webhook/providers/github.ts` | NEW | `github(opts: GithubOpts): VerifyFn` per §7.2 |
| `packages/theo/src/server/webhook/providers/slack.ts` | NEW | `slack(opts: SlackOpts): VerifyFn` per §7.3 |
| `packages/theo/src/server/webhook/providers/index.ts` | NEW | Re-export `stripe`, `github`, `slack` |
| `packages/theo/src/server/webhook/index.ts` | NEW | Barrel re-exporting `defineWebhook` + providers + types |
| `packages/theo/src/server/define/index.ts` | MODIFIED | Add `export * from '../webhook/define-webhook.js'` |
| `packages/theo/src/server/index.ts` | MODIFIED | Add `export { stripe, github, slack } from './webhook/providers/index.js'` |
| `packages/theo/src/server/scan/scan-routes.ts` | MODIFIED | Detect `defineWebhook` callsite, register with `kind: 'webhook'`, `csrf: false` |
| `packages/theo/src/server/http/execute-route.ts` | MODIFIED | Branch for webhook kind: pre-read raw bytes, run verify, mount fresh Request |
| `tests/unit/webhook-providers-stripe.test.ts` | NEW | BDD test matrix per §9.5 |
| `tests/unit/webhook-providers-github.test.ts` | NEW | BDD test matrix per §9.5 |
| `tests/unit/webhook-providers-slack.test.ts` | NEW | BDD test matrix per §9.5 |
| `tests/unit/webhook-timing-safe.test.ts` | NEW | Unit tests for `timingSafeEqualHex` (per Hono test cases §3.4) |
| `tests/unit/webhook-raw-body.test.ts` | NEW | Size cap, gzip, empty body, double-read prevention |
| `tests/integration/define-webhook-raw-body.test.ts` | NEW | End-to-end: a webhook route receives a forged Stripe payload ⇒ 401; valid payload ⇒ 200 |
| `tests/integration/webhook-cross-validation.test.ts` | NEW (dev-only) | Cross-check `hmacSha256Hex` produces signatures identical to `standardwebhooks` npm package |
| `fixtures/webhook-stripe/` | NEW | Mini-project demonstrating Stripe signature roundtrip + revalidate cache wiring |
| `fixtures/webhook-github/` | NEW | Mini-project: GitHub `push` event ⇒ enqueue job |
| `fixtures/webhook-slack/` | NEW | Mini-project: Slack `url_verification` challenge + `event_callback` dispatch |
| `examples/full-stack-agent/server/webhooks/stripe.ts` | NEW | Canonical demo: Stripe payment events update agent user's tier in `trackAgentRun` (R0.5.11) |
| `docs/concepts/webhooks.md` | NEW | User docs: when to use, secret management, idempotency, troubleshooting |

### 9.3 Public API TypeScript signatures

```ts
// packages/theo/src/server/webhook/webhook-types.ts

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string }

export type VerifyFn = (req: Request) => Promise<VerifyResult>

export interface WebhookContext {
  /** The fresh `Request` whose body is intact (the wrapper re-mounted it after verifying). */
  request: Request
  /** Raw bytes the wrapper read and passed to `verify`. Same bytes the HMAC was computed over. */
  rawBody: Uint8Array
  /** Convenience: `rawBody` as a UTF-8 string. Throws if body is not valid UTF-8. */
  readonly rawBodyText: string
  /** Provider-specific delivery ID for idempotency dedup (e.g., `X-GitHub-Delivery`, Stripe event id from payload). */
  deliveryId: string | null
  /** TheoKit request id (W3C Trace Context already set up). Useful for log correlation. */
  traceId: string
  /** Abort signal that fires at the framework's response-timeout deadline (default 9s, under GitHub's 10s SLA). */
  signal: AbortSignal
  /** Same `ctx` object surface routes/actions get — db, logger, queue, cache, etc. */
  ctx: unknown
}

export interface WebhookConfig {
  /** Async function returning {ok:true} or {ok:false, reason: string}. Inline OR via a provider factory. */
  verify: VerifyFn
  /** Handler invoked only after verify resolves {ok:true}. */
  handler: (ctx: WebhookContext) => Response | Promise<Response>
  /** Max request body size in bytes. Default: 1 MB. */
  maxBodyBytes?: number
  /** Soft deadline for the handler. Default: 9000ms. */
  timeoutMs?: number
}

// packages/theo/src/server/webhook/define-webhook.ts

export function defineWebhook(config: WebhookConfig): WebhookConfig
```

```ts
// packages/theo/src/server/webhook/providers/stripe.ts

export interface StripeOpts {
  /** Stripe webhook signing secret (`whsec_...`). Pass an array to support key rotation. */
  secret: string | string[]
  /** Replay window in seconds. Default: 300. Throws if 0 (per Stripe docs). */
  toleranceSeconds?: number
}

export function stripe(opts: StripeOpts): VerifyFn

// packages/theo/src/server/webhook/providers/github.ts

export interface GithubOpts {
  /** GitHub webhook secret (configured per-repo in Settings -> Webhooks). Array supported for rotation. */
  secret: string | string[]
}

export function github(opts: GithubOpts): VerifyFn

// packages/theo/src/server/webhook/providers/slack.ts

export interface SlackOpts {
  /** Slack app signing secret (from App's "Basic Information" page). Array supported for the 24-hour rotation grace window. */
  signingSecret: string | string[]
  /** Replay window in seconds. Default: 300. Throws if 0. */
  toleranceSeconds?: number
}

export function slack(opts: SlackOpts): VerifyFn
```

**User-defined `verify` example (the escape hatch — covers Twilio, Resend, and arbitrary providers):**

```ts
import { defineWebhook } from 'theokit/server'
import twilio from 'twilio'

export const POST = defineWebhook({
  verify: async (req) => {
    const sig = req.headers.get('x-twilio-signature') ?? ''
    const formText = await req.text()
    const params = Object.fromEntries(new URLSearchParams(formText))
    const ok = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      sig,
      req.url,
      params,
    )
    return ok ? { ok: true } : { ok: false, reason: 'twilio.signature.invalid' }
  },
  handler: async (ctx) => {
    // ...
    return new Response('ok')
  },
})
```

### 9.4 Dependencies argument

Already covered in §6. The TL;DR:

- **Zero runtime deps.** All HMAC via Web Crypto, all constant-time via Node `crypto.timingSafeEqual` (fast path) + Hono-style string compare (Web fallback).
- **One dev dep:** `standardwebhooks` (~3 kB) for cross-validation only.
- **Bundle delta:** +2.5 kB gzipped to `theokit/server`. Default-template budget is 350 kB; current is 193.90 kB. Within budget.

### 9.5 Test strategy (BDD scenarios — TDD obligatory per `.claude/rules/testing.md`)

Every scenario is RED first, GREEN second, REFACTOR third. Test names follow Given-When-Then.

**`tests/unit/webhook-providers-stripe.test.ts`:**

| # | Scenario |
|---|---|
| S-1 | `should accept a signature generated with the same secret and within tolerance` |
| S-2 | `should reject when stripe-signature header is missing` |
| S-3 | `should reject when stripe-signature header has no v1=... entry` |
| S-4 | `should reject when timestamp is older than toleranceSeconds (300s default)` |
| S-5 | `should reject when timestamp is in the future beyond toleranceSeconds` |
| S-6 | `should accept when one of multiple v1=... entries matches (sender-side rotation)` |
| S-7 | `should accept when one of multiple secrets in array matches (receiver-side rotation)` |
| S-8 | `should reject when signature was generated over a different body` |
| S-9 | `should reject when signature was generated with the wrong secret` |
| S-10 | `should throw WebhookConfigurationError at construction when secret is empty string` |
| S-11 | `should throw WebhookConfigurationError at construction when toleranceSeconds is 0` |
| S-12 | `should produce identical signatures whether body is a string or Uint8Array` |
| S-13 | `should ignore v0=... legacy signatures (downgrade attack defense)` |
| S-14 | `should accept when stripe-signature has trailing garbage (,v1=potato) appended (Stripe test parity)` |

**`tests/unit/webhook-providers-github.test.ts`:**

| # | Scenario |
|---|---|
| G-1 | `should accept a signature generated with the same secret` |
| G-2 | `should reject when X-Hub-Signature-256 header is missing` |
| G-3 | `should reject when X-Hub-Signature-256 lacks the "sha256=" prefix` |
| G-4 | `should reject when signature is computed against a different body` |
| G-5 | `should accept when one of multiple secrets in array matches (receiver-side rotation)` |
| G-6 | `should NOT validate timestamp (GitHub does not sign timestamps)` |
| G-7 | `should expose X-GitHub-Delivery as ctx.deliveryId` |
| G-8 | `should handle ping event with empty-ish payload ({"zen":"..."}) just like any other` |

**`tests/unit/webhook-providers-slack.test.ts`:**

| # | Scenario |
|---|---|
| SL-1 | `should accept a signature generated with same secret within tolerance` |
| SL-2 | `should reject when X-Slack-Signature is missing` |
| SL-3 | `should reject when X-Slack-Request-Timestamp is missing` |
| SL-4 | `should reject when signature lacks v0= prefix` |
| SL-5 | `should reject when timestamp is older than toleranceSeconds (300s default)` |
| SL-6 | `should accept when one of multiple signing secrets in array matches` |
| SL-7 | `should reject when basestring construction differs (v0:ts:body must match exactly)` |
| SL-8 | `should compute correct signature when body contains form-encoded fields with colons in values` |

**`tests/unit/webhook-timing-safe.test.ts`:**

| # | Scenario |
|---|---|
| T-1 | `should return true for two identical hex strings` |
| T-2 | `should return false for hex strings of equal length but different content` |
| T-3 | `should return false for hex strings of different lengths without throwing` |
| T-4 | `should return true for two empty strings` (Hono parity, §3.4 test) |
| T-5 | `should use Node crypto.timingSafeEqual under Node runtime` |
| T-6 | `should fall back to constant-time string compare under simulated Web-only runtime` |

**`tests/unit/webhook-raw-body.test.ts`:**

| # | Scenario |
|---|---|
| R-1 | `should read the full body bytes byte-faithfully` |
| R-2 | `should respect maxBodyBytes and throw WebhookBodyTooLargeError when exceeded` |
| R-3 | `should reject early via Content-Length when declared size exceeds maxBodyBytes` |
| R-4 | `should decompress gzip-encoded request body before returning bytes` |
| R-5 | `should construct a fresh Request whose .text() returns identical raw bytes` |

**`tests/integration/define-webhook-raw-body.test.ts`:**

| # | Scenario (full request lifecycle) |
|---|---|
| I-1 | `should return 200 when a Stripe webhook is delivered with valid signature` |
| I-2 | `should return 401 when the signature is forged` |
| I-3 | `should return 401 when the timestamp is one hour old (replay attempt)` |
| I-4 | `should return 413 when body exceeds maxBodyBytes` |
| I-5 | `should expose ctx.rawBodyText with byte-identical content to what HMAC verified` |
| I-6 | `should auto-set csrf: false (webhook routes bypass CSRF) without user opting in` |
| I-7 | `should NOT invoke the handler when verify returns {ok: false}` |
| I-8 | `should log a warn-level message with reason on signature failure` |
| I-9 | `should propagate AbortSignal to ctx.signal at the 9s deadline (configurable)` |

**`tests/integration/webhook-cross-validation.test.ts` (dev-only):**

| # | Scenario |
|---|---|
| CV-1 | `should produce HMAC-SHA256 hex digests byte-identical to standardwebhooks npm package` |
| CV-2 | `should produce HMAC-SHA256 hex digests byte-identical to a Node crypto.createHmac reference` |

**Fixture pattern** (each of `fixtures/webhook-{stripe,github,slack}/`):

- `theo.config.ts` — minimal config
- `server/routes/webhooks/<provider>.ts` — `defineWebhook` callsite
- `tests/<provider>-roundtrip.test.ts` — fires a real signed request through the fixture app, asserts 200; fires forged request, asserts 401

### 9.6 Phases of rollout (sequenced)

**Phase A — Foundations (1.5d)**
- Implement `timing-safe-equal.ts` + tests T-1..T-6
- Implement `_internal/hmac.ts` + `_internal/hex.ts`
- Implement `raw-body.ts` + tests R-1..R-5
- No public API exported yet. RED → GREEN → REFACTOR each piece.

**Phase B — Stripe provider (1d)**
- Implement `providers/stripe.ts` per §7.1
- Tests S-1..S-14 (full Stripe test matrix from `stripe-node` cross-checked)
- Re-export from `providers/index.ts` (but NOT from `theokit/server` yet — gate on Phase D)

**Phase C — GitHub + Slack providers (1d combined — they're smaller)**
- Implement `providers/github.ts` + `providers/slack.ts` per §7.2 / §7.3
- Tests G-1..G-8, SL-1..SL-8

**Phase D — `defineWebhook` + executor integration (1.5d)**
- Implement `define-webhook.ts` + `webhook-types.ts`
- Modify `server/scan/scan-routes.ts` to detect `defineWebhook` callsites, register with `kind: 'webhook'`, `csrf: false` (closes EC-14)
- Modify `server/http/execute-route.ts` to branch for webhook kind:
  - Pre-read raw bytes via `raw-body.ts` (respecting `maxBodyBytes`)
  - Run `verify(request)` — 401 on failure (logged at `warn`)
  - Construct `WebhookContext`, mount fresh `Request` with rawBuffer body
  - Invoke handler with 9s `AbortSignal` deadline
- Integration tests I-1..I-9
- Add `defineWebhook`, `stripe`, `github`, `slack` to `theokit/server` public exports

**Phase E — Manifest + DevTools (0.5d)**
- Emit `.theo/webhooks.json` from build (`scan-routes.ts`)
- DevTools "Webhooks" tab (mirror of "Routes" tab) shows: route path, provider, last 50 received requests + signature verification result
- This is gated on closing Open Question §10.Q1 — see below

**Phase F — Fixtures + canonical demo + docs (2d)**
- Build 3 fixtures (`fixtures/webhook-stripe/`, `/webhook-github/`, `/webhook-slack/`)
- Wire `examples/full-stack-agent/server/webhooks/stripe.ts` — drives the chat tier-limit update on `customer.subscription.updated`
- Write `docs/concepts/webhooks.md` — usage, secret management, idempotency, troubleshooting
- Add a Playwright test exercising the example end-to-end (signed request from a fixture replay → handler invoked → revalidate fires)

**Total budget:** ~6.5 days of focused work — fits within the R0.5.10 scope envelope.

### 9.7 Acceptance criteria

- [ ] All unit + integration tests GREEN (S-*, G-*, SL-*, T-*, R-*, I-*, CV-*)
- [ ] Cross-validation test (CV-1) confirms byte-identical signatures vs `standardwebhooks` npm package
- [ ] Bundle delta < 3 kB gzipped (per §6 estimate); CI bundle gate (R0.5.3) passes
- [ ] `defineWebhook` route auto-receives `csrf: false` — no manual user action required (EC-14 closed)
- [ ] Three fixtures live + pass roundtrip tests
- [ ] `examples/full-stack-agent` ships a working Stripe webhook that updates user tier on `customer.subscription.updated`
- [ ] `docs/concepts/webhooks.md` includes: getting started, raw body invariant, secret rotation, idempotency, troubleshooting matrix, user-defined `verify` recipe (Twilio), Standard Webhooks recipe (Resend)
- [ ] All 16 edge cases (EC-1..EC-16) have at least one regression test
- [ ] CHANGELOG entry under `[Unreleased]` ⇒ `Added` (Keep a Changelog format per `.claude/CLAUDE.md` §6)

### 9.8 Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Timing attack via early-return in `timingSafeEqualHex` (length pre-check leaks) | Low (we wrote the fake-compare branch) | High (silent secret discovery) | §7.5 + test T-3 explicitly asserts no-throw on length mismatch AND adds a perf benchmark (R-6 to add) that the two branches' times are within 5%. |
| Body parser consumes the body before verify runs (EC-7 manifesting) | Medium (any middleware author can trigger) | High (false-negative verification, user disables verification "to make it work") | Webhook routes are a separate executor branch (`kind: 'webhook'` in scan), pre-reading bytes before any other consumer. Tested in I-1. |
| Key rotation operational complexity (user forgets to remove old secret after rotation) | Medium | Low (no security impact while both secrets valid; bundle grows by one secret per env var) | Documented in `docs/concepts/webhooks.md` under "Rotating a secret": remove the old secret from the array after the provider-specific grace window (24h for Slack, immediate for Stripe). Log at `info` level the index of the secret that matched, so users can grep for "always secret[0]" before removing secret[1]. |
| Wrong default tolerance (300s) breaks Mailgun-style 2-min senders | Low (Mailgun is not first-party) | Low | Per-provider override via `toleranceSeconds`. User-defined `verify` can pick any window. |
| Future deprecation of Node `crypto.timingSafeEqual` API surface | Very low | Low | Web-Crypto-only fallback is the primary path. Node fast path is a perf optimization. |
| Adoption confusion: "why do I need `defineWebhook` instead of `defineRoute` with `csrf: false`?" | Medium | Low (documentation issue, not technical) | Doc page leads with: "Use `defineWebhook` when you receive HMAC-signed POSTs from a third-party. The framework handles raw-body preservation, signature verification, CSRF exemption, and timeout." |
| Standard Webhooks (Svix) ecosystem grows fast, our delegation looks lazy | Medium | Low | Documented re-evaluation trigger in §3.12 — when 3+ TheoKit users ask for Resend support, ship `@theokit/webhook-standard`. |

---

## 10. Open questions (≥3 — required)

### Q1. Should webhook routes appear in the route manifest like crons + jobs (R0.5.7)?

**Today's posture:** Yes — the build emits `.theo/webhooks.json` listing path + provider name (per Phase E in §9.6). This mirrors what cron + job manifests look like (R0.5.7).

**Question:** Should the manifest include the **provider type** explicitly (`provider: 'stripe' | 'github' | 'slack' | 'custom'`) for tooling? Pro: enables a DevTools "Webhooks" tab that groups by provider, enables future static analysis like "warn if a Stripe webhook does not reference `STRIPE_WEBHOOK_SECRET` env var". Con: requires the `defineWebhook` factory to expose a `_providerName` on the returned `VerifyFn` (cosmetic API leak), and the "custom" bucket grows organically.

**Recommendation:** Ship the manifest with `path` and `kind: 'webhook'` only in Phase E. Re-evaluate the `provider` field after first 10 community webhooks land — if at least 7 use one of the 3 first-party helpers, add the field.

### Q2. Should we expose an Express-like middleware (`createWebhookMiddleware(opts)`) for users who want manual handling outside `defineWebhook`?

**Today's posture:** No. The locked design is a single primitive.

**Question:** When a user is migrating from Express/Fastify and has a verbose Stripe webhook handler with custom error mapping, do they need an escape hatch like `import { verifyStripeWebhook } from 'theokit/server'` (a function form) instead of `stripe()` (the factory form)? The user-defined `verify` escape hatch covers most cases, but for users who want to keep their existing handler shape and only borrow our verification logic, exposing the verifier as a standalone function would be one more degree of polish.

**Recommendation:** Defer. Ship `defineWebhook` only in 0.5.0. If 3+ community asks land, add `import { verifyStripeWebhook } from 'theokit/server/webhook'` as a 0.5.x patch (the implementation is already there; it's just one more export line).

### Q3. Should `defineWebhook` ship an opinionated idempotency layer (auto-dedup via `cache/revalidate`'s storage adapter), or leave dedup to the handler?

**Today's posture:** Leave to the handler. `ctx.deliveryId` is exposed; the user wires it into their own dedup (cache, DB, etc.).

**Question:** R0.5.5 (`defineJob` + queue) explicitly supports `enqueue(...inputs, { idempotencyKey })`. If the canonical webhook handler is "verify → enqueue", and the queue has an idempotency mechanism, then auto-dedup at the webhook layer is double-work. But if the handler does anything *besides* enqueue (write to DB, send notification), the queue's idempotency doesn't help. The cleanest framework primitive is `defineWebhook({ verify, dedupBy: (ctx) => ctx.deliveryId, handler: ... })` where `dedupBy` opts the handler into a 24-hour automatic dedup via the cache adapter, but adding `dedupBy` is a public API commitment.

**Recommendation:** Ship without `dedupBy` in 0.5.0. Document the manual dedup recipe in `docs/concepts/webhooks.md` (a 5-line `if (await cache.has(ctx.deliveryId)) return new Response('already processed')` snippet). Re-evaluate if 3+ users report duplicate processing pain.

### Q4. Should the framework throw OR log-and-skip when a webhook handler does NOT return a `Response`?

**Today's posture:** Throw (typed `WebhookHandlerError`). The contract is unambiguous: a webhook handler returns a `Response`.

**Question:** GitHub's docs say "respond with 2XX within 10 seconds" — a handler that returns `undefined` (returns implicitly) is a programming error but should the framework return a default `200 OK` to keep the provider happy? Pro: more forgiving DX. Con: silently masks bugs and the user thinks the handler ran when it might have errored before the implicit return.

**Recommendation:** Throw with a developer-facing message ("`defineWebhook` handler must return a `Response`. Did you forget to `return new Response('ok')`?"). Map the throw to `500 Internal Server Error` so the provider retries (this is the safer side-effect — the alternative of silent `200` causes lost events).

### Q5. Should `defineWebhook` integrate directly with `defineJob` enqueue as a first-class shortcut?

**Today's posture:** No — handler wires it manually (`await ctx.queue.enqueue(...)`).

**Question:** The dominant webhook pattern is "verify → enqueue → 200". Could we ship `defineWebhook({ verify, enqueue: 'process-stripe-event' })` as a sugar that auto-enqueues the body and returns 200?

**Recommendation:** Defer. This is sugar over the canonical handler; if 3+ community asks land after 0.5.0 ships, add `enqueueAs` as a 0.5.x patch. Avoiding it now prevents API expansion during the active design window.

---

## 11. Referências citadas

### Frameworks (`referencias/`)

- Next.js Stripe example route: `referencias/next.js/examples/with-stripe-typescript/app/api/webhooks/route.ts`
- Next.js Stripe SDK init: `referencias/next.js/examples/with-stripe-typescript/lib/stripe.ts`
- Next.js compiled `raw-body` (Pages Router legacy): `referencias/next.js/packages/next/src/compiled/raw-body/index.js`
- Fastify ecosystem docs (raw-body pointer): `referencias/fastify/docs/Guides/Ecosystem.md:578-579`
- Fastify content-type parser internals: `referencias/fastify/lib/content-type-parser.js`
- Fastify hooks lifecycle: `referencias/fastify/lib/hooks.js`
- Hono buffer utilities (constant-time + double-hash): `referencias/hono/src/utils/buffer.ts`
- Hono crypto utilities (Web Crypto digest, hex encoding): `referencias/hono/src/utils/crypto.ts`
- Hono JWT middleware (`importKey` pattern): `referencias/hono/src/middleware/jwt/jwt.ts:72-73`
- Hono Bearer Auth (consumer of `timingSafeEqual`): `referencias/hono/src/middleware/bearer-auth/index.ts:195-198`
- Hono Basic Auth (consumer of `timingSafeEqual`): `referencias/hono/src/middleware/basic-auth/index.ts:119-120`
- Hono buffer tests (timing-safe edge cases): `referencias/hono/src/utils/buffer.test.ts:33-40`
- Rails Mandrill ingress (HMAC-SHA1 + Base64): `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/mandrill/inbound_emails_controller.rb`
- Rails Mailgun ingress (HMAC-SHA256 + 2-min replay window): `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/mailgun/inbound_emails_controller.rb`
- Rails Mailgun tests (full BDD matrix): `referencias/rails/actionmailbox/test/controllers/ingresses/mailgun/inbound_emails_controller_test.rb`
- Rails Sendgrid ingress (Basic Auth — negative case): `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/sendgrid/inbound_emails_controller.rb`
- Rails Postmark ingress: `referencias/rails/actionmailbox/app/controllers/action_mailbox/ingresses/postmark/inbound_emails_controller.rb`
- Rails ActionMailbox routes (per-provider mount): `referencias/rails/actionmailbox/config/routes.rb`
- SvelteKit raw-body test fixture: `referencias/sveltekit/packages/kit/test/apps/basics/src/routes/load/raw-body.json/+server.js`
- Nitro cache docs (webhook-as-invalidation-trigger mention): `referencias/nitro/docs/1.docs/7.cache.md:333`

### TheoKit internal (verified on `develop`, 2026-05-24)

- `defineRoute` csrf opt-out doc: `packages/theo/src/server/define/define-route.ts:14-22`
- Existing `body-parser-web.ts` (the parser that webhook routes bypass): `packages/theo/src/server/body-parser-web.ts`
- Auth `crypto.ts` (precedent for `cachedWebCrypto` reference pattern): `packages/theo/src/server/auth/crypto.ts`
- Cache `revalidate.ts` (the canonical wiring target for webhooks): `packages/theo/src/cache/revalidate.ts:10` ("safe to call from a webhook")
- `defineAgentEndpoint` (the sibling primitive, also `defineRoute`-shaped): `packages/theo/src/server/define/define-agent-endpoint.ts`
- ADR-0005 webhook plugin-vs-class — locked in CLAUDE.md "Architectural decisions to land in 0.5.0" table
- Architecture rules v2 (module map, dependency direction): `.claude/rules/architecture.md`
- Type safety rules (Zod single source of truth, `z.infer<>`): `.claude/rules/type-safety.md`
- Testing rules (TDD obligatory, Given-When-Then BDD): `.claude/rules/testing.md`

### Web sources

- Stripe official webhook signing algorithm: <https://docs.stripe.com/webhooks/signatures>
- Stripe webhooks overview (retries, idempotency, events): <https://docs.stripe.com/webhooks>
- `stripe-node` `Webhooks.ts`: <https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts>
- `stripe-node` `Webhook.spec.ts` (test cases): <https://github.com/stripe/stripe-node/blob/master/test/Webhook.spec.ts>
- GitHub webhook signature validation: <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries>
- GitHub webhook best practices (idempotency via `X-GitHub-Delivery`, 10s response SLA): <https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks>
- Slack request verification: <https://docs.slack.dev/authentication/verifying-requests-from-slack>
- bolt-js `verify-request.ts` (5-min tolerance constant, `v0:ts:body` basestring, `tsscmp` constant-time compare): <https://github.com/slackapi/bolt-js/blob/main/src/receivers/verify-request.ts>
- Twilio webhook security (HMAC-SHA1, URL+form-params signing): <https://www.twilio.com/docs/usage/webhooks/webhooks-security>
- Resend webhooks (Svix-based): <https://resend.com/docs/dashboard/webhooks/introduction>
- Svix verification algorithm: <https://docs.svix.com/receiving/verifying-payloads/how>
- Standard Webhooks specification: <https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md>
- Node `crypto.timingSafeEqual` docs: <https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b>
- Web Crypto `SubtleCrypto.verify`: <https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify>
- Web Crypto `SubtleCrypto.sign`: <https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign>
- Hono Stripe webhook example: <https://hono.dev/examples/stripe-webhook>
- `hono-stripe-webhook-middleware-lite` (zero-dep, Web Crypto only): <https://github.com/nakanoasaservice/hono-stripe-webhook-middleware-lite>
- Cloudflare Workers HMAC signing example: <https://developers.cloudflare.com/workers/examples/signing-requests/>
- Hookray webhook signature verification 2026 guide (raw body + timingSafeEqual patterns): <https://hookray.com/blog/webhook-signature-verification-2026>
- Hookray Stripe webhook best practices 2026 (key rotation + body limit): <https://hookray.com/blog/stripe-webhook-best-practices-2026>
- Hermes Agent docs (webhook ingress reference for the agent-app use case): <https://github.com/mudrii/hermes-agent-docs/blob/main/user-guide/messaging/webhooks.md>
- Snyk advisor on `raw-body` (body-size limit rationale): <https://snyk.io/advisor/npm-package/raw-body>
- RFC 6234 (HMAC-SHA256 spec): <https://www.rfc-editor.org/rfc/rfc6234>
