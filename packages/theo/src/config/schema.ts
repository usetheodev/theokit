import { z } from 'zod'

export const rateLimitSchema = z.object({
  windowMs: z.number().min(1),
  max: z.number().int().min(1),
})

export const uploadSchema = z.object({
  maxFileSize: z.number().min(1).default(10 * 1024 * 1024), // 10MB
  maxFiles: z.number().int().min(1).default(10),
  maxFieldSize: z.number().min(1).default(1 * 1024 * 1024), // 1MB
})

export const loggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
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
export const securityHeadersSchema = z.object({
  csp: z.union([z.string(), z.literal(false)]).optional(),
  cspMode: z.enum(['enforce', 'report-only', 'off']).default('report-only'),
  hsts: z.union([z.string(), z.literal(false)]).optional(),
  frameOptions: z.enum(['DENY', 'SAMEORIGIN']).default('DENY'),
  contentTypeOptions: z.literal('nosniff').default('nosniff'),
  referrerPolicy: z.string().default('strict-origin-when-cross-origin'),
})

export const securitySchema = z.object({
  csrf: z.enum(['off', 'warn', 'strict']).default('warn'),
  headers: securityHeadersSchema.optional(),
})

export const theoConfigSchema = z.object({
  appDir: z.string().default('app'),
  serverDir: z.string().default('server'),
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
    .union([
      z.boolean(),
      z.object({ max: z.number().int().positive().optional() }),
    ])
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
})

export type TheoConfig = z.infer<typeof theoConfigSchema>
