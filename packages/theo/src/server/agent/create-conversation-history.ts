/**
 * Item #5 — `createConversationHistory`
 *
 * Orchestrator that resolves a stable `agentId` from (explicit → session →
 * cookie → fresh UUID), then returns an `@usetheo/sdk` `Agent` via
 * `Agent.getOrCreate(agentId, options)`. Conversation turns auto-persist in
 * `<cwd>/.theokit/agents/<agentId>/messages.jsonl` — SDK owns the storage
 * (ADR D1). `MemorySettings` (facts recall layer) is opt-in passthrough via
 * `options.memory` (ADR D2).
 *
 * Security: agentId from cookie/explicit is attacker-controlled. The SDK
 * uses it as a filesystem path component AND we serialize it into Set-Cookie.
 * EC-1 enforces a strict regex `^[a-zA-Z0-9_-]{1,128}$` at every entry point;
 * invalid values fall through (treated as "missing") rather than throw.
 */

// ──────────────────────────────────────────────────────────────────────────
// Structural types — mirrors of SDK shapes we don't want to hard-import
// (the SDK is an OPTIONAL peer per item #4's stance).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Minimum surface of an SDK Agent that consumers care about post-creation.
 * Structural match — any object with `send` + `dispose` of compatible
 * shape works. `send` returns a `SdkRunLike` (a Run-shaped object) that
 * `streamAgentRun` can consume. Permissive `unknown` for now; consumers
 * who want stricter types can cast to the SDK's own types.
 */
export interface SdkRunLike {
  stream: () => AsyncIterable<{ type: string }>
  wait: () => Promise<{ status: 'finished' | 'error' | 'cancelled'; error?: { message: string } }>
}

export interface SdkAgent {
  send: (message: string, options?: unknown) => Promise<SdkRunLike>
  dispose: () => Promise<void>
}

/**
 * Phase 2 — structural duck-type of `@usetheo/sdk`'s `ConversationStorageAdapter`.
 *
 * D2 (decoupling): we mirror the SDK's shape locally rather than hard-import
 * the SDK type. This lets consumers pass any object matching the structural
 * contract (own implementation, SDK's `FileSystemConversationStorage`,
 * `InMemoryConversationStorage`, or a Postgres/Redis recipe).
 *
 * EC-5 (SHOULD TEST — sync drift detection): the SDK type MUST be assignable
 * to this interface AND vice-versa. A contract test asserts both directions.
 *
 * `unknown` for the message payload avoids coupling to the SDK's `SDKMessage`
 * shape. Real consumers cast at the call site if they need stricter types.
 */
export interface ConversationStorageLike {
  getMessages(conversationId: string): Promise<readonly unknown[]>
  appendMessage(conversationId: string, message: unknown): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  listConversationIds?(opts?: { limit?: number }): Promise<readonly string[] | undefined>
  dispose?(): Promise<void>
}

/**
 * Minimum surface of `AgentOptions` accepted by `Agent.getOrCreate`. Forward-
 * compatible: callers pass whatever the SDK supports (memory, tools, etc.).
 *
 * Phase 2 adds typed `conversationStorage` slot. The index signature still
 * passes everything else opaquely.
 */
export interface SdkAgentOptions {
  apiKey?: string
  model?: { id: string }
  tools?: readonly unknown[]
  memory?: Record<string, unknown>
  /**
   * Phase 2 (Production-Readiness #1) — pluggable conversation persistence.
   * Default (when omitted): SDK falls back to `FileSystemConversationStorage`.
   * Required for serverless / multi-host deploys.
   */
  conversationStorage?: ConversationStorageLike
  [key: string]: unknown
}

