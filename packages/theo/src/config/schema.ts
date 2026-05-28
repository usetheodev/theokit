import { z } from 'zod'

import { servicesConfigSchema } from '../services/index.js'

/**
 * Base bucket config — legacy shape preserved for backwards compatibility.
 */
const baseRateLimitSchema = z.object({
  windowMs: z.number().min(1),
  max: z.number().int().min(1),
})

/**
 * T2.2 — Per-route + per-user rate limit. The new shape adds `routes`
 * (path map), `keyBy`, and `cookieName`. The legacy flat shape is still
 * accepted via the union — see `createRouteRateLimiter` for normalization.
 */
export const rateLimitSchema = z.union([
  baseRateLimitSchema,
  z.object({
    default: baseRateLimitSchema.optional(),
    routes: z.record(z.string(), baseRateLimitSchema).optional(),
    keyBy: z
      .union([
        z.enum(['ip', 'session', 'user']),
        z.function().args(z.unknown()).returns(z.string()),
      ])
      .optional(),
    cookieName: z.string().min(1).optional(),
  }),
])

export const uploadSchema = z.object({
  maxFileSize: z
    .number()
    .min(1)
    .default(10 * 1024 * 1024), // 10MB
  maxFiles: z.number().int().min(1).default(10),
  maxFieldSize: z
    .number()
    .min(1)
    .default(1 * 1024 * 1024), // 1MB
})

export const loggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
})

/**
 * Cache subsystem config (caching-and-revalidation-plan).
 * Default `cache: undefined` keeps the framework backward-compatible
 * (no engine initialized → no cache primitives available).
 *
 * Setting `cache: {}` opts in with all defaults.
 */
const routeRuleSchema = z.object({
  maxAge: z.number().nonnegative().finite().optional(),
  swr: z.number().nonnegative().finite().optional(),
  tags: z.array(z.string()).optional(),
})

export const cacheSchema = z.object({
  enabled: z.boolean().default(true),
  /** 'memory' uses InMemoryCacheAdapter; otherwise pass a custom adapter instance. */
  storage: z.union([z.literal('memory'), z.custom<unknown>()]).default('memory'),
  maxEntries: z.number().int().positive().default(1000),
  defaults: z
    .object({
      maxAge: z.number().nonnegative().finite().default(1),
      swr: z.number().nonnegative().finite().optional(),
      cacheErrors: z.boolean().default(false),
    })
    .default({}),
  keyDerivation: z
    .object({
      excludeQuery: z.array(z.string()).optional(),
      sortQuery: z.boolean().default(true),
      lowercaseHost: z.boolean().default(true),
    })
    .default({}),
  routeRules: z.record(z.string(), routeRuleSchema).optional(),
})

/**
 * Phase 5 — CSRF warn-first (EC-1).
 *
 * 0.2.0 default: `warn`. Existing apps keep working but get structured
 * warnings about every state-mutating request that does not carry the
 * `X-Theo-Action: 1` header. 0.3.0 will flip the default to `strict`.
 *
 * Set explicitly to `strict` to opt into the future default early,
 * or `off` to disable CSRF entirely (only valid when you have another
 * defense — bearer auth, no session cookies, etc).
 */
/**
 * Phase 6 — Default security headers (D4 / EC-2).
 *
 * 0.2.0 defaults:
 *   - CSP in `report-only` mode (EC-2: don't break existing apps)
 *   - X-Frame-Options: DENY · X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - HSTS in production only (no TLS on localhost)
 *
 * Users override individual headers, swap CSP to `enforce`, or disable
 * CSP entirely (`csp: false` / `cspMode: 'off'`).
 */
/**
 * EC-3 — CWE-113 HTTP Response Splitting mitigation.
 *
 * Every string that becomes a header value must reject CR/LF. Apps that
 * derive header values from untrusted input (feature flags, tenant config,
 * URL params) would otherwise let attackers inject Set-Cookie / Location
 * headers via `\r\n`. Apply this refinement to every header-bound string
 * field: permissionsPolicy, csp, hsts, referrerPolicy.
 */
const headerSafeString = z
  .string()
  .refine((s) => !/[\r\n]/.test(s), { message: 'Header value must not contain CR/LF' })

