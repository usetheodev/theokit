# Reference: OAuth/OIDC Delegation Strategy in Web Frameworks

**Date:** 2026-05-19
**Depth:** exhaustive
**Frameworks analyzed:**
- Next.js (canonical "delegate to libraries" model — 12 recommended libs, ships nothing)
- Remix 3.0.0-beta (aggressive "bundle providers" model — 9 built-in providers + protocol primitives)
- SvelteKit (light delegation — Better Auth via CLI + Lucia guide)
- Hono (utility-only — `basic-auth` HTTP header helper, no OAuth)
- Nitro (zero — example only)
- Fastify (zero — Ecosystem page lists external libs)
- Astro (zero in repo)
- Rails (generator model — scaffolds code into user's project)

**TheoKit package affected:** `packages/theo/src/server/` (potential new modules: `oauth-pkce.ts`, `oidc-discovery.ts`, `oauth-state.ts`), `docs/concepts/auth-providers.md` (NEW), ADR D-AUTH-DELEGATION
**Related references:**
- `.claude/knowledge-base/reference/server-components-rsc.md` — same DEFERRED-with-named-triggers shape
- `.claude/knowledge-base/reference/devtools.md` — same prior-art audit methodology

---

## 1. Problem statement

- **What:** TheoKit ships session primitives (`createSessionManager`, AES-256-GCM, HttpOnly cookies), CSRF strict mode, rate limit, and `requireAuth()` type-narrowing. It does NOT ship OAuth/OIDC integration. The user picks Auth.js, Lucia, NextAuth, Iron Session, Clerk, or builds custom.
- **Current state:** No documentation of the boundary. README mentions "Sessions that just work" but not "and here's how to add Google login." A user landing on TheoKit cold has zero guidance for "I need login with Google."
- **Why now:** Security audit (this conversation) identified OAuth/OIDC as a documented gap. User explicitly agreed delegation is the right call ("OAuth/OIDC built-in — delegado a libs externas — design, não bug"). The plan now needs (a) an ADR locking the decision, (b) a docs page surfacing the recommendation, (c) optional standards-level helpers (PKCE/state/discovery) that libs and DIY users both consume.

## 2. Inventário completo de arquivos (mandatório)

### Next.js — canonical "delegate" model

#### Core
| File | Category | Read in full? | Anchored in |
|---|---|---|---|
| `referencias/next.js/docs/01-app/02-guides/authentication.mdx` | doc | ✅ (read in full, ~700 LOC) | §3.1, §4 (delegation pattern) |
| `referencias/next.js/docs/02-pages/02-guides/authentication.mdx` | doc | skim only | §3.1 (mirror of app-router doc) |
| `referencias/next.js/examples/auth/` | example | skim — sample auth flow with Iron Session + Passport.js | §3.1 |
| `referencias/next.js/examples/with-clerk/` | example | skim — full Clerk integration | §3.1 |
| `referencias/next.js/examples/with-auth0/` | example | discarded — equivalent shape to with-clerk | §2.discarded |
| `referencias/next.js/examples/with-iron-session/` | example | skim — Iron Session integration | §3.1 |
| `referencias/next.js/scripts/release-github-auth.js` | discard | unrelated — used by Next.js's own release pipeline to auth against GitHub | §2.discarded |
| `referencias/next.js/examples/cms-umbraco/types/author.ts` | discard | false positive — `author.ts` (CMS author type), not auth | §2.discarded |
| `referencias/next.js/examples/api-routes-apollo-server-and-client-auth/lib/auth.ts` + `auth-cookies.ts` | example | skim — JWT cookie example pattern | §3.1 |

Next.js's `authentication.mdx` recommends **12 third-party libraries** (full list in §3.1) — zero shipped code.

#### Remix 3.0.0-beta — full bundled providers

##### Core
| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/remix/packages/auth/README.md` | doc | — | ✅ (positioning + API surface) | §3.2 |
| `referencias/remix/packages/auth/src/lib/provider.ts` | core | ~ 400 | partial (interfaces deep-read, body skimmed) | §3.2, §4.1 (OAuthProvider type shape) |
| `referencias/remix/packages/auth/src/lib/providers/oidc.ts` | core | ~ 350 | partial (interfaces + ctor) | §3.2 (OIDC discovery + base impl) |
| `referencias/remix/packages/auth/src/lib/providers/github.ts` | core | ~ 200 | partial (signature + scope defaults) | §3.2 (concrete provider shape) |
| `referencias/remix/packages/auth/src/lib/providers/google.ts` | core | — | skim — same shape as github | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/microsoft.ts` | core | — | skim — same shape as github | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/okta.ts` | core | — | skim | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/auth0.ts` | core | — | skim — OIDC profile | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/facebook.ts` | core | — | skim | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/x.ts` | core | — | skim — Twitter/X OAuth 2.0 | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/atmosphere.ts` | core | — | skim — Bluesky's AT Protocol auth | §3.2 |
| `referencias/remix/packages/auth/src/lib/providers/credentials.ts` | core | — | skim — username/password flow | §3.2 |
| `referencias/remix/packages/auth/src/lib/start-external-auth.ts` | core | — | skim (PKCE + state token + redirect) | §3.2, §4.2 |
| `referencias/remix/packages/auth/src/lib/finish-external-auth.ts` | core | — | skim (callback handler + token exchange) | §3.2, §4.2 |
| `referencias/remix/packages/auth/src/lib/refresh-external-auth.ts` | core | — | skim (refresh token exchange) | §3.2 |
| `referencias/remix/packages/auth/src/lib/complete-auth.ts` | core | — | skim (session id rotation after login) | §3.2, §4.3 |
| `referencias/remix/packages/auth/src/lib/verify-credentials.ts` | core | — | skim (parse + verify submitted credentials) | §3.2 |
| `referencias/remix/packages/auth/src/lib/utils.ts` | support | — | partial (PKCE code challenge helper) | §3.2, §7.1 |
| `referencias/remix/packages/auth/package.json` | doc | — | ✅ | §6 (deps) |
| `referencias/remix/packages/auth/CHANGELOG.md` | doc | — | grep "fix" | §8 |
| `referencias/remix/packages/auth-middleware/README.md` | doc | — | ✅ | §3.2 (request-time auth resolution) |
| `referencias/remix/packages/auth-middleware/src/lib/auth.ts` | core | — | partial | §3.2 |
| `referencias/remix/packages/auth-middleware/src/lib/require-auth.ts` | core | — | partial | §3.2 |
| `referencias/remix/packages/remix/src/auth.ts` | core | — | ✅ (re-exports `@remix-run/auth`) | §3.2 (umbrella export shape) |
| `referencias/remix/packages/remix/src/auth-middleware.ts` | core | — | ✅ (re-exports `@remix-run/auth-middleware`) | §3.2 |
| `referencias/remix/packages/remix/src/auth/README.md` | doc | — | skim | §3.2 |
| `referencias/remix/packages/remix/src/auth-middleware/README.md` | doc | — | skim | §3.2 |
| `referencias/remix/packages/auth/.changes/major.auth-middleware-context-helper-renames.md` | doc | — | skim | §8 (recent rename for clarity) |

##### Support (test files — informational, not deep-read for impl)
| File | Category | Reason |
|---|---|---|
| `referencias/remix/packages/auth/src/lib/oauth-flow.integration.test.ts` | test | Full OAuth flow integration test — confirms the API works end-to-end with mock provider; useful for cataloguing tested edge cases (§8) |
| `referencias/remix/packages/auth/src/lib/providers/{github,google,microsoft,okta,auth0,facebook,x,atmosphere,oidc,credentials}.test.ts` | test | Per-provider unit tests — confirm the per-provider parse/scope/endpoint details (§8) |
| `referencias/remix/packages/auth/src/lib/{verify-credentials,complete-auth,start-external-auth,finish-external-auth,refresh-external-auth}.test.ts` | test | Top-level primitive tests (§8) |
| `referencias/remix/packages/auth/src/lib/test-utils.ts` | support | Test helpers (mock provider builder) — irrelevant to impl plan |

#### SvelteKit — light delegation

| File | Category | Read in full? | Anchored in |
|---|---|---|---|
| `referencias/sveltekit/documentation/docs/40-best-practices/03-auth.md` | doc | ✅ (short — ~40 LOC) | §3.3 |

SvelteKit ships **zero auth code**. The Svelte CLI has an option to install **Better Auth**; the doc page also recommends **Lucia** for DIY session-based auth.

#### Hono — utility only

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/hono/src/utils/basic-auth.ts` | core | — | partial | §3.4 (HTTP Basic auth header only — NOT OAuth) |

Hono ships only **HTTP Basic auth** (RFC 7617) header helper. No OAuth/OIDC/session at all.

#### Nitro — zero

| File | Category | Read? | Reason |
|---|---|---|---|
| `referencias/nitro/examples/middleware/server/middleware/auth.ts` | example | skim | Demonstration middleware that reads a header — not auth library |
| `referencias/nitro/docs/2.deploy/20.providers/aws-amplify.md` | doc | discard | "auth" hit was for AWS Amplify cloud provider, not auth library | §2.discarded |

#### Fastify — zero

| File | Category | Read? | Reason |
|---|---|---|---|
| `referencias/fastify/docs/Guides/Ecosystem.md` | doc | grep "auth" | Lists `@fastify/jwt`, `@fastify/auth`, `@fastify/oauth2` as ecosystem libs — Fastify itself ships nothing | §3.5 |

#### Astro — zero

(No hits in `referencias/astro` for OAuth/OIDC — searched.)

#### Rails — generator-based

| File | Category | Read in full? | Anchored in |
|---|---|---|---|
| `referencias/rails/railties/lib/rails/generators/rails/authentication/authentication_generator.rb` | core | ✅ | §3.6 (generator orchestrator) |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/models/session.rb.tt` | template | ✅ | §3.6 (scaffolded session model — ActiveRecord, ~ 3 LOC) |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/models/user.rb.tt` | template | skim | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/models/current.rb.tt` | template | skim — `Current.user` ActiveSupport CurrentAttributes pattern | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/controllers/sessions_controller.rb.tt` | template | skim — login/logout actions | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/controllers/concerns/authentication.rb.tt` | template | skim — `require_authentication` controller concern | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/controllers/passwords_controller.rb.tt` | template | skim — password reset flow | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/mailers/passwords_mailer.rb.tt` | template | skim — password reset email | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/channels/application_cable/connection.rb.tt` | template | skim — ActionCable auth | §3.6 |
| `referencias/rails/railties/lib/rails/generators/rails/authentication/USAGE` | doc | skim — `rails generate authentication` docstring | §3.6 |
| `referencias/rails/actionpack/lib/action_controller/metal/request_forgery_protection.rb` | doc/core | discard | CSRF module, not OAuth | §2.discarded |
| `referencias/rails/actionpack/CHANGELOG.md` | doc | grep | Changelog mentions only password/session/cookie history — no OAuth | §8 |
| `referencias/rails/actioncable/lib/action_cable/connection/authorization.rb` | core | discard | ActionCable authorization rejection helper, not OAuth | §2.discarded |

Rails scaffolds **password-based session auth** via `rails generate authentication`. OAuth is delegated to **OmniAuth** (separate gem, not in Rails repo).

### Arquivos avaliados e descartados (com motivo)

| File | Why discarded |
|---|---|
| `referencias/next.js/scripts/release-github-auth.js` | Unrelated — Next.js release pipeline's own GitHub token authenticator |
| `referencias/next.js/examples/cms-umbraco/types/author.ts` | False positive — `author.ts` is a CMS post-author type, not an auth file |
| `referencias/next.js/examples/with-auth0/`, `with-supabase`, `with-stytch`, etc. | Same shape as `with-clerk` — provider-specific integration examples. One example is enough to characterize the delegation pattern |
| `referencias/nitro/docs/2.deploy/20.providers/aws-amplify.md` | "auth" hit was for AWS Amplify managed cloud, not an auth library |
| `referencias/rails/actionpack/lib/action_controller/metal/request_forgery_protection.rb` | CSRF protection module — adjacent topic but not OAuth |
| `referencias/rails/actioncable/lib/action_cable/connection/authorization.rb` | ActionCable WebSocket auth — `reject_unauthorized_connection`, not OAuth |
| `referencias/rails/actionpack/lib/action_controller/metal/http_authentication.rb` | HTTP Basic/Digest/Token auth helpers — not OAuth |
| `referencias/rails/activerecord/test/models/author_encrypted.rb` | Test fixture model — `author` (book author), not auth |
| `referencias/remix/packages/auth/src/lib/providers/{...}.test.ts` (× 10) | Per-provider unit tests — informational for §8 edge cases but not impl-source |
| `referencias/remix/packages/auth/src/lib/{...}.test.ts` (× 5) | Top-level primitive tests — same |
| `referencias/remix/packages/auth/src/lib/test-utils.ts` | Mock provider builder for tests, not framework code |
| `referencias/remix/packages/route-pattern/bench/patterns/mediarss.ts` | False positive — `authors` field in RSS pattern bench fixture |

## 3. Prior art — deep dive por framework

### 3.1 Next.js — canonical "delegate to libraries"

#### API pública
**Nothing.** Next.js ships no auth code. The `authentication.mdx` doc is a tutorial showing how to wire Server Actions + cookies + DAL pattern, plus a list of recommended libraries.

#### Recommended libraries (from `docs/01-app/02-guides/authentication.mdx`)

**12 auth providers** recommended by Next.js:

| Library | URL | Type |
|---|---|---|
| Auth0 | `auth0.com/docs/quickstart/webapp/nextjs` | Hosted IdP |
| Better Auth | `better-auth.com/docs/integrations/next` | Self-host OSS |
| Clerk | `clerk.com/docs/quickstarts/nextjs` | Hosted IdP |
| Descope | `docs.descope.com/getting-started/nextjs` | Hosted IdP |
| Kinde | `kinde.com/docs/developer-tools/nextjs-sdk` | Hosted IdP |
| Logto | `docs.logto.io/quick-starts/next-app-router` | Self-host or hosted |
| NextAuth.js (Auth.js) | `authjs.dev/getting-started/installation?framework=next.js` | Self-host OSS |
| Ory | `ory.sh/docs/getting-started/integrate-auth/nextjs` | Hosted or self-host |
| Stack Auth | `docs.stack-auth.com/getting-started/setup` | Hosted |
| Supabase | `supabase.com/docs/guides/getting-started/quickstarts/nextjs` | Hosted (BaaS) |
| Stytch | `stytch.com/docs/guides/quickstarts/nextjs` | Hosted IdP |
| WorkOS | `workos.com/docs/user-management/nextjs` | Hosted (enterprise SSO) |

**2 session libraries** recommended:
- Iron Session — `github.com/vvo/iron-session`
- Jose — `github.com/panva/jose`

#### Algoritmo interno (the recommended pattern)

Next.js's auth doc tells users to:
1. Capture credentials via `<form action={serverAction}>`
2. Validate via Zod schema in the Server Action
3. Hash password via `bcrypt` / `argon2`
4. Issue a session cookie (Iron Session / jose JWT)
5. Protect routes via DAL pattern (`getSession()` called in every protected component/route)

#### Side effects observáveis
None — Next.js doesn't ship any auth code.

#### Padrão de design
- **Pattern: Tutorial + Curated Library List.** Frame as "here's how to think about auth + here are 12 libraries that solve it for you."

### 3.2 Remix 3.0.0-beta — bundled providers

#### API pública
`packages/auth/README.md:14-23` defines the 5 primitives:

```ts
// Browser-side auth flow (login routes)
import { verifyCredentials, startExternalAuth, finishExternalAuth,
         refreshExternalAuth, completeAuth } from 'remix/auth'

// Built-in providers
import { createGitHubAuthProvider, createGoogleAuthProvider,
         createMicrosoftAuthProvider, createOktaAuthProvider,
         createAuth0AuthProvider, createFacebookAuthProvider,
         createXAuthProvider, createAtmosphereAuthProvider,
         createOIDCAuthProvider, createCredentialsAuthProvider } from 'remix/auth'

// Request-time auth (route protection)
import { auth, createSessionAuthScheme, createBearerTokenAuthScheme,
         createApiKeyAuthScheme, requireAuth } from 'remix/auth-middleware'
```

10 concrete providers + 1 OIDC base + 1 credentials provider. Three request-time auth schemes (session, bearer, API key).

#### Algoritmo interno (passo a passo — OAuth external login)

1. **Route handler calls `startExternalAuth(provider, context)`** (`packages/auth/src/lib/start-external-auth.ts`):
   - Generates PKCE `code_verifier` + `code_challenge` (`utils.ts:createCodeChallenge`)
   - Generates anti-CSRF `state` token
   - Stores `{state, codeVerifier, returnTo}` in session as transaction
   - Builds authorization URL via `provider.createAuthorizationURL({redirectUri, scope, state, codeChallenge})`
   - Returns `Response` with `Location: <provider authorize URL>` redirect
2. **Browser redirects to provider**, user logs in, provider redirects back to `redirectUri?code=...&state=...`
3. **Callback route calls `finishExternalAuth(provider, context)`** (`finish-external-auth.ts`):
   - Reads stored transaction from session
   - Verifies `state` matches (CSRF check)
   - Calls `provider.exchangeAuthorizationCode({code, codeVerifier})` → tokens
   - Calls `provider.getProfile(tokens)` → normalized profile
   - Clears the stored transaction
   - Returns `{result: {provider, account, profile, tokens}, returnTo}`
4. **Route handler calls `completeAuth(context)`** (`complete-auth.ts`):
   - Rotates session ID (security best practice — prevents session fixation)
   - Returns the new session for the handler to write the user record into

#### Algoritmo interno (passo a passo — credentials login)

1. Route handler reads form data, calls `verifyCredentials(provider, context)` (`verify-credentials.ts`):
   - Calls `provider.parse(context)` to extract `{email, password}` from form
   - Calls `provider.verify({email, password})` to check against DB + hash compare
   - Returns the auth result (or `null`)
2. If non-null, calls `completeAuth(context)` to rotate the session ID

#### Estado mantido

- **In session**: in-progress OAuth transactions (state + codeVerifier + returnTo) stored at `session.get('auth:transaction')`
- **Per-provider closures**: configuration captured at boot via factory call (`createGitHubAuthProvider({clientId, clientSecret, redirectUri, scopes})`). The returned provider object closes over these values; no env-var reading at runtime.
- **Request-time `context.auth`**: populated by `auth({schemes})` middleware before route handlers run. Cleared/invalidated by `invalidate` callback (e.g., `session.unset('auth')` on logout).

#### Dependências externas usadas

| Lib | Provider impl | Function | TheoKit decision |
|---|---|---|---|
| `@remix-run/fetch-router` | all | Routing primitive (their fetch-based router) | N/A — TheoKit has its own router |
| native `crypto.subtle` | utils | PKCE code challenge SHA-256 | **Adopt** — Web Crypto, no dep |
| native `fetch` | providers | Token exchange, userinfo, JWKS | **Adopt** — Web standard |
| (none for JWT verify) | `oidc.ts` | They verify `id_token` claims by fetching JWKS and validating signature, NOT via a JWT lib | **Avoid bundling jose** — Remix demonstrates this works pure |

**Notable absence:** Remix's `packages/auth/` ships ZERO npm deps for OAuth. All HTTP, crypto, JSON parsing is via Web Standards. The provider implementations are pure protocol code.

#### Side effects observáveis
- Mutates session at `session.set('auth:transaction', {...})` during `startExternalAuth`
- Mutates session at `session.unset('auth:transaction')` after `finishExternalAuth`
- Rotates session ID (calls underlying session store's `regenerateId()`) in `completeAuth`

#### Padrão de design
- **Pattern A: Provider factory closures over config** — `createGitHubAuthProvider({clientId, clientSecret, redirectUri})` returns a frozen provider object. Boot-time validation surfaces missing env vars immediately.
- **Pattern B: Split primitives between `auth` (login flow) and `auth-middleware` (request resolution)**. Login routes use the former. Request handlers depend on the latter via `context.auth`.
- **Pattern C: PKCE + state mandatory for all OAuth providers**, not optional. No "legacy mode" — even providers that don't require PKCE (like GitHub) use it.
- **Pattern D: ID token verification via JWKS fetch, not bundled JWT lib**.

#### TODOs / FIXMEs / HACKs literais
> (None found in the deep-read of `provider.ts` and `oidc.ts` — code is mature.)

### 3.3 SvelteKit — light delegation

From `documentation/docs/40-best-practices/03-auth.md`:

> **Libraries:** The Svelte CLI gives the option to set up Better Auth with a new project or add it to an existing project.
> **Guides:** If you'd like to implement your own auth system, the Lucia auth guide provides a reference for session-based web app auth with SvelteKit examples.

#### Padrão de design
- **Pattern E: CLI-driven setup wizard** — `npx svelte add better-auth` or similar. The framework doesn't ship Better Auth's code, but the CLI knows how to install it.
- **Pattern F: Linked DIY guide** — pointer to `lucia-auth.com` for users who want to learn rather than install.

### 3.4 Hono — utility only

`src/utils/basic-auth.ts` is the ONLY auth-related file in Hono. It's a ~ 50-LOC HTTP Basic Auth header helper (RFC 7617). Used like:

```ts
import { basicAuth } from 'hono/basic-auth'
app.use('/admin/*', basicAuth({ username: process.env.ADMIN_USER!, password: process.env.ADMIN_PASS! }))
```

No session, no OAuth, no OIDC, no JWT. Hono is an unopinionated HTTP framework — auth is fully delegated. Their docs page (separate from repo) recommends `hono/jwt` middleware (in-repo) + external libs.

#### Padrão de design
- **Pattern G: Ship ONE protocol primitive (Basic Auth, HTTP standard)** and stop. Everything else is user's choice.

### 3.5 Fastify — Ecosystem catalog

`docs/Guides/Ecosystem.md` lists fastify-maintained plugins:
- `@fastify/jwt` — JWT verification
- `@fastify/auth` — composable auth middleware
- `@fastify/oauth2` — OAuth 2.0 helper
- `@fastify/passport` — Passport.js integration

These are NPM-published but live in `fastify-contrib` orgs, not bundled in the core `fastify` package.

#### Padrão de design
- **Pattern H: Sibling-org maintained plugins** — same author, distinct npm packages. Users pick what they need. Core stays lean.

### 3.6 Rails — generator model

`rails generate authentication` (`authentication_generator.rb:13-40`) creates:

- `app/models/session.rb` — ActiveRecord `Session belongs_to :user`
- `app/models/user.rb` — User model with `has_secure_password`
- `app/models/current.rb` — `Current.user` via ActiveSupport CurrentAttributes
- `app/controllers/sessions_controller.rb` — `new`/`create`/`destroy` actions
- `app/controllers/concerns/authentication.rb` — `require_authentication` callback
- `app/controllers/passwords_controller.rb` — password reset flow
- `app/mailers/passwords_mailer.rb` + 2 templates — password reset email
- `app/channels/application_cable/connection.rb` — ActionCable auth (if installed)

**NO OAuth.** The Rails generator scaffolds password-based session auth. OAuth is delegated to **OmniAuth** (separate gem ecosystem with 100+ provider strategies).

#### Padrão de design
- **Pattern I: Code generation into user repo** — user OWNS the auth code after `rails generate`. Framework provides scaffolding only.
- **Pattern J: Password is in core; OAuth is delegated** — Rails maintainers don't want to keep up with OAuth provider deltas; OmniAuth's community handles that.

## 4. Convergent patterns (todos concordam)

| # | Pattern | Adopted by | Why it works | TheoKit decision |
|---|---|---|---|---|
| **4.1** | **OAuth provider implementations should NOT live in framework core** | Next.js (delegated to libs), SvelteKit (delegated to Better Auth), Fastify (sibling-org plugins), Hono (none shipped), Rails (delegated to OmniAuth), Astro (none) | OAuth providers have constant deltas (scope changes, endpoint moves, breaking auth flow updates). A framework maintainer trying to keep up with 10 providers' quirks is signing up for an unbounded maintenance commitment. Specialist libs (Auth.js, OmniAuth, NextAuth) are the right home. | **Adopt — DO NOT bundle providers.** |
| **4.2** | **Session is in scope; OAuth is out** | Every framework that ships any auth code: Next.js (cookie API), Remix (cookie + session-storage in core), SvelteKit (cookie API), Rails (Session model). | Sessions are a primitive that lives in HTTP/cookie semantics — stable, framework-shaped. OAuth is a domain (providers, flows, scopes) — library-shaped. | **Already done** — TheoKit ships `createSessionManager` AES-256-GCM. ✅ |
| **4.3** | **Documentation MUST surface recommended libraries** | Next.js (12 libs listed), SvelteKit (Better Auth + Lucia), Rails (OmniAuth in guides), Fastify (Ecosystem page) | Without an opinionated recommendation, users are paralyzed by choice. Framework docs are the right place to opine ("we recommend X for OSS, Y for hosted"). | **TODO** — TheoKit has no auth-providers docs page. |
| **4.4** | **Ship the protocol-stable primitives (PKCE, state token, OIDC discovery), NOT the provider-specific code** | Remix's `utils.ts:createCodeChallenge` (PKCE), `oidc.ts` (discovery). Hono's `basic-auth.ts` (HTTP Basic — protocol-stable). | RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), and OIDC Discovery don't churn. Provider implementations DO. Stable primitives are a framework concern; unstable surface is a library concern. | **Adopt** — ship `oauth-pkce.ts`, `oauth-state.ts`, `oidc-discovery.ts` as standards-level helpers. NOT bundling providers. |
| **4.5** | **Session ID rotation on successful login is mandatory** | Remix's `completeAuth(context)` rotates session ID after both credentials and OAuth flows (`complete-auth.ts`). Rails' `sessions_controller.rb` regenerates session via `reset_session`. | OWASP A07:2021 — Identification & Authentication Failures: session fixation is a real attack class. Rotation on auth state change is the canonical mitigation. | **TODO** — TheoKit's `createSessionManager` doesn't expose a rotate API. Adjacent gap. |

## 5. Divergent patterns (real trade-offs)

| # | Decision | Options | TheoKit choice |
|---|---|---|---|
| **5.1** | **Bundle providers, or delegate?** | **Remix 3** bundles 9 concrete providers + OIDC base. They take on the maintenance cost in exchange for tight integration. **Next.js, SvelteKit, Hono, Fastify, Astro, Rails** all delegate to specialist libs. | **Delegate** — TheoKit is single-maintainer; bundling 10 providers is signing up for unsustainable maintenance. Next.js/SvelteKit model. |
| **5.2** | **Scaffold code into user repo (Rails generator), or recommend npm install (Next/SvelteKit)?** | **Rails** scaffolds. User owns the code afterwards — no upgrade contract. **Next/SvelteKit/etc.** point to npm libs. Library author owns upgrade contract. | **Recommend npm install (Auth.js / Better Auth / Lucia).** TheoKit doesn't have a CLI scaffold infrastructure yet (the only scaffolder is `create-theokit`, which creates apps not features). Adding `theokit generate auth` is out-of-scope for this plan. |
| **5.3** | **OAuth + Session in the same package, or split?** | **Remix** splits: `remix/auth` (login flow) + `remix/auth-middleware` (request-time). **Rails** unifies into one generator. | **No new packages** — TheoKit ships protocol primitives in `packages/theo/src/server/oauth-*` (alongside `session.ts`). Auth libs (Auth.js et al.) are the ones who decide their own package boundaries. |
| **5.4** | **PKCE mandatory or optional?** | Remix: **mandatory for all providers** (no opt-out). Older OAuth libs allow opt-out for legacy providers. | **Mandatory.** If we ship a PKCE helper at all, it's the default. Legacy providers without PKCE either pass the verifier as `null` or use a different code path entirely. |
| **5.5** | **ID token verification — bundle a JWT lib (jose) or roll your own JWKS fetch?** | Remix: **roll JWKS fetch + signature verify by hand** (no `jose` dep). Next.js (in their auth doc tutorial): recommends `jose`. | **Recommend `jose` in docs, don't bundle.** If user's auth lib already brings `jose` (Auth.js does), there's no point shipping a second copy. |
| **5.6** | **2FA/MFA — primitives in framework, full flow in library, or fully out?** | Remix: **out** (no TOTP/backup codes shipped). Next.js: **out** (recommends libs that do it). Rails: **out** (recommends `rotp` gem). | **Primitives in TheoKit, full flow in user code/lib.** TOTP (RFC 6238) is a stable algorithm — fits the §4.4 pattern. We ship `generateTotp`/`verifyTotp` + backup codes. We do NOT ship the UX (enroll flow, recovery flow). |

## 6. Dependency inventory — bibliotecas comuns

Convergent libs (recommended by 2+ frameworks):

| Lib | Recommended by | Function | TheoKit decision |
|---|---|---|---|
| **Auth.js (NextAuth)** | Next.js (officially), used in Remix ecosystem too | Full OAuth/OIDC flows, 100+ providers, JWT/session abstraction | **Recommend in docs**. Tested integration example. |
| **Better Auth** | Next.js (officially), SvelteKit (officially via CLI) | Modern OSS auth library, TypeScript-first | **Recommend in docs**. Maintainer is active, scope is right (no IdP overreach). |
| **Lucia** | Next.js (linked guide), SvelteKit (guides) | DIY session-based auth reference (more of a guide than a library now post-deprecation) | **Mention in docs but flag the maintenance status** — Lucia v3 was officially deprecated in 2025; users should NOT new-adopt. Use Better Auth instead. |
| **Iron Session** | Next.js (session library list) | Stateless cookie-based session (alternative to TheoKit's built-in) | **Do not recommend** — TheoKit already ships `createSessionManager`. Iron Session is the alternative if user doesn't want our session. |
| **jose** | Next.js, Remix (mentioned), virtually every JWT lib | JWT sign/verify, JWK ops | **Recommend in docs** when user implements OAuth manually (e.g., custom OIDC). |
| **Clerk / Auth0 / WorkOS / Stytch / Stack Auth** | Next.js | Hosted IdPs | **Mention in docs as "hosted alternatives"** for users who want zero auth infra. |

**Conclusion: TheoKit ships ZERO new npm deps for OAuth.** Standards-level helpers use Web Crypto + native fetch.

## 7. Algorithms / data structures não-óbvios

### 7.1 PKCE code challenge (RFC 7636)

Remix's `utils.ts:createCodeChallenge`:

```ts
// 1. Generate a random 43-128 char code_verifier (URL-safe base64)
// 2. SHA-256 the verifier
// 3. URL-safe base64-encode the hash → code_challenge
// 4. code_challenge_method = 'S256'

const verifier = generateUrlSafeBase64(32) // 43 chars
const challenge = base64url(sha256(verifier))
```

Complexity: O(1). Web Crypto's `crypto.subtle.digest('SHA-256', ...)` is the only primitive needed.

**TheoKit shape:**
```ts
export async function generatePkceChallenge(): Promise<{
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
}>
```

### 7.2 OIDC Discovery (`/.well-known/openid-configuration`)

Remix's `oidc.ts:fetchMetadata`:

```ts
const metadataUrl = new URL('.well-known/openid-configuration', issuer)
const metadata: OIDCAuthProviderMetadata = await fetchJson(metadataUrl)
// metadata.authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, ...
```

Caches metadata in module scope by `issuer` URL. Avoids re-fetching on every callback.

**TheoKit shape:**
```ts
export async function discoverOidcProvider(issuer: string | URL): Promise<OidcMetadata>
```

### 7.3 ID Token verification via JWKS fetch

Remix's `oidc.ts:verifyIdToken`:

```ts
// 1. Parse JWT header → kid (key ID)
// 2. Fetch JWKS from metadata.jwks_uri (cached)
// 3. Find key matching kid
// 4. Verify signature via crypto.subtle.verify('RSASSA-PKCS1-v1_5' | 'ECDSA', ...)
// 5. Verify claims: iss === issuer, aud === clientId, exp > now, iat < now + leeway
```

**TheoKit decision: do NOT ship this.** Pure protocol code but heavy (~ 200 LOC + JWKS cache). Users doing OIDC manually should reach for `jose`. Document this in the boundary ADR.

### 7.4 TOTP (RFC 6238)

Standard algorithm (HMAC-SHA-1 with time-based counter):

```ts
function generateTotp(secret: Uint8Array, time = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(time / 1000 / step)
  const buffer = new ArrayBuffer(8)
  new DataView(buffer).setBigUint64(0, BigInt(counter))
  const hmac = await crypto.subtle.sign('HMAC', hmacKey(secret), buffer) // SHA-1
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset+1] << 16) |
              (hmac[offset+2] << 8) | hmac[offset+3]
  return String(bin % 10**digits).padStart(digits, '0')
}
```

Complexity: O(1). Standards-stable since 2011. ~ 30 LOC.

**TheoKit shape:**
```ts
export async function generateTotp(opts: TotpOptions): Promise<string>
export async function verifyTotp(token: string, opts: TotpOptions & { window?: number }): Promise<boolean>
```

### 7.5 Backup codes — constant-time verification

```ts
// Hash codes at generation time (Argon2id or bcrypt)
// At verify, hash the input and constant-time compare against every stored hash
// O(n) where n = number of codes (typically 8-10, so trivial)
```

**Critical: use `crypto.timingSafeEqual` (Node) or constant-time JS compare.** Naive `===` leaks timing. Web Crypto has no direct constant-time-compare; use a XOR-loop pattern.

## 8. Edge cases conhecidos (com fonte)

| # | Edge case | How it manifests | Where it was addressed | TheoKit prevention |
|---|---|---|---|---|
| EC-1 | **OAuth state token CSRF** | Without `state`, attacker can trick user into linking attacker's account | Remix `start-external-auth.ts` — mandatory `state` stored in session, verified in `finish-external-auth.ts` | If we ship state helper, mandatory pairing with verify helper |
| EC-2 | **PKCE downgrade attack** | Provider supports PKCE but client doesn't enforce it; attacker MITMs the authorization code | Remix mandates PKCE for ALL providers (`createCodeChallenge` always called) | Mandatory `S256` method only; no `plain` fallback |
| EC-3 | **OIDC `aud` claim mismatch** | Token issued for different client_id reused against this app | Remix `oidc.ts:verifyIdToken` checks `aud === clientId` | (Out of scope — user implements with `jose`) |
| EC-4 | **OIDC `iss` claim mismatch** | Token forged by another issuer | Remix `oidc.ts:verifyIdToken` checks `iss === metadata.issuer` | (Out of scope — user implements with `jose`) |
| EC-5 | **JWKS rotation between sign and verify** | Token signed with key K1; K1 rotated out before verify; verify fails | Remix `oidc.ts` re-fetches JWKS on cache miss for kid | (Out of scope — user implements with `jose`) |
| EC-6 | **Session fixation after login** | User logs in with attacker-supplied session ID; attacker reads session post-login | Remix `complete-auth.ts:completeAuth` rotates session ID. Rails `sessions_controller.rb#create` calls `reset_session` | **TheoKit gap** — `createSessionManager` lacks `rotate()` method. Plan to add. |
| EC-7 | **TOTP clock drift** | Authenticator app and server clocks drift; valid codes rejected | RFC 6238 §5.2 recommends ±1 window (90s total tolerance) | `verifyTotp({ window: 1 })` default |
| EC-8 | **TOTP code replay within same window** | Same 6-digit code accepted twice in 30s window | RFC 6238 §5.2 — "MUST NOT accept previously used codes" | Need a `usedTotpCodes` store (Redis/in-memory by `userId:code:window`) — but **this is a stateful concern; TheoKit ships the algorithm, not the store**. Document the requirement. |
| EC-9 | **Backup code reuse** | Code generated 10x but stored once; user uses same code twice | Standard mitigation: mark as used / delete after use | User's storage layer concern. TheoKit ships `verifyBackupCode(code, hashes)`; user removes from storage on match. |
| EC-10 | **Timing attack on backup code compare** | Naive `===` reveals which characters matched | Use constant-time XOR loop | `verifyBackupCode` uses constant-time compare internally |
| EC-11 | **Provider returns error in callback** (`?error=access_denied`) | Naive callback handlers redirect with no validation, leak info | Remix `finish-external-auth.ts` validates response shape | Document in user-facing examples |
| EC-12 | **Redirect URI tampering** | Attacker manipulates `redirect_uri` in authorize URL | Mandate exact-match per provider config (no wildcards) | Out of scope (provider-side concern) |
| EC-13 | **OAuth scope creep** | User-controlled scope param in start-external-auth | Use scope from provider config, not request param | Document |
| EC-14 | **`code` parameter replay** | Authorization code reused after consumption | OAuth spec mandates one-time use; provider enforces | Provider-side concern |

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
TheoKit ships (in `packages/theo/src/server/`):
┌─────────────────────────────────────────────────┐
│  oauth-pkce.ts        — PKCE helper (RFC 7636)  │
│  oauth-state.ts       — State token + verify    │
│  oidc-discovery.ts    — /.well-known fetcher    │
│  auth-totp.ts         — TOTP gen + verify       │
│  auth-backup-codes.ts — Backup code gen+verify  │
│  auth-throttle.ts     — Login throttling helper │
│  session.ts (modify)  — Add `rotate()` method   │
└─────────────────────────────────────────────────┘

User assembles (in their app code, OR via Auth.js/Better Auth):
┌─────────────────────────────────────────────────┐
│  app/login.tsx          — login form            │
│  server/routes/         ─ auth/callback         │
│                         ─ auth/start            │
│                         ─ auth/verify-2fa       │
│  ↓ uses ↓                                       │
│  npm: 'better-auth' OR 'next-auth' OR custom    │
└─────────────────────────────────────────────────┘

TheoKit documents (in `docs/concepts/`):
┌─────────────────────────────────────────────────┐
│  auth-providers.md   — recommend Auth.js/       │
│                        Better Auth + examples   │
│  ADR-AUTH-DELEGATION — formal scope boundary    │
└─────────────────────────────────────────────────┘
```

### 9.2 Files to create

```
packages/theo/src/server/oauth-pkce.ts         — generatePkceChallenge() (~ 50 LOC)
packages/theo/src/server/oauth-state.ts        — generateState() + verifyState() (~ 30 LOC)
packages/theo/src/server/oidc-discovery.ts     — discoverOidcProvider() + cache (~ 60 LOC)
packages/theo/src/server/auth-totp.ts          — generateTotp() + verifyTotp() (~ 80 LOC)
packages/theo/src/server/auth-backup-codes.ts  — generateBackupCodes() + verifyBackupCode() (~ 80 LOC)
packages/theo/src/server/auth-throttle.ts      — throttleLoginAttempts() (~ 60 LOC, uses RateLimitStore)

tests/unit/oauth-pkce.test.ts                   — RFC 7636 test vectors
tests/unit/oauth-state.test.ts                  — state lifecycle, replay rejection
tests/unit/oidc-discovery.test.ts               — mock provider, cache hit/miss
tests/unit/auth-totp.test.ts                    — RFC 6238 test vectors + window tolerance
tests/unit/auth-backup-codes.test.ts            — generate uniqueness + constant-time verify
tests/unit/auth-throttle.test.ts                — lockout window, attempt counter

tests/fixtures/auth-providers/                  — mini-project showing Auth.js integration
                                                  + a DIY OAuth flow using only the primitives

docs/concepts/auth-providers.md                 — recommendation page (HERO copy + 3 worked examples)
docs/concepts/2fa-totp.md                       — TOTP enrollment + verification recipe
docs/decisions/ADR-AUTH-DELEGATION.md           — formal architectural decision
```

(modify `packages/theo/src/server/session.ts` to add a `rotate()` method — EC-6 fix.)

### 9.3 Public API surface (TypeScript)

```ts
// oauth-pkce.ts
export interface PkceChallenge {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
}
export async function generatePkceChallenge(): Promise<PkceChallenge>

// oauth-state.ts
export interface OAuthStateOptions {
  /** Bytes of entropy. Default 32 (256 bits). */
  bytes?: number
}
export function generateOAuthState(opts?: OAuthStateOptions): string
export function verifyOAuthState(provided: string, stored: string): boolean // constant-time

// oidc-discovery.ts
export interface OidcMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
  jwks_uri?: string
  end_session_endpoint?: string
  code_challenge_methods_supported?: string[]
}
export async function discoverOidcProvider(issuer: string | URL): Promise<OidcMetadata>

// auth-totp.ts
export interface TotpOptions {
  secret: Uint8Array | string  // base32 if string
  step?: number    // seconds, default 30
  digits?: 6 | 7 | 8  // default 6
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512'  // default SHA-1 (RFC)
}
export async function generateTotp(opts: TotpOptions & { time?: number }): Promise<string>
export async function verifyTotp(
  token: string,
  opts: TotpOptions & { window?: number; time?: number },
): Promise<boolean>
export function generateTotpSecret(bytes?: number): Uint8Array
export function totpUri(opts: { secret: Uint8Array; issuer: string; account: string }): string

// auth-backup-codes.ts
export interface BackupCodeOptions {
  count?: number  // default 10
  length?: number // default 8 chars (no separators)
}
export interface BackupCode {
  plaintext: string  // show to user once
  hash: string       // store in DB
}
export async function generateBackupCodes(opts?: BackupCodeOptions): Promise<BackupCode[]>
export async function verifyBackupCode(code: string, hashes: string[]): Promise<{
  valid: boolean
  matchedHash?: string  // user removes from storage
}>

// auth-throttle.ts (uses RateLimitStore from earlier security-hardening plan)
export interface ThrottleOptions {
  store: RateLimitStore  // pluggable
  identifier: string     // 'user:alice' | 'ip:192.0.2.1' | etc
  maxAttempts?: number   // default 5
  windowMs?: number      // default 15 * 60_000 (15 min)
  lockoutMs?: number     // default 60 * 60_000 (1 hour) after maxAttempts
}
export interface ThrottleResult {
  allowed: boolean
  remainingAttempts: number
  lockedUntil?: Date
}
export async function recordAttempt(opts: ThrottleOptions, success: boolean): Promise<ThrottleResult>
export async function checkThrottle(opts: ThrottleOptions): Promise<ThrottleResult>

// session.ts (modify)
export interface SessionManager<TSession> {
  // ... existing methods
  /** Rotate the underlying session token. Use after auth state changes. EC-6. */
  rotateSession(req: IncomingMessage, res: ServerResponse): Promise<TSession | null>
}
```

### 9.4 Dependências a adotar

| Package | Version | Justification |
|---|---|---|
| (none) | — | Everything uses Web Crypto + Node `crypto` (already available). NO npm dep added. |

### 9.5 Test strategy

- **Unit:**
  - `oauth-pkce.test.ts` — RFC 7636 test vector (verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`)
  - `oauth-state.test.ts` — happy path (gen → verify true), replay (verify twice → second fail if stateful, else just match check), mismatch (different stored → false)
  - `oidc-discovery.test.ts` — mock provider via `globalThis.fetch` stub, assert cache hit on second call
  - `auth-totp.test.ts` — RFC 6238 Appendix B test vectors (SHA-1: `94287082` at T=59 with secret `12345678901234567890`)
  - `auth-backup-codes.test.ts` — gen uniqueness (no duplicates in 10k), constant-time verify (compare against wrong code never short-circuits)
  - `auth-throttle.test.ts` — 5 failed attempts → 6th locked, success resets counter, lockout expires
