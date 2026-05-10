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
  rateLimit: rateLimitSchema.optional(),
  upload: uploadSchema.optional(),
  logging: loggingSchema.optional(),
  serialization: z.enum(['json', 'superjson']).default('json'),
})

export type TheoConfig = z.infer<typeof theoConfigSchema>