export const securityHeadersSchema = z.object({
  csp: z.union([headerSafeString, z.literal(false)]).optional(),
  // T6.1 — default flipped from 'report-only' to 'enforce' for 0.3.0.
  // Users who want the old behaviour set `cspMode: 'report-only'`
  // explicitly. See docs/migrating/0.2-to-0.3.md.
  cspMode: z.enum(['enforce', 'report-only', 'off']).default('enforce'),
  hsts: z.union([headerSafeString, z.literal(false)]).optional(),
  frameOptions: z.enum(['DENY', 'SAMEORIGIN']).default('DENY'),
  contentTypeOptions: z.literal('nosniff').default('nosniff'),
  referrerPolicy: headerSafeString.default('strict-origin-when-cross-origin'),
  /**
   * T1.1 — Permissions-Policy directive string. EC-3-refined: rejects CR/LF.
   * Pass `false` to suppress the header.
   */
  permissionsPolicy: z.union([headerSafeString, z.literal(false)]).optional(),
})

/**
 * T5.1 — Disallowed-routes escalation pattern (Rails-inspired).
 *
 * `routes` accepts string (exact match — trailing slash matters) or
 * RegExp entries. Matched routes that would otherwise emit `csrf.warn`
 * dispatch through `disallowedBehavior` instead:
 *   - `'warn'`  : no-op vs the default warn-mode behavior
 *   - `'raise'` : escalate to 403, even when global `csrf` mode is 'warn'
 *
 * Use to roll out strict mode per-route (e.g., flip /api/auth/* first)
 * without committing the entire surface to strict at once.
 */
export const disallowedConfigSchema = z.object({
  routes: z.array(z.union([z.string(), z.instanceof(RegExp)])),
  behavior: z.enum(['warn', 'raise']).default('raise'),
})

/**
 * T1.2 — CORS configuration.
 *
 * `origins` accepts a single value (`'*'`, string, RegExp, callback) OR an
 * array of (string | RegExp). The spec-violating `origins: '*'` +
 * `credentials: true` combination is rejected at parse time (browsers
 * ignore wildcards when credentials are sent).
 *
 * EC-3 — `allowedHeaders` and `exposedHeaders` entries go through the
 * header-safe refinement (CR/LF rejected — CWE-113 mitigation).
 */
export const corsSchema = z
  .object({
    origins: z.union([
      z.literal('*'),
      headerSafeString,
      z.instanceof(RegExp),
      z.array(z.union([headerSafeString, z.instanceof(RegExp)])),
      z.function().args(z.string()).returns(z.boolean()),
    ]),
    methods: z
      .array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']))
      .optional(),
    allowedHeaders: z.array(headerSafeString).optional(),
    exposedHeaders: z.array(headerSafeString).optional(),
    credentials: z.boolean().default(false),
    maxAge: z.number().int().min(0).max(86400).default(600),
  })
  .refine((c) => !(c.origins === '*' && c.credentials), {
    message: 'CORS spec forbids origins:"*" with credentials:true — browsers ignore the wildcard',
  })

export const securitySchema = z.object({
  // T6.1 — default flipped from 'warn' to 'strict' for 0.3.0. Apps that
  // grep their warn-mode logs from 0.2.x already know which endpoints
  // break; opt back into 'warn' globally OR use disallowedRoutes for
  // surgical migration. See docs/migrating/0.2-to-0.3.md.
  csrf: z.enum(['off', 'warn', 'strict']).default('strict'),
  headers: securityHeadersSchema.optional(),
  /** T5.1 — per-route escalation (Rails disallowed_warnings pattern). */
  disallowed: disallowedConfigSchema.optional(),
  /** T1.2 — Cross-Origin Resource Sharing. Single global config; runs first in pipeline. */
  cors: corsSchema.optional(),
})

/**
 * StorageManager schemas (T1.1 / ADR-0007 D4).
 *
 * `theo.config.ts > storage` declares Postgres servers (credentials), the
 * databases on each server (TheoCloud / managed PG / self-host), and Redis
 * servers. The runtime `StorageManager` consumes this block; adapters
 * (PostgresJobBackend, PostgresConversationStorage, etc.) request pools by
 * database name and never see raw credentials at the call site.
 *
 * EC-1 (DOCUMENT in concept doc T4.1): Zod default strip-unknown mode
 * silently drops typo keys (`databasees` instead of `databases`). The
 * concept doc warns users to use exact names; runtime errors are still
 * actionable (`Database "X" not configured`).
 *
 * EC-2 (DEFERRED to use-time): `databases.X.server` references a key in
 * `servers`. Cross-field validation is intentionally NOT enforced at parse
 * time — `StorageManager.usePostgres()` throws an actionable error on the
 * first call with the dangling reference, matching Rails / Nitro behavior.
 */