- **Integration:** none required at framework level (the primitives are pure)
- **Fixture:** `tests/fixtures/auth-providers/` shows two cases:
  - **Case 1: Auth.js integration** — installs `@auth/core`, wires sessions through TheoKit's `createSessionManager` adapter
  - **Case 2: DIY OAuth with GitHub** — uses TheoKit's `oauth-pkce` + `oauth-state` + manual token exchange (no provider lib). ~ 100 LOC including the GitHub callback route.
- **Playwright (if UI):** none required at framework level. Fixture has E2E test for the GitHub DIY case (mocked provider).

### 9.6 Phases of rollout

1. **Phase 1 — Boundary docs + ADR** (target: clear scope)
   - Write ADR `ADR-AUTH-DELEGATION` listing the §5.1 / §5.2 / §5.3 decisions
   - Write `docs/concepts/auth-providers.md` with the 3 worked examples (Auth.js, Better Auth, DIY)
   - Update README.md "What you'd ship" section: "social login (via Auth.js or Better Auth)"
2. **Phase 2 — Protocol primitives** (target: pure helpers shipped, no provider deltas)
   - `oauth-pkce.ts` + `oauth-state.ts` + `oidc-discovery.ts` + tests
3. **Phase 3 — Session rotation** (target: EC-6 closed)
   - Add `rotateSession()` to `SessionManager` + test
