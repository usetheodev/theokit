// M60 — `@theokit/agents/auth`: the OO auth contract. `AuthProvider` (ENRICH — it holds the shared
// `config`+`store` state and delegates to the SDK's free OAuth-lifecycle functions), plus the auth
// domain's types re-exported so a consumer types the whole surface from the Theokit layer, never
// reaching back to `@theokit/sdk/auth`.
export { AuthProvider } from './auth/auth-provider.js'

// M73 — "enriching never reduces". The SDK's store mechanics cross as a PURE PASS-THROUGH.
//
// Before this, this subpath exported 1 value and 6 types while `@theokit/sdk/auth` exported 19
// symbols: no function crossed. Since the consumer holds an UNBREAKABLE rule never to import
// `@theokit/sdk*` directly, **reimplementing was the only legal way out** — and agent-builder
// rewrote six of these names, ~120 lines of duplicated mechanics. The gap was ours, not indiscipline
// on their side.
//
// PURE, not a wrapper (parsimony Rung 9): these are I/O functions with no state to hold. The layer
// enriches where there is orchestration — which is what `AuthProvider` does with the `config`+`store`
// pair. Wrapping this would add indirection with nothing inside, and would **break `instanceof`**:
// the consumer writes `err instanceof CredentialError`, which only holds while the class is the SAME
// reference as the SDK's. `tests/unit/auth-parity.test.ts` pins that identity with `toBe`.
//
// `resolveCredential` does NOT cross, on purpose: the SDK and agent-builder have DIFFERENT functions
// under that name (sync vs async, throws vs `undefined`, reads env vs does not, infers the provider
// vs refuses), and the SDK itself declares that env precedence, prefix inference and the declared
// provider are the consumer's app policy (`internal/auth/credential-store.ts`). Exposing both in the
// same scope would be an invitation to import the wrong one, failing silently.
// M67 — `assertSecureModes` arrived with the `^4.49.0` floor (ADR 0060). It encodes a security rule
// over auth modes, and the doctrine above forbids withholding exactly this kind of symbol: the
// consumer's only legal way out would be to restate the rule, and a second copy of a security rule
// diverges from the first in silence.
export {
  assertSecureModes,
  authFilePath,
  CredentialError,
  credentialHome,
  readAuthFile,
  readStoredOAuth,
  writeCredential,
} from '@theokit/sdk/auth'

// M110 — the **RFC 8628** device flow crosses, on the SAME argument as M73 above, over symbols that
// milestone did not cover.
//
// Measured: the SDK implements the standard (`deviceLogin`, `requestDeviceCode`, `pollDeviceToken`,
// `DeviceOAuthConfig`), and this subpath re-exported **only** OpenAI's variant (`openaiDeviceLogin`,
// `OpenAIDeviceConfig`). A consumer needing the standard had two ways out: break the UNBREAKABLE
// rule, or reimplement the RFC. It is literally M73's sentence — *"the gap was ours, not
// indiscipline on their side"* — replayed in a neighbouring subsystem.
//
// PURE, not a wrapper, by the criterion M73 wrote down: they are I/O functions with no state to
// hold. `DeviceDeps` is already injectable, so a consumer tests its own provider without a network.
//
// The two shapes COEXIST and nothing is unified: `DeviceOAuthConfig` has **one** `deviceCodeEndpoint`
// (RFC), and `OpenAIDeviceConfig` has **two** (`deviceUsercodeEndpoint` → `devicePollEndpoint`, with
// PKCE). Merging them would break Codex — the provider this work exists to make easier.
// And `openaiDeviceLogin` crosses ALONGSIDE it, which M110's measurement showed was missing: it was
// **imported** here for `AuthProvider`'s internal use and never re-exported. The consequence — the
// Codex flow was only reachable by constructing an `AuthProvider` (which requires `config`+`store`),
// when the concrete request was *"make using the Codex provider easier"*. Exporting it is the same
// argument as the lines above, applied to the variant that already existed.
export {
  deviceLogin,
  openaiDeviceLogin,
  pollDeviceToken,
  requestDeviceCode,
} from '@theokit/sdk/auth'
export type { DeviceCodeGrant, DeviceOAuthConfig } from '@theokit/sdk/auth'

// M112 — the OAuth ENGINE crosses over, by the SAME argument as M73 and M110, over the subsystem
// neither of them covered.
//
// Measured in the TheoCode ↔ theokit cross-validation of 2026-08-07: `@theokit/sdk/auth` exports the
// full engine (`ensureFreshCredential`, `persistOAuthTokens`, `refreshOAuthTokens`) plus the JWT
// helper `extractAccountId`; this subpath re-exported NONE of the four. M73 opened the store and
// M110 opened the device flow — what sits BETWEEN them (exchange a device grant for tokens, refresh
// before expiry, persist the result) had no door at all.
//
// The consumer cannot import `@theokit/sdk*` directly, so it did the only legal thing left: it
// rewrote the mechanics by hand in `packages/agent/src/auth/credentials.ts` (finding SAC-07). This
// is the third re-enactment of the sentence M73 wrote — *"the gap was ours, not their indiscipline"*.
//
// PURE, not a wrapper, by the criterion M73 fixed: these are stateless I/O functions; what holds the
// `config`+`store` pair is `AuthProvider`. `tests/unit/auth-parity.test.ts` locks referential
// identity with `toBe`, so a future wrapper turns red.
//
// `resolveCredential` stays OUT, and now with a test proving it: see the M73 paragraph above — two
// functions share that name with divergent semantics, and exposing both in one scope invites
// importing the wrong one, silently. Opening the neighbouring subsystem is what makes that lock
// necessary, because the symmetry invites the opposite.
export {
  ensureFreshCredential,
  extractAccountId,
  persistOAuthTokens,
  refreshOAuthTokens,
} from '@theokit/sdk/auth'
export type { ResolveCredentialOptions } from '@theokit/sdk/auth'
export type {
  CredentialStoreConfig,
  DeviceDeps,
  OAuthProviderConfig,
  OAuthTokens,
  OpenAIDeviceConfig,
  ResolvedCredential,
  StoredCredential,
  StoredOAuthCredential,
} from '@theokit/sdk/auth'