const tlsConfigSchema = z.object({
  rejectUnauthorized: z.boolean().optional(),
  caCert: z.string().optional(),
  clientCert: z.string().optional(),
  clientKey: z.string().optional(),
})

const serverConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().max(65535).optional(),
  user: z.string().min(1),
  /** Password may be the empty string (some providers permit it). */
  password: z.string(),
  tls: tlsConfigSchema.optional(),
})

const postgresPoolConfigSchema = z.object({
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().positive().optional(),
  connectionTimeoutMillis: z.number().int().positive().optional(),
  idleTimeoutMillis: z.number().int().nonnegative().optional(),
})

const postgresDatabaseConfigSchema = z.object({
  /** References a key in `storage.servers`. Resolved at `usePostgres()` call time. */
  server: z.string().min(1),
  database: z.string().min(1),
  pool: postgresPoolConfigSchema.optional(),
})

const redisServerConfigSchema = serverConfigSchema.extend({
  db: z.number().int().nonnegative().optional(),
  maxRetriesPerRequest: z.number().int().nonnegative().optional(),
})

export const storageSchema = z.object({
  servers: z.record(z.string(), serverConfigSchema).optional(),
  databases: z.record(z.string(), postgresDatabaseConfigSchema).optional(),
  redis: z.record(z.string(), redisServerConfigSchema).optional(),
})

export type StorageConfig = z.infer<typeof storageSchema>