4. **Phase 4 — 2FA primitives** (target: TOTP + backup codes available)
   - `auth-totp.ts` + `auth-backup-codes.ts` + tests
5. **Phase 5 — Login throttling** (target: brute-force defense primitive)
   - `auth-throttle.ts` (depends on `RateLimitStore` from the broader security-hardening plan)
6. **Phase 6 — Fixture + docs polish** (target: integration story tested)
   - `tests/fixtures/auth-providers/` with Auth.js + DIY GitHub examples

### 9.7 Acceptance criteria

- [ ] ADR `ADR-AUTH-DELEGATION` exists and is referenced from CLAUDE.md's "Architectural decisions on record" section
- [ ] `docs/concepts/auth-providers.md` exists with 3 working examples
- [ ] README "What you'd ship" mentions social login via lib
- [ ] All 6 new files in `packages/theo/src/server/auth-*.ts` + `oauth-*.ts` + `oidc-*.ts` ship
- [ ] Each new file has a `tests/unit/*.test.ts` with RFC test vectors where applicable
- [ ] `session.ts` exposes `rotateSession()`; existing tests still pass; new test exercises rotation
- [ ] `tests/fixtures/auth-providers/` runs Auth.js + DIY GitHub examples in CI
- [ ] `tsc --noEmit` clean
- [ ] `vitest run` green (new tests + existing 1569 regression-free)
- [ ] Playwright unchanged (auth fixture has its own Playwright, optional)
- [ ] Dogfood check #51 (auth primitives present + docs page exists)
- [ ] CHANGELOG entry under `[Unreleased]` documenting the new primitives + delegation stance

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Users miss the docs page and reinvent OAuth incorrectly | Medium | README links to `auth-providers.md` prominently; `npm create theokit` scaffolds a TODO comment in `app/login.tsx` referencing the docs page |
| TOTP standard updates break compatibility | Very Low | RFC 6238 has been stable since 2011 |
| `RateLimitStore` interface (Phase 5 dep) not ready | High | Sequence: ship Phase 5 of THIS plan AFTER the broader security-hardening plan's RateLimitStore lands |
| Auth.js / Better Auth breaks integration with our `createSessionManager` | Medium | Maintain a `theokit-better-auth-adapter` package (out of scope for this plan; track as follow-up issue) |
| Users confuse "OAuth primitives" with "use these to implement OAuth from scratch" | Medium | Docs page leads with "USE A LIBRARY"; primitives are for advanced users only |