interface SdkModule {
  Agent: {
    getOrCreate: (agentId: string, options: SdkAgentOptions) => Promise<SdkAgent>
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export interface ConversationHistoryArgs {
  /** Request — for reading the conversation cookie. */
  request: Request | { headers?: { cookie?: string } | Headers }
  /**
   * Response-like surface that accepts a `Set-Cookie` header. The primitive
   * appends a Set-Cookie line when issuing a new conversation id. If absent,
   * the primitive still reads the existing cookie but cannot issue a new
   * one — useful for read-only contexts.
   */
  response?: { headers: Headers }
  /** Explicit override — wins over session/cookie/uuid (ADR D3 step 1). */
  agentId?: string
  /** Auth session containing a `conversationId` field — ADR D3 step 2. */
  session?: { conversationId?: string } | null
  /** SDK AgentOptions forwarded to Agent.getOrCreate. apiKey + model required. */
  options: SdkAgentOptions
  /** Cookie name override. Default: 'theo_conversation'. */
  cookieName?: string
  /** Cookie max-age in seconds. Default + min: 30 days. Non-positive coerced to default (EC-4). */
  cookieMaxAge?: number
}

export interface ConversationHistoryResult {
  /** The SDK Agent, ready to receive `agent.send(message)`. */
  agent: SdkAgent
  /** The resolved conversation id (useful for logging / debugging). */
  conversationId: string
  /** True when the id was newly generated (no prior cookie / session). */
  isNew: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Test seam — allows unit tests to swap the SDK without dynamic import flake.
// Underscore-prefixed: NOT part of the public contract.
// ──────────────────────────────────────────────────────────────────────────

let sdkOverride: SdkModule | null | undefined = undefined

/** @internal */
export function __setSdkForTests(sdk: SdkModule | null): void {
  sdkOverride = sdk
}

/** @internal */
export function __resetSdkForTests(): void {
  sdkOverride = undefined
}

async function loadSdk(): Promise<SdkModule> {
  // EC-2 (edge case review — MUST FIX): the SDK is an optional peer; if the
  // consumer never installed it, `import('@usetheo/sdk')` throws
  // ERR_MODULE_NOT_FOUND. Re-throw with an actionable message.
  if (sdkOverride === null) {
    throw new Error(
      'createConversationHistory requires @usetheo/sdk. Install: pnpm add @usetheo/sdk',
    )
  }
  if (sdkOverride !== undefined) return sdkOverride
  try {
    // Use `createRequire` — Node's CJS-style require resolves against the
    // process's actual node_modules tree, bypassing Vite's SSR import-
    // analysis pipeline. The dynamic ESM `import()` path got intercepted
    // by Vite's `vite:import-analysis` plugin and failed to find the SDK
    // even when it was installed; createRequire goes straight to Node.
    //
    // The SDK ships dual ESM+CJS (per its tsup build), so `require` yields
    // the same module the ESM `import` would.
    const { createRequire } = await import('node:module')
    const requireFn = createRequire(import.meta.url)
    const spec = '@usetheo/sdk'
    const mod = requireFn(spec) as unknown as SdkModule
    return mod
  } catch (cause) {
    throw new Error(
      'createConversationHistory requires @usetheo/sdk. Install: pnpm add @usetheo/sdk',
      { cause },
    )
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_COOKIE_NAME = 'theo_conversation'
const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

/**
 * EC-1 (edge case review — MUST FIX): the agentId becomes a filesystem path
 * component (`<cwd>/.theokit/agents/<agentId>/messages.jsonl`) inside the SDK
 * AND is serialized into a Set-Cookie header. The SDK does NOT validate the
 * char set. An attacker setting `Cookie: theo_conversation=../../../etc/passwd`
 * could trigger arbitrary-path writes; an `agentId` with CRLF would inject
 * HTTP headers. The same regex kills both attacks.
 */
const AGENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/

function isValidAgentId(s: string | undefined | null): s is string {
  return typeof s === 'string' && AGENT_ID_REGEX.test(s)
}

/**
 * Minimal RFC 6265 cookie parser. Returns the FIRST occurrence of `name`
 * (EC-5 — pins first-wins behavior).
 */
function readCookieValue(
  request: ConversationHistoryArgs['request'],
  name: string,
): string | undefined {
  let raw: string | undefined
  const h = request.headers
  if (h === undefined) return undefined
  if (typeof (h as Headers).get === 'function') {
    raw = (h as Headers).get('cookie') ?? undefined
  } else {
    raw = (h as { cookie?: string }).cookie
  }
  if (raw === undefined || raw.length === 0) return undefined
  const pairs = raw.split(/[;,]/)
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const k = pair.slice(0, eq).trim()
    if (k === name) return pair.slice(eq + 1).trim()
  }
  return undefined
}

interface SerializeCookieOptions {
  httpOnly?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  maxAge?: number
  path?: string
}

function serializeCookie(name: string, value: string, options: SerializeCookieOptions): string {
  const parts: string[] = [`${name}=${value}`]
  if (options.path !== undefined) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.sameSite !== undefined) {
    const v = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)
    parts.push(`SameSite=${v}`)
  }
  if (options.httpOnly === true) parts.push('HttpOnly')
  return parts.join('; ')
}

export async function createConversationHistory(
  args: ConversationHistoryArgs,
): Promise<ConversationHistoryResult> {
  const cookieName = args.cookieName ?? DEFAULT_COOKIE_NAME
  // EC-4 (edge case review — SHOULD TEST): coerce non-positive to default.
  // The `??` operator alone would let `0` through, producing `Max-Age=0`
  // which means "delete cookie immediately" — almost certainly not intent.
  const rawMaxAge = args.cookieMaxAge
  const cookieMaxAge =
    typeof rawMaxAge === 'number' && rawMaxAge > 0 ? rawMaxAge : DEFAULT_COOKIE_MAX_AGE

  // 1. Resolve agentId per ADR D3 — sources are validated; invalid values
  //    fall through (treated as "missing") rather than throw.
  let conversationId: string | undefined
  let isNew = false
  const cookieOnRequest = readCookieValue(args.request, cookieName)

  if (isValidAgentId(args.agentId)) {
    conversationId = args.agentId
  } else if (args.session !== null && args.session !== undefined) {
    const sId = args.session.conversationId
    if (isValidAgentId(sId)) conversationId = sId
  }
  if (conversationId === undefined && isValidAgentId(cookieOnRequest)) {
    conversationId = cookieOnRequest
  }

  if (conversationId === undefined) {
    conversationId = crypto.randomUUID()
    isNew = true
  }

  // Issue (or refresh) the cookie when:
  //   1. The id was newly generated (no source had it), OR
  //   2. The request's cookie does NOT match the resolved id (explicit
  //      `agentId` override, session-derived id, etc.). Without this,
  //      callers that pre-probe the id (e.g. to build agentId-scoped tools)
  //      and pass it via `agentId` would never get a Set-Cookie even on
  //      first visit. Net effect: every response with a `response` slot
  //      ensures the browser ends up with a cookie that matches the
  //      resolved id.
  const shouldIssueCookie = isNew || cookieOnRequest !== conversationId
  if (shouldIssueCookie && args.response !== undefined) {
    const cookie = serializeCookie(cookieName, conversationId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: cookieMaxAge,
      path: '/',
    })
    args.response.headers.append('set-cookie', cookie)
  }

  // 2. Resolve the agent via SDK.
  const sdk = await loadSdk()
  const agent = await sdk.Agent.getOrCreate(conversationId, args.options)

  return { agent, conversationId, isNew }
}
