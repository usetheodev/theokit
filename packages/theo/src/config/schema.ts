import { z } from 'zod'

export const theoConfigSchema = z.object({
  appDir: z.string().default('app'),
  serverDir: z.string().default('server'),
  port: z.number().int().min(1).max(65535).default(3000),
})

export type TheoConfig = z.infer<typeof theoConfigSchema>