## 10. Open questions

1. **Should `oidc-discovery.ts` also ship a JWKS fetch + ID token verifier?** §3.2 shows Remix does. §5.5 leans no (recommend `jose`). **Open** — pending decision based on user demand evidence (zero today).
2. **Should `auth-throttle.ts` ship with a default in-memory store or REQUIRE a store?** Latter forces explicit choice; former is more ergonomic but hides multi-instance risk. **Lean: require a store**, document why.
3. **Should backup codes include separators (e.g., `XXXX-XXXX`)?** Improves UX (easier to type/dictate), slightly weakens entropy per char. **Open** — recommend yes with config flag.
4. **Should `tests/fixtures/auth-providers/` ship two separate fixture dirs or one with both flows?** Lean separate (`auth-providers/with-authjs/`, `auth-providers/diy-github/`) so each has a self-contained `theo.config.ts` and `package.json`.
5. **Should `npm create theokit` get an `--auth=authjs|better-auth|none` flag?** Adjacent to this plan, would require CLI work. Track as follow-up.
6. **Should we maintain an official `@theokit/better-auth-adapter`?** Better Auth ecosystem is growing fast. Adapter would smooth integration. Out of scope for this plan; track separately.

## 11. Referências citadas (todos os arquivos do inventário)

### Next.js
- `referencias/next.js/docs/01-app/02-guides/authentication.mdx:1-700` — canonical "delegate to libraries" doc; §3.1 (recommended libs list), §4.3 (docs surface)
- `referencias/next.js/docs/02-pages/02-guides/authentication.mdx` — Pages Router mirror of above; §3.1
- `referencias/next.js/examples/auth/auth.ts` — Iron Session + Passport.js sample
- `referencias/next.js/examples/with-clerk/` (tree) — full Clerk integration sample
- `referencias/next.js/examples/with-iron-session/` — Iron Session sample
- `referencias/next.js/examples/api-routes-apollo-server-and-client-auth/lib/auth.ts` + `auth-cookies.ts` — JWT cookie sample

