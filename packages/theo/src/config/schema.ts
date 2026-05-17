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
})

export type TheoConfig = z.infer<typeof theoConfigSchema>