export const theoConfigSchema = z
  .object({
    appDir: z.string().default('app'),
    serverDir: z.string().default('server'),
    /**
     * T2.2 / EC-4 — Build output directory. Must be a relative path inside
     * the project root. Refused absolute or parent-relative paths to prevent
     * `cleanOutDir` from wiping arbitrary locations (defense-in-depth on
     * top of cleanOutDir's runtime EC-3 guard).
     */
    distDir: z
      .string()
      .default('.theo')
      .refine(
        (d) => !/^([A-Za-z]:)?[/\\]/.test(d) && !d.startsWith('..'),
        'distDir must be a relative path inside the project root (e.g., ".theo")',
      ),
    /**
     * Agent runtime configuration.
     *
     * - `maxRegistries` (T2.3, legacy): dev-mode cleanup of stale
     *   `.theokit/agents/<id>/` dirs by mtime. Now superseded by SDK's
     *   native registry GC but kept for backward-compat.
     * - `registry` (Phase 6, Production-Readiness #2): forwarded to
     *   `Agent.registry.configure()` lazily on first request.
     *   * `maxAgents` — LRU cap. MUST be ≥ max-concurrent-active-conversations
     *     (EC-17 DOCUMENT): with maxAgents:1 and 2 concurrent chats, LRU evicts
     *     mid-stream → SDK aborts with code:'aborted'. Default 100 covers
     *     indie/small-team; tune up for high-traffic.
     *   * `idleTimeoutMs` — auto-evict idle agents (default 30 min). 0 disables
     *     idle eviction (LRU only).
     */
    agents: z
      .object({
        maxRegistries: z.number().int().positive().default(100),
        registry: z
          .object({
            /** LRU cap — MUST be ≥ max-concurrent-active-conversations. */
            maxAgents: z.number().int().positive().max(10_000).default(100),
            /** Idle eviction window in ms. 0 disables idle eviction (LRU only). */
            idleTimeoutMs: z
              .number()
              .int()
              .nonnegative()
              .default(30 * 60_000),
          })
          .optional(),
      })
      .optional(),
    port: z.number().int().min(1).max(65535).default(3000),
    ssr: z.boolean().default(false),
    /** When true (and ssr === true), use renderToPipeableStream with progressive
     * shell flush instead of single-shot renderToString. Opt-in for streaming
     * SSR; default false preserves the current behavior. */
    ssrStreaming: z.boolean().default(false),
    rateLimit: rateLimitSchema.optional(),
    upload: uploadSchema.optional(),
    logging: loggingSchema.optional(),
    security: securitySchema.optional(),
    serialization: z.enum(['json', 'superjson']).default('json'),
    // Plugins are validated structurally at runtime by createPluginRunnerFromConfig.
    // Zod only checks the shape minimally (must be array). Type-level safety is
    // provided through defineConfig at the user surface.
    plugins: z.array(z.unknown()).optional(),
    /** Enable client-side batching of theoFetch calls and the
     * /api/__theo_batch__ server endpoint. */
    batching: z
      .union([z.boolean(), z.object({ max: z.number().int().positive().optional() })])
      .optional(),
    /** T4.1 — Audit log. When `logger` is provided, framework events
     * (csrf.warn, rate-limit.exceeded, session.rotated, csp.violation) are
     * emitted to it. Default: noop. */
    audit: z
      .object({
        logger: z.unknown().optional(),
      })
      .optional(),
    /** TheoUI auto-wire (T2.1). `false` = opt-out; object = explicit theme/fonts;
     * undefined = enabled when @usetheo/ui is detected in node_modules. */
    ui: z
      .union([
        z.literal(false),
        z.object({
          theme: z.enum(['violet-forge', 'noir', 'paper']).optional(),
          fonts: z.enum(['bundled', 'cdn']).optional(),
        }),
      ])
      .optional(),
    /**
     * Cache subsystem (caching-and-revalidation-plan).
     * Default `undefined` keeps caching disabled (backward compatible).
     * Pass `cache: {}` to opt in with defaults.
     */
    cache: cacheSchema.optional(),
    /**
     * Devtools overlay (Phase 0.4.0+ — see docs/plans/devtools-plan.md).
     *
     * - `undefined` (default): devtools auto-injects in `pnpm dev`, NEVER in `vite build`.
     * - `false`: devtools disabled entirely (Vite plugin skips injection even in dev).
     * - `{ ... }`: devtools enabled with explicit defaults (position, theme).
     *
     * Tree-shaken to noop in prod via the dual-export pattern in
     * `packages/theo/src/devtools/index.ts` (EC-17 positive prod check).
     */
    devtools: z
      .union([
        z.literal(false),
        z.object({
          position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
          theme: z.enum(['light', 'dark', 'system']).optional(),
        }),
      ])
      .optional(),
    /**
     * Informative list of deploy adapters the app supports. Does NOT
     * trigger per-build translations — only the `--target` CLI flag does
     * (EC-201 / ADR D2). If `config.adapters` includes a target NOT
     * matching `--target`, `theokit build` emits a cross-reference note.
     */
    adapters: z.array(z.string()).optional(),
    /**
     * Jobs backend (ADR D3 + T2.1). When configured, every request gets
     * `ctx.queue.enqueue` auto-wired via the outbox lifecycle. Pass a
     * `JobBackend` instance (InMemoryJobBackend, PostgresJobBackend, etc.).
     */
    jobs: z
      .object({
        backend: z.custom<unknown>((v) => typeof v === 'object' && v !== null),
      })
      .optional(),
    /**
     * StorageManager configuration (T1.1 / ADR-0007).
     *
     * Declares Postgres servers + databases + Redis servers. Consumed by
     * `getStorageManager().configure()` at boot via `start.ts`.
     *
     * Default `undefined` means manager exists but is not configured — adapters
     * relying on the manager (PostgresJobBackend.fromStorageManager, etc.) will
     * throw with an actionable error on first use.
     */
    storage: storageSchema.optional(),
    /**
     * Wave 2 — Polyglot services orchestration (T1.1 / ADR-0012/0013/0014/0015).
     *
     * Declarative external sidecar processes (Python FastAPI / Node Hono)
     * that boot alongside the TheoKit TS app. Empty `services: {}` is the
     * default and preserves Wave 1 behavior.
     */
    services: servicesConfigSchema,
  })
  // EC-2 fix: cross-config refine — no service may share TheoKit's web port.
  .refine((cfg) => !Object.values(cfg.services).some((s) => s.port === cfg.port), {
    message: 'service.port collides with TheoKit web port — change one of them',
    path: ['services'],
  })

export type TheoConfig = z.infer<typeof theoConfigSchema>