### Remix 3.0.0-beta
- `referencias/remix/packages/auth/README.md:1-200` — 5 primitives + 10 providers; §3.2 main reference
- `referencias/remix/packages/auth/src/lib/provider.ts:1-400` — OAuth provider type machinery; §3.2, §4.1
- `referencias/remix/packages/auth/src/lib/start-external-auth.ts` — start OAuth flow; §3.2 step 1
- `referencias/remix/packages/auth/src/lib/finish-external-auth.ts` — callback handler; §3.2 step 3
- `referencias/remix/packages/auth/src/lib/refresh-external-auth.ts` — refresh tokens; §3.2
- `referencias/remix/packages/auth/src/lib/complete-auth.ts` — session ID rotation; §3.2 step 4, §4.5 (EC-6)
- `referencias/remix/packages/auth/src/lib/verify-credentials.ts` — credentials flow; §3.2
- `referencias/remix/packages/auth/src/lib/utils.ts` — `createCodeChallenge` (PKCE); §3.2, §7.1
- `referencias/remix/packages/auth/src/lib/providers/oidc.ts:1-350` — OIDC base + discovery; §3.2, §7.2, §7.3
- `referencias/remix/packages/auth/src/lib/providers/github.ts` — concrete provider shape; §3.2
- `referencias/remix/packages/auth/src/lib/providers/google.ts` — OIDC-derived provider
- `referencias/remix/packages/auth/src/lib/providers/microsoft.ts` — OIDC-derived provider
- `referencias/remix/packages/auth/src/lib/providers/okta.ts` — OIDC-derived provider
- `referencias/remix/packages/auth/src/lib/providers/auth0.ts` — OIDC-derived provider
- `referencias/remix/packages/auth/src/lib/providers/facebook.ts` — OAuth 2.0 provider
- `referencias/remix/packages/auth/src/lib/providers/x.ts` — Twitter/X OAuth 2.0
- `referencias/remix/packages/auth/src/lib/providers/atmosphere.ts` — Bluesky AT Protocol
- `referencias/remix/packages/auth/src/lib/providers/credentials.ts` — username/password
- `referencias/remix/packages/auth/package.json` — zero npm deps; §6
- `referencias/remix/packages/auth/CHANGELOG.md` — no major bug fixes recorded; §8
- `referencias/remix/packages/auth-middleware/README.md:1-60` — request-time auth resolution; §3.2
- `referencias/remix/packages/auth-middleware/src/lib/auth.ts` — `auth({schemes})` middleware factory
- `referencias/remix/packages/auth-middleware/src/lib/require-auth.ts` — `requireAuth()` helper
- `referencias/remix/packages/remix/src/auth.ts` — umbrella re-export
- `referencias/remix/packages/remix/src/auth-middleware.ts` — umbrella re-export
- `referencias/remix/packages/remix/package.json` — exports declaration (`./auth`, `./auth-middleware`)

