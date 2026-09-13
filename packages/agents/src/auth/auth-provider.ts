import {
  authFilePath,
  ensureFreshCredential,
  openaiDeviceLogin,
  persistOAuthTokens,
  readStoredOAuth,
} from '@theokit/sdk/auth'
import type {
  CredentialStoreConfig,
  OAuthProviderConfig,
  OAuthTokens,
  OpenAIDeviceConfig,
  ResolvedCredential,
} from '@theokit/sdk/auth'
import { withFileLock } from '@theokit/sdk/persistence'

/**
 * M60 — `AuthProvider`, the OO contract that unifies the SDK's free OAuth-lifecycle functions
 * (`openaiDeviceLogin` → `persistOAuthTokens` → `ensureFreshCredential`). Those are stateful across a
 * SHARED `config` (`OAuthProviderConfig`) + `store` (`CredentialStoreConfig`); this class holds that
 * state so a consumer authors `new AuthProvider(config, store).persist(...)` / `.ensureFresh(...)`
 * instead of threading `config`/`store` through every call — the `SDK → Theokit → AgentBuilder`
 * boundary applied to the auth domain (ENRICH, per blueprint D2: auth carries orchestration + state).
 *
 * It DELEGATES, never reimplements (parsimony Rung 9): each method forwards verbatim to the SDK
 * function, so login → persist → refresh produces byte-identical state to calling the SDK directly.
 *
 * SECRET-SAFETY (hard rule): this class NEVER logs, stringifies, or otherwise surfaces token material.
 * Methods return exactly what the SDK returns and add no observability — a token is data that flows
 * through, never something this layer emits. The parity/secret tests pin both properties.
 */

/** The HTTP deps of `ensureFreshCredential` (`{ fetch, now }`) — typed off the SDK to avoid drift. */
type EnsureFreshHttpDeps = Parameters<typeof ensureFreshCredential>[2]
/** The device-flow deps + prompt hook of `openaiDeviceLogin` — typed off the SDK. */
type DeviceLoginDeps = Parameters<typeof openaiDeviceLogin>[1]
type DeviceLoginHooks = Parameters<typeof openaiDeviceLogin>[2]

/**
 * A classified refresh failure — because the decision to retry depends on the class, not the text.
 *
 * M74: repeating an `invalid_grant` is not resilience, it is noise. The refresh token was revoked and
 * no attempt changes that; the user who revoked the login waits through three backoffs to read a
 * message that was already known from the first response. Network and 5xx are the opposite: they
 * almost always succeed on the second try.
 *
 * SECRET-SAFETY: the message never carries token material — only the class and the reason.
 */
export class RefreshFailure extends Error {
  constructor(
    message: string,
    /** `true` ⇒ worth retrying with backoff. `false` ⇒ terminal, fails on the first attempt. */
    readonly transient: boolean,
  ) {
    super(message)
    this.name = 'RefreshFailure'
  }
}

/**
 * What counts as transient. A NAMED list on purpose: it is a product decision that ages, and
 * scattering it across `if`s makes every site age on its own.
 */
const TRANSIENT_REASONS = [
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'AbortError',
]

/** Classifies a refresh failure. `invalid_grant` is terminal; network and 5xx are transient. */
export function classifyRefreshFailure(err: unknown): RefreshFailure {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  if (/invalid_grant|invalid_request|unauthorized_client/i.test(text)) {
    return new RefreshFailure(
      'the refresh token is no longer valid — log in again. Retrying does not change the outcome.',
      false,
    )
  }
  const transient =
    TRANSIENT_REASONS.some((m) => text.includes(m)) || /\b(5\d{2})\b|timeout|network/i.test(text)
  return new RefreshFailure(
    transient ? 'transient failure refreshing the credential' : 'failure refreshing the credential',
    transient,
  )
}

/** Wait with jitter: exponential backoff ±25%, so two processes do not retry in unison. */
export function waitWithJitter(attempt: number, baseMs = 200, random = Math.random): number {
  const base = baseMs * 2 ** attempt
  return Math.round(base * (0.75 + random() * 0.5))
}

export class AuthProvider {
  constructor(
    private readonly config: OAuthProviderConfig,
    private readonly store: CredentialStoreConfig,
  ) {}

