import { z } from 'zod'

export const rateLimitSchema = z.object({
  windowMs: z.number().min(1),
  max: z.number().int().min(1),
})

export const theoConfigSchema = z.object({
  appDir: z.string().default('app'),
  serverDir: z.string().default('server'),
  port: z.number().int().min(1).max(65535).default(3000),
  rateLimit: rateLimitSchema.optional(),
})

export type TheoConfig = z.infer<typeof theoConfigSchema>