#### Tests (informational for §8)
- `referencias/remix/packages/auth/src/lib/oauth-flow.integration.test.ts` — full flow integration
- `referencias/remix/packages/auth/src/lib/providers/{github,google,microsoft,okta,auth0,facebook,x,atmosphere,oidc,credentials}.test.ts` — per-provider tests
- `referencias/remix/packages/auth/src/lib/{verify-credentials,complete-auth,start-external-auth,finish-external-auth,refresh-external-auth}.test.ts` — primitive tests

#### Changelog
- `referencias/remix/packages/auth/.changes/major.auth-middleware-context-helper-renames.md` — recent rename for clarity

### SvelteKit
- `referencias/sveltekit/documentation/docs/40-best-practices/03-auth.md:1-40` — light delegation doc (Better Auth + Lucia); §3.3, §4.3

### Hono
- `referencias/hono/src/utils/basic-auth.ts` — Basic Auth header helper (RFC 7617); §3.4, §4.4

### Nitro
- `referencias/nitro/examples/middleware/server/middleware/auth.ts` — header check sample

### Fastify
- `referencias/fastify/docs/Guides/Ecosystem.md` — sibling-org plugin catalog (`@fastify/jwt`, `@fastify/auth`, `@fastify/oauth2`, `@fastify/passport`); §3.5