/**
 * "Which provider issued this key?" — the question a login flow asks before any profile exists.
 *
 * Forwarded now that it is typed. It was published in `@theokit/sdk@4.52.0` and absent from the
 * emitted declaration until 4.52.1, so forwarding it earlier did not compile (measured: TS2305).
 * The surface-parity gate is what surfaced the moment it became forwardable — `./auth` is the one
 * subpath under a HARD gate, and an SDK export with no written decision here fails CI. Nobody had
 * to remember.
 *
 * Distinct from `resolveCredential`, which answers "what credential should I use?" from the
 * environment and the store. This answers "whose is this string?" about a key already in hand, and
 * it is the single owner of the prefix knowledge — `assertKeyMatchesProvider` asks it rather than
 * restating the table.
 */
export { providerFromApiKeyPrefix } from '@theokit/sdk/auth'

// M111 — device auth PLUG-AND-PLAY. M110 made the RFC 8628 flow cross; it did not touch ergonomics.
//
// To authenticate against Codex, the consumer had to know that TWO device-flow shapes exist, copy a
// `clientId` and three OpenAI URLs into its own code, assemble `{fetch, sleep, now}`, call
// `deviceLogin` and REMEMBER to call `persist` — forgetting the last one costs a full OAuth
// round-trip that stores nothing.
//
// The design came from measuring three peers and REFUTED the original proposal (a flat descriptor
// with a `kind` discriminant): none of the three discriminates protocol by field. `AuthMethod` is a
// discriminated union and each method points at ITS OWN function — no `switch`, and no way to make
// an OAuth method that cannot authorize representable.
//
// It ENRICHES, it is not a pass-through: `loginWithDevice` orchestrates `authorize` + `persist` (the
// shape of codex's `run_device_code_login`, which returns `()`), and `CODEX_PROVIDER` is a public
// identity every consumer used to copy — two owners of the same fact is a DRY violation across the
// boundary.
export { CODEX_CLIENT_ID_ENV_VAR, CODEX_PROVIDER, loginWithDevice } from './auth/device-provider.js'
export type { AuthMethod, DeviceAuthProvider, PromptHooks } from './auth/device-provider.js'

// M79 — the framework's OWN `resolveCredential`, and the reason it may carry that name here.
//
// The paragraphs above withhold the SDK's symbol because two divergent functions share the name.
// This one is a THIRD, and it is safe precisely because it is the only one reachable from this
// subpath and the only one whose signature says which providers it is talking about: the descriptor
// list is a parameter. WHICH providers exist stays app policy; the precedence chain, the
// prefix<->provider consistency check and the provenance record are mechanism, and withholding
// mechanism is what made a consumer write a 70-line dotenv parser to answer "shell or .env?".
export {
  CredentialNotFoundError,
  DEFAULT_PROVIDERS,
  DeclaredProviderError,
  ProviderKeyMismatchError,
  ProviderPrefixMismatchError,
  credentialSources,
  requireCredential,
  resolveAgentCredential,
  resolveCredential,
} from './auth/resolve-credential.js'
export type { AgentCredentialInput } from './auth/resolve-credential.js'
export type { CredentialSourcesInput } from './auth/resolve-credential.js'
export type {
  CredentialResolution,
  ProviderDescriptor as CredentialProviderDescriptor,
  ResolveCredentialInput,
  SourceOrigin,
} from './auth/resolve-credential.js'

/**
 * Persisted tool-permission grants — "always allow this", without "allow everything".
 *
 * Measured absent from BOTH this framework and its closest consumer: the only tool-level escape on
 * offer was the global `full-auto`, which removes the gate instead of narrowing it. The tenth prompt
 * is where a person stops reading prompts, so "no standing grant" is what produces unsafe behaviour.
 */
export {
  PermissionStore,
  type Grant,
  type GrantOptions,
  type PermissionQuery,
  type PermissionStoreOptions,
} from './auth/permission-store.js'

/**
 * The adapter that puts a `PermissionStore` in force. Exported beside the store deliberately: for
 * one release the store shipped alone, describing a deny-by-default posture with nothing that could
 * apply it.
 */
export {
  grantGate,
  type Classification,
  type Governed,
  type GrantGateContext,
  type NotGoverned,
  type Veto,
} from './auth/permission-gate.js'

/**
 * B-061 — the type this barrel's own signatures NAME.
 *
 * It appeared in an exported signature and crossed nothing: a consumer could read the shape in the
 * emitted `.d.ts` and could only name it by importing the upstream package directly. The sixth
 * instance of the shape `bridge/index.ts` enumerates by issue number, and the first caught by a
 * guard that DERIVES the requirement from the built barrels rather than listing it
 * (`tests/unit/every-public-type-crosses-the-barrel.test.ts`).
 */
export type { PermissionMode } from '@theokit/sdk'