  /**
   * Refresh a resolved credential if stale. Delegates to `ensureFreshCredential` with the held
   * `config` + `store`; `env` (for reading the store's env overrides) + the `{ fetch, now }` HTTP deps
   * thread through. Returns the fresh `ResolvedCredential` — never logs the rotated token.
   */
  async ensureFresh(
    resolved: ResolvedCredential,
    deps: EnsureFreshHttpDeps,
    env?: Record<string, string | undefined>,
  ): Promise<ResolvedCredential> {
    if (resolved.kind !== 'oauth') {
      // An API key does not expire: no lock, no re-read, no I/O. Keeping the hot path clear is what
      // makes the per-run resolver cheap (M74, Risk 1).

      return ensureFreshCredential(resolved, { config: this.config, store: this.store, env }, deps)
    }

    const filePath: string = authFilePath(this.store, env)

    // SINGLE-FLIGHT in-process, BEFORE the lock (M74, EC-2 of the edge-case review).
    //
    // `withFileLock` (proper-lockfile) is NOT reentrant: if a run starts inside a context that
    // already holds the lock — a nested run, or a team firing off members while the parent refreshes —
    // the second acquisition waits until the timeout and the symptom is "the run hung", with no error
    // at all. With M74's per-run resolver this stops being hypothetical: `ensureFresh` starts being
    // called from inside the stream. The in-flight promise makes reentrancy resolve by composition
    // rather than by lock.
    const inFlight = AuthProvider.refreshInFlight.get(filePath)
    if (inFlight !== undefined) return inFlight

    const promise = this.refreshUnderLock(filePath, resolved, deps, env)
    AuthProvider.refreshInFlight.set(filePath, promise)
    try {
      return await promise
    } finally {
      AuthProvider.refreshInFlight.delete(filePath)
    }
  }

  /** In-flight refresh per store path — the key is the file, not the instance. */
  private static readonly refreshInFlight = new Map<string, Promise<ResolvedCredential>>()

  /**
   * The refresh itself, serialized across PROCESSES and with a re-read.
   *
   * The re-read is not a detail: without it the lock merely serializes, and the second process
   * decides using the state it read BEFORE waiting — refreshing again and invalidating the token the
   * first one just wrote. It is classic double-checked locking, and it is what the two-process test
   * catches.
   */
  private refreshUnderLock(
    filePath: string,
    resolved: ResolvedCredential,
    deps: EnsureFreshHttpDeps,
    env?: Record<string, string | undefined>,
  ): Promise<ResolvedCredential> {
    return withFileLock(filePath, async () => {
      // RE-READ after acquiring the lock: another process may have refreshed while we waited.
      const doDisco = readStoredOAuth(this.store, env)
      const current =
        doDisco !== undefined
          ? { ...resolved, apiKey: doDisco.access, expiresAt: doDisco.expires }
          : resolved
      // Retry ONLY on the transient class. An `invalid_grant` fails on the FIRST try: the token was
      // revoked and no attempt changes that — insisting only delays the message the user needs to read.
      //
      // This loop existed once and was DELETED by a lint-fix of mine that rewrote the whole block;
      // the review caught it (`POST attempts = 1`, against the 3 the DoD requires). Testing the
      // classifier in isolation proves that it classifies, not that it is WIRED IN — hence a
      // structural gate.
      const MAX_ATTEMPTS = 3
      for (let attempt = 0; ; attempt++) {
        try {
          return await ensureFreshCredential(
            current,
            { config: this.config, store: this.store, env },
            deps,
          )
        } catch (err) {
          const failure = classifyRefreshFailure(err)
          if (!failure.transient || attempt >= MAX_ATTEMPTS - 1) throw failure
          await new Promise((resolve) => setTimeout(resolve, waitWithJitter(attempt)))
        }
      }
    })
  }

  /**
   * Run the headless OpenAI device-login flow. Delegates to `openaiDeviceLogin` (which JWT-extracts the
   * account id). `deviceConfig` is passed per-call because it is a distinct endpoint set from the
   * refresh `config`. Returns `OAuthTokens` — the caller persists them via {@link AuthProvider.persist}.
   */
  deviceLogin(
    deviceConfig: OpenAIDeviceConfig,
    deps: DeviceLoginDeps,
    hooks: DeviceLoginHooks,
  ): Promise<OAuthTokens> {
    return openaiDeviceLogin(deviceConfig, deps, hooks)
  }

  /**
   * Persist freshly-obtained tokens through the held `store`. Delegates to `persistOAuthTokens` and
   * returns the credential-file path (never the token). `env` selects the store's home override.
   */
  persist(provider: string, tokens: OAuthTokens, env?: Record<string, string | undefined>): string {
    return persistOAuthTokens(provider, tokens, this.store, env)
  }
}