### Rails
- `referencias/rails/railties/lib/rails/generators/rails/authentication/authentication_generator.rb:1-40` — generator orchestrator; §3.6, §5.2 (Pattern I)
- `referencias/rails/railties/lib/rails/generators/rails/authentication/USAGE` — `rails generate authentication` docstring
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/models/session.rb.tt` — `Session belongs_to :user` (3 LOC); §3.6
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/models/user.rb.tt` — User with `has_secure_password`
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/models/current.rb.tt` — `Current.user` (CurrentAttributes)
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/controllers/sessions_controller.rb.tt` — login/logout controller (calls `reset_session` — EC-6 fix); §4.5
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/controllers/concerns/authentication.rb.tt` — `require_authentication` callback
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/controllers/passwords_controller.rb.tt` — password reset flow
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/mailers/passwords_mailer.rb.tt` — password reset email
- `referencias/rails/railties/lib/rails/generators/rails/authentication/templates/app/channels/application_cable/connection.rb.tt` — ActionCable auth
- `referencias/rails/actionpack/CHANGELOG.md` — no OAuth entries (password/session/cookie history only); §8

### URLs externas
- `authjs.dev/getting-started/installation?framework=next.js` — Auth.js (NextAuth) official quickstart for the recommended library path
- `better-auth.com/docs` — Better Auth, the SvelteKit-blessed alternative
- `lucia-auth.com` — Lucia guide (note: v3 deprecated 2025; reference only)
- `github.com/vvo/iron-session` — Iron Session (alternative to TheoKit's `createSessionManager`)
- `github.com/panva/jose` — `jose` JWT lib (for users implementing OIDC manually)
- RFC 6749 — OAuth 2.0 Framework
- RFC 7636 — PKCE for OAuth 2.0 (§7.1)
- RFC 6238 — TOTP: Time-Based One-Time Password Algorithm (§7.4)
- RFC 7617 — HTTP Basic Auth (Hono's only auth file)
- OpenID Connect Core 1.0 — `openid.net/specs/openid-connect-core-1_0.html`
- OpenID Connect Discovery 1.0 — `openid.net/specs/openid-connect-discovery-1_0.html` (§7.2)
- OWASP A07:2021 — Identification & Authentication Failures (justifies EC-6 session rotation)
